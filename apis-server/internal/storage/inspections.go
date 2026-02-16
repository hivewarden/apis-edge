package storage

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Inspection represents an inspection record in the database.
type Inspection struct {
	ID           string     `json:"id"`
	TenantID     string     `json:"tenant_id"`
	HiveID       string     `json:"hive_id"`
	InspectedAt  time.Time  `json:"inspected_at"`
	QueenSeen    *bool      `json:"queen_seen,omitempty"`
	EggsSeen     *bool      `json:"eggs_seen,omitempty"`
	QueenCells   *bool      `json:"queen_cells,omitempty"`
	BroodFrames  *int       `json:"brood_frames,omitempty"`
	BroodPattern *string    `json:"brood_pattern,omitempty"`
	HoneyLevel   *string    `json:"honey_level,omitempty"`
	PollenLevel  *string    `json:"pollen_level,omitempty"`
	Temperament  *string    `json:"temperament,omitempty"`
	Issues       []string   `json:"issues"`
	Notes        *string    `json:"notes,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

// CreateInspectionInput contains the fields needed to create a new inspection.
type CreateInspectionInput struct {
	HiveID       string    `json:"hive_id"`
	InspectedAt  time.Time `json:"inspected_at"`
	QueenSeen    *bool     `json:"queen_seen,omitempty"`
	EggsSeen     *bool     `json:"eggs_seen,omitempty"`
	QueenCells   *bool     `json:"queen_cells,omitempty"`
	BroodFrames  *int      `json:"brood_frames,omitempty"`
	BroodPattern *string   `json:"brood_pattern,omitempty"`
	HoneyLevel   *string   `json:"honey_level,omitempty"`
	PollenLevel  *string   `json:"pollen_level,omitempty"`
	Temperament  *string   `json:"temperament,omitempty"`
	Issues       []string  `json:"issues,omitempty"`
	Notes        *string   `json:"notes,omitempty"`
}

// UpdateInspectionInput contains the fields that can be updated on an inspection.
type UpdateInspectionInput struct {
	InspectedAt  *time.Time `json:"inspected_at,omitempty"`
	QueenSeen    *bool      `json:"queen_seen,omitempty"`
	EggsSeen     *bool      `json:"eggs_seen,omitempty"`
	QueenCells   *bool      `json:"queen_cells,omitempty"`
	BroodFrames  *int       `json:"brood_frames,omitempty"`
	BroodPattern *string    `json:"brood_pattern,omitempty"`
	HoneyLevel   *string    `json:"honey_level,omitempty"`
	PollenLevel  *string    `json:"pollen_level,omitempty"`
	Temperament  *string    `json:"temperament,omitempty"`
	Issues       []string   `json:"issues,omitempty"`
	Notes        *string    `json:"notes,omitempty"`
}

// CreateInspection creates a new inspection in the database.
func CreateInspection(ctx context.Context, conn *pgxpool.Conn, tenantID string, input *CreateInspectionInput) (*Inspection, error) {
	// Ensure issues is not nil
	issues := input.Issues
	if issues == nil {
		issues = []string{}
	}

	issuesJSON, err := json.Marshal(issues)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to marshal issues: %w", err)
	}

	var inspection Inspection
	var issuesBytes []byte

	err = conn.QueryRow(ctx,
		`INSERT INTO inspections (tenant_id, hive_id, inspected_at, queen_seen, eggs_seen, queen_cells,
		 brood_frames, brood_pattern, honey_level, pollen_level, temperament, issues, notes)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		 RETURNING id, tenant_id, hive_id, inspected_at, queen_seen, eggs_seen, queen_cells,
		 brood_frames, brood_pattern, honey_level, pollen_level, temperament, issues, notes, created_at, updated_at`,
		tenantID, input.HiveID, input.InspectedAt, input.QueenSeen, input.EggsSeen, input.QueenCells,
		input.BroodFrames, input.BroodPattern, input.HoneyLevel, input.PollenLevel, input.Temperament,
		issuesJSON, input.Notes,
	).Scan(&inspection.ID, &inspection.TenantID, &inspection.HiveID, &inspection.InspectedAt,
		&inspection.QueenSeen, &inspection.EggsSeen, &inspection.QueenCells,
		&inspection.BroodFrames, &inspection.BroodPattern, &inspection.HoneyLevel, &inspection.PollenLevel,
		&inspection.Temperament, &issuesBytes, &inspection.Notes, &inspection.CreatedAt, &inspection.UpdatedAt)

	if err != nil {
		return nil, fmt.Errorf("storage: failed to create inspection: %w", err)
	}

	// Parse issues JSON
	if err := json.Unmarshal(issuesBytes, &inspection.Issues); err != nil {
		inspection.Issues = []string{}
	}

	return &inspection, nil
}

// GetInspectionByID retrieves an inspection by its ID.
func GetInspectionByID(ctx context.Context, conn *pgxpool.Conn, id string) (*Inspection, error) {
	var inspection Inspection
	var issuesBytes []byte

	err := conn.QueryRow(ctx,
		`SELECT id, tenant_id, hive_id, inspected_at, queen_seen, eggs_seen, queen_cells,
		 brood_frames, brood_pattern, honey_level, pollen_level, temperament, issues, notes, created_at, updated_at
		 FROM inspections
		 WHERE id = $1`,
		id,
	).Scan(&inspection.ID, &inspection.TenantID, &inspection.HiveID, &inspection.InspectedAt,
		&inspection.QueenSeen, &inspection.EggsSeen, &inspection.QueenCells,
		&inspection.BroodFrames, &inspection.BroodPattern, &inspection.HoneyLevel, &inspection.PollenLevel,
		&inspection.Temperament, &issuesBytes, &inspection.Notes, &inspection.CreatedAt, &inspection.UpdatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get inspection: %w", err)
	}

	// Parse issues JSON
	if err := json.Unmarshal(issuesBytes, &inspection.Issues); err != nil {
		inspection.Issues = []string{}
	}

	return &inspection, nil
}

// ListInspectionsByHive returns all inspections for a specific hive.
func ListInspectionsByHive(ctx context.Context, conn *pgxpool.Conn, hiveID string, limit int) ([]Inspection, error) {
	if limit <= 0 {
		limit = 50
	}

	rows, err := conn.Query(ctx,
		`SELECT id, tenant_id, hive_id, inspected_at, queen_seen, eggs_seen, queen_cells,
		 brood_frames, brood_pattern, honey_level, pollen_level, temperament, issues, notes, created_at, updated_at
		 FROM inspections
		 WHERE hive_id = $1
		 ORDER BY inspected_at DESC
		 LIMIT $2`,
		hiveID, limit)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list inspections: %w", err)
	}
	defer rows.Close()

	var inspections []Inspection
	for rows.Next() {
		var inspection Inspection
		var issuesBytes []byte

		err := rows.Scan(&inspection.ID, &inspection.TenantID, &inspection.HiveID, &inspection.InspectedAt,
			&inspection.QueenSeen, &inspection.EggsSeen, &inspection.QueenCells,
			&inspection.BroodFrames, &inspection.BroodPattern, &inspection.HoneyLevel, &inspection.PollenLevel,
			&inspection.Temperament, &issuesBytes, &inspection.Notes, &inspection.CreatedAt, &inspection.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan inspection: %w", err)
		}

		// Parse issues JSON
		if err := json.Unmarshal(issuesBytes, &inspection.Issues); err != nil {
			inspection.Issues = []string{}
		}

		inspections = append(inspections, inspection)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating inspections: %w", err)
	}

	return inspections, nil
}

// ListInspectionsPaginated returns paginated inspections for a specific hive.
func ListInspectionsPaginated(ctx context.Context, conn *pgxpool.Conn, hiveID string, limit, offset int, sortAsc bool) ([]Inspection, int, error) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}

	// Get total count
	var total int
	err := conn.QueryRow(ctx, `SELECT COUNT(*) FROM inspections WHERE hive_id = $1`, hiveID).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("storage: failed to count inspections: %w", err)
	}

	// Determine sort order
	// SECURITY: orderBy is safe - only hardcoded "inspected_at DESC" or "inspected_at ASC" values
	// are used based on the boolean sortAsc parameter. No user input reaches this string.
	orderBy := "inspected_at DESC"
	if sortAsc {
		orderBy = "inspected_at ASC"
	}

	rows, err := conn.Query(ctx,
		`SELECT id, tenant_id, hive_id, inspected_at, queen_seen, eggs_seen, queen_cells,
		 brood_frames, brood_pattern, honey_level, pollen_level, temperament, issues, notes, created_at, updated_at
		 FROM inspections
		 WHERE hive_id = $1
		 ORDER BY `+orderBy+`
		 LIMIT $2 OFFSET $3`,
		hiveID, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("storage: failed to list inspections: %w", err)
	}
	defer rows.Close()

	var inspections []Inspection
	for rows.Next() {
		var inspection Inspection
		var issuesBytes []byte

		err := rows.Scan(&inspection.ID, &inspection.TenantID, &inspection.HiveID, &inspection.InspectedAt,
			&inspection.QueenSeen, &inspection.EggsSeen, &inspection.QueenCells,
			&inspection.BroodFrames, &inspection.BroodPattern, &inspection.HoneyLevel, &inspection.PollenLevel,
			&inspection.Temperament, &issuesBytes, &inspection.Notes, &inspection.CreatedAt, &inspection.UpdatedAt)
		if err != nil {
			return nil, 0, fmt.Errorf("storage: failed to scan inspection: %w", err)
		}

		// Parse issues JSON
		if err := json.Unmarshal(issuesBytes, &inspection.Issues); err != nil {
			inspection.Issues = []string{}
		}

		inspections = append(inspections, inspection)
	}

	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("storage: error iterating inspections: %w", err)
	}

	return inspections, total, nil
}

// ListAllInspectionsByHive returns ALL inspections for a hive (for export).
func ListAllInspectionsByHive(ctx context.Context, conn *pgxpool.Conn, hiveID string) ([]Inspection, error) {
	rows, err := conn.Query(ctx,
		`SELECT id, tenant_id, hive_id, inspected_at, queen_seen, eggs_seen, queen_cells,
		 brood_frames, brood_pattern, honey_level, pollen_level, temperament, issues, notes, created_at, updated_at
		 FROM inspections
		 WHERE hive_id = $1
		 ORDER BY inspected_at DESC`,
		hiveID)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list inspections: %w", err)
	}
	defer rows.Close()

	var inspections []Inspection
	for rows.Next() {
		var inspection Inspection
		var issuesBytes []byte

		err := rows.Scan(&inspection.ID, &inspection.TenantID, &inspection.HiveID, &inspection.InspectedAt,
			&inspection.QueenSeen, &inspection.EggsSeen, &inspection.QueenCells,
			&inspection.BroodFrames, &inspection.BroodPattern, &inspection.HoneyLevel, &inspection.PollenLevel,
			&inspection.Temperament, &issuesBytes, &inspection.Notes, &inspection.CreatedAt, &inspection.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan inspection: %w", err)
		}

		// Parse issues JSON
		if err := json.Unmarshal(issuesBytes, &inspection.Issues); err != nil {
			inspection.Issues = []string{}
		}

		inspections = append(inspections, inspection)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating inspections: %w", err)
	}

	return inspections, nil
}

// GetLastInspectionForHive returns the most recent inspection for a hive.
func GetLastInspectionForHive(ctx context.Context, conn *pgxpool.Conn, hiveID string) (*Inspection, error) {
	var inspection Inspection
	var issuesBytes []byte

	err := conn.QueryRow(ctx,
		`SELECT id, tenant_id, hive_id, inspected_at, queen_seen, eggs_seen, queen_cells,
		 brood_frames, brood_pattern, honey_level, pollen_level, temperament, issues, notes, created_at, updated_at
		 FROM inspections
		 WHERE hive_id = $1
		 ORDER BY inspected_at DESC
		 LIMIT 1`,
		hiveID,
	).Scan(&inspection.ID, &inspection.TenantID, &inspection.HiveID, &inspection.InspectedAt,
		&inspection.QueenSeen, &inspection.EggsSeen, &inspection.QueenCells,
		&inspection.BroodFrames, &inspection.BroodPattern, &inspection.HoneyLevel, &inspection.PollenLevel,
		&inspection.Temperament, &issuesBytes, &inspection.Notes, &inspection.CreatedAt, &inspection.UpdatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get last inspection: %w", err)
	}

	// Parse issues JSON
	if err := json.Unmarshal(issuesBytes, &inspection.Issues); err != nil {
		inspection.Issues = []string{}
	}

	return &inspection, nil
}

// UpdateInspection updates an existing inspection.
func UpdateInspection(ctx context.Context, conn *pgxpool.Conn, id string, input *UpdateInspectionInput) (*Inspection, error) {
	// Get current inspection
	current, err := GetInspectionByID(ctx, conn, id)
	if err != nil {
		return nil, err
	}

	// Apply updates
	inspectedAt := current.InspectedAt
	if input.InspectedAt != nil {
		inspectedAt = *input.InspectedAt
	}

	queenSeen := current.QueenSeen
	if input.QueenSeen != nil {
		queenSeen = input.QueenSeen
	}

	eggsSeen := current.EggsSeen
	if input.EggsSeen != nil {
		eggsSeen = input.EggsSeen
	}

	queenCells := current.QueenCells
	if input.QueenCells != nil {
		queenCells = input.QueenCells
	}

	broodFrames := current.BroodFrames
	if input.BroodFrames != nil {
		broodFrames = input.BroodFrames
	}

	broodPattern := current.BroodPattern
	if input.BroodPattern != nil {
		broodPattern = input.BroodPattern
	}

	honeyLevel := current.HoneyLevel
	if input.HoneyLevel != nil {
		honeyLevel = input.HoneyLevel
	}

	pollenLevel := current.PollenLevel
	if input.PollenLevel != nil {
		pollenLevel = input.PollenLevel
	}

	temperament := current.Temperament
	if input.Temperament != nil {
		temperament = input.Temperament
	}

	issues := current.Issues
	if input.Issues != nil {
		issues = input.Issues
	}

	notes := current.Notes
	if input.Notes != nil {
		notes = input.Notes
	}

	issuesJSON, err := json.Marshal(issues)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to marshal issues: %w", err)
	}

	var inspection Inspection
	var issuesBytes []byte

	err = conn.QueryRow(ctx,
		`UPDATE inspections
		 SET inspected_at = $2, queen_seen = $3, eggs_seen = $4, queen_cells = $5,
		     brood_frames = $6, brood_pattern = $7, honey_level = $8, pollen_level = $9,
		     temperament = $10, issues = $11, notes = $12
		 WHERE id = $1
		 RETURNING id, tenant_id, hive_id, inspected_at, queen_seen, eggs_seen, queen_cells,
		 brood_frames, brood_pattern, honey_level, pollen_level, temperament, issues, notes, created_at, updated_at`,
		id, inspectedAt, queenSeen, eggsSeen, queenCells, broodFrames, broodPattern,
		honeyLevel, pollenLevel, temperament, issuesJSON, notes,
	).Scan(&inspection.ID, &inspection.TenantID, &inspection.HiveID, &inspection.InspectedAt,
		&inspection.QueenSeen, &inspection.EggsSeen, &inspection.QueenCells,
		&inspection.BroodFrames, &inspection.BroodPattern, &inspection.HoneyLevel, &inspection.PollenLevel,
		&inspection.Temperament, &issuesBytes, &inspection.Notes, &inspection.CreatedAt, &inspection.UpdatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to update inspection: %w", err)
	}

	// Parse issues JSON
	if err := json.Unmarshal(issuesBytes, &inspection.Issues); err != nil {
		inspection.Issues = []string{}
	}

	return &inspection, nil
}

// DeleteInspection deletes an inspection by its ID.
func DeleteInspection(ctx context.Context, conn *pgxpool.Conn, id string) error {
	result, err := conn.Exec(ctx, `DELETE FROM inspections WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("storage: failed to delete inspection: %w", err)
	}

	if result.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

// CountInspectionsByHive returns the total number of inspections for a hive.
func CountInspectionsByHive(ctx context.Context, conn *pgxpool.Conn, hiveID string) (int, error) {
	var count int
	err := conn.QueryRow(ctx, `SELECT COUNT(*) FROM inspections WHERE hive_id = $1`, hiveID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("storage: failed to count inspections: %w", err)
	}
	return count, nil
}

// GetLastInspectionsForHives returns the most recent inspection for each of the given hive IDs.
// Returns a map of hive_id -> Inspection. Hives without inspections won't be in the map.
// This is optimized for batch fetching to avoid N+1 queries.
func GetLastInspectionsForHives(ctx context.Context, conn *pgxpool.Conn, hiveIDs []string) (map[string]*Inspection, error) {
	if len(hiveIDs) == 0 {
		return make(map[string]*Inspection), nil
	}

	// Use a window function to get the latest inspection for each hive in a single query
	rows, err := conn.Query(ctx,
		`WITH ranked_inspections AS (
			SELECT id, tenant_id, hive_id, inspected_at, queen_seen, eggs_seen, queen_cells,
			       brood_frames, brood_pattern, honey_level, pollen_level, temperament, issues, notes,
			       created_at, updated_at,
			       ROW_NUMBER() OVER (PARTITION BY hive_id ORDER BY inspected_at DESC) as rn
			FROM inspections
			WHERE hive_id = ANY($1)
		)
		SELECT id, tenant_id, hive_id, inspected_at, queen_seen, eggs_seen, queen_cells,
		       brood_frames, brood_pattern, honey_level, pollen_level, temperament, issues, notes,
		       created_at, updated_at
		FROM ranked_inspections
		WHERE rn = 1`,
		hiveIDs)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get last inspections for hives: %w", err)
	}
	defer rows.Close()

	result := make(map[string]*Inspection)
	for rows.Next() {
		var inspection Inspection
		var issuesBytes []byte

		err := rows.Scan(&inspection.ID, &inspection.TenantID, &inspection.HiveID, &inspection.InspectedAt,
			&inspection.QueenSeen, &inspection.EggsSeen, &inspection.QueenCells,
			&inspection.BroodFrames, &inspection.BroodPattern, &inspection.HoneyLevel, &inspection.PollenLevel,
			&inspection.Temperament, &issuesBytes, &inspection.Notes, &inspection.CreatedAt, &inspection.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan inspection: %w", err)
		}

		// Parse issues JSON
		if err := json.Unmarshal(issuesBytes, &inspection.Issues); err != nil {
			inspection.Issues = []string{}
		}

		result[inspection.HiveID] = &inspection
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating inspections: %w", err)
	}

	return result, nil
}
