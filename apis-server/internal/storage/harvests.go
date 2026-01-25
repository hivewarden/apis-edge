package storage

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"
)

// Harvest represents a harvest record in the database.
type Harvest struct {
	ID          string          `json:"id"`
	TenantID    string          `json:"tenant_id"`
	SiteID      string          `json:"site_id"`
	HarvestedAt time.Time       `json:"harvested_at"`
	TotalKg     decimal.Decimal `json:"total_kg"`
	Notes       *string         `json:"notes,omitempty"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
	// Populated by GetHarvestByID with join
	Hives []HarvestHive `json:"hives,omitempty"`
}

// HarvestHive represents a per-hive breakdown of a harvest.
type HarvestHive struct {
	ID        string          `json:"id"`
	HarvestID string          `json:"harvest_id"`
	HiveID    string          `json:"hive_id"`
	HiveName  string          `json:"hive_name,omitempty"` // Populated from join
	Frames    *int            `json:"frames,omitempty"`
	AmountKg  decimal.Decimal `json:"amount_kg"`
	CreatedAt time.Time       `json:"created_at"`
}

// CreateHarvestInput contains the fields needed to create a new harvest.
type CreateHarvestInput struct {
	SiteID        string                   `json:"site_id"`
	HarvestedAt   time.Time                `json:"harvested_at"`
	TotalKg       decimal.Decimal          `json:"total_kg"`
	Notes         *string                  `json:"notes,omitempty"`
	HiveBreakdown []HarvestHiveInput       `json:"hive_breakdown"`
}

// HarvestHiveInput represents the per-hive input for creating a harvest.
type HarvestHiveInput struct {
	HiveID   string          `json:"hive_id"`
	Frames   *int            `json:"frames,omitempty"`
	AmountKg decimal.Decimal `json:"amount_kg"`
}

// UpdateHarvestInput contains the fields that can be updated on a harvest.
type UpdateHarvestInput struct {
	HarvestedAt   *time.Time               `json:"harvested_at,omitempty"`
	TotalKg       *decimal.Decimal         `json:"total_kg,omitempty"`
	Notes         *string                  `json:"notes,omitempty"`
	HiveBreakdown []HarvestHiveInput       `json:"hive_breakdown,omitempty"`
}

// HarvestAnalytics contains aggregated harvest data for analytics.
type HarvestAnalytics struct {
	TotalKg          float64           `json:"total_kg"`
	TotalHarvests    int               `json:"total_harvests"`
	PerHive          []HiveHarvestStat `json:"per_hive"`
	YearOverYear     []YearStat        `json:"year_over_year"`
	BestPerformingHive *BestHiveStat   `json:"best_performing_hive,omitempty"`
}

// HiveHarvestStat contains harvest statistics for a single hive.
type HiveHarvestStat struct {
	HiveID    string  `json:"hive_id"`
	HiveName  string  `json:"hive_name"`
	TotalKg   float64 `json:"total_kg"`
	Harvests  int     `json:"harvests"`
}

// YearStat contains harvest statistics for a single year.
type YearStat struct {
	Year    int     `json:"year"`
	TotalKg float64 `json:"total_kg"`
}

// BestHiveStat contains information about the best performing hive.
type BestHiveStat struct {
	HiveID        string  `json:"hive_id"`
	HiveName      string  `json:"hive_name"`
	KgPerHarvest  float64 `json:"kg_per_harvest"`
}

// CreateHarvest creates a new harvest with per-hive breakdown in a transaction.
func CreateHarvest(ctx context.Context, conn *pgxpool.Conn, tenantID string, input *CreateHarvestInput) (*Harvest, error) {
	tx, err := conn.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Insert main harvest record
	var harvest Harvest
	err = tx.QueryRow(ctx,
		`INSERT INTO harvests (tenant_id, site_id, harvested_at, total_kg, notes)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, tenant_id, site_id, harvested_at, total_kg, notes, created_at, updated_at`,
		tenantID, input.SiteID, input.HarvestedAt, input.TotalKg, input.Notes,
	).Scan(&harvest.ID, &harvest.TenantID, &harvest.SiteID, &harvest.HarvestedAt,
		&harvest.TotalKg, &harvest.Notes, &harvest.CreatedAt, &harvest.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to create harvest: %w", err)
	}

	// Insert per-hive breakdown records
	harvest.Hives = make([]HarvestHive, 0, len(input.HiveBreakdown))
	for _, hb := range input.HiveBreakdown {
		var hh HarvestHive
		err = tx.QueryRow(ctx,
			`INSERT INTO harvest_hives (harvest_id, hive_id, frames, amount_kg)
			 VALUES ($1, $2, $3, $4)
			 RETURNING id, harvest_id, hive_id, frames, amount_kg, created_at`,
			harvest.ID, hb.HiveID, hb.Frames, hb.AmountKg,
		).Scan(&hh.ID, &hh.HarvestID, &hh.HiveID, &hh.Frames, &hh.AmountKg, &hh.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to create harvest_hive for hive %s: %w", hb.HiveID, err)
		}
		harvest.Hives = append(harvest.Hives, hh)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("storage: failed to commit transaction: %w", err)
	}

	return &harvest, nil
}

// GetHarvestByID retrieves a harvest by ID with its per-hive breakdown.
func GetHarvestByID(ctx context.Context, conn *pgxpool.Conn, id string) (*Harvest, error) {
	var harvest Harvest
	err := conn.QueryRow(ctx,
		`SELECT id, tenant_id, site_id, harvested_at, total_kg, notes, created_at, updated_at
		 FROM harvests
		 WHERE id = $1`,
		id,
	).Scan(&harvest.ID, &harvest.TenantID, &harvest.SiteID, &harvest.HarvestedAt,
		&harvest.TotalKg, &harvest.Notes, &harvest.CreatedAt, &harvest.UpdatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get harvest: %w", err)
	}

	// Get per-hive breakdown with hive names
	rows, err := conn.Query(ctx,
		`SELECT hh.id, hh.harvest_id, hh.hive_id, h.name, hh.frames, hh.amount_kg, hh.created_at
		 FROM harvest_hives hh
		 JOIN hives h ON h.id = hh.hive_id
		 WHERE hh.harvest_id = $1
		 ORDER BY h.name`,
		id)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get harvest hives: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var hh HarvestHive
		err := rows.Scan(&hh.ID, &hh.HarvestID, &hh.HiveID, &hh.HiveName, &hh.Frames, &hh.AmountKg, &hh.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan harvest hive: %w", err)
		}
		harvest.Hives = append(harvest.Hives, hh)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating harvest hives: %w", err)
	}

	return &harvest, nil
}

// ListHarvestsByHive returns all harvests that include a specific hive.
func ListHarvestsByHive(ctx context.Context, conn *pgxpool.Conn, hiveID string) ([]Harvest, error) {
	rows, err := conn.Query(ctx,
		`SELECT DISTINCT h.id, h.tenant_id, h.site_id, h.harvested_at, h.total_kg, h.notes, h.created_at, h.updated_at
		 FROM harvests h
		 JOIN harvest_hives hh ON hh.harvest_id = h.id
		 WHERE hh.hive_id = $1
		 ORDER BY h.harvested_at DESC, h.created_at DESC`,
		hiveID)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list harvests by hive: %w", err)
	}
	defer rows.Close()

	var harvests []Harvest
	var harvestIDs []string
	for rows.Next() {
		var h Harvest
		err := rows.Scan(&h.ID, &h.TenantID, &h.SiteID, &h.HarvestedAt,
			&h.TotalKg, &h.Notes, &h.CreatedAt, &h.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan harvest: %w", err)
		}
		harvests = append(harvests, h)
		harvestIDs = append(harvestIDs, h.ID)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating harvests: %w", err)
	}

	// Batch load hive breakdowns (single query instead of N+1)
	hivesMap, err := batchLoadHarvestHives(ctx, conn, harvestIDs)
	if err != nil {
		return nil, err
	}
	for i := range harvests {
		harvests[i].Hives = hivesMap[harvests[i].ID]
	}

	return harvests, nil
}

// ListHarvestsBySite returns all harvests for a specific site.
func ListHarvestsBySite(ctx context.Context, conn *pgxpool.Conn, siteID string) ([]Harvest, error) {
	rows, err := conn.Query(ctx,
		`SELECT id, tenant_id, site_id, harvested_at, total_kg, notes, created_at, updated_at
		 FROM harvests
		 WHERE site_id = $1
		 ORDER BY harvested_at DESC, created_at DESC`,
		siteID)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list harvests by site: %w", err)
	}
	defer rows.Close()

	var harvests []Harvest
	var harvestIDs []string
	for rows.Next() {
		var h Harvest
		err := rows.Scan(&h.ID, &h.TenantID, &h.SiteID, &h.HarvestedAt,
			&h.TotalKg, &h.Notes, &h.CreatedAt, &h.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan harvest: %w", err)
		}
		harvests = append(harvests, h)
		harvestIDs = append(harvestIDs, h.ID)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating harvests: %w", err)
	}

	// Batch load hive breakdowns (single query instead of N+1)
	hivesMap, err := batchLoadHarvestHives(ctx, conn, harvestIDs)
	if err != nil {
		return nil, err
	}
	for i := range harvests {
		harvests[i].Hives = hivesMap[harvests[i].ID]
	}

	return harvests, nil
}

// listHarvestHives is a helper to get the per-hive breakdown for a harvest.
func listHarvestHives(ctx context.Context, conn *pgxpool.Conn, harvestID string) ([]HarvestHive, error) {
	rows, err := conn.Query(ctx,
		`SELECT hh.id, hh.harvest_id, hh.hive_id, h.name, hh.frames, hh.amount_kg, hh.created_at
		 FROM harvest_hives hh
		 JOIN hives h ON h.id = hh.hive_id
		 WHERE hh.harvest_id = $1
		 ORDER BY h.name`,
		harvestID)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list harvest hives: %w", err)
	}
	defer rows.Close()

	var hives []HarvestHive
	for rows.Next() {
		var hh HarvestHive
		err := rows.Scan(&hh.ID, &hh.HarvestID, &hh.HiveID, &hh.HiveName, &hh.Frames, &hh.AmountKg, &hh.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan harvest hive: %w", err)
		}
		hives = append(hives, hh)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating harvest hives: %w", err)
	}

	return hives, nil
}

// batchLoadHarvestHives loads hive breakdowns for multiple harvests in a single query.
// This avoids N+1 queries when listing harvests.
func batchLoadHarvestHives(ctx context.Context, conn *pgxpool.Conn, harvestIDs []string) (map[string][]HarvestHive, error) {
	if len(harvestIDs) == 0 {
		return make(map[string][]HarvestHive), nil
	}

	rows, err := conn.Query(ctx,
		`SELECT hh.id, hh.harvest_id, hh.hive_id, h.name, hh.frames, hh.amount_kg, hh.created_at
		 FROM harvest_hives hh
		 JOIN hives h ON h.id = hh.hive_id
		 WHERE hh.harvest_id = ANY($1)
		 ORDER BY hh.harvest_id, h.name`,
		harvestIDs)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to batch load harvest hives: %w", err)
	}
	defer rows.Close()

	result := make(map[string][]HarvestHive)
	for rows.Next() {
		var hh HarvestHive
		err := rows.Scan(&hh.ID, &hh.HarvestID, &hh.HiveID, &hh.HiveName, &hh.Frames, &hh.AmountKg, &hh.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan harvest hive: %w", err)
		}
		result[hh.HarvestID] = append(result[hh.HarvestID], hh)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating harvest hives: %w", err)
	}

	return result, nil
}

// UpdateHarvest updates an existing harvest and its per-hive breakdown.
func UpdateHarvest(ctx context.Context, conn *pgxpool.Conn, id string, input *UpdateHarvestInput) (*Harvest, error) {
	tx, err := conn.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Get current harvest
	current, err := GetHarvestByID(ctx, conn, id)
	if err != nil {
		return nil, err
	}

	// Apply updates
	harvestedAt := current.HarvestedAt
	if input.HarvestedAt != nil {
		harvestedAt = *input.HarvestedAt
	}

	totalKg := current.TotalKg
	if input.TotalKg != nil {
		totalKg = *input.TotalKg
	}

	notes := current.Notes
	if input.Notes != nil {
		notes = input.Notes
	}

	// Update main harvest record
	var harvest Harvest
	err = tx.QueryRow(ctx,
		`UPDATE harvests
		 SET harvested_at = $2, total_kg = $3, notes = $4, updated_at = NOW()
		 WHERE id = $1
		 RETURNING id, tenant_id, site_id, harvested_at, total_kg, notes, created_at, updated_at`,
		id, harvestedAt, totalKg, notes,
	).Scan(&harvest.ID, &harvest.TenantID, &harvest.SiteID, &harvest.HarvestedAt,
		&harvest.TotalKg, &harvest.Notes, &harvest.CreatedAt, &harvest.UpdatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to update harvest: %w", err)
	}

	// If hive breakdown is provided, replace all existing entries
	if len(input.HiveBreakdown) > 0 {
		// Delete existing breakdown
		_, err = tx.Exec(ctx, `DELETE FROM harvest_hives WHERE harvest_id = $1`, id)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to delete existing harvest hives: %w", err)
		}

		// Insert new breakdown
		harvest.Hives = make([]HarvestHive, 0, len(input.HiveBreakdown))
		for _, hb := range input.HiveBreakdown {
			var hh HarvestHive
			err = tx.QueryRow(ctx,
				`INSERT INTO harvest_hives (harvest_id, hive_id, frames, amount_kg)
				 VALUES ($1, $2, $3, $4)
				 RETURNING id, harvest_id, hive_id, frames, amount_kg, created_at`,
				id, hb.HiveID, hb.Frames, hb.AmountKg,
			).Scan(&hh.ID, &hh.HarvestID, &hh.HiveID, &hh.Frames, &hh.AmountKg, &hh.CreatedAt)
			if err != nil {
				return nil, fmt.Errorf("storage: failed to insert harvest hive: %w", err)
			}
			harvest.Hives = append(harvest.Hives, hh)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("storage: failed to commit transaction: %w", err)
	}

	// Reload with hive names if breakdown wasn't updated
	if len(harvest.Hives) == 0 {
		harvest.Hives, err = listHarvestHives(ctx, conn, id)
		if err != nil {
			return nil, err
		}
	}

	return &harvest, nil
}

// DeleteHarvest deletes a harvest and its per-hive breakdown (cascade).
func DeleteHarvest(ctx context.Context, conn *pgxpool.Conn, id string) error {
	result, err := conn.Exec(ctx, `DELETE FROM harvests WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("storage: failed to delete harvest: %w", err)
	}

	if result.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

// IsFirstHarvest checks if this would be the first harvest for a tenant.
func IsFirstHarvest(ctx context.Context, conn *pgxpool.Conn, tenantID string) (bool, error) {
	var count int
	err := conn.QueryRow(ctx, `SELECT COUNT(*) FROM harvests WHERE tenant_id = $1`, tenantID).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("storage: failed to check first harvest: %w", err)
	}
	return count == 0, nil
}

// GetHarvestAnalytics returns aggregated harvest statistics for a tenant.
func GetHarvestAnalytics(ctx context.Context, conn *pgxpool.Conn, tenantID string) (*HarvestAnalytics, error) {
	analytics := &HarvestAnalytics{
		PerHive:      []HiveHarvestStat{},
		YearOverYear: []YearStat{},
	}

	// Get total kg and harvest count
	err := conn.QueryRow(ctx,
		`SELECT COALESCE(SUM(total_kg), 0), COUNT(*)
		 FROM harvests
		 WHERE tenant_id = $1`,
		tenantID,
	).Scan(&analytics.TotalKg, &analytics.TotalHarvests)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get harvest totals: %w", err)
	}

	// Get per-hive statistics
	rows, err := conn.Query(ctx,
		`SELECT hh.hive_id, hv.name, COALESCE(SUM(hh.amount_kg), 0), COUNT(*)
		 FROM harvest_hives hh
		 JOIN hives hv ON hv.id = hh.hive_id
		 JOIN harvests h ON h.id = hh.harvest_id
		 WHERE h.tenant_id = $1
		 GROUP BY hh.hive_id, hv.name
		 ORDER BY SUM(hh.amount_kg) DESC`,
		tenantID)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get per-hive stats: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var stat HiveHarvestStat
		var totalDecimal decimal.Decimal
		err := rows.Scan(&stat.HiveID, &stat.HiveName, &totalDecimal, &stat.Harvests)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan hive stat: %w", err)
		}
		stat.TotalKg, _ = totalDecimal.Float64()
		analytics.PerHive = append(analytics.PerHive, stat)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating hive stats: %w", err)
	}

	// Find best performing hive (by kg per harvest)
	if len(analytics.PerHive) > 0 {
		var best *BestHiveStat
		var bestKgPerHarvest float64
		for _, stat := range analytics.PerHive {
			if stat.Harvests > 0 {
				kgPerHarvest := stat.TotalKg / float64(stat.Harvests)
				if kgPerHarvest > bestKgPerHarvest {
					bestKgPerHarvest = kgPerHarvest
					best = &BestHiveStat{
						HiveID:       stat.HiveID,
						HiveName:     stat.HiveName,
						KgPerHarvest: kgPerHarvest,
					}
				}
			}
		}
		analytics.BestPerformingHive = best
	}

	// Get year-over-year stats
	rows, err = conn.Query(ctx,
		`SELECT EXTRACT(YEAR FROM harvested_at)::int, COALESCE(SUM(total_kg), 0)
		 FROM harvests
		 WHERE tenant_id = $1
		 GROUP BY EXTRACT(YEAR FROM harvested_at)
		 ORDER BY EXTRACT(YEAR FROM harvested_at)`,
		tenantID)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get year-over-year stats: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var stat YearStat
		var totalDecimal decimal.Decimal
		err := rows.Scan(&stat.Year, &totalDecimal)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan year stat: %w", err)
		}
		stat.TotalKg, _ = totalDecimal.Float64()
		analytics.YearOverYear = append(analytics.YearOverYear, stat)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating year stats: %w", err)
	}

	return analytics, nil
}

// GetHarvestSeasonTotals returns the harvest totals for the current beekeeping season.
func GetHarvestSeasonTotals(ctx context.Context, conn *pgxpool.Conn, siteID string) (float64, int, error) {
	// Determine season start (April 1)
	now := time.Now()
	var seasonStart time.Time
	if now.Month() >= time.April {
		seasonStart = time.Date(now.Year(), time.April, 1, 0, 0, 0, 0, time.UTC)
	} else {
		seasonStart = time.Date(now.Year()-1, time.April, 1, 0, 0, 0, 0, time.UTC)
	}

	var totalKg decimal.Decimal
	var harvestCount int
	err := conn.QueryRow(ctx,
		`SELECT COALESCE(SUM(total_kg), 0), COUNT(*)
		 FROM harvests
		 WHERE site_id = $1 AND harvested_at >= $2`,
		siteID, seasonStart,
	).Scan(&totalKg, &harvestCount)
	if err != nil {
		return 0, 0, fmt.Errorf("storage: failed to get season totals: %w", err)
	}

	total, _ := totalKg.Float64()
	return total, harvestCount, nil
}

// CountHarvestsByHive returns the total number of harvests that include a specific hive.
func CountHarvestsByHive(ctx context.Context, conn *pgxpool.Conn, hiveID string) (int, error) {
	var count int
	err := conn.QueryRow(ctx,
		`SELECT COUNT(DISTINCT harvest_id) FROM harvest_hives WHERE hive_id = $1`,
		hiveID,
	).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("storage: failed to count harvests: %w", err)
	}
	return count, nil
}
