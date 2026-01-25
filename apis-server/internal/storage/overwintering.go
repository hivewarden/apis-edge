package storage

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// OverwinteringRecord represents a hive's overwintering outcome in the database.
type OverwinteringRecord struct {
	ID                    string    `json:"id"`
	TenantID              string    `json:"tenant_id"`
	HiveID                string    `json:"hive_id"`
	HiveName              string    `json:"hive_name,omitempty"` // Joined from hives table
	WinterSeason          int       `json:"winter_season"`       // Year of winter start (e.g., 2025 for 2025-2026)
	Survived              bool      `json:"survived"`
	Condition             *string   `json:"condition,omitempty"`               // 'strong', 'medium', 'weak' (only if survived)
	StoresRemaining       *string   `json:"stores_remaining,omitempty"`        // 'none', 'low', 'adequate', 'plenty' (only if survived)
	FirstInspectionNotes  *string   `json:"first_inspection_notes,omitempty"`  // Free text notes (only if survived)
	RecordedAt            time.Time `json:"recorded_at"`
	CreatedAt             time.Time `json:"created_at"`
}

// CreateOverwinteringInput contains the fields needed to create a new overwintering record.
type CreateOverwinteringInput struct {
	HiveID               string  `json:"hive_id"`
	WinterSeason         int     `json:"winter_season"`
	Survived             bool    `json:"survived"`
	Condition            *string `json:"condition,omitempty"`
	StoresRemaining      *string `json:"stores_remaining,omitempty"`
	FirstInspectionNotes *string `json:"first_inspection_notes,omitempty"`
}

// WinterReport contains aggregated overwintering statistics for a season.
type WinterReport struct {
	WinterSeason    int                    `json:"winter_season"`
	SeasonLabel     string                 `json:"season_label"`
	TotalHives      int                    `json:"total_hives"`
	SurvivedCount   int                    `json:"survived_count"`
	LostCount       int                    `json:"lost_count"`
	WeakCount       int                    `json:"weak_count"`
	SurvivalRate    float64                `json:"survival_rate"`
	Is100Percent    bool                   `json:"is_100_percent"`
	LostHives       []LostHiveSummary      `json:"lost_hives"`
	SurvivedHives   []SurvivedHiveSummary  `json:"survived_hives"`
	Comparison      *WinterComparison      `json:"comparison,omitempty"`
}

// LostHiveSummary contains summary info about a lost hive for the report.
type LostHiveSummary struct {
	HiveID         string  `json:"hive_id"`
	HiveName       string  `json:"hive_name"`
	Cause          string  `json:"cause,omitempty"`
	CauseDisplay   string  `json:"cause_display,omitempty"`
	HasPostMortem  bool    `json:"has_post_mortem"`
}

// SurvivedHiveSummary contains summary info about a surviving hive for the report.
type SurvivedHiveSummary struct {
	HiveID               string  `json:"hive_id"`
	HiveName             string  `json:"hive_name"`
	Condition            *string `json:"condition,omitempty"`
	ConditionDisplay     string  `json:"condition_display,omitempty"`
	StoresRemaining      *string `json:"stores_remaining,omitempty"`
	StoresDisplay        string  `json:"stores_display,omitempty"`
	FirstInspectionNotes *string `json:"first_inspection_notes,omitempty"`
}

// WinterComparison contains comparison data to previous winter.
type WinterComparison struct {
	PreviousSeason      int     `json:"previous_season"`
	PreviousSeasonLabel string  `json:"previous_season_label"`
	PreviousSurvivalRate float64 `json:"previous_survival_rate"`
	ChangePercent       float64 `json:"change_percent"`
	Improved            bool    `json:"improved"`
}

// WinterSurvivalTrend contains historical survival data for trend analysis.
type WinterSurvivalTrend struct {
	WinterSeason   int     `json:"winter_season"`
	SeasonLabel    string  `json:"season_label"`
	SurvivalRate   float64 `json:"survival_rate"`
	TotalHives     int     `json:"total_hives"`
	SurvivedCount  int     `json:"survived_count"`
}

// HiveWithOverwinteringRecord represents a hive with its optional existing overwintering record.
type HiveWithOverwinteringRecord struct {
	HiveID         string                  `json:"hive_id"`
	HiveName       string                  `json:"hive_name"`
	ExistingRecord *OverwinteringRecord    `json:"existing_record,omitempty"`
}

// Condition display names
var ConditionDisplayNames = map[string]string{
	"strong": "Strong",
	"medium": "Medium",
	"weak":   "Weak",
}

// Stores display names
var StoresDisplayNames = map[string]string{
	"none":     "None",
	"low":      "Low",
	"adequate": "Adequate",
	"plenty":   "Plenty",
}

// ValidConditions lists valid condition values.
var ValidConditions = []string{"strong", "medium", "weak"}

// ValidStoresRemaining lists valid stores_remaining values.
var ValidStoresRemaining = []string{"none", "low", "adequate", "plenty"}

// IsValidCondition checks if a condition value is valid.
func IsValidCondition(condition string) bool {
	for _, c := range ValidConditions {
		if c == condition {
			return true
		}
	}
	return false
}

// IsValidStoresRemaining checks if a stores_remaining value is valid.
func IsValidStoresRemaining(stores string) bool {
	for _, s := range ValidStoresRemaining {
		if s == stores {
			return true
		}
	}
	return false
}

// GetWinterSeasonLabel returns display label like "2025-2026".
func GetWinterSeasonLabel(winterSeason int) string {
	return fmt.Sprintf("%d-%d", winterSeason, winterSeason+1)
}

// CreateOverwinteringRecord creates a new overwintering record in the database.
func CreateOverwinteringRecord(ctx context.Context, conn *pgxpool.Conn, tenantID string, input *CreateOverwinteringInput) (*OverwinteringRecord, error) {
	var record OverwinteringRecord
	err := conn.QueryRow(ctx,
		`INSERT INTO overwintering_records (tenant_id, hive_id, winter_season, survived, condition, stores_remaining, first_inspection_notes)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id, tenant_id, hive_id, winter_season, survived, condition, stores_remaining, first_inspection_notes, recorded_at, created_at`,
		tenantID, input.HiveID, input.WinterSeason, input.Survived, input.Condition, input.StoresRemaining, input.FirstInspectionNotes,
	).Scan(&record.ID, &record.TenantID, &record.HiveID, &record.WinterSeason, &record.Survived,
		&record.Condition, &record.StoresRemaining, &record.FirstInspectionNotes, &record.RecordedAt, &record.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("storage: failed to create overwintering record: %w", err)
	}

	return &record, nil
}

// GetOverwinteringRecord retrieves an overwintering record for a specific hive and season.
func GetOverwinteringRecord(ctx context.Context, conn *pgxpool.Conn, hiveID string, winterSeason int) (*OverwinteringRecord, error) {
	var record OverwinteringRecord
	err := conn.QueryRow(ctx,
		`SELECT o.id, o.tenant_id, o.hive_id, h.name, o.winter_season, o.survived, o.condition, o.stores_remaining, o.first_inspection_notes, o.recorded_at, o.created_at
		 FROM overwintering_records o
		 JOIN hives h ON h.id = o.hive_id
		 WHERE o.hive_id = $1 AND o.winter_season = $2`,
		hiveID, winterSeason,
	).Scan(&record.ID, &record.TenantID, &record.HiveID, &record.HiveName, &record.WinterSeason, &record.Survived,
		&record.Condition, &record.StoresRemaining, &record.FirstInspectionNotes, &record.RecordedAt, &record.CreatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get overwintering record: %w", err)
	}
	return &record, nil
}

// ListOverwinteringRecordsBySeason returns all overwintering records for a tenant and season.
func ListOverwinteringRecordsBySeason(ctx context.Context, conn *pgxpool.Conn, tenantID string, winterSeason int) ([]OverwinteringRecord, error) {
	rows, err := conn.Query(ctx,
		`SELECT o.id, o.tenant_id, o.hive_id, h.name, o.winter_season, o.survived, o.condition, o.stores_remaining, o.first_inspection_notes, o.recorded_at, o.created_at
		 FROM overwintering_records o
		 JOIN hives h ON h.id = o.hive_id
		 WHERE o.tenant_id = $1 AND o.winter_season = $2
		 ORDER BY h.name`,
		tenantID, winterSeason)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list overwintering records: %w", err)
	}
	defer rows.Close()

	var records []OverwinteringRecord
	for rows.Next() {
		var r OverwinteringRecord
		err := rows.Scan(&r.ID, &r.TenantID, &r.HiveID, &r.HiveName, &r.WinterSeason, &r.Survived,
			&r.Condition, &r.StoresRemaining, &r.FirstInspectionNotes, &r.RecordedAt, &r.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan overwintering record: %w", err)
		}
		records = append(records, r)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating overwintering records: %w", err)
	}

	return records, nil
}

// HasOverwinteringRecordForSeason checks if any record exists for the tenant and season.
func HasOverwinteringRecordForSeason(ctx context.Context, conn *pgxpool.Conn, tenantID string, winterSeason int) (bool, error) {
	var count int
	err := conn.QueryRow(ctx,
		`SELECT COUNT(*) FROM overwintering_records WHERE tenant_id = $1 AND winter_season = $2`,
		tenantID, winterSeason,
	).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("storage: failed to check overwintering records: %w", err)
	}
	return count > 0, nil
}

// GetWinterReport returns aggregated overwintering statistics for a season.
func GetWinterReport(ctx context.Context, conn *pgxpool.Conn, tenantID string, winterSeason int) (*WinterReport, error) {
	records, err := ListOverwinteringRecordsBySeason(ctx, conn, tenantID, winterSeason)
	if err != nil {
		return nil, err
	}

	report := &WinterReport{
		WinterSeason:  winterSeason,
		SeasonLabel:   GetWinterSeasonLabel(winterSeason),
		TotalHives:    len(records),
		LostHives:     []LostHiveSummary{},
		SurvivedHives: []SurvivedHiveSummary{},
	}

	for _, r := range records {
		if r.Survived {
			report.SurvivedCount++

			// Check if weak
			if r.Condition != nil && *r.Condition == "weak" {
				report.WeakCount++
			}

			conditionDisplay := ""
			if r.Condition != nil {
				conditionDisplay = ConditionDisplayNames[*r.Condition]
			}
			storesDisplay := ""
			if r.StoresRemaining != nil {
				storesDisplay = StoresDisplayNames[*r.StoresRemaining]
			}

			report.SurvivedHives = append(report.SurvivedHives, SurvivedHiveSummary{
				HiveID:               r.HiveID,
				HiveName:             r.HiveName,
				Condition:            r.Condition,
				ConditionDisplay:     conditionDisplay,
				StoresRemaining:      r.StoresRemaining,
				StoresDisplay:        storesDisplay,
				FirstInspectionNotes: r.FirstInspectionNotes,
			})
		} else {
			report.LostCount++

			// Get post-mortem info if available
			summary := LostHiveSummary{
				HiveID:        r.HiveID,
				HiveName:      r.HiveName,
				HasPostMortem: false,
			}

			loss, err := GetHiveLossByHiveID(ctx, conn, r.HiveID)
			if err == nil && loss != nil {
				summary.HasPostMortem = true
				summary.Cause = loss.Cause
				summary.CauseDisplay = CauseDisplayNames[loss.Cause]
			}

			report.LostHives = append(report.LostHives, summary)
		}
	}

	// Calculate survival rate
	if report.TotalHives > 0 {
		report.SurvivalRate = float64(report.SurvivedCount) / float64(report.TotalHives) * 100
		report.Is100Percent = report.SurvivedCount == report.TotalHives
	}

	// Get comparison to previous winter
	previousSeason := winterSeason - 1
	prevRecords, err := ListOverwinteringRecordsBySeason(ctx, conn, tenantID, previousSeason)
	if err == nil && len(prevRecords) > 0 {
		prevSurvived := 0
		for _, r := range prevRecords {
			if r.Survived {
				prevSurvived++
			}
		}
		prevRate := float64(prevSurvived) / float64(len(prevRecords)) * 100

		report.Comparison = &WinterComparison{
			PreviousSeason:       previousSeason,
			PreviousSeasonLabel:  GetWinterSeasonLabel(previousSeason),
			PreviousSurvivalRate: prevRate,
			ChangePercent:        report.SurvivalRate - prevRate,
			Improved:             report.SurvivalRate > prevRate,
		}
	}

	return report, nil
}

// GetSurvivalTrends returns historical survival rate data for trend analysis.
func GetSurvivalTrends(ctx context.Context, conn *pgxpool.Conn, tenantID string, years int) ([]WinterSurvivalTrend, error) {
	rows, err := conn.Query(ctx,
		`SELECT winter_season,
		        COUNT(*) as total_hives,
		        SUM(CASE WHEN survived THEN 1 ELSE 0 END) as survived_count
		 FROM overwintering_records
		 WHERE tenant_id = $1
		 GROUP BY winter_season
		 ORDER BY winter_season DESC
		 LIMIT $2`,
		tenantID, years)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get survival trends: %w", err)
	}
	defer rows.Close()

	var trends []WinterSurvivalTrend
	for rows.Next() {
		var t WinterSurvivalTrend
		err := rows.Scan(&t.WinterSeason, &t.TotalHives, &t.SurvivedCount)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan survival trend: %w", err)
		}
		t.SeasonLabel = GetWinterSeasonLabel(t.WinterSeason)
		if t.TotalHives > 0 {
			t.SurvivalRate = float64(t.SurvivedCount) / float64(t.TotalHives) * 100
		}
		trends = append(trends, t)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating survival trends: %w", err)
	}

	return trends, nil
}

// GetAvailableWinterSeasons returns all years with overwintering data for a tenant.
func GetAvailableWinterSeasons(ctx context.Context, conn *pgxpool.Conn, tenantID string) ([]int, error) {
	rows, err := conn.Query(ctx,
		`SELECT DISTINCT winter_season
		 FROM overwintering_records
		 WHERE tenant_id = $1
		 ORDER BY winter_season DESC`,
		tenantID)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get available winter seasons: %w", err)
	}
	defer rows.Close()

	var seasons []int
	for rows.Next() {
		var season int
		if err := rows.Scan(&season); err != nil {
			return nil, fmt.Errorf("storage: failed to scan winter season: %w", err)
		}
		seasons = append(seasons, season)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating winter seasons: %w", err)
	}

	return seasons, nil
}

// GetHivesForOverwintering returns all active hives with their existing overwintering records for a season.
func GetHivesForOverwintering(ctx context.Context, conn *pgxpool.Conn, tenantID string, winterSeason int) ([]HiveWithOverwinteringRecord, error) {
	// Get all hives (active or lost - we want all that existed before this winter)
	rows, err := conn.Query(ctx,
		`SELECT h.id, h.name
		 FROM hives h
		 WHERE h.tenant_id = $1
		 ORDER BY h.name`,
		tenantID)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list hives for overwintering: %w", err)
	}
	defer rows.Close()

	var hives []HiveWithOverwinteringRecord
	for rows.Next() {
		var hive HiveWithOverwinteringRecord
		err := rows.Scan(&hive.HiveID, &hive.HiveName)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan hive: %w", err)
		}
		hives = append(hives, hive)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating hives: %w", err)
	}

	// Get existing overwintering records for this season
	records, err := ListOverwinteringRecordsBySeason(ctx, conn, tenantID, winterSeason)
	if err != nil {
		return nil, err
	}

	// Map records by hive ID
	recordMap := make(map[string]*OverwinteringRecord)
	for i := range records {
		recordMap[records[i].HiveID] = &records[i]
	}

	// Attach records to hives
	for i := range hives {
		if record, ok := recordMap[hives[i].HiveID]; ok {
			hives[i].ExistingRecord = record
		}
	}

	return hives, nil
}
