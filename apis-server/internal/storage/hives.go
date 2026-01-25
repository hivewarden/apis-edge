package storage

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
)

// Hive represents a beehive in the database.
type Hive struct {
	ID               string     `json:"id"`
	TenantID         string     `json:"tenant_id"`
	SiteID           string     `json:"site_id"`
	Name             string     `json:"name"`
	QueenIntroducedAt *time.Time `json:"queen_introduced_at,omitempty"`
	QueenSource      *string    `json:"queen_source,omitempty"`
	BroodBoxes       int        `json:"brood_boxes"`
	HoneySupers      int        `json:"honey_supers"`
	Notes            *string    `json:"notes,omitempty"`
	Status           string     `json:"status"`                // "active", "lost", or "archived"
	LostAt           *time.Time `json:"lost_at,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

// QueenHistory represents a queen history entry in the database.
type QueenHistory struct {
	ID                string     `json:"id"`
	HiveID            string     `json:"hive_id"`
	IntroducedAt      time.Time  `json:"introduced_at"`
	Source            *string    `json:"source,omitempty"`
	ReplacedAt        *time.Time `json:"replaced_at,omitempty"`
	ReplacementReason *string    `json:"replacement_reason,omitempty"`
	CreatedAt         time.Time  `json:"created_at"`
}

// BoxChange represents a box change entry in the database.
type BoxChange struct {
	ID         string    `json:"id"`
	HiveID     string    `json:"hive_id"`
	ChangeType string    `json:"change_type"` // "added" or "removed"
	BoxType    string    `json:"box_type"`    // "brood" or "super"
	ChangedAt  time.Time `json:"changed_at"`
	Notes      *string   `json:"notes,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}

// CreateHiveInput contains the fields needed to create a new hive.
type CreateHiveInput struct {
	SiteID            string     `json:"site_id"`
	Name              string     `json:"name"`
	QueenIntroducedAt *time.Time `json:"queen_introduced_at,omitempty"`
	QueenSource       *string    `json:"queen_source,omitempty"`
	BroodBoxes        int        `json:"brood_boxes"`
	HoneySupers       int        `json:"honey_supers"`
	Notes             *string    `json:"notes,omitempty"`
}

// UpdateHiveInput contains the fields that can be updated on a hive.
type UpdateHiveInput struct {
	Name              *string    `json:"name,omitempty"`
	QueenIntroducedAt *time.Time `json:"queen_introduced_at,omitempty"`
	QueenSource       *string    `json:"queen_source,omitempty"`
	BroodBoxes        *int       `json:"brood_boxes,omitempty"`
	HoneySupers       *int       `json:"honey_supers,omitempty"`
	Notes             *string    `json:"notes,omitempty"`
}

// CreateQueenHistoryInput contains the fields needed to create a queen history entry.
type CreateQueenHistoryInput struct {
	HiveID            string     `json:"hive_id"`
	IntroducedAt      time.Time  `json:"introduced_at"`
	Source            *string    `json:"source,omitempty"`
	ReplacedAt        *time.Time `json:"replaced_at,omitempty"`
	ReplacementReason *string    `json:"replacement_reason,omitempty"`
}

// CreateBoxChangeInput contains the fields needed to create a box change entry.
type CreateBoxChangeInput struct {
	HiveID     string    `json:"hive_id"`
	ChangeType string    `json:"change_type"` // "added" or "removed"
	BoxType    string    `json:"box_type"`    // "brood" or "super"
	ChangedAt  time.Time `json:"changed_at"`
	Notes      *string   `json:"notes,omitempty"`
}

// ErrHiveHasInspections is returned when trying to delete a hive that has inspections.
var ErrHiveHasInspections = errors.New("hive has inspections")

// CreateHive creates a new hive in the database.
func CreateHive(ctx context.Context, conn *pgxpool.Conn, tenantID string, input *CreateHiveInput) (*Hive, error) {
	// Set defaults
	broodBoxes := input.BroodBoxes
	if broodBoxes < 1 {
		broodBoxes = 1
	}
	if broodBoxes > 3 {
		broodBoxes = 3
	}

	honeySupers := input.HoneySupers
	if honeySupers < 0 {
		honeySupers = 0
	}
	if honeySupers > 5 {
		honeySupers = 5
	}

	var hive Hive
	err := conn.QueryRow(ctx,
		`INSERT INTO hives (tenant_id, site_id, name, queen_introduced_at, queen_source, brood_boxes, honey_supers, notes)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 RETURNING id, tenant_id, site_id, name, queen_introduced_at, queen_source, brood_boxes, honey_supers, notes, created_at, updated_at`,
		tenantID, input.SiteID, input.Name, input.QueenIntroducedAt, input.QueenSource, broodBoxes, honeySupers, input.Notes,
	).Scan(&hive.ID, &hive.TenantID, &hive.SiteID, &hive.Name, &hive.QueenIntroducedAt, &hive.QueenSource,
		&hive.BroodBoxes, &hive.HoneySupers, &hive.Notes, &hive.CreatedAt, &hive.UpdatedAt)

	if err != nil {
		return nil, fmt.Errorf("storage: failed to create hive: %w", err)
	}

	// If queen info provided, create initial queen history entry
	if input.QueenIntroducedAt != nil {
		_, err = CreateQueenHistory(ctx, conn, &CreateQueenHistoryInput{
			HiveID:       hive.ID,
			IntroducedAt: *input.QueenIntroducedAt,
			Source:       input.QueenSource,
		})
		if err != nil {
			// Log but don't fail - hive was created successfully
			log.Warn().Err(err).Str("hive_id", hive.ID).Msg("storage: failed to create initial queen history")
		}
	}

	return &hive, nil
}

// ListHivesBySite returns all active hives for a specific site (excludes lost hives by default).
func ListHivesBySite(ctx context.Context, conn *pgxpool.Conn, siteID string) ([]Hive, error) {
	return ListHivesBySiteWithStatus(ctx, conn, siteID, false)
}

// ListHivesBySiteWithStatus returns hives for a site with optional lost hive inclusion.
func ListHivesBySiteWithStatus(ctx context.Context, conn *pgxpool.Conn, siteID string, includeLost bool) ([]Hive, error) {
	var query string
	if includeLost {
		query = `SELECT id, tenant_id, site_id, name, queen_introduced_at, queen_source, brood_boxes, honey_supers, notes, status, lost_at, created_at, updated_at
		 FROM hives
		 WHERE site_id = $1
		 ORDER BY status ASC, name ASC`
	} else {
		query = `SELECT id, tenant_id, site_id, name, queen_introduced_at, queen_source, brood_boxes, honey_supers, notes, status, lost_at, created_at, updated_at
		 FROM hives
		 WHERE site_id = $1 AND status = 'active'
		 ORDER BY name ASC`
	}

	rows, err := conn.Query(ctx, query, siteID)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list hives: %w", err)
	}
	defer rows.Close()

	var hives []Hive
	for rows.Next() {
		var hive Hive
		err := rows.Scan(&hive.ID, &hive.TenantID, &hive.SiteID, &hive.Name, &hive.QueenIntroducedAt, &hive.QueenSource,
			&hive.BroodBoxes, &hive.HoneySupers, &hive.Notes, &hive.Status, &hive.LostAt, &hive.CreatedAt, &hive.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan hive: %w", err)
		}
		hives = append(hives, hive)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating hives: %w", err)
	}

	return hives, nil
}

// ListHives returns all active hives for the current tenant (excludes lost hives by default).
func ListHives(ctx context.Context, conn *pgxpool.Conn) ([]Hive, error) {
	return ListHivesWithStatus(ctx, conn, false)
}

// ListHivesWithStatus returns all hives with optional lost hive inclusion.
func ListHivesWithStatus(ctx context.Context, conn *pgxpool.Conn, includeLost bool) ([]Hive, error) {
	var query string
	if includeLost {
		query = `SELECT id, tenant_id, site_id, name, queen_introduced_at, queen_source, brood_boxes, honey_supers, notes, status, lost_at, created_at, updated_at
		 FROM hives
		 ORDER BY status ASC, name ASC`
	} else {
		query = `SELECT id, tenant_id, site_id, name, queen_introduced_at, queen_source, brood_boxes, honey_supers, notes, status, lost_at, created_at, updated_at
		 FROM hives
		 WHERE status = 'active'
		 ORDER BY name ASC`
	}

	rows, err := conn.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list hives: %w", err)
	}
	defer rows.Close()

	var hives []Hive
	for rows.Next() {
		var hive Hive
		err := rows.Scan(&hive.ID, &hive.TenantID, &hive.SiteID, &hive.Name, &hive.QueenIntroducedAt, &hive.QueenSource,
			&hive.BroodBoxes, &hive.HoneySupers, &hive.Notes, &hive.Status, &hive.LostAt, &hive.CreatedAt, &hive.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan hive: %w", err)
		}
		hives = append(hives, hive)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating hives: %w", err)
	}

	return hives, nil
}

// GetHiveByID retrieves a hive by its ID.
func GetHiveByID(ctx context.Context, conn *pgxpool.Conn, id string) (*Hive, error) {
	var hive Hive
	err := conn.QueryRow(ctx,
		`SELECT id, tenant_id, site_id, name, queen_introduced_at, queen_source, brood_boxes, honey_supers, notes, status, lost_at, created_at, updated_at
		 FROM hives
		 WHERE id = $1`,
		id,
	).Scan(&hive.ID, &hive.TenantID, &hive.SiteID, &hive.Name, &hive.QueenIntroducedAt, &hive.QueenSource,
		&hive.BroodBoxes, &hive.HoneySupers, &hive.Notes, &hive.Status, &hive.LostAt, &hive.CreatedAt, &hive.UpdatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get hive: %w", err)
	}
	return &hive, nil
}

// UpdateHive updates an existing hive and optionally tracks box changes.
func UpdateHive(ctx context.Context, conn *pgxpool.Conn, id string, input *UpdateHiveInput) (*Hive, error) {
	// Get current hive to track changes
	current, err := GetHiveByID(ctx, conn, id)
	if err != nil {
		return nil, err
	}

	// Apply updates
	name := current.Name
	if input.Name != nil {
		name = *input.Name
	}

	queenIntroducedAt := current.QueenIntroducedAt
	if input.QueenIntroducedAt != nil {
		queenIntroducedAt = input.QueenIntroducedAt
	}

	queenSource := current.QueenSource
	if input.QueenSource != nil {
		queenSource = input.QueenSource
	}

	broodBoxes := current.BroodBoxes
	if input.BroodBoxes != nil {
		broodBoxes = *input.BroodBoxes
		if broodBoxes < 1 {
			broodBoxes = 1
		}
		if broodBoxes > 3 {
			broodBoxes = 3
		}
	}

	honeySupers := current.HoneySupers
	if input.HoneySupers != nil {
		honeySupers = *input.HoneySupers
		if honeySupers < 0 {
			honeySupers = 0
		}
		if honeySupers > 5 {
			honeySupers = 5
		}
	}

	notes := current.Notes
	if input.Notes != nil {
		notes = input.Notes
	}

	// Update hive
	var hive Hive
	err = conn.QueryRow(ctx,
		`UPDATE hives
		 SET name = $2, queen_introduced_at = $3, queen_source = $4, brood_boxes = $5, honey_supers = $6, notes = $7
		 WHERE id = $1
		 RETURNING id, tenant_id, site_id, name, queen_introduced_at, queen_source, brood_boxes, honey_supers, notes, created_at, updated_at`,
		id, name, queenIntroducedAt, queenSource, broodBoxes, honeySupers, notes,
	).Scan(&hive.ID, &hive.TenantID, &hive.SiteID, &hive.Name, &hive.QueenIntroducedAt, &hive.QueenSource,
		&hive.BroodBoxes, &hive.HoneySupers, &hive.Notes, &hive.CreatedAt, &hive.UpdatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to update hive: %w", err)
	}

	// Track box changes
	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)

	// Track brood box changes
	if input.BroodBoxes != nil && broodBoxes != current.BroodBoxes {
		diff := broodBoxes - current.BroodBoxes
		changeType := "added"
		if diff < 0 {
			changeType = "removed"
			diff = -diff
		}
		for i := 0; i < diff; i++ {
			_, err = CreateBoxChange(ctx, conn, &CreateBoxChangeInput{
				HiveID:     id,
				ChangeType: changeType,
				BoxType:    "brood",
				ChangedAt:  today,
			})
			if err != nil {
				log.Warn().Err(err).Str("hive_id", id).Str("box_type", "brood").Msg("storage: failed to create box change")
			}
		}
	}

	// Track honey super changes
	if input.HoneySupers != nil && honeySupers != current.HoneySupers {
		diff := honeySupers - current.HoneySupers
		changeType := "added"
		if diff < 0 {
			changeType = "removed"
			diff = -diff
		}
		for i := 0; i < diff; i++ {
			_, err = CreateBoxChange(ctx, conn, &CreateBoxChangeInput{
				HiveID:     id,
				ChangeType: changeType,
				BoxType:    "super",
				ChangedAt:  today,
			})
			if err != nil {
				log.Warn().Err(err).Str("hive_id", id).Str("box_type", "super").Msg("storage: failed to create box change")
			}
		}
	}

	return &hive, nil
}

// MarkHiveAsLost updates a hive's status to 'lost' and sets the lost_at date.
func MarkHiveAsLost(ctx context.Context, conn *pgxpool.Conn, hiveID string, lostAt time.Time) error {
	// First check if hive is already lost
	var currentStatus string
	err := conn.QueryRow(ctx, `SELECT status FROM hives WHERE id = $1`, hiveID).Scan(&currentStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("storage: failed to check hive status: %w", err)
	}

	if currentStatus == "lost" {
		return ErrHiveAlreadyLost
	}

	result, err := conn.Exec(ctx,
		`UPDATE hives SET status = 'lost', lost_at = $2, updated_at = NOW() WHERE id = $1`,
		hiveID, lostAt)
	if err != nil {
		return fmt.Errorf("storage: failed to mark hive as lost: %w", err)
	}

	if result.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

// ErrHiveAlreadyLost is returned when trying to mark an already lost hive as lost.
var ErrHiveAlreadyLost = errors.New("hive is already marked as lost")

// DeleteHive deletes a hive by its ID.
func DeleteHive(ctx context.Context, conn *pgxpool.Conn, id string) error {
	// Check if hive has inspections (if inspections table exists)
	var tableExists bool
	err := conn.QueryRow(ctx,
		`SELECT EXISTS (
			SELECT 1 FROM information_schema.tables
			WHERE table_name = 'inspections'
		)`).Scan(&tableExists)
	if err != nil {
		return fmt.Errorf("storage: failed to check inspections table: %w", err)
	}

	if tableExists {
		var count int
		err := conn.QueryRow(ctx,
			`SELECT COUNT(*) FROM inspections WHERE hive_id = $1`,
			id,
		).Scan(&count)
		if err != nil {
			return fmt.Errorf("storage: failed to check inspections for hive: %w", err)
		}
		if count > 0 {
			return ErrHiveHasInspections
		}
	}

	// Delete the hive (cascade will handle queen_history and box_changes)
	result, err := conn.Exec(ctx, `DELETE FROM hives WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("storage: failed to delete hive: %w", err)
	}

	if result.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

// CountHivesBySite returns the total number of hives for a site.
func CountHivesBySite(ctx context.Context, conn *pgxpool.Conn, siteID string) (int, error) {
	var count int
	err := conn.QueryRow(ctx, `SELECT COUNT(*) FROM hives WHERE site_id = $1`, siteID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("storage: failed to count hives: %w", err)
	}
	return count, nil
}

// CreateQueenHistory creates a new queen history entry.
func CreateQueenHistory(ctx context.Context, conn *pgxpool.Conn, input *CreateQueenHistoryInput) (*QueenHistory, error) {
	var qh QueenHistory
	err := conn.QueryRow(ctx,
		`INSERT INTO queen_history (hive_id, introduced_at, source, replaced_at, replacement_reason)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, hive_id, introduced_at, source, replaced_at, replacement_reason, created_at`,
		input.HiveID, input.IntroducedAt, input.Source, input.ReplacedAt, input.ReplacementReason,
	).Scan(&qh.ID, &qh.HiveID, &qh.IntroducedAt, &qh.Source, &qh.ReplacedAt, &qh.ReplacementReason, &qh.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("storage: failed to create queen history: %w", err)
	}
	return &qh, nil
}

// ListQueenHistory returns all queen history entries for a hive.
func ListQueenHistory(ctx context.Context, conn *pgxpool.Conn, hiveID string) ([]QueenHistory, error) {
	rows, err := conn.Query(ctx,
		`SELECT id, hive_id, introduced_at, source, replaced_at, replacement_reason, created_at
		 FROM queen_history
		 WHERE hive_id = $1
		 ORDER BY introduced_at DESC`,
		hiveID)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list queen history: %w", err)
	}
	defer rows.Close()

	var history []QueenHistory
	for rows.Next() {
		var qh QueenHistory
		err := rows.Scan(&qh.ID, &qh.HiveID, &qh.IntroducedAt, &qh.Source, &qh.ReplacedAt, &qh.ReplacementReason, &qh.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan queen history: %w", err)
		}
		history = append(history, qh)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating queen history: %w", err)
	}

	return history, nil
}

// UpdateQueenHistoryReplacement marks a queen as replaced.
func UpdateQueenHistoryReplacement(ctx context.Context, conn *pgxpool.Conn, id string, replacedAt time.Time, reason *string) error {
	result, err := conn.Exec(ctx,
		`UPDATE queen_history SET replaced_at = $2, replacement_reason = $3 WHERE id = $1`,
		id, replacedAt, reason)
	if err != nil {
		return fmt.Errorf("storage: failed to update queen history: %w", err)
	}
	if result.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// CreateBoxChange creates a new box change entry.
func CreateBoxChange(ctx context.Context, conn *pgxpool.Conn, input *CreateBoxChangeInput) (*BoxChange, error) {
	var bc BoxChange
	err := conn.QueryRow(ctx,
		`INSERT INTO box_changes (hive_id, change_type, box_type, changed_at, notes)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, hive_id, change_type, box_type, changed_at, notes, created_at`,
		input.HiveID, input.ChangeType, input.BoxType, input.ChangedAt, input.Notes,
	).Scan(&bc.ID, &bc.HiveID, &bc.ChangeType, &bc.BoxType, &bc.ChangedAt, &bc.Notes, &bc.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("storage: failed to create box change: %w", err)
	}
	return &bc, nil
}

// ListBoxChanges returns all box change entries for a hive.
func ListBoxChanges(ctx context.Context, conn *pgxpool.Conn, hiveID string) ([]BoxChange, error) {
	rows, err := conn.Query(ctx,
		`SELECT id, hive_id, change_type, box_type, changed_at, notes, created_at
		 FROM box_changes
		 WHERE hive_id = $1
		 ORDER BY changed_at DESC`,
		hiveID)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list box changes: %w", err)
	}
	defer rows.Close()

	var changes []BoxChange
	for rows.Next() {
		var bc BoxChange
		err := rows.Scan(&bc.ID, &bc.HiveID, &bc.ChangeType, &bc.BoxType, &bc.ChangedAt, &bc.Notes, &bc.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan box change: %w", err)
		}
		changes = append(changes, bc)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating box changes: %w", err)
	}

	return changes, nil
}
