package storage

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
)

// SeasonRecap represents a cached season recap in the database.
type SeasonRecap struct {
	ID          string          `json:"id"`
	TenantID    string          `json:"tenant_id"`
	SeasonYear  int             `json:"season_year"`
	Hemisphere  string          `json:"hemisphere"`
	SeasonStart time.Time       `json:"season_start"`
	SeasonEnd   time.Time       `json:"season_end"`
	RecapData   SeasonRecapData `json:"recap_data"`
	GeneratedAt time.Time       `json:"generated_at"`
}

// SeasonRecapData contains the aggregated recap statistics stored as JSONB.
type SeasonRecapData struct {
	SeasonDates      SeasonDates      `json:"season_dates"`
	TotalHarvestKg   float64          `json:"total_harvest_kg"`
	HornetsDeterred  int              `json:"hornets_deterred"`
	InspectionsCount int              `json:"inspections_count"`
	TreatmentsCount  int              `json:"treatments_count"`
	FeedingsCount    int              `json:"feedings_count"`
	Milestones       []Milestone      `json:"milestones"`
	PerHiveStats     []HiveSeasonStat `json:"per_hive_stats"`
	ComparisonData   *YearComparison  `json:"comparison_data,omitempty"`
}

// SeasonDates represents the start and end dates of a season.
type SeasonDates struct {
	Start       time.Time `json:"start"`
	End         time.Time `json:"end"`
	DisplayText string    `json:"display_text"` // "Aug 1 - Oct 31, 2026"
}

// Milestone represents a notable event during the season.
type Milestone struct {
	Type        string    `json:"type"`        // "first_harvest", "new_hive", "queen_replaced", "hive_loss"
	Description string    `json:"description"`
	Date        time.Time `json:"date"`
	HiveID      *string   `json:"hive_id,omitempty"`
	HiveName    *string   `json:"hive_name,omitempty"`
}

// HiveSeasonStat contains per-hive statistics for a season.
type HiveSeasonStat struct {
	HiveID       string   `json:"hive_id"`
	HiveName     string   `json:"hive_name"`
	HarvestKg    float64  `json:"harvest_kg"`
	Status       string   `json:"status"`       // "healthy", "treated", "new_queen", "lost"
	StatusDetail string   `json:"status_detail,omitempty"`
	Issues       []string `json:"issues,omitempty"`
}

// YearComparison contains year-over-year comparison data.
type YearComparison struct {
	PreviousYear      int     `json:"previous_year"`
	PreviousHarvestKg float64 `json:"previous_harvest_kg"`
	HarvestChange     float64 `json:"harvest_change_percent"`
	PreviousHornets   int     `json:"previous_hornets"`
	HornetsChange     float64 `json:"hornets_change_percent"`
}

// CreateSeasonRecapInput contains the fields needed to create a new season recap.
type CreateSeasonRecapInput struct {
	SeasonYear  int             `json:"season_year"`
	Hemisphere  string          `json:"hemisphere"`
	SeasonStart time.Time       `json:"season_start"`
	SeasonEnd   time.Time       `json:"season_end"`
	RecapData   SeasonRecapData `json:"recap_data"`
}

// CreateSeasonRecap creates a new season recap in the database.
func CreateSeasonRecap(ctx context.Context, conn *pgxpool.Conn, tenantID string, input *CreateSeasonRecapInput) (*SeasonRecap, error) {
	recapDataJSON, err := json.Marshal(input.RecapData)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to marshal recap data: %w", err)
	}

	var recap SeasonRecap
	var recapDataBytes []byte
	err = conn.QueryRow(ctx,
		`INSERT INTO season_recaps (tenant_id, season_year, hemisphere, season_start, season_end, recap_data)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 ON CONFLICT (tenant_id, season_year) DO UPDATE SET
		     hemisphere = $3,
		     season_start = $4,
		     season_end = $5,
		     recap_data = $6,
		     generated_at = NOW()
		 RETURNING id, tenant_id, season_year, hemisphere, season_start, season_end, recap_data, generated_at`,
		tenantID, input.SeasonYear, input.Hemisphere, input.SeasonStart, input.SeasonEnd, recapDataJSON,
	).Scan(&recap.ID, &recap.TenantID, &recap.SeasonYear, &recap.Hemisphere,
		&recap.SeasonStart, &recap.SeasonEnd, &recapDataBytes, &recap.GeneratedAt)

	if err != nil {
		return nil, fmt.Errorf("storage: failed to create season recap: %w", err)
	}

	if err := json.Unmarshal(recapDataBytes, &recap.RecapData); err != nil {
		return nil, fmt.Errorf("storage: failed to unmarshal recap data: %w", err)
	}

	return &recap, nil
}

// GetSeasonRecap retrieves a season recap by year for the current tenant.
func GetSeasonRecap(ctx context.Context, conn *pgxpool.Conn, tenantID string, year int) (*SeasonRecap, error) {
	var recap SeasonRecap
	var recapDataBytes []byte

	err := conn.QueryRow(ctx,
		`SELECT id, tenant_id, season_year, hemisphere, season_start, season_end, recap_data, generated_at
		 FROM season_recaps
		 WHERE tenant_id = $1 AND season_year = $2`,
		tenantID, year,
	).Scan(&recap.ID, &recap.TenantID, &recap.SeasonYear, &recap.Hemisphere,
		&recap.SeasonStart, &recap.SeasonEnd, &recapDataBytes, &recap.GeneratedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get season recap: %w", err)
	}

	if err := json.Unmarshal(recapDataBytes, &recap.RecapData); err != nil {
		return nil, fmt.Errorf("storage: failed to unmarshal recap data: %w", err)
	}

	return &recap, nil
}

// ListSeasonRecaps returns all season recaps for a tenant.
func ListSeasonRecaps(ctx context.Context, conn *pgxpool.Conn, tenantID string) ([]SeasonRecap, error) {
	rows, err := conn.Query(ctx,
		`SELECT id, tenant_id, season_year, hemisphere, season_start, season_end, recap_data, generated_at
		 FROM season_recaps
		 WHERE tenant_id = $1
		 ORDER BY season_year DESC`,
		tenantID)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list season recaps: %w", err)
	}
	defer rows.Close()

	var recaps []SeasonRecap
	for rows.Next() {
		var recap SeasonRecap
		var recapDataBytes []byte
		err := rows.Scan(&recap.ID, &recap.TenantID, &recap.SeasonYear, &recap.Hemisphere,
			&recap.SeasonStart, &recap.SeasonEnd, &recapDataBytes, &recap.GeneratedAt)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan season recap: %w", err)
		}
		if err := json.Unmarshal(recapDataBytes, &recap.RecapData); err != nil {
			log.Warn().Err(err).Str("recap_id", recap.ID).Msg("storage: failed to unmarshal recap data, using empty")
			recap.RecapData = SeasonRecapData{} // Use empty data on parse error
		}
		recaps = append(recaps, recap)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating season recaps: %w", err)
	}

	return recaps, nil
}

// DeleteSeasonRecap deletes a season recap by year (for cache invalidation).
func DeleteSeasonRecap(ctx context.Context, conn *pgxpool.Conn, tenantID string, year int) error {
	result, err := conn.Exec(ctx, `DELETE FROM season_recaps WHERE tenant_id = $1 AND season_year = $2`, tenantID, year)
	if err != nil {
		return fmt.Errorf("storage: failed to delete season recap: %w", err)
	}

	if result.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

// GetAvailableSeasons returns a list of years that have data (harvests, detections, or inspections).
func GetAvailableSeasons(ctx context.Context, conn *pgxpool.Conn, tenantID string) ([]int, error) {
	rows, err := conn.Query(ctx,
		`SELECT DISTINCT year FROM (
			SELECT EXTRACT(YEAR FROM harvested_at)::INT AS year FROM harvests WHERE tenant_id = $1
			UNION
			SELECT EXTRACT(YEAR FROM detected_at)::INT AS year FROM detections WHERE tenant_id = $1
			UNION
			SELECT EXTRACT(YEAR FROM inspected_at)::INT AS year FROM inspections WHERE tenant_id = $1
		) AS years
		ORDER BY year DESC`,
		tenantID)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get available seasons: %w", err)
	}
	defer rows.Close()

	var years []int
	for rows.Next() {
		var year int
		if err := rows.Scan(&year); err != nil {
			return nil, fmt.Errorf("storage: failed to scan year: %w", err)
		}
		years = append(years, year)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating years: %w", err)
	}

	return years, nil
}
