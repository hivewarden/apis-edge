package storage

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// WeatherSnapshot represents a cached weather data point.
type WeatherSnapshot struct {
	ID           string    `json:"id"`
	TenantID     string    `json:"tenant_id"`
	SiteID       string    `json:"site_id"`
	TemperatureC float64   `json:"temperature_c"`
	FeelsLikeC   *float64  `json:"feels_like_c,omitempty"`
	Humidity     *int      `json:"humidity,omitempty"`
	WeatherCode  *int      `json:"weather_code,omitempty"`
	WindSpeedKmh *float64  `json:"wind_speed_kmh,omitempty"`
	RecordedAt   time.Time `json:"recorded_at"`
	CreatedAt    time.Time `json:"created_at"`
}

// CreateWeatherSnapshotInput contains the fields needed to create a weather snapshot.
type CreateWeatherSnapshotInput struct {
	TemperatureC float64
	FeelsLikeC   *float64
	Humidity     *int
	WeatherCode  *int
	WindSpeedKmh *float64
	RecordedAt   time.Time
}

// CreateWeatherSnapshot saves a new weather snapshot to the database.
func CreateWeatherSnapshot(ctx context.Context, conn *pgxpool.Conn, tenantID, siteID string, input *CreateWeatherSnapshotInput) (*WeatherSnapshot, error) {
	var snapshot WeatherSnapshot
	err := conn.QueryRow(ctx,
		`INSERT INTO weather_snapshots (tenant_id, site_id, temperature_c, feels_like_c, humidity, weather_code, wind_speed_kmh, recorded_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 RETURNING id, tenant_id, site_id, temperature_c, feels_like_c, humidity, weather_code, wind_speed_kmh, recorded_at, created_at`,
		tenantID, siteID, input.TemperatureC, input.FeelsLikeC, input.Humidity, input.WeatherCode, input.WindSpeedKmh, input.RecordedAt,
	).Scan(&snapshot.ID, &snapshot.TenantID, &snapshot.SiteID, &snapshot.TemperatureC,
		&snapshot.FeelsLikeC, &snapshot.Humidity, &snapshot.WeatherCode, &snapshot.WindSpeedKmh,
		&snapshot.RecordedAt, &snapshot.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("storage: failed to create weather snapshot: %w", err)
	}
	return &snapshot, nil
}

// GetLatestWeatherSnapshot returns the most recent weather snapshot for a site.
// Returns ErrNotFound if no snapshot exists.
func GetLatestWeatherSnapshot(ctx context.Context, conn *pgxpool.Conn, siteID string) (*WeatherSnapshot, error) {
	var snapshot WeatherSnapshot
	err := conn.QueryRow(ctx,
		`SELECT id, tenant_id, site_id, temperature_c, feels_like_c, humidity, weather_code, wind_speed_kmh, recorded_at, created_at
		 FROM weather_snapshots
		 WHERE site_id = $1
		 ORDER BY recorded_at DESC
		 LIMIT 1`,
		siteID,
	).Scan(&snapshot.ID, &snapshot.TenantID, &snapshot.SiteID, &snapshot.TemperatureC,
		&snapshot.FeelsLikeC, &snapshot.Humidity, &snapshot.WeatherCode, &snapshot.WindSpeedKmh,
		&snapshot.RecordedAt, &snapshot.CreatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get latest weather snapshot: %w", err)
	}
	return &snapshot, nil
}

// GetWeatherSnapshotWithinAge returns the latest snapshot if it's within the given duration.
// Returns ErrNotFound if no recent snapshot exists.
func GetWeatherSnapshotWithinAge(ctx context.Context, conn *pgxpool.Conn, siteID string, maxAge time.Duration) (*WeatherSnapshot, error) {
	cutoff := time.Now().Add(-maxAge)

	var snapshot WeatherSnapshot
	err := conn.QueryRow(ctx,
		`SELECT id, tenant_id, site_id, temperature_c, feels_like_c, humidity, weather_code, wind_speed_kmh, recorded_at, created_at
		 FROM weather_snapshots
		 WHERE site_id = $1 AND recorded_at >= $2
		 ORDER BY recorded_at DESC
		 LIMIT 1`,
		siteID, cutoff,
	).Scan(&snapshot.ID, &snapshot.TenantID, &snapshot.SiteID, &snapshot.TemperatureC,
		&snapshot.FeelsLikeC, &snapshot.Humidity, &snapshot.WeatherCode, &snapshot.WindSpeedKmh,
		&snapshot.RecordedAt, &snapshot.CreatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get weather snapshot within age: %w", err)
	}
	return &snapshot, nil
}

// CleanupOldWeatherSnapshots removes snapshots older than the given retention period.
// Returns the number of deleted rows.
func CleanupOldWeatherSnapshots(ctx context.Context, conn *pgxpool.Conn, retention time.Duration) (int64, error) {
	cutoff := time.Now().Add(-retention)

	result, err := conn.Exec(ctx,
		`DELETE FROM weather_snapshots WHERE recorded_at < $1`,
		cutoff,
	)
	if err != nil {
		return 0, fmt.Errorf("storage: failed to cleanup old weather snapshots: %w", err)
	}
	return result.RowsAffected(), nil
}
