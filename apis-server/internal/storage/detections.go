package storage

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Detection represents a hornet detection event from a unit.
type Detection struct {
	ID              string     `json:"id"`
	TenantID        string     `json:"tenant_id,omitempty"`
	UnitID          string     `json:"unit_id"`
	UnitName        *string    `json:"unit_name,omitempty"` // Joined from units table
	SiteID          string     `json:"site_id"`
	DetectedAt      time.Time  `json:"detected_at"`
	Confidence      *float64   `json:"confidence,omitempty"`
	SizePixels      *int       `json:"size_pixels,omitempty"`
	HoverDurationMs *int       `json:"hover_duration_ms,omitempty"`
	LaserActivated  bool       `json:"laser_activated"`
	ClipID          *string    `json:"clip_id,omitempty"`
	ClipFilename    *string    `json:"clip_filename,omitempty"`
	TemperatureC    *float64   `json:"temperature_c,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
}

// CreateDetectionInput contains the fields needed to create a new detection.
type CreateDetectionInput struct {
	DetectedAt      time.Time `json:"detected_at"`
	Confidence      *float64  `json:"confidence,omitempty"`
	SizePixels      *int      `json:"size_pixels,omitempty"`
	HoverDurationMs *int      `json:"hover_duration_ms,omitempty"`
	LaserActivated  bool      `json:"laser_activated"`
	ClipFilename    *string   `json:"clip_filename,omitempty"`
}

// DetectionStats contains aggregated detection statistics.
type DetectionStats struct {
	TotalDetections  int       `json:"total_detections"`
	LaserActivations int       `json:"laser_activations"`
	HourlyBreakdown  []int     `json:"hourly_breakdown"` // 24 elements, one per hour
	AvgConfidence    *float64  `json:"avg_confidence,omitempty"`
	FirstDetection   *time.Time `json:"first_detection,omitempty"`
	LastDetection    *time.Time `json:"last_detection,omitempty"`
}

// ListDetectionsParams contains parameters for listing detections.
type ListDetectionsParams struct {
	SiteID  string
	UnitID  *string
	From    time.Time
	To      time.Time
	Page    int
	PerPage int
}

// GetDetection retrieves a detection by ID.
func GetDetection(ctx context.Context, conn *pgxpool.Conn, id string) (*Detection, error) {
	var d Detection
	err := conn.QueryRow(ctx,
		`SELECT id, tenant_id, unit_id, site_id, detected_at, confidence, size_pixels, hover_duration_ms, laser_activated, clip_id, clip_filename, temperature_c, created_at
		 FROM detections
		 WHERE id = $1`,
		id,
	).Scan(&d.ID, &d.TenantID, &d.UnitID, &d.SiteID, &d.DetectedAt,
		&d.Confidence, &d.SizePixels, &d.HoverDurationMs, &d.LaserActivated,
		&d.ClipID, &d.ClipFilename, &d.TemperatureC, &d.CreatedAt)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("storage: failed to get detection: %w", err)
	}

	return &d, nil
}

// CreateDetection creates a new detection record.
// tenantID and siteID are derived from the unit.
func CreateDetection(ctx context.Context, conn *pgxpool.Conn, tenantID, unitID, siteID string, input *CreateDetectionInput, temperatureC *float64) (*Detection, error) {
	var detection Detection
	err := conn.QueryRow(ctx,
		`INSERT INTO detections (tenant_id, unit_id, site_id, detected_at, confidence, size_pixels, hover_duration_ms, laser_activated, clip_filename, temperature_c)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		 RETURNING id, tenant_id, unit_id, site_id, detected_at, confidence, size_pixels, hover_duration_ms, laser_activated, clip_id, clip_filename, temperature_c, created_at`,
		tenantID, unitID, siteID, input.DetectedAt, input.Confidence, input.SizePixels, input.HoverDurationMs, input.LaserActivated, input.ClipFilename, temperatureC,
	).Scan(&detection.ID, &detection.TenantID, &detection.UnitID, &detection.SiteID, &detection.DetectedAt,
		&detection.Confidence, &detection.SizePixels, &detection.HoverDurationMs, &detection.LaserActivated,
		&detection.ClipID, &detection.ClipFilename, &detection.TemperatureC, &detection.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("storage: failed to create detection: %w", err)
	}

	return &detection, nil
}

// ListDetections returns detections for a site within a date range.
// Includes unit name from a join with the units table.
func ListDetections(ctx context.Context, conn *pgxpool.Conn, params *ListDetectionsParams) ([]Detection, int, error) {
	// Build WHERE clause
	whereClause := `WHERE d.site_id = $1 AND d.detected_at >= $2 AND d.detected_at < $3`
	args := []any{params.SiteID, params.From, params.To}
	argIdx := 4

	if params.UnitID != nil {
		whereClause += fmt.Sprintf(` AND d.unit_id = $%d`, argIdx)
		args = append(args, *params.UnitID)
		argIdx++
	}

	// Count total (use all args up to current argIdx-1, which is the count before adding pagination)
	var total int
	countQuery := `SELECT COUNT(*) FROM detections d ` + whereClause
	countArgs := make([]any, len(args))
	copy(countArgs, args)
	err := conn.QueryRow(ctx, countQuery, countArgs...).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("storage: failed to count detections: %w", err)
	}

	// Fetch page
	offset := (params.Page - 1) * params.PerPage
	query := `SELECT d.id, d.tenant_id, d.unit_id, u.name, d.site_id, d.detected_at, d.confidence, d.size_pixels, d.hover_duration_ms, d.laser_activated, d.clip_id, d.clip_filename, d.temperature_c, d.created_at
		 FROM detections d
		 LEFT JOIN units u ON u.id = d.unit_id
		 ` + whereClause + `
		 ORDER BY d.detected_at DESC
		 LIMIT $` + fmt.Sprintf("%d", argIdx) + ` OFFSET $` + fmt.Sprintf("%d", argIdx+1)
	args = append(args, params.PerPage, offset)

	rows, err := conn.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("storage: failed to list detections: %w", err)
	}
	defer rows.Close()

	var detections []Detection
	for rows.Next() {
		var d Detection
		err := rows.Scan(&d.ID, &d.TenantID, &d.UnitID, &d.UnitName, &d.SiteID, &d.DetectedAt,
			&d.Confidence, &d.SizePixels, &d.HoverDurationMs, &d.LaserActivated,
			&d.ClipID, &d.ClipFilename, &d.TemperatureC, &d.CreatedAt)
		if err != nil {
			return nil, 0, fmt.Errorf("storage: failed to scan detection: %w", err)
		}
		// Don't expose tenant_id in list response
		d.TenantID = ""
		detections = append(detections, d)
	}

	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("storage: error iterating detections: %w", err)
	}

	return detections, total, nil
}

// GetDetectionStats returns aggregated statistics for a site within a date range.
func GetDetectionStats(ctx context.Context, conn *pgxpool.Conn, siteID string, from, to time.Time, timezone string) (*DetectionStats, error) {
	stats := &DetectionStats{
		HourlyBreakdown: make([]int, 24),
	}

	// Get totals and timestamps
	err := conn.QueryRow(ctx,
		`SELECT
			COUNT(*) AS total,
			COUNT(*) FILTER (WHERE laser_activated = true) AS laser_count,
			AVG(confidence) AS avg_conf,
			MIN(detected_at) AS first_det,
			MAX(detected_at) AS last_det
		 FROM detections
		 WHERE site_id = $1 AND detected_at >= $2 AND detected_at < $3`,
		siteID, from, to,
	).Scan(&stats.TotalDetections, &stats.LaserActivations, &stats.AvgConfidence, &stats.FirstDetection, &stats.LastDetection)

	if err != nil {
		return nil, fmt.Errorf("storage: failed to get detection stats: %w", err)
	}

	// Get hourly breakdown
	rows, err := conn.Query(ctx,
		`SELECT
			EXTRACT(HOUR FROM detected_at AT TIME ZONE $4)::INTEGER AS hour,
			COUNT(*) AS count
		 FROM detections
		 WHERE site_id = $1 AND detected_at >= $2 AND detected_at < $3
		 GROUP BY hour
		 ORDER BY hour`,
		siteID, from, to, timezone,
	)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get hourly breakdown: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var hour, count int
		if err := rows.Scan(&hour, &count); err != nil {
			return nil, fmt.Errorf("storage: failed to scan hourly breakdown: %w", err)
		}
		if hour >= 0 && hour < 24 {
			stats.HourlyBreakdown[hour] = count
		}
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating hourly breakdown: %w", err)
	}

	return stats, nil
}

// CountDetections returns the total number of detections for a site.
func CountDetections(ctx context.Context, conn *pgxpool.Conn, siteID string) (int, error) {
	var count int
	err := conn.QueryRow(ctx,
		`SELECT COUNT(*) FROM detections WHERE site_id = $1`,
		siteID,
	).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("storage: failed to count detections: %w", err)
	}
	return count, nil
}

// TemperatureCorrelationPoint represents a single data point for temperature correlation.
// For range != "day": one point per day with daily aggregates.
// For range == "day": one point per hour with hourly aggregates.
type TemperatureCorrelationPoint struct {
	// Date is set for daily aggregates (range != "day")
	Date string `json:"date,omitempty"`
	// Hour is set for hourly aggregates (range == "day", 0-23)
	Hour *int `json:"hour,omitempty"`
	// AvgTemp is the average temperature for this period
	AvgTemp float64 `json:"avg_temp"`
	// DetectionCount is the number of detections for this period
	DetectionCount int `json:"detection_count"`
}

// TemperatureCorrelation contains temperature correlation data for a site.
type TemperatureCorrelation struct {
	Points     []TemperatureCorrelationPoint `json:"data"`
	IsHourly   bool                          `json:"is_hourly"`
	TotalCount int                           `json:"total_count"`
}

// GetTemperatureCorrelation returns temperature vs detection correlation data.
// For range != "day": returns daily aggregates.
// For range == "day": returns hourly aggregates for that specific day.
func GetTemperatureCorrelation(ctx context.Context, conn *pgxpool.Conn, siteID string, from, to time.Time, timezone string, isHourly bool) (*TemperatureCorrelation, error) {
	result := &TemperatureCorrelation{
		Points:   make([]TemperatureCorrelationPoint, 0),
		IsHourly: isHourly,
	}

	if isHourly {
		// Hourly aggregates for a single day
		rows, err := conn.Query(ctx,
			`SELECT
				EXTRACT(HOUR FROM detected_at AT TIME ZONE $4)::INTEGER AS hour,
				AVG(temperature_c) AS avg_temp,
				COUNT(*) AS detection_count
			 FROM detections
			 WHERE site_id = $1
			   AND detected_at >= $2 AND detected_at < $3
			   AND temperature_c IS NOT NULL
			 GROUP BY hour
			 ORDER BY hour`,
			siteID, from, to, timezone,
		)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to get hourly temperature correlation: %w", err)
		}
		defer rows.Close()

		for rows.Next() {
			var point TemperatureCorrelationPoint
			var hour int
			var avgTemp float64
			if err := rows.Scan(&hour, &avgTemp, &point.DetectionCount); err != nil {
				return nil, fmt.Errorf("storage: failed to scan hourly correlation point: %w", err)
			}
			point.Hour = &hour
			point.AvgTemp = avgTemp
			result.Points = append(result.Points, point)
			result.TotalCount += point.DetectionCount
		}

		if err := rows.Err(); err != nil {
			return nil, fmt.Errorf("storage: error iterating hourly correlation: %w", err)
		}
	} else {
		// Daily aggregates for multi-day ranges
		rows, err := conn.Query(ctx,
			`SELECT
				TO_CHAR(DATE(detected_at AT TIME ZONE $4), 'YYYY-MM-DD') AS date,
				AVG(temperature_c) AS avg_temp,
				COUNT(*) AS detection_count
			 FROM detections
			 WHERE site_id = $1
			   AND detected_at >= $2 AND detected_at < $3
			   AND temperature_c IS NOT NULL
			 GROUP BY DATE(detected_at AT TIME ZONE $4)
			 ORDER BY date`,
			siteID, from, to, timezone,
		)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to get daily temperature correlation: %w", err)
		}
		defer rows.Close()

		for rows.Next() {
			var point TemperatureCorrelationPoint
			var avgTemp float64
			if err := rows.Scan(&point.Date, &avgTemp, &point.DetectionCount); err != nil {
				return nil, fmt.Errorf("storage: failed to scan daily correlation point: %w", err)
			}
			point.AvgTemp = avgTemp
			result.Points = append(result.Points, point)
			result.TotalCount += point.DetectionCount
		}

		if err := rows.Err(); err != nil {
			return nil, fmt.Errorf("storage: error iterating daily correlation: %w", err)
		}
	}

	return result, nil
}

// TrendDataPoint represents a single data point for trend charts.
type TrendDataPoint struct {
	// Label is the display label for this point (e.g., "Mon", "Jan 15", "W32")
	Label string `json:"label"`
	// Date is the ISO date string for this point
	Date string `json:"date,omitempty"`
	// Hour is set for hourly aggregates (0-23)
	Hour *int `json:"hour,omitempty"`
	// Count is the number of detections for this period
	Count int `json:"count"`
}

// TrendData contains trend data for a site.
type TrendData struct {
	Points          []TrendDataPoint `json:"data"`
	Aggregation     string           `json:"aggregation"` // hourly, daily, weekly
	TotalDetections int              `json:"total_detections"`
}

// GetTrendData returns detection trend data for charts.
// Aggregation level depends on time range:
// - day: hourly
// - week/month: daily
// - season/year/all: weekly
func GetTrendData(ctx context.Context, conn *pgxpool.Conn, siteID string, from, to time.Time, timezone string, rangeType string) (*TrendData, error) {
	result := &TrendData{
		Points: make([]TrendDataPoint, 0),
	}

	var query string
	switch rangeType {
	case "day":
		// Hourly aggregation for single day
		result.Aggregation = "hourly"
		query = `SELECT
			EXTRACT(HOUR FROM detected_at AT TIME ZONE $4)::INTEGER AS hour,
			COUNT(*) AS count
		 FROM detections
		 WHERE site_id = $1 AND detected_at >= $2 AND detected_at < $3
		 GROUP BY hour
		 ORDER BY hour`

		rows, err := conn.Query(ctx, query, siteID, from, to, timezone)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to get hourly trend: %w", err)
		}
		defer rows.Close()

		// Create all 24 hours with zero counts
		hourCounts := make([]int, 24)
		for rows.Next() {
			var hour, count int
			if err := rows.Scan(&hour, &count); err != nil {
				return nil, fmt.Errorf("storage: failed to scan hourly trend: %w", err)
			}
			if hour >= 0 && hour < 24 {
				hourCounts[hour] = count
				result.TotalDetections += count
			}
		}
		if err := rows.Err(); err != nil {
			return nil, fmt.Errorf("storage: error iterating hourly trend: %w", err)
		}

		// Build data points for all hours
		for h := 0; h < 24; h++ {
			label := fmt.Sprintf("%02d:00", h)
			hour := h
			result.Points = append(result.Points, TrendDataPoint{
				Label: label,
				Hour:  &hour,
				Count: hourCounts[h],
			})
		}

	case "week", "month":
		// Daily aggregation
		result.Aggregation = "daily"
		query = `SELECT
			TO_CHAR(DATE(detected_at AT TIME ZONE $4), 'YYYY-MM-DD') AS date,
			TO_CHAR(DATE(detected_at AT TIME ZONE $4), 'Dy') AS day_label,
			COUNT(*) AS count
		 FROM detections
		 WHERE site_id = $1 AND detected_at >= $2 AND detected_at < $3
		 GROUP BY DATE(detected_at AT TIME ZONE $4)
		 ORDER BY date`

		rows, err := conn.Query(ctx, query, siteID, from, to, timezone)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to get daily trend: %w", err)
		}
		defer rows.Close()

		// Build map of dates to counts
		dateCounts := make(map[string]int)
		dateLabels := make(map[string]string)
		for rows.Next() {
			var date, label string
			var count int
			if err := rows.Scan(&date, &label, &count); err != nil {
				return nil, fmt.Errorf("storage: failed to scan daily trend: %w", err)
			}
			dateCounts[date] = count
			dateLabels[date] = label
			result.TotalDetections += count
		}
		if err := rows.Err(); err != nil {
			return nil, fmt.Errorf("storage: error iterating daily trend: %w", err)
		}

		// Generate all dates in range
		loc, _ := time.LoadLocation(timezone)
		if loc == nil {
			loc = time.UTC
		}
		for d := from; d.Before(to); d = d.AddDate(0, 0, 1) {
			dLocal := d.In(loc)
			dateStr := dLocal.Format("2006-01-02")
			label := dLocal.Format("Mon")
			if rangeType == "month" {
				label = dLocal.Format("Jan 2")
			}
			if existingLabel, ok := dateLabels[dateStr]; ok {
				label = existingLabel
				if rangeType == "month" {
					label = dLocal.Format("Jan 2")
				}
			}
			result.Points = append(result.Points, TrendDataPoint{
				Label: label,
				Date:  dateStr,
				Count: dateCounts[dateStr],
			})
		}

	default:
		// Weekly aggregation for season/year/all
		result.Aggregation = "weekly"
		query = `SELECT
			DATE_TRUNC('week', detected_at AT TIME ZONE $4)::DATE AS week_start,
			COUNT(*) AS count
		 FROM detections
		 WHERE site_id = $1 AND detected_at >= $2 AND detected_at < $3
		 GROUP BY DATE_TRUNC('week', detected_at AT TIME ZONE $4)
		 ORDER BY week_start`

		rows, err := conn.Query(ctx, query, siteID, from, to, timezone)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to get weekly trend: %w", err)
		}
		defer rows.Close()

		// Build map of week starts to counts
		weekCounts := make(map[string]int)
		for rows.Next() {
			var weekStart time.Time
			var count int
			if err := rows.Scan(&weekStart, &count); err != nil {
				return nil, fmt.Errorf("storage: failed to scan weekly trend: %w", err)
			}
			weekStr := weekStart.Format("2006-01-02")
			weekCounts[weekStr] = count
			result.TotalDetections += count
		}
		if err := rows.Err(); err != nil {
			return nil, fmt.Errorf("storage: error iterating weekly trend: %w", err)
		}

		// Generate all weeks in range
		loc, _ := time.LoadLocation(timezone)
		if loc == nil {
			loc = time.UTC
		}
		// Start from the beginning of the week containing 'from'
		weekStart := from.In(loc)
		weekday := int(weekStart.Weekday())
		if weekday == 0 {
			weekday = 7
		}
		weekStart = weekStart.AddDate(0, 0, -(weekday - 1))
		weekStart = time.Date(weekStart.Year(), weekStart.Month(), weekStart.Day(), 0, 0, 0, 0, loc)

		for weekStart.Before(to) {
			weekStr := weekStart.Format("2006-01-02")
			_, week := weekStart.ISOWeek()
			label := fmt.Sprintf("W%d", week)
			if rangeType == "year" || rangeType == "all" {
				label = weekStart.Format("Jan 2")
			}
			result.Points = append(result.Points, TrendDataPoint{
				Label: label,
				Date:  weekStr,
				Count: weekCounts[weekStr],
			})
			weekStart = weekStart.AddDate(0, 0, 7)
		}
	}

	return result, nil
}

// NestEstimateStats contains statistics needed for nest radius estimation.
type NestEstimateStats struct {
	ObservationCount        int
	AvgVisitIntervalMinutes float64
	ValidIntervalsCount     int // Number of intervals used in calculation (> 0 and < 120 min)
}

// GetNestEstimateStats retrieves detection statistics for nest radius calculation.
// It calculates the average time interval between detection events.
func GetNestEstimateStats(ctx context.Context, conn *pgxpool.Conn, siteID string) (*NestEstimateStats, error) {
	// Count total observations
	var count int
	err := conn.QueryRow(ctx,
		`SELECT COUNT(*) FROM detections WHERE site_id = $1`,
		siteID,
	).Scan(&count)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to count detections for nest estimate: %w", err)
	}

	if count < 2 {
		return &NestEstimateStats{
			ObservationCount:        count,
			AvgVisitIntervalMinutes: 0,
		}, nil
	}

	// Calculate average interval between consecutive detections
	// Using LAG window function to get time difference between consecutive events
	// Also count how many valid intervals we have to assess data quality
	var avgIntervalMinutes float64
	var validIntervalsCount int
	err = conn.QueryRow(ctx,
		`WITH intervals AS (
			SELECT
				EXTRACT(EPOCH FROM (detected_at - LAG(detected_at) OVER (ORDER BY detected_at))) / 60 AS interval_minutes
			FROM detections
			WHERE site_id = $1
			ORDER BY detected_at
		)
		SELECT COALESCE(AVG(interval_minutes), 0), COUNT(*)
		FROM intervals
		WHERE interval_minutes IS NOT NULL
		  AND interval_minutes > 0
		  AND interval_minutes < 120`,
		siteID,
	).Scan(&avgIntervalMinutes, &validIntervalsCount)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to calculate avg visit interval: %w", err)
	}

	return &NestEstimateStats{
		ObservationCount:        count,
		AvgVisitIntervalMinutes: avgIntervalMinutes,
		ValidIntervalsCount:     validIntervalsCount,
	}, nil
}

// DetectionSpikeData contains data needed to evaluate detection spikes.
type DetectionSpikeData struct {
	RecentCount  int     // Detections in the recent window
	AverageDaily float64 // Average daily detections over the last 7 days
}

// GetDetectionSpikeData retrieves detection data for spike analysis.
// It returns the count of detections in the recent window (windowHours)
// and the average daily detection count over the last 7 days.
// Queries by hive using units at the same site for per-hive analysis.
func GetDetectionSpikeData(ctx context.Context, conn *pgxpool.Conn, hiveID string, windowHours int) (*DetectionSpikeData, error) {
	now := time.Now()
	windowStart := now.Add(-time.Duration(windowHours) * time.Hour)
	weekAgo := now.AddDate(0, 0, -7)

	// Get recent count (last windowHours) for units at the same site as this hive
	var recentCount int
	err := conn.QueryRow(ctx,
		`SELECT COUNT(*)
		 FROM detections
		 WHERE unit_id IN (
		   SELECT u.id FROM units u
		   JOIN hives h ON u.site_id = h.site_id
		   WHERE h.id = $1
		 )
		 AND detected_at >= $2`,
		hiveID, windowStart,
	).Scan(&recentCount)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get recent detection count: %w", err)
	}

	// Get 7-day average (excluding the recent window to avoid double-counting)
	var totalLastWeek int
	err = conn.QueryRow(ctx,
		`SELECT COUNT(*)
		 FROM detections
		 WHERE unit_id IN (
		   SELECT u.id FROM units u
		   JOIN hives h ON u.site_id = h.site_id
		   WHERE h.id = $1
		 )
		 AND detected_at >= $2 AND detected_at < $3`,
		hiveID, weekAgo, windowStart,
	).Scan(&totalLastWeek)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get weekly detection count: %w", err)
	}

	// Calculate the number of days in the comparison window
	daysInWindow := windowStart.Sub(weekAgo).Hours() / 24
	var avgDaily float64
	if daysInWindow > 0 {
		avgDaily = float64(totalLastWeek) / daysInWindow
	}

	return &DetectionSpikeData{
		RecentCount:  recentCount,
		AverageDaily: avgDaily,
	}, nil
}
