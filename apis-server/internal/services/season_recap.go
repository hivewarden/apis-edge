package services

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
	"github.com/shopspring/decimal"

	"github.com/jermoo/apis/apis-server/internal/storage"
)

// SeasonRecapService handles season recap generation and caching.
type SeasonRecapService struct {
	pool *pgxpool.Pool
}

// NewSeasonRecapService creates a new season recap service.
func NewSeasonRecapService(pool *pgxpool.Pool) *SeasonRecapService {
	return &SeasonRecapService{pool: pool}
}

// GetSeasonDates returns start/end dates for a season year.
// Northern Hemisphere: Aug 1 - Oct 31
// Southern Hemisphere: Feb 1 - Apr 30
func GetSeasonDates(year int, hemisphere string) (time.Time, time.Time) {
	if hemisphere == "southern" {
		start := time.Date(year, time.February, 1, 0, 0, 0, 0, time.UTC)
		end := time.Date(year, time.April, 30, 23, 59, 59, 0, time.UTC)
		return start, end
	}
	// Default: northern hemisphere
	start := time.Date(year, time.August, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(year, time.October, 31, 23, 59, 59, 0, time.UTC)
	return start, end
}

// GetCurrentSeason returns the current season year.
// For northern hemisphere, November onwards is previous season's recap time.
// For southern hemisphere, May onwards is previous season's recap time.
func GetCurrentSeason(hemisphere string) int {
	now := time.Now()
	if hemisphere == "southern" {
		// Southern: Season is Feb-Apr, recap time is May+
		if now.Month() >= time.May {
			return now.Year()
		}
		return now.Year() - 1
	}
	// Northern: Season is Aug-Oct, recap time is Nov+
	if now.Month() >= time.November {
		return now.Year()
	}
	if now.Month() < time.August {
		return now.Year() - 1
	}
	return now.Year()
}

// IsRecapTime returns true if it's time to show recap prompt.
func IsRecapTime(hemisphere string) bool {
	now := time.Now()
	if hemisphere == "southern" {
		return now.Month() >= time.May
	}
	return now.Month() >= time.November
}

// FormatSeasonDates formats season dates for display.
func FormatSeasonDates(start, end time.Time) string {
	return fmt.Sprintf("%s - %s", start.Format("Jan 2"), end.Format("Jan 2, 2006"))
}

// GenerateRecap generates a season recap by aggregating data.
func (s *SeasonRecapService) GenerateRecap(ctx context.Context, tenantID string, year int, hemisphere string) (*storage.SeasonRecapData, error) {
	start, end := GetSeasonDates(year, hemisphere)

	conn, err := s.pool.Acquire(ctx)
	if err != nil {
		return nil, fmt.Errorf("services: failed to acquire connection: %w", err)
	}
	defer conn.Release()

	recapData := &storage.SeasonRecapData{
		SeasonDates: storage.SeasonDates{
			Start:       start,
			End:         end,
			DisplayText: FormatSeasonDates(start, end),
		},
		Milestones:   []storage.Milestone{},
		PerHiveStats: []storage.HiveSeasonStat{},
	}

	// 1. Aggregate harvest data
	totalHarvest, perHiveHarvests, err := s.aggregateHarvests(ctx, conn, tenantID, start, end)
	if err != nil {
		log.Warn().Err(err).Msg("services: failed to aggregate harvests")
	}
	recapData.TotalHarvestKg = totalHarvest

	// 2. Count detections
	detectionCount, err := s.countDetections(ctx, conn, tenantID, start, end)
	if err != nil {
		log.Warn().Err(err).Msg("services: failed to count detections")
	}
	recapData.HornetsDeterred = detectionCount

	// 3. Count inspections
	inspectionCount, err := s.countInspections(ctx, conn, tenantID, start, end)
	if err != nil {
		log.Warn().Err(err).Msg("services: failed to count inspections")
	}
	recapData.InspectionsCount = inspectionCount

	// 4. Count treatments
	treatmentCount, err := s.countTreatments(ctx, conn, tenantID, start, end)
	if err != nil {
		log.Warn().Err(err).Msg("services: failed to count treatments")
	}
	recapData.TreatmentsCount = treatmentCount

	// 5. Count feedings
	feedingCount, err := s.countFeedings(ctx, conn, tenantID, start, end)
	if err != nil {
		log.Warn().Err(err).Msg("services: failed to count feedings")
	}
	recapData.FeedingsCount = feedingCount

	// 6. Detect milestones
	milestones, err := s.detectMilestones(ctx, conn, tenantID, start, end)
	if err != nil {
		log.Warn().Err(err).Msg("services: failed to detect milestones")
	}
	recapData.Milestones = milestones

	// 7. Build per-hive statistics
	hiveStats, err := s.buildHiveStats(ctx, conn, tenantID, start, end, perHiveHarvests)
	if err != nil {
		log.Warn().Err(err).Msg("services: failed to build hive stats")
	}
	recapData.PerHiveStats = hiveStats

	// 8. Year-over-year comparison
	comparison, err := s.calculateComparison(ctx, conn, tenantID, year, hemisphere)
	if err != nil {
		log.Warn().Err(err).Msg("services: failed to calculate comparison")
	}
	recapData.ComparisonData = comparison

	return recapData, nil
}

// GetOrGenerateRecap retrieves a cached recap or generates a new one.
func (s *SeasonRecapService) GetOrGenerateRecap(ctx context.Context, tenantID string, year int, hemisphere string, forceRegenerate bool) (*storage.SeasonRecap, error) {
	conn, err := s.pool.Acquire(ctx)
	if err != nil {
		return nil, fmt.Errorf("services: failed to acquire connection: %w", err)
	}
	defer conn.Release()

	// Try to get cached recap if not forcing regeneration
	if !forceRegenerate {
		cached, err := storage.GetSeasonRecap(ctx, conn, tenantID, year)
		if err == nil {
			return cached, nil
		}
		if err != storage.ErrNotFound {
			log.Warn().Err(err).Msg("services: error checking cached recap")
		}
	}

	// Generate new recap
	recapData, err := s.GenerateRecap(ctx, tenantID, year, hemisphere)
	if err != nil {
		return nil, err
	}

	start, end := GetSeasonDates(year, hemisphere)
	input := &storage.CreateSeasonRecapInput{
		SeasonYear:  year,
		Hemisphere:  hemisphere,
		SeasonStart: start,
		SeasonEnd:   end,
		RecapData:   *recapData,
	}

	recap, err := storage.CreateSeasonRecap(ctx, conn, tenantID, input)
	if err != nil {
		return nil, fmt.Errorf("services: failed to cache recap: %w", err)
	}

	return recap, nil
}

// GetRecapAsText generates a formatted text version of the recap.
func (s *SeasonRecapService) GetRecapAsText(recap *storage.SeasonRecap) string {
	data := recap.RecapData

	text := fmt.Sprintf("APIS Season Recap %d (%s)\n\n", recap.SeasonYear, data.SeasonDates.DisplayText)
	text += "Key Stats:\n"
	text += fmt.Sprintf("* Total Harvest: %.1f kg\n", data.TotalHarvestKg)
	text += fmt.Sprintf("* Hornets Deterred: %d\n", data.HornetsDeterred)
	text += fmt.Sprintf("* Inspections: %d\n", data.InspectionsCount)

	if len(data.Milestones) > 0 {
		text += "\nHighlights:\n"
		for _, m := range data.Milestones {
			text += fmt.Sprintf("* %s\n", m.Description)
		}
	}

	if data.ComparisonData != nil {
		text += fmt.Sprintf("\nvs %d: %+.1f%% harvest, %+.1f%% hornet activity\n",
			data.ComparisonData.PreviousYear,
			data.ComparisonData.HarvestChange,
			data.ComparisonData.HornetsChange)
	}

	if len(data.PerHiveStats) > 0 {
		text += "\nPer Hive:\n"
		for _, h := range data.PerHiveStats {
			status := h.Status
			if h.StatusDetail != "" {
				status = h.StatusDetail
			}
			text += fmt.Sprintf("* %s: %.1f kg (%s)\n", h.HiveName, h.HarvestKg, status)
		}
	}

	text += "\nGenerated with APIS - apis.honeybeegood.be"

	return text
}

// aggregateHarvests returns total harvest kg and per-hive breakdown.
func (s *SeasonRecapService) aggregateHarvests(ctx context.Context, conn *pgxpool.Conn, tenantID string, start, end time.Time) (float64, map[string]float64, error) {
	perHive := make(map[string]float64)

	var totalKg decimal.Decimal
	err := conn.QueryRow(ctx,
		`SELECT COALESCE(SUM(total_kg), 0)
		 FROM harvests
		 WHERE tenant_id = $1 AND harvested_at >= $2 AND harvested_at <= $3`,
		tenantID, start, end,
	).Scan(&totalKg)
	if err != nil {
		return 0, perHive, fmt.Errorf("services: failed to sum harvests: %w", err)
	}

	// Per-hive breakdown
	rows, err := conn.Query(ctx,
		`SELECT hh.hive_id, COALESCE(SUM(hh.amount_kg), 0)
		 FROM harvest_hives hh
		 JOIN harvests h ON h.id = hh.harvest_id
		 WHERE h.tenant_id = $1 AND h.harvested_at >= $2 AND h.harvested_at <= $3
		 GROUP BY hh.hive_id`,
		tenantID, start, end)
	if err != nil {
		return 0, perHive, fmt.Errorf("services: failed to get per-hive harvests: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var hiveID string
		var amount decimal.Decimal
		if err := rows.Scan(&hiveID, &amount); err != nil {
			continue
		}
		amountFloat, _ := amount.Float64()
		perHive[hiveID] = amountFloat
	}

	total, _ := totalKg.Float64()
	return total, perHive, nil
}

// countDetections returns the total detection count within the date range.
func (s *SeasonRecapService) countDetections(ctx context.Context, conn *pgxpool.Conn, tenantID string, start, end time.Time) (int, error) {
	var count int
	err := conn.QueryRow(ctx,
		`SELECT COUNT(*)
		 FROM detections
		 WHERE tenant_id = $1 AND detected_at >= $2 AND detected_at <= $3`,
		tenantID, start, end,
	).Scan(&count)
	if err != nil {
		return 0, err
	}
	return count, nil
}

// countInspections returns the total inspection count within the date range.
func (s *SeasonRecapService) countInspections(ctx context.Context, conn *pgxpool.Conn, tenantID string, start, end time.Time) (int, error) {
	var count int
	err := conn.QueryRow(ctx,
		`SELECT COUNT(*)
		 FROM inspections
		 WHERE tenant_id = $1 AND inspected_at >= $2 AND inspected_at <= $3`,
		tenantID, start, end,
	).Scan(&count)
	if err != nil {
		return 0, err
	}
	return count, nil
}

// countTreatments returns the total treatment count within the date range.
func (s *SeasonRecapService) countTreatments(ctx context.Context, conn *pgxpool.Conn, tenantID string, start, end time.Time) (int, error) {
	var count int
	err := conn.QueryRow(ctx,
		`SELECT COUNT(*)
		 FROM treatments
		 WHERE tenant_id = $1 AND treated_at >= $2 AND treated_at <= $3`,
		tenantID, start, end,
	).Scan(&count)
	if err != nil {
		return 0, err
	}
	return count, nil
}

// countFeedings returns the total feeding count within the date range.
func (s *SeasonRecapService) countFeedings(ctx context.Context, conn *pgxpool.Conn, tenantID string, start, end time.Time) (int, error) {
	var count int
	err := conn.QueryRow(ctx,
		`SELECT COUNT(*)
		 FROM feedings
		 WHERE tenant_id = $1 AND fed_at >= $2 AND fed_at <= $3`,
		tenantID, start, end,
	).Scan(&count)
	if err != nil {
		return 0, err
	}
	return count, nil
}

// detectMilestones finds notable events during the season.
func (s *SeasonRecapService) detectMilestones(ctx context.Context, conn *pgxpool.Conn, tenantID string, start, end time.Time) ([]storage.Milestone, error) {
	milestones := []storage.Milestone{}

	// Check for new hives created in season
	rows, err := conn.Query(ctx,
		`SELECT id, name, created_at FROM hives
		 WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3`,
		tenantID, start, end)
	if err != nil {
		return milestones, err
	}
	for rows.Next() {
		var hiveID, hiveName string
		var createdAt time.Time
		if err := rows.Scan(&hiveID, &hiveName, &createdAt); err != nil {
			continue
		}
		milestones = append(milestones, storage.Milestone{
			Type:        "new_hive",
			Description: fmt.Sprintf("New hive: %s", hiveName),
			Date:        createdAt,
			HiveID:      &hiveID,
			HiveName:    &hiveName,
		})
	}
	rows.Close()

	// Check for queen replacements in season
	rows, err = conn.Query(ctx,
		`SELECT id, name, queen_introduced_at FROM hives
		 WHERE tenant_id = $1 AND queen_introduced_at >= $2 AND queen_introduced_at <= $3`,
		tenantID, start, end)
	if err != nil {
		return milestones, err
	}
	for rows.Next() {
		var hiveID, hiveName string
		var queenDate *time.Time
		if err := rows.Scan(&hiveID, &hiveName, &queenDate); err != nil {
			continue
		}
		if queenDate != nil {
			milestones = append(milestones, storage.Milestone{
				Type:        "queen_replaced",
				Description: fmt.Sprintf("New queen in %s", hiveName),
				Date:        *queenDate,
				HiveID:      &hiveID,
				HiveName:    &hiveName,
			})
		}
	}
	rows.Close()

	// Check for hive losses in season
	rows, err = conn.Query(ctx,
		`SELECT h.id, h.name, hl.discovered_at, hl.cause
		 FROM hives h
		 JOIN hive_losses hl ON h.id = hl.hive_id
		 WHERE h.tenant_id = $1 AND hl.discovered_at >= $2 AND hl.discovered_at <= $3`,
		tenantID, start, end)
	if err != nil {
		return milestones, err
	}
	for rows.Next() {
		var hiveID, hiveName string
		var discoveredAt time.Time
		var cause *string
		if err := rows.Scan(&hiveID, &hiveName, &discoveredAt, &cause); err != nil {
			continue
		}
		desc := fmt.Sprintf("Lost hive: %s", hiveName)
		if cause != nil && *cause != "" {
			desc = fmt.Sprintf("Lost hive: %s (%s)", hiveName, *cause)
		}
		milestones = append(milestones, storage.Milestone{
			Type:        "hive_loss",
			Description: desc,
			Date:        discoveredAt,
			HiveID:      &hiveID,
			HiveName:    &hiveName,
		})
	}
	rows.Close()

	// Check for first harvests
	rows, err = conn.Query(ctx,
		`SELECT DISTINCT ON (hh.hive_id) hh.hive_id, hv.name, h.harvested_at
		 FROM harvest_hives hh
		 JOIN harvests h ON h.id = hh.harvest_id
		 JOIN hives hv ON hv.id = hh.hive_id
		 WHERE h.tenant_id = $1 AND h.harvested_at >= $2 AND h.harvested_at <= $3
		 ORDER BY hh.hive_id, h.harvested_at ASC`,
		tenantID, start, end)
	if err != nil {
		return milestones, err
	}
	for rows.Next() {
		var hiveID, hiveName string
		var harvestedAt time.Time
		if err := rows.Scan(&hiveID, &hiveName, &harvestedAt); err != nil {
			continue
		}
		// Check if this is actually the first harvest ever for this hive
		var prevCount int
		conn.QueryRow(ctx,
			`SELECT COUNT(*) FROM harvest_hives hh
			 JOIN harvests h ON h.id = hh.harvest_id
			 WHERE hh.hive_id = $1 AND h.harvested_at < $2`,
			hiveID, start,
		).Scan(&prevCount)
		if prevCount == 0 {
			milestones = append(milestones, storage.Milestone{
				Type:        "first_harvest",
				Description: fmt.Sprintf("First harvest from %s", hiveName),
				Date:        harvestedAt,
				HiveID:      &hiveID,
				HiveName:    &hiveName,
			})
		}
	}
	rows.Close()

	return milestones, nil
}

// buildHiveStats creates per-hive statistics for the season.
func (s *SeasonRecapService) buildHiveStats(ctx context.Context, conn *pgxpool.Conn, tenantID string, start, end time.Time, perHiveHarvests map[string]float64) ([]storage.HiveSeasonStat, error) {
	stats := []storage.HiveSeasonStat{}

	// Get all hives that existed during the season
	rows, err := conn.Query(ctx,
		`SELECT id, name, status, lost_at, queen_introduced_at
		 FROM hives
		 WHERE tenant_id = $1
		 ORDER BY name`,
		tenantID)
	if err != nil {
		return stats, err
	}
	defer rows.Close()

	for rows.Next() {
		var hive struct {
			ID               string
			Name             string
			Status           string
			LostAt           *time.Time
			QueenIntroducedAt *time.Time
		}
		if err := rows.Scan(&hive.ID, &hive.Name, &hive.Status, &hive.LostAt, &hive.QueenIntroducedAt); err != nil {
			continue
		}

		stat := storage.HiveSeasonStat{
			HiveID:    hive.ID,
			HiveName:  hive.Name,
			HarvestKg: perHiveHarvests[hive.ID],
			Issues:    []string{},
		}

		// Determine status
		status, detail := s.determineHiveStatus(ctx, conn, hive.ID, hive.Status, hive.LostAt, hive.QueenIntroducedAt, start, end)
		stat.Status = status
		stat.StatusDetail = detail

		// Collect issues from inspections
		issues, _ := s.collectHiveIssues(ctx, conn, hive.ID, start, end)
		stat.Issues = issues

		stats = append(stats, stat)
	}

	return stats, nil
}

// determineHiveStatus determines the recap status for a hive.
func (s *SeasonRecapService) determineHiveStatus(ctx context.Context, conn *pgxpool.Conn, hiveID, currentStatus string, lostAt, queenIntroducedAt *time.Time, start, end time.Time) (string, string) {
	// Check if lost during season
	if currentStatus == "lost" && lostAt != nil && !lostAt.Before(start) && !lostAt.After(end) {
		return "lost", fmt.Sprintf("Lost on %s", lostAt.Format("Jan 2"))
	}

	// Check if queen replaced during season
	if queenIntroducedAt != nil && !queenIntroducedAt.Before(start) && !queenIntroducedAt.After(end) {
		return "new_queen", fmt.Sprintf("New queen %s", queenIntroducedAt.Format("Jan 2"))
	}

	// Check if treated during season
	var treatmentCount int
	var treatmentType *string
	conn.QueryRow(ctx,
		`SELECT COUNT(*), MAX(treatment_type)
		 FROM treatments
		 WHERE hive_id = $1 AND treated_at >= $2 AND treated_at <= $3`,
		hiveID, start, end,
	).Scan(&treatmentCount, &treatmentType)

	if treatmentCount > 0 && treatmentType != nil {
		return "treated", fmt.Sprintf("Treated for %s", *treatmentType)
	}

	return "healthy", ""
}

// collectHiveIssues extracts issues from inspection records.
func (s *SeasonRecapService) collectHiveIssues(ctx context.Context, conn *pgxpool.Conn, hiveID string, start, end time.Time) ([]string, error) {
	issues := []string{}

	rows, err := conn.Query(ctx,
		`SELECT DISTINCT unnest(issues) AS issue
		 FROM inspections
		 WHERE hive_id = $1 AND inspected_at >= $2 AND inspected_at <= $3
		   AND issues IS NOT NULL AND array_length(issues, 1) > 0`,
		hiveID, start, end)
	if err != nil {
		return issues, err
	}
	defer rows.Close()

	for rows.Next() {
		var issue string
		if err := rows.Scan(&issue); err != nil {
			continue
		}
		issues = append(issues, issue)
	}

	return issues, nil
}

// calculateComparison calculates year-over-year comparison data.
func (s *SeasonRecapService) calculateComparison(ctx context.Context, conn *pgxpool.Conn, tenantID string, year int, hemisphere string) (*storage.YearComparison, error) {
	prevYear := year - 1
	prevStart, prevEnd := GetSeasonDates(prevYear, hemisphere)

	// Get previous year harvest
	var prevHarvest decimal.Decimal
	err := conn.QueryRow(ctx,
		`SELECT COALESCE(SUM(total_kg), 0)
		 FROM harvests
		 WHERE tenant_id = $1 AND harvested_at >= $2 AND harvested_at <= $3`,
		tenantID, prevStart, prevEnd,
	).Scan(&prevHarvest)
	if err != nil {
		return nil, err
	}

	prevHarvestFloat, _ := prevHarvest.Float64()
	if prevHarvestFloat == 0 {
		// No previous data, skip comparison
		return nil, nil
	}

	// Get previous year detections
	var prevDetections int
	conn.QueryRow(ctx,
		`SELECT COUNT(*)
		 FROM detections
		 WHERE tenant_id = $1 AND detected_at >= $2 AND detected_at <= $3`,
		tenantID, prevStart, prevEnd,
	).Scan(&prevDetections)

	// Get current year data
	currStart, currEnd := GetSeasonDates(year, hemisphere)
	var currHarvest decimal.Decimal
	conn.QueryRow(ctx,
		`SELECT COALESCE(SUM(total_kg), 0)
		 FROM harvests
		 WHERE tenant_id = $1 AND harvested_at >= $2 AND harvested_at <= $3`,
		tenantID, currStart, currEnd,
	).Scan(&currHarvest)

	var currDetections int
	conn.QueryRow(ctx,
		`SELECT COUNT(*)
		 FROM detections
		 WHERE tenant_id = $1 AND detected_at >= $2 AND detected_at <= $3`,
		tenantID, currStart, currEnd,
	).Scan(&currDetections)

	currHarvestFloat, _ := currHarvest.Float64()

	// Calculate percentage changes
	harvestChange := 0.0
	if prevHarvestFloat > 0 {
		harvestChange = ((currHarvestFloat - prevHarvestFloat) / prevHarvestFloat) * 100
	}

	hornetsChange := 0.0
	if prevDetections > 0 {
		hornetsChange = (float64(currDetections-prevDetections) / float64(prevDetections)) * 100
	}

	return &storage.YearComparison{
		PreviousYear:      prevYear,
		PreviousHarvestKg: prevHarvestFloat,
		HarvestChange:     harvestChange,
		PreviousHornets:   prevDetections,
		HornetsChange:     hornetsChange,
	}, nil
}
