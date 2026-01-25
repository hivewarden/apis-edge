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

// Feeding represents a feeding record in the database.
type Feeding struct {
	ID            string          `json:"id"`
	TenantID      string          `json:"tenant_id"`
	HiveID        string          `json:"hive_id"`
	FedAt         time.Time       `json:"fed_at"`
	FeedType      string          `json:"feed_type"`
	Amount        decimal.Decimal `json:"amount"`
	Unit          string          `json:"unit"`
	Concentration *string         `json:"concentration,omitempty"`
	Notes         *string         `json:"notes,omitempty"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
}

// CreateFeedingInput contains the fields needed to create a new feeding.
type CreateFeedingInput struct {
	HiveID        string          `json:"hive_id"`
	FedAt         time.Time       `json:"fed_at"`
	FeedType      string          `json:"feed_type"`
	Amount        decimal.Decimal `json:"amount"`
	Unit          string          `json:"unit"`
	Concentration *string         `json:"concentration,omitempty"`
	Notes         *string         `json:"notes,omitempty"`
}

// UpdateFeedingInput contains the fields that can be updated on a feeding.
type UpdateFeedingInput struct {
	FedAt         *time.Time       `json:"fed_at,omitempty"`
	FeedType      *string          `json:"feed_type,omitempty"`
	Amount        *decimal.Decimal `json:"amount,omitempty"`
	Unit          *string          `json:"unit,omitempty"`
	Concentration *string          `json:"concentration,omitempty"`
	Notes         *string          `json:"notes,omitempty"`
}

// SeasonTotal represents the total amount of a feed type for a season.
type SeasonTotal struct {
	FeedType string  `json:"feed_type"`
	Unit     string  `json:"unit"`
	Total    float64 `json:"total"`
}

// CreateFeeding creates a new feeding record in the database.
func CreateFeeding(ctx context.Context, conn *pgxpool.Conn, tenantID string, input *CreateFeedingInput) (*Feeding, error) {
	var feeding Feeding
	err := conn.QueryRow(ctx,
		`INSERT INTO feedings (tenant_id, hive_id, fed_at, feed_type, amount, unit, concentration, notes)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 RETURNING id, tenant_id, hive_id, fed_at, feed_type, amount, unit, concentration, notes, created_at, updated_at`,
		tenantID, input.HiveID, input.FedAt, input.FeedType, input.Amount, input.Unit,
		input.Concentration, input.Notes,
	).Scan(&feeding.ID, &feeding.TenantID, &feeding.HiveID, &feeding.FedAt, &feeding.FeedType,
		&feeding.Amount, &feeding.Unit, &feeding.Concentration, &feeding.Notes,
		&feeding.CreatedAt, &feeding.UpdatedAt)

	if err != nil {
		return nil, fmt.Errorf("storage: failed to create feeding: %w", err)
	}

	return &feeding, nil
}

// CreateFeedingsForMultipleHives creates feeding records for multiple hives within a transaction.
func CreateFeedingsForMultipleHives(ctx context.Context, conn *pgxpool.Conn, tenantID string, hiveIDs []string, input *CreateFeedingInput) ([]Feeding, error) {
	feedings := make([]Feeding, 0, len(hiveIDs))

	// Use a transaction to ensure all-or-nothing creation
	tx, err := conn.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx) // No-op if committed

	for _, hiveID := range hiveIDs {
		var feeding Feeding
		err := tx.QueryRow(ctx,
			`INSERT INTO feedings (tenant_id, hive_id, fed_at, feed_type, amount, unit, concentration, notes)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			 RETURNING id, tenant_id, hive_id, fed_at, feed_type, amount, unit, concentration, notes, created_at, updated_at`,
			tenantID, hiveID, input.FedAt, input.FeedType, input.Amount, input.Unit,
			input.Concentration, input.Notes,
		).Scan(&feeding.ID, &feeding.TenantID, &feeding.HiveID, &feeding.FedAt, &feeding.FeedType,
			&feeding.Amount, &feeding.Unit, &feeding.Concentration, &feeding.Notes,
			&feeding.CreatedAt, &feeding.UpdatedAt)

		if err != nil {
			return nil, fmt.Errorf("storage: failed to create feeding for hive %s: %w", hiveID, err)
		}

		feedings = append(feedings, feeding)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("storage: failed to commit transaction: %w", err)
	}

	return feedings, nil
}

// ListFeedingsByHive returns all feedings for a specific hive.
func ListFeedingsByHive(ctx context.Context, conn *pgxpool.Conn, hiveID string) ([]Feeding, error) {
	rows, err := conn.Query(ctx,
		`SELECT id, tenant_id, hive_id, fed_at, feed_type, amount, unit, concentration, notes, created_at, updated_at
		 FROM feedings
		 WHERE hive_id = $1
		 ORDER BY fed_at DESC, created_at DESC`,
		hiveID)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list feedings: %w", err)
	}
	defer rows.Close()

	var feedings []Feeding
	for rows.Next() {
		var f Feeding
		err := rows.Scan(&f.ID, &f.TenantID, &f.HiveID, &f.FedAt, &f.FeedType,
			&f.Amount, &f.Unit, &f.Concentration, &f.Notes,
			&f.CreatedAt, &f.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan feeding: %w", err)
		}
		feedings = append(feedings, f)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating feedings: %w", err)
	}

	return feedings, nil
}

// GetFeedingByID retrieves a feeding by its ID.
func GetFeedingByID(ctx context.Context, conn *pgxpool.Conn, id string) (*Feeding, error) {
	var feeding Feeding
	err := conn.QueryRow(ctx,
		`SELECT id, tenant_id, hive_id, fed_at, feed_type, amount, unit, concentration, notes, created_at, updated_at
		 FROM feedings
		 WHERE id = $1`,
		id,
	).Scan(&feeding.ID, &feeding.TenantID, &feeding.HiveID, &feeding.FedAt, &feeding.FeedType,
		&feeding.Amount, &feeding.Unit, &feeding.Concentration, &feeding.Notes,
		&feeding.CreatedAt, &feeding.UpdatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get feeding: %w", err)
	}
	return &feeding, nil
}

// UpdateFeeding updates an existing feeding.
func UpdateFeeding(ctx context.Context, conn *pgxpool.Conn, id string, input *UpdateFeedingInput) (*Feeding, error) {
	// Get current feeding
	current, err := GetFeedingByID(ctx, conn, id)
	if err != nil {
		return nil, err
	}

	// Apply updates
	fedAt := current.FedAt
	if input.FedAt != nil {
		fedAt = *input.FedAt
	}

	feedType := current.FeedType
	if input.FeedType != nil {
		feedType = *input.FeedType
	}

	amount := current.Amount
	if input.Amount != nil {
		amount = *input.Amount
	}

	unit := current.Unit
	if input.Unit != nil {
		unit = *input.Unit
	}

	concentration := current.Concentration
	if input.Concentration != nil {
		concentration = input.Concentration
	}

	notes := current.Notes
	if input.Notes != nil {
		notes = input.Notes
	}

	// Update feeding
	var feeding Feeding
	err = conn.QueryRow(ctx,
		`UPDATE feedings
		 SET fed_at = $2, feed_type = $3, amount = $4, unit = $5, concentration = $6, notes = $7, updated_at = NOW()
		 WHERE id = $1
		 RETURNING id, tenant_id, hive_id, fed_at, feed_type, amount, unit, concentration, notes, created_at, updated_at`,
		id, fedAt, feedType, amount, unit, concentration, notes,
	).Scan(&feeding.ID, &feeding.TenantID, &feeding.HiveID, &feeding.FedAt, &feeding.FeedType,
		&feeding.Amount, &feeding.Unit, &feeding.Concentration, &feeding.Notes,
		&feeding.CreatedAt, &feeding.UpdatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to update feeding: %w", err)
	}

	return &feeding, nil
}

// DeleteFeeding deletes a feeding by its ID.
func DeleteFeeding(ctx context.Context, conn *pgxpool.Conn, id string) error {
	result, err := conn.Exec(ctx, `DELETE FROM feedings WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("storage: failed to delete feeding: %w", err)
	}

	if result.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

// GetFeedingSeasonTotals returns the total amount of each feed type for the current season.
// Season is defined as April 1 to March 31 (beekeeping year).
func GetFeedingSeasonTotals(ctx context.Context, conn *pgxpool.Conn, hiveID string) ([]SeasonTotal, error) {
	// Determine season start (April 1)
	now := time.Now()
	var seasonStart time.Time
	if now.Month() >= time.April {
		seasonStart = time.Date(now.Year(), time.April, 1, 0, 0, 0, 0, time.UTC)
	} else {
		seasonStart = time.Date(now.Year()-1, time.April, 1, 0, 0, 0, 0, time.UTC)
	}

	rows, err := conn.Query(ctx,
		`SELECT feed_type, unit, COALESCE(SUM(amount), 0) as total
		 FROM feedings
		 WHERE hive_id = $1 AND fed_at >= $2
		 GROUP BY feed_type, unit
		 ORDER BY feed_type`,
		hiveID, seasonStart)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get feeding season totals: %w", err)
	}
	defer rows.Close()

	var totals []SeasonTotal
	for rows.Next() {
		var t SeasonTotal
		var totalDecimal decimal.Decimal
		err := rows.Scan(&t.FeedType, &t.Unit, &totalDecimal)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan season total: %w", err)
		}
		t.Total, _ = totalDecimal.Float64()
		totals = append(totals, t)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating season totals: %w", err)
	}

	return totals, nil
}

// CountFeedingsByHive returns the total number of feedings for a hive.
func CountFeedingsByHive(ctx context.Context, conn *pgxpool.Conn, hiveID string) (int, error) {
	var count int
	err := conn.QueryRow(ctx, `SELECT COUNT(*) FROM feedings WHERE hive_id = $1`, hiveID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("storage: failed to count feedings: %w", err)
	}
	return count, nil
}
