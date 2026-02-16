// Package storage provides data access layer for the APIS server.
package storage

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ImpersonationSession represents an impersonation session in the database.
// Super-admins use impersonation to access tenant data for debugging and support.
type ImpersonationSession struct {
	ID           string     `json:"id"`
	SuperAdminID string     `json:"super_admin_id"` // The super-admin who initiated impersonation
	TenantID     string     `json:"tenant_id"`      // The tenant being impersonated
	StartedAt    time.Time  `json:"started_at"`
	EndedAt      *time.Time `json:"ended_at,omitempty"` // NULL while session is active
	ActionsTaken int        `json:"actions_taken"`      // Count of actions during session
}

// ErrNotImpersonating is returned when trying to stop impersonation but no active session exists.
var ErrNotImpersonating = errors.New("storage: not currently impersonating")

// ErrAlreadyImpersonating is returned when trying to start impersonation while already impersonating.
var ErrAlreadyImpersonating = errors.New("storage: already impersonating a tenant")

// CreateImpersonationLog creates a new impersonation session record.
// This is called when a super-admin starts impersonating a tenant.
// TODO (DL-M14): This function has a TOCTOU race condition: it first checks if an
// active session exists, then inserts a new one. Concurrent requests could both pass
// the check. Fix by adding a unique partial index:
//   CREATE UNIQUE INDEX idx_impersonation_active ON impersonation_log(super_admin_id) WHERE ended_at IS NULL;
// Then handle the constraint violation in Go, or use INSERT ... WHERE NOT EXISTS atomically.
func CreateImpersonationLog(ctx context.Context, pool *pgxpool.Pool, superAdminID, tenantID string) (*ImpersonationSession, error) {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to acquire connection: %w", err)
	}
	defer conn.Release()

	// Check if already impersonating (active session exists)
	var existingID string
	err = conn.QueryRow(ctx,
		`SELECT id FROM impersonation_log
		 WHERE super_admin_id = $1 AND ended_at IS NULL
		 LIMIT 1`,
		superAdminID,
	).Scan(&existingID)

	if err == nil {
		// Found an active session
		return nil, ErrAlreadyImpersonating
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("storage: failed to check existing impersonation: %w", err)
	}

	// Create new session
	var session ImpersonationSession
	err = conn.QueryRow(ctx,
		`INSERT INTO impersonation_log (super_admin_id, tenant_id)
		 VALUES ($1, $2)
		 RETURNING id, super_admin_id, tenant_id, started_at, ended_at, actions_taken`,
		superAdminID, tenantID,
	).Scan(
		&session.ID,
		&session.SuperAdminID,
		&session.TenantID,
		&session.StartedAt,
		&session.EndedAt,
		&session.ActionsTaken,
	)

	if err != nil {
		return nil, fmt.Errorf("storage: failed to create impersonation log: %w", err)
	}

	return &session, nil
}

// EndImpersonationLog ends the active impersonation session for a super-admin.
// Returns ErrNotImpersonating if no active session exists.
func EndImpersonationLog(ctx context.Context, pool *pgxpool.Pool, superAdminID string) (*ImpersonationSession, error) {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to acquire connection: %w", err)
	}
	defer conn.Release()

	// Update the active session and return its details
	var session ImpersonationSession
	err = conn.QueryRow(ctx,
		`UPDATE impersonation_log
		 SET ended_at = NOW()
		 WHERE super_admin_id = $1 AND ended_at IS NULL
		 RETURNING id, super_admin_id, tenant_id, started_at, ended_at, actions_taken`,
		superAdminID,
	).Scan(
		&session.ID,
		&session.SuperAdminID,
		&session.TenantID,
		&session.StartedAt,
		&session.EndedAt,
		&session.ActionsTaken,
	)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotImpersonating
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to end impersonation log: %w", err)
	}

	return &session, nil
}

// GetActiveImpersonation returns the active impersonation session for a super-admin.
// Returns nil if no active session exists (not an error).
func GetActiveImpersonation(ctx context.Context, pool *pgxpool.Pool, superAdminID string) (*ImpersonationSession, error) {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to acquire connection: %w", err)
	}
	defer conn.Release()

	var session ImpersonationSession
	err = conn.QueryRow(ctx,
		`SELECT id, super_admin_id, tenant_id, started_at, ended_at, actions_taken
		 FROM impersonation_log
		 WHERE super_admin_id = $1 AND ended_at IS NULL
		 ORDER BY started_at DESC
		 LIMIT 1`,
		superAdminID,
	).Scan(
		&session.ID,
		&session.SuperAdminID,
		&session.TenantID,
		&session.StartedAt,
		&session.EndedAt,
		&session.ActionsTaken,
	)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil // No active session is not an error
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get active impersonation: %w", err)
	}

	return &session, nil
}

// ListImpersonationLogs returns impersonation logs for a specific tenant.
// This is useful for audit purposes to see who has accessed tenant data.
// Results are ordered by started_at descending (most recent first).
func ListImpersonationLogs(ctx context.Context, pool *pgxpool.Pool, tenantID string, limit int) ([]*ImpersonationSession, error) {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to acquire connection: %w", err)
	}
	defer conn.Release()

	if limit <= 0 {
		limit = 50 // Default limit
	}

	rows, err := conn.Query(ctx,
		`SELECT id, super_admin_id, tenant_id, started_at, ended_at, actions_taken
		 FROM impersonation_log
		 WHERE tenant_id = $1
		 ORDER BY started_at DESC
		 LIMIT $2`,
		tenantID, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list impersonation logs: %w", err)
	}
	defer rows.Close()

	var sessions []*ImpersonationSession
	for rows.Next() {
		var s ImpersonationSession
		if err := rows.Scan(
			&s.ID,
			&s.SuperAdminID,
			&s.TenantID,
			&s.StartedAt,
			&s.EndedAt,
			&s.ActionsTaken,
		); err != nil {
			return nil, fmt.Errorf("storage: failed to scan impersonation log: %w", err)
		}
		sessions = append(sessions, &s)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: row iteration error: %w", err)
	}

	return sessions, nil
}

// IncrementImpersonationActions increments the actions_taken counter for the active session.
// This is called when actions are performed during impersonation for audit purposes.
func IncrementImpersonationActions(ctx context.Context, pool *pgxpool.Pool, superAdminID string) error {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("storage: failed to acquire connection: %w", err)
	}
	defer conn.Release()

	_, err = conn.Exec(ctx,
		`UPDATE impersonation_log
		 SET actions_taken = actions_taken + 1
		 WHERE super_admin_id = $1 AND ended_at IS NULL`,
		superAdminID,
	)
	if err != nil {
		return fmt.Errorf("storage: failed to increment actions: %w", err)
	}

	return nil
}
