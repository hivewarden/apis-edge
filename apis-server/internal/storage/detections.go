package storage

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Detection represents a hornet detection event in the database.
type Detection struct {
	ID              string    `json:"id"`
	TenantID        string    `json:"tenant_id"`
	UnitID          string    `json:"unit_id"`
	SiteID          string    `json:"site_id"`
	DetectedAt      time.Time `json:"detected_at"`
	Confidence      *float64  `json:"confidence,omitempty"`
	SizePixels      *int      `json:"size_pixels,omitempty"`
	HoverDurationMs *int      `json:"hover_duration_ms,omitempty"`
	LaserActivated  bool      `json:"laser_activated"`
	ClipID          *string   `json:"clip_id,omitempty"`
	TemperatureC    *float64  `json:"temperature_c,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
}

// CreateDetectionInput contains the fields needed to create a detection.
type CreateDetectionInput struct {
	UnitID          string   `json:"unit_id"`
	SiteID          string   `json:"site_id"`
	DetectedAt      string   `json:"detected_at"`
	Confidence      *float64 `json:"confidence,omitempty"`
	SizePixels      *int     `json:"size_pixels,omitempty"`
	HoverDurationMs *int     `json:"hover_duration_ms,omitempty"`
	LaserActivated  bool     `json:"laser_activated"`
	ClipFilename    *string  `json:"clip_filename,omitempty"`
	TemperatureC    *float64 `json:"temperature_c,omitempty"`
}

// DetectionStats contains aggregated detection statistics.
type DetectionStats struct {
	TotalDetections  int       `json:"total_detections"`
	LaserActivations int       `json:"laser_activations"`
	HourlyBreakdown  [24]int   `json:"hourly_breakdown"`
	AvgConfidence    *float64  `json:"avg_confidence,omitempty"`
	FirstDetection   *time.Time `json:"first_detection,omitempty"`
	LastDetection    *time.Time `json:"last_detection,omitempty"`
}

// HourlyCount represents detections for a single hour.
type HourlyCount struct {
	Hour  int `json:"hour"`
	Count int `json:"count"`
}

// DailyTrend represents detection count for a single day.
type DailyTrend struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
}

// TemperatureCorrelation represents a data point for temperature vs detections.
type TemperatureCorrelation struct {
	Date         string   `json:"date"`
	TemperatureC float64  `json:"temperature_c"`
	Count        int      `json:"count"`
}

// DetectionListParams contains parameters for listing detections.
type DetectionListParams struct {
	SiteID *string
	UnitID *string
	From   *time.Time
	To     *time.Time
	Limit  int
	Offset int
}

// CreateDetection creates a new detection record.
func CreateDetection(ctx context.Context, conn *pgxpool.Conn, tenantID string, input *CreateDetectionInput) (*Detection, error) {
	detectedAt, err := time.Parse(time.RFC3339, input.DetectedAt)
	if err != nil {
		return nil, fmt.Errorf("storage: invalid detected_at format: %w", err)
	}

	var detection Detection
	err = conn.QueryRow(ctx,
		`INSERT INTO detections (tenant_id, unit_id, site_id, detected_at, confidence, size_pixels, hover_duration_ms, laser_activated, temperature_c)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		 RETURNING id, tenant_id, unit_id, site_id, detected_at, confidence, size_pixels, hover_duration_ms, laser_activated, clip_id, temperature_c, created_at`,
		tenantID, input.UnitID, input.SiteID, detectedAt, input.Confidence, input.SizePixels,
		input.HoverDurationMs, input.LaserActivated, input.TemperatureC,
	).Scan(&detection.ID, &detection.TenantID, &detection.UnitID, &detection.SiteID,
		&detection.DetectedAt, &detection.Confidence, &detection.SizePixels,
		&detection.HoverDurationMs, &detection.LaserActivated, &detection.ClipID,
		&detection.TemperatureC, &detection.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("storage: failed to create detection: %w", err)
	}
	return &detection, nil
}

// ListDetections returns detections matching the given parameters.
func ListDetections(ctx context.Context, conn *pgxpool.Conn, params *DetectionListParams) ([]Detection, int, error) {
	// Build query dynamically based on parameters
	query := `SELECT id, tenant_id, unit_id, site_id, detected_at, confidence, size_pixels,
	          hover_duration_ms, laser_activated, clip_id, temperature_c, created_at
	          FROM detections WHERE 1=1`
	countQuery := `SELECT COUNT(*) FROM detections WHERE 1=1`

	var args []interface{}
	argNum := 1

	if params.SiteID != nil {
		query += fmt.Sprintf(" AND site_id = $%d", argNum)
		countQuery += fmt.Sprintf(" AND site_id = $%d", argNum)
		args = append(args, *params.SiteID)
		argNum++
	}

	if params.UnitID != nil {
		query += fmt.Sprintf(" AND unit_id = $%d", argNum)
		countQuery += fmt.Sprintf(" AND unit_id = $%d", argNum)
		args = append(args, *params.UnitID)
		argNum++
	}

	if params.From != nil {
		query += fmt.Sprintf(" AND detected_at >= $%d", argNum)
		countQuery += fmt.Sprintf(" AND detected_at >= $%d", argNum)
		args = append(args, *params.From)
		argNum++
	}

	if params.To != nil {
		query += fmt.Sprintf(" AND detected_at <= $%d", argNum)
		countQuery += fmt.Sprintf(" AND detected_at <= $%d", argNum)
		args = append(args, *params.To)
		argNum++
	}

	// Get total count
	var total int
	err := conn.QueryRow(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("storage: failed to count detections: %w", err)
	}

	// Add ordering and pagination
	query += " ORDER BY detected_at DESC"

	if params.Limit > 0 {
		query += fmt.Sprintf(" LIMIT $%d", argNum)
		args = append(args, params.Limit)
		argNum++
	}

	if params.Offset > 0 {
		query += fmt.Sprintf(" OFFSET $%d", argNum)
		args = append(args, params.Offset)
	}

	rows, err := conn.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("storage: failed to list detections: %w", err)
	}
	defer rows.Close()

	var detections []Detection
	for rows.Next() {
		var d Detection
		err := rows.Scan(&d.ID, &d.TenantID, &d.UnitID, &d.SiteID, &d.DetectedAt,
			&d.Confidence, &d.SizePixels, &d.HoverDurationMs, &d.LaserActivated,
			&d.ClipID, &d.TemperatureC, &d.CreatedAt)
		if err != nil {
			return nil, 0, fmt.Errorf("storage: failed to scan detection: %w", err)
		}
		detections = append(detections, d)
	}

	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("storage: error iterating detections: %w", err)
	}

	return detections, total, nil
}

// GetDetectionByID retrieves a single detection by ID.
func GetDetectionByID(ctx context.Context, conn *pgxpool.Conn, id string) (*Detection, error) {
	var d Detection
	err := conn.QueryRow(ctx,
		`SELECT id, tenant_id, unit_id, site_id, detected_at, confidence, size_pixels,
		        hover_duration_ms, laser_activated, clip_id, temperature_c, created_at
		 FROM detections WHERE id = $1`,
		id,
	).Scan(&d.ID, &d.TenantID, &d.UnitID, &d.SiteID, &d.DetectedAt,
		&d.Confidence, &d.SizePixels, &d.HoverDurationMs, &d.LaserActivated,
		&d.ClipID, &d.TemperatureC, &d.CreatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get detection: %w", err)
	}
	return &d, nil
}

// GetDetectionStats returns aggregated statistics for the given parameters.
func GetDetectionStats(ctx context.Context, conn *pgxpool.Conn, siteID string, from, to time.Time) (*DetectionStats, error) {
	stats := &DetectionStats{}

	// Get total counts and averages
	err := conn.QueryRow(ctx,
		`SELECT
			COUNT(*),
			COUNT(*) FILTER (WHERE laser_activated = true),
			AVG(confidence),
			MIN(detected_at),
			MAX(detected_at)
		 FROM detections
		 WHERE site_id = $1 AND detected_at >= $2 AND detected_at <= $3`,
		siteID, from, to,
	).Scan(&stats.TotalDetections, &stats.LaserActivations, &stats.AvgConfidence,
		&stats.FirstDetection, &stats.LastDetection)

	if err != nil {
		return nil, fmt.Errorf("storage: failed to get detection stats: %w", err)
	}

	// Get hourly breakdown
	rows, err := conn.Query(ctx,
		`SELECT EXTRACT(HOUR FROM detected_at)::int AS hour, COUNT(*)
		 FROM detections
		 WHERE site_id = $1 AND detected_at >= $2 AND detected_at <= $3
		 GROUP BY hour
		 ORDER BY hour`,
		siteID, from, to,
	)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get hourly breakdown: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var hour, count int
		if err := rows.Scan(&hour, &count); err != nil {
			return nil, fmt.Errorf("storage: failed to scan hourly count: %w", err)
		}
		if hour >= 0 && hour < 24 {
			stats.HourlyBreakdown[hour] = count
		}
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating hourly counts: %w", err)
	}

	return stats, nil
}

// GetHourlyDetections returns hourly aggregated detection counts.
func GetHourlyDetections(ctx context.Context, conn *pgxpool.Conn, siteID string, from, to time.Time) ([]HourlyCount, error) {
	rows, err := conn.Query(ctx,
		`SELECT EXTRACT(HOUR FROM detected_at)::int AS hour, COUNT(*) AS count
		 FROM detections
		 WHERE site_id = $1 AND detected_at >= $2 AND detected_at <= $3
		 GROUP BY hour
		 ORDER BY hour`,
		siteID, from, to,
	)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get hourly detections: %w", err)
	}
	defer rows.Close()

	// Initialize all 24 hours with zero counts
	hourly := make([]HourlyCount, 24)
	for i := 0; i < 24; i++ {
		hourly[i] = HourlyCount{Hour: i, Count: 0}
	}

	for rows.Next() {
		var hour, count int
		if err := rows.Scan(&hour, &count); err != nil {
			return nil, fmt.Errorf("storage: failed to scan hourly detection: %w", err)
		}
		if hour >= 0 && hour < 24 {
			hourly[hour].Count = count
		}
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating hourly detections: %w", err)
	}

	return hourly, nil
}

// GetDetectionTrend returns daily detection counts for the given range.
func GetDetectionTrend(ctx context.Context, conn *pgxpool.Conn, siteID string, from, to time.Time) ([]DailyTrend, error) {
	rows, err := conn.Query(ctx,
		`SELECT DATE(detected_at) AS date, COUNT(*) AS count
		 FROM detections
		 WHERE site_id = $1 AND detected_at >= $2 AND detected_at <= $3
		 GROUP BY date
		 ORDER BY date`,
		siteID, from, to,
	)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get detection trend: %w", err)
	}
	defer rows.Close()

	var trends []DailyTrend
	for rows.Next() {
		var dateStr string
		var count int
		if err := rows.Scan(&dateStr, &count); err != nil {
			return nil, fmt.Errorf("storage: failed to scan trend: %w", err)
		}
		trends = append(trends, DailyTrend{Date: dateStr, Count: count})
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating trends: %w", err)
	}

	return trends, nil
}

// GetTemperatureCorrelation returns temperature vs detection count data points.
func GetTemperatureCorrelation(ctx context.Context, conn *pgxpool.Conn, siteID string, from, to time.Time) ([]TemperatureCorrelation, error) {
	rows, err := conn.Query(ctx,
		`SELECT DATE(detected_at) AS date,
		        AVG(temperature_c) AS avg_temp,
		        COUNT(*) AS count
		 FROM detections
		 WHERE site_id = $1
		   AND detected_at >= $2
		   AND detected_at <= $3
		   AND temperature_c IS NOT NULL
		 GROUP BY date
		 ORDER BY date`,
		siteID, from, to,
	)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get temperature correlation: %w", err)
	}
	defer rows.Close()

	var correlations []TemperatureCorrelation
	for rows.Next() {
		var dateStr string
		var avgTemp float64
		var count int
		if err := rows.Scan(&dateStr, &avgTemp, &count); err != nil {
			return nil, fmt.Errorf("storage: failed to scan correlation: %w", err)
		}
		correlations = append(correlations, TemperatureCorrelation{
			Date:         dateStr,
			TemperatureC: avgTemp,
			Count:        count,
		})
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating correlations: %w", err)
	}

	return correlations, nil
}
