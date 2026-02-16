package storage

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Treatment represents a varroa treatment record in the database.
type Treatment struct {
	ID              string     `json:"id"`
	TenantID        string     `json:"tenant_id"`
	HiveID          string     `json:"hive_id"`
	TreatedAt       time.Time  `json:"treated_at"`
	TreatmentType   string     `json:"treatment_type"`
	Method          *string    `json:"method,omitempty"`
	Dose            *string    `json:"dose,omitempty"`
	MiteCountBefore *int       `json:"mite_count_before,omitempty"`
	MiteCountAfter  *int       `json:"mite_count_after,omitempty"`
	Weather         *string    `json:"weather,omitempty"`
	Notes           *string    `json:"notes,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

// CreateTreatmentInput contains the fields needed to create a new treatment.
type CreateTreatmentInput struct {
	HiveID          string    `json:"hive_id"`
	TreatedAt       time.Time `json:"treated_at"`
	TreatmentType   string    `json:"treatment_type"`
	Method          *string   `json:"method,omitempty"`
	Dose            *string   `json:"dose,omitempty"`
	MiteCountBefore *int      `json:"mite_count_before,omitempty"`
	MiteCountAfter  *int      `json:"mite_count_after,omitempty"`
	Weather         *string   `json:"weather,omitempty"`
	Notes           *string   `json:"notes,omitempty"`
}

// UpdateTreatmentInput contains the fields that can be updated on a treatment.
type UpdateTreatmentInput struct {
	TreatedAt       *time.Time `json:"treated_at,omitempty"`
	TreatmentType   *string    `json:"treatment_type,omitempty"`
	Method          *string    `json:"method,omitempty"`
	Dose            *string    `json:"dose,omitempty"`
	MiteCountBefore *int       `json:"mite_count_before,omitempty"`
	MiteCountAfter  *int       `json:"mite_count_after,omitempty"`
	Weather         *string    `json:"weather,omitempty"`
	Notes           *string    `json:"notes,omitempty"`
}

// CreateTreatment creates a new treatment record in the database.
func CreateTreatment(ctx context.Context, conn *pgxpool.Conn, tenantID string, input *CreateTreatmentInput) (*Treatment, error) {
	var treatment Treatment
	err := conn.QueryRow(ctx,
		`INSERT INTO treatments (tenant_id, hive_id, treated_at, treatment_type, method, dose, mite_count_before, mite_count_after, weather, notes)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		 RETURNING id, tenant_id, hive_id, treated_at, treatment_type, method, dose, mite_count_before, mite_count_after, weather, notes, created_at, updated_at`,
		tenantID, input.HiveID, input.TreatedAt, input.TreatmentType, input.Method, input.Dose,
		input.MiteCountBefore, input.MiteCountAfter, input.Weather, input.Notes,
	).Scan(&treatment.ID, &treatment.TenantID, &treatment.HiveID, &treatment.TreatedAt, &treatment.TreatmentType,
		&treatment.Method, &treatment.Dose, &treatment.MiteCountBefore, &treatment.MiteCountAfter,
		&treatment.Weather, &treatment.Notes, &treatment.CreatedAt, &treatment.UpdatedAt)

	if err != nil {
		return nil, fmt.Errorf("storage: failed to create treatment: %w", err)
	}

	return &treatment, nil
}

// CreateTreatmentsForMultipleHives creates treatment records for multiple hives within a transaction.
func CreateTreatmentsForMultipleHives(ctx context.Context, conn *pgxpool.Conn, tenantID string, hiveIDs []string, input *CreateTreatmentInput) ([]Treatment, error) {
	treatments := make([]Treatment, 0, len(hiveIDs))

	// Use a transaction to ensure all-or-nothing creation
	tx, err := conn.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx) // No-op if committed

	for _, hiveID := range hiveIDs {
		var treatment Treatment
		err := tx.QueryRow(ctx,
			`INSERT INTO treatments (tenant_id, hive_id, treated_at, treatment_type, method, dose, mite_count_before, mite_count_after, weather, notes)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
			 RETURNING id, tenant_id, hive_id, treated_at, treatment_type, method, dose, mite_count_before, mite_count_after, weather, notes, created_at, updated_at`,
			tenantID, hiveID, input.TreatedAt, input.TreatmentType, input.Method, input.Dose,
			input.MiteCountBefore, input.MiteCountAfter, input.Weather, input.Notes,
		).Scan(&treatment.ID, &treatment.TenantID, &treatment.HiveID, &treatment.TreatedAt, &treatment.TreatmentType,
			&treatment.Method, &treatment.Dose, &treatment.MiteCountBefore, &treatment.MiteCountAfter,
			&treatment.Weather, &treatment.Notes, &treatment.CreatedAt, &treatment.UpdatedAt)

		if err != nil {
			return nil, fmt.Errorf("storage: failed to create treatment for hive %s: %w", hiveID, err)
		}

		treatments = append(treatments, treatment)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("storage: failed to commit transaction: %w", err)
	}

	return treatments, nil
}

// ListTreatmentsByHive returns all treatments for a specific hive.
func ListTreatmentsByHive(ctx context.Context, conn *pgxpool.Conn, hiveID string) ([]Treatment, error) {
	rows, err := conn.Query(ctx,
		`SELECT id, tenant_id, hive_id, treated_at, treatment_type, method, dose, mite_count_before, mite_count_after, weather, notes, created_at, updated_at
		 FROM treatments
		 WHERE hive_id = $1
		 ORDER BY treated_at DESC, created_at DESC`,
		hiveID)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list treatments: %w", err)
	}
	defer rows.Close()

	var treatments []Treatment
	for rows.Next() {
		var t Treatment
		err := rows.Scan(&t.ID, &t.TenantID, &t.HiveID, &t.TreatedAt, &t.TreatmentType,
			&t.Method, &t.Dose, &t.MiteCountBefore, &t.MiteCountAfter,
			&t.Weather, &t.Notes, &t.CreatedAt, &t.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan treatment: %w", err)
		}
		treatments = append(treatments, t)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating treatments: %w", err)
	}

	return treatments, nil
}

// GetTreatmentByID retrieves a treatment by its ID.
func GetTreatmentByID(ctx context.Context, conn *pgxpool.Conn, id string) (*Treatment, error) {
	var treatment Treatment
	err := conn.QueryRow(ctx,
		`SELECT id, tenant_id, hive_id, treated_at, treatment_type, method, dose, mite_count_before, mite_count_after, weather, notes, created_at, updated_at
		 FROM treatments
		 WHERE id = $1`,
		id,
	).Scan(&treatment.ID, &treatment.TenantID, &treatment.HiveID, &treatment.TreatedAt, &treatment.TreatmentType,
		&treatment.Method, &treatment.Dose, &treatment.MiteCountBefore, &treatment.MiteCountAfter,
		&treatment.Weather, &treatment.Notes, &treatment.CreatedAt, &treatment.UpdatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get treatment: %w", err)
	}
	return &treatment, nil
}

// UpdateTreatment updates an existing treatment.
func UpdateTreatment(ctx context.Context, conn *pgxpool.Conn, id string, input *UpdateTreatmentInput) (*Treatment, error) {
	// Get current treatment
	current, err := GetTreatmentByID(ctx, conn, id)
	if err != nil {
		return nil, err
	}

	// Apply updates
	treatedAt := current.TreatedAt
	if input.TreatedAt != nil {
		treatedAt = *input.TreatedAt
	}

	treatmentType := current.TreatmentType
	if input.TreatmentType != nil {
		treatmentType = *input.TreatmentType
	}

	method := current.Method
	if input.Method != nil {
		method = input.Method
	}

	dose := current.Dose
	if input.Dose != nil {
		dose = input.Dose
	}

	miteCountBefore := current.MiteCountBefore
	if input.MiteCountBefore != nil {
		miteCountBefore = input.MiteCountBefore
	}

	miteCountAfter := current.MiteCountAfter
	if input.MiteCountAfter != nil {
		miteCountAfter = input.MiteCountAfter
	}

	weather := current.Weather
	if input.Weather != nil {
		weather = input.Weather
	}

	notes := current.Notes
	if input.Notes != nil {
		notes = input.Notes
	}

	// Update treatment
	var treatment Treatment
	err = conn.QueryRow(ctx,
		`UPDATE treatments
		 SET treated_at = $2, treatment_type = $3, method = $4, dose = $5, mite_count_before = $6, mite_count_after = $7, weather = $8, notes = $9, updated_at = NOW()
		 WHERE id = $1
		 RETURNING id, tenant_id, hive_id, treated_at, treatment_type, method, dose, mite_count_before, mite_count_after, weather, notes, created_at, updated_at`,
		id, treatedAt, treatmentType, method, dose, miteCountBefore, miteCountAfter, weather, notes,
	).Scan(&treatment.ID, &treatment.TenantID, &treatment.HiveID, &treatment.TreatedAt, &treatment.TreatmentType,
		&treatment.Method, &treatment.Dose, &treatment.MiteCountBefore, &treatment.MiteCountAfter,
		&treatment.Weather, &treatment.Notes, &treatment.CreatedAt, &treatment.UpdatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to update treatment: %w", err)
	}

	return &treatment, nil
}

// DeleteTreatment deletes a treatment by its ID.
func DeleteTreatment(ctx context.Context, conn *pgxpool.Conn, id string) error {
	result, err := conn.Exec(ctx, `DELETE FROM treatments WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("storage: failed to delete treatment: %w", err)
	}

	if result.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

// CountTreatmentsByHive returns the total number of treatments for a hive.
func CountTreatmentsByHive(ctx context.Context, conn *pgxpool.Conn, hiveID string) (int, error) {
	var count int
	err := conn.QueryRow(ctx, `SELECT COUNT(*) FROM treatments WHERE hive_id = $1`, hiveID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("storage: failed to count treatments: %w", err)
	}
	return count, nil
}

// GetLastTreatmentForHive returns the most recent treatment for a hive.
func GetLastTreatmentForHive(ctx context.Context, conn *pgxpool.Conn, hiveID string) (*Treatment, error) {
	var treatment Treatment
	err := conn.QueryRow(ctx,
		`SELECT id, tenant_id, hive_id, treated_at, treatment_type, method, dose, mite_count_before, mite_count_after, weather, notes, created_at, updated_at
		 FROM treatments
		 WHERE hive_id = $1
		 ORDER BY treated_at DESC, created_at DESC
		 LIMIT 1`,
		hiveID,
	).Scan(&treatment.ID, &treatment.TenantID, &treatment.HiveID, &treatment.TreatedAt, &treatment.TreatmentType,
		&treatment.Method, &treatment.Dose, &treatment.MiteCountBefore, &treatment.MiteCountAfter,
		&treatment.Weather, &treatment.Notes, &treatment.CreatedAt, &treatment.UpdatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get last treatment: %w", err)
	}
	return &treatment, nil
}

// GetLastTreatmentsByTypeForHive returns the most recent treatment for each treatment type for a hive.
// Returns a map of treatment_type -> Treatment.
func GetLastTreatmentsByTypeForHive(ctx context.Context, conn *pgxpool.Conn, hiveID string) (map[string]*Treatment, error) {
	rows, err := conn.Query(ctx,
		`SELECT DISTINCT ON (treatment_type)
		        id, tenant_id, hive_id, treated_at, treatment_type, method, dose, mite_count_before, mite_count_after, weather, notes, created_at, updated_at
		 FROM treatments
		 WHERE hive_id = $1
		 ORDER BY treatment_type, treated_at DESC, created_at DESC`,
		hiveID)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get last treatments by type: %w", err)
	}
	defer rows.Close()

	result := make(map[string]*Treatment)
	for rows.Next() {
		var t Treatment
		err := rows.Scan(&t.ID, &t.TenantID, &t.HiveID, &t.TreatedAt, &t.TreatmentType,
			&t.Method, &t.Dose, &t.MiteCountBefore, &t.MiteCountAfter,
			&t.Weather, &t.Notes, &t.CreatedAt, &t.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan treatment: %w", err)
		}
		result[t.TreatmentType] = &t
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating treatments: %w", err)
	}

	return result, nil
}

// ListTreatmentsForDateRange returns all treatments within a date range for a tenant.
func ListTreatmentsForDateRange(ctx context.Context, conn *pgxpool.Conn, tenantID string, startDate, endDate time.Time) ([]Treatment, error) {
	rows, err := conn.Query(ctx,
		`SELECT id, tenant_id, hive_id, treated_at, treatment_type, method, dose, mite_count_before, mite_count_after, weather, notes, created_at, updated_at
		 FROM treatments
		 WHERE tenant_id = $1 AND treated_at >= $2 AND treated_at <= $3
		 ORDER BY treated_at ASC, created_at ASC`,
		tenantID, startDate, endDate)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list treatments for date range: %w", err)
	}
	defer rows.Close()

	var treatments []Treatment
	for rows.Next() {
		var t Treatment
		err := rows.Scan(&t.ID, &t.TenantID, &t.HiveID, &t.TreatedAt, &t.TreatmentType,
			&t.Method, &t.Dose, &t.MiteCountBefore, &t.MiteCountAfter,
			&t.Weather, &t.Notes, &t.CreatedAt, &t.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan treatment: %w", err)
		}
		treatments = append(treatments, t)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating treatments: %w", err)
	}

	return treatments, nil
}

// CreateTreatmentFromTask creates a treatment record from task completion data.
// This is a simplified method that accepts a map and applies sensible defaults.
// Used by auto-effects processing when a task creates a treatment record.
func CreateTreatmentFromTask(ctx context.Context, conn *pgxpool.Conn, tenantID, hiveID string, fields map[string]any) (*Treatment, error) {
	// Parse fields with defaults
	treatmentType := parseTreatmentStringField(fields, "treatment_type", "other")
	if treatmentType == "" {
		treatmentType = "other"
	}

	// Optional fields
	method := parseTreatmentOptionalString(fields, "method")
	dose := parseTreatmentOptionalString(fields, "dose")
	miteCountBefore := parseTreatmentOptionalInt(fields, "mite_count_before")
	miteCountAfter := parseTreatmentOptionalInt(fields, "mite_count_after")
	weather := parseTreatmentOptionalString(fields, "weather")
	notes := parseTreatmentOptionalString(fields, "notes")

	// Parse date or use today
	treatedAt := parseTreatmentDateField(fields, "treated_at")

	input := &CreateTreatmentInput{
		HiveID:          hiveID,
		TreatedAt:       treatedAt,
		TreatmentType:   treatmentType,
		Method:          method,
		Dose:            dose,
		MiteCountBefore: miteCountBefore,
		MiteCountAfter:  miteCountAfter,
		Weather:         weather,
		Notes:           notes,
	}

	return CreateTreatment(ctx, conn, tenantID, input)
}

// parseTreatmentStringField extracts a string from a map with a default value.
func parseTreatmentStringField(fields map[string]any, key, defaultVal string) string {
	if val, ok := fields[key]; ok {
		if s, ok := val.(string); ok && s != "" {
			return s
		}
	}
	return defaultVal
}

// parseTreatmentOptionalString extracts an optional string pointer from a map.
func parseTreatmentOptionalString(fields map[string]any, key string) *string {
	if val, ok := fields[key]; ok {
		if s, ok := val.(string); ok && s != "" {
			return &s
		}
	}
	return nil
}

// parseTreatmentOptionalInt extracts an optional int pointer from a map.
func parseTreatmentOptionalInt(fields map[string]any, key string) *int {
	if val, ok := fields[key]; ok {
		switch v := val.(type) {
		case float64:
			i := int(v)
			return &i
		case int:
			return &v
		case int64:
			i := int(v)
			return &i
		case string:
			if i, err := strconv.Atoi(v); err == nil {
				return &i
			}
		}
	}
	return nil
}

// parseTreatmentDateField extracts a date from fields or returns current time.
func parseTreatmentDateField(fields map[string]any, key string) time.Time {
	if val, ok := fields[key]; ok {
		if dateStr, ok := val.(string); ok && dateStr != "" {
			// Try various date formats
			for _, layout := range []string{"2006-01-02", time.RFC3339, "2006-01-02T15:04:05Z"} {
				if parsed, err := time.Parse(layout, dateStr); err == nil {
					return parsed
				}
			}
		}
	}
	return time.Now()
}
