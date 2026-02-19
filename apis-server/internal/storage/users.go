package storage

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// User represents a user in the system.
// Users can be either external OIDC-synced (SaaS mode) or local (standalone mode).
type User struct {
	ID                 string     `json:"id"`
	TenantID           string     `json:"tenant_id"`
	ExternalUserID     string     `json:"external_user_id,omitempty"` // NULL for local users
	Email              string     `json:"email"`
	Name               string     `json:"name"` // display_name column
	Role               string     `json:"role"` // admin or member
	PasswordHash       string     `json:"-"`    // Never expose in JSON
	IsActive           bool       `json:"is_active"`
	MustChangePassword bool       `json:"must_change_password"`
	LastLoginAt        *time.Time `json:"last_login_at,omitempty"`
	CreatedAt          time.Time  `json:"created_at"`
}

// CreateLocalUserInput contains the data needed to create a local auth user.
type CreateLocalUserInput struct {
	TenantID     string
	Email        string
	DisplayName  string
	PasswordHash string
	Role         string // "admin" or "member"
}

// GetUserByExternalID retrieves a user by their external OIDC user ID (sub claim).
// Returns ErrNotFound if the user does not exist.
// Note: This query IS subject to RLS - the tenant context (app.tenant_id) must
// be set before calling, otherwise RLS will return no rows even if user exists.
func GetUserByExternalID(ctx context.Context, conn *pgxpool.Conn, externalUserID string) (*User, error) {
	var u User
	err := conn.QueryRow(ctx,
		`SELECT id, tenant_id, COALESCE(external_user_id, ''), email,
		        COALESCE(display_name, ''), created_at
		 FROM users WHERE external_user_id = $1`,
		externalUserID,
	).Scan(&u.ID, &u.TenantID, &u.ExternalUserID, &u.Email, &u.Name, &u.CreatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("query user: %w", err)
	}
	return &u, nil
}

// GetUserByID retrieves a user by their internal ID.
// Returns ErrNotFound if the user does not exist.
// Note: This query is subject to RLS based on app.tenant_id.
func GetUserByID(ctx context.Context, conn *pgxpool.Conn, id string) (*User, error) {
	var u User
	err := conn.QueryRow(ctx,
		`SELECT id, tenant_id, COALESCE(external_user_id, ''), email,
		        COALESCE(display_name, ''), created_at
		 FROM users WHERE id = $1`,
		id,
	).Scan(&u.ID, &u.TenantID, &u.ExternalUserID, &u.Email, &u.Name, &u.CreatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("query user: %w", err)
	}
	return &u, nil
}

// CreateUser creates a new user.
// Returns the created user with populated fields including generated ID.
func CreateUser(ctx context.Context, conn *pgxpool.Conn, u *User) (*User, error) {
	var created User
	err := conn.QueryRow(ctx,
		`INSERT INTO users (tenant_id, external_user_id, email, display_name)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, tenant_id, external_user_id, email, display_name, created_at`,
		u.TenantID, u.ExternalUserID, u.Email, u.Name,
	).Scan(&created.ID, &created.TenantID, &created.ExternalUserID, &created.Email, &created.Name, &created.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("insert user: %w", err)
	}
	return &created, nil
}

// GetUserByEmail retrieves a user by their email address.
// Returns ErrNotFound if the user does not exist.
// Note: This query is subject to RLS based on app.tenant_id.
// Used by local auth mode for email-based user lookup.
func GetUserByEmail(ctx context.Context, conn *pgxpool.Conn, email string) (*User, error) {
	var u User
	err := conn.QueryRow(ctx,
		`SELECT id, tenant_id, external_user_id, email, display_name, created_at
		 FROM users WHERE email = $1`,
		email,
	).Scan(&u.ID, &u.TenantID, &u.ExternalUserID, &u.Email, &u.Name, &u.CreatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: query user by email: %w", err)
	}
	return &u, nil
}

// ListUsersByTenant retrieves all users for a tenant.
// Note: This query is subject to RLS, so only the current tenant's users are returned.
func ListUsersByTenant(ctx context.Context, conn *pgxpool.Conn) ([]*User, error) {
	rows, err := conn.Query(ctx,
		`SELECT id, tenant_id, COALESCE(external_user_id, ''), email,
		        COALESCE(display_name, ''), COALESCE(role, 'member'),
		        COALESCE(is_active, true), created_at
		 FROM users ORDER BY created_at DESC`,
	)
	if err != nil {
		return nil, fmt.Errorf("query users: %w", err)
	}
	defer rows.Close()

	var users []*User
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.TenantID, &u.ExternalUserID, &u.Email, &u.Name, &u.Role, &u.IsActive, &u.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}
		users = append(users, &u)
	}
	return users, rows.Err()
}

// CreateLocalUser creates a new user for local authentication mode.
// This function is used by the setup wizard and user invitation flow.
// The password_hash should already be bcrypt-hashed.
//
// Returns the created user with populated fields including generated ID.
func CreateLocalUser(ctx context.Context, conn *pgxpool.Conn, input *CreateLocalUserInput) (*User, error) {
	var u User
	// Note: We use display_name column (renamed from name in migration 0023)
	err := conn.QueryRow(ctx,
		`INSERT INTO users (tenant_id, email, display_name, password_hash, role, is_active, external_user_id)
		 VALUES ($1, $2, $3, $4, $5, true, NULL)
		 RETURNING id, tenant_id, email, display_name, role, is_active, created_at`,
		input.TenantID, input.Email, input.DisplayName, input.PasswordHash, input.Role,
	).Scan(&u.ID, &u.TenantID, &u.Email, &u.Name, &u.Role, &u.IsActive, &u.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("storage: insert local user: %w", err)
	}
	return &u, nil
}

// GetUserByEmailWithPassword retrieves a user by email including password hash.
// Used for local authentication login verification.
// Sets RLS context before query to allow access to user data.
func GetUserByEmailWithPassword(ctx context.Context, conn *pgxpool.Conn, tenantID, email string) (*User, error) {
	// Set the tenant context for RLS (Row Level Security)
	// This is required because RLS policies check app.tenant_id
	// Use false for is_local since we're not in a transaction
	_, err := conn.Exec(ctx, "SELECT set_config('app.tenant_id', $1, false)", tenantID)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to set tenant context: %w", err)
	}

	var u User
	err = conn.QueryRow(ctx,
		`SELECT id, tenant_id, COALESCE(external_user_id, ''), email,
		        COALESCE(display_name, ''), COALESCE(role, 'member'),
		        COALESCE(password_hash, ''), COALESCE(is_active, true), created_at
		 FROM users
		 WHERE tenant_id = $1 AND email = $2`,
		tenantID, email,
	).Scan(&u.ID, &u.TenantID, &u.ExternalUserID, &u.Email, &u.Name, &u.Role, &u.PasswordHash, &u.IsActive, &u.CreatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: query user by email with password: %w", err)
	}
	return &u, nil
}

// UpdateUserLastLogin updates the last_login_at timestamp for a user.
// Note: This function requires the RLS context to already be set by the caller
// (typically GetUserByEmailWithPassword sets it on the same connection).
func UpdateUserLastLogin(ctx context.Context, conn *pgxpool.Conn, tenantID, userID string) error {
	// Set the tenant context for RLS
	_, err := conn.Exec(ctx, "SELECT set_config('app.tenant_id', $1, false)", tenantID)
	if err != nil {
		return fmt.Errorf("storage: failed to set tenant context: %w", err)
	}

	_, err = conn.Exec(ctx,
		`UPDATE users SET last_login_at = NOW() WHERE id = $1`,
		userID,
	)
	if err != nil {
		return fmt.Errorf("storage: update last login: %w", err)
	}
	return nil
}

// ErrSetupAlreadyComplete is returned when trying to create the first admin
// but users already exist in the tenant.
var ErrSetupAlreadyComplete = errors.New("setup already complete: users exist")

// CreateFirstAdminAtomic atomically creates the first admin user for a tenant.
// This uses a transaction with SELECT FOR UPDATE to prevent race conditions
// where two concurrent requests could both pass the "no users exist" check.
//
// Returns:
// - (*User, nil) on success
// - (nil, ErrSetupAlreadyComplete) if users already exist
// - (nil, error) for other errors
func CreateFirstAdminAtomic(ctx context.Context, pool *pgxpool.Pool, input *CreateLocalUserInput) (*User, error) {
	// Begin transaction
	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx) // No-op if committed

	// Set tenant context for RLS (Row Level Security)
	// This is required because RLS policies check app.tenant_id
	// Use set_config() function which properly supports parameters
	_, err = tx.Exec(ctx, "SELECT set_config('app.tenant_id', $1, true)", input.TenantID)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to set tenant context: %w", err)
	}

	// Lock the tenant row to prevent concurrent setup attempts.
	// SELECT FOR UPDATE acquires a row-level lock that blocks other transactions
	// from updating or locking the same row until this transaction completes.
	var tenantID string
	err = tx.QueryRow(ctx,
		`SELECT id FROM tenants WHERE id = $1 FOR UPDATE`,
		input.TenantID,
	).Scan(&tenantID)

	if errors.Is(err, pgx.ErrNoRows) {
		// Tenant doesn't exist - this shouldn't happen if EnsureDefaultTenantExists was called
		return nil, fmt.Errorf("storage: tenant %s not found", input.TenantID)
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to lock tenant: %w", err)
	}

	// Check if users already exist (within the same transaction)
	var count int64
	err = tx.QueryRow(ctx,
		`SELECT COUNT(*) FROM users WHERE tenant_id = $1`,
		input.TenantID,
	).Scan(&count)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to count users: %w", err)
	}

	if count > 0 {
		return nil, ErrSetupAlreadyComplete
	}

	// Create the admin user within the transaction
	var u User
	err = tx.QueryRow(ctx,
		`INSERT INTO users (tenant_id, email, display_name, password_hash, role, is_active, external_user_id)
		 VALUES ($1, $2, $3, $4, $5, true, NULL)
		 RETURNING id, tenant_id, email, display_name, role, is_active, created_at`,
		input.TenantID, input.Email, input.DisplayName, input.PasswordHash, input.Role,
	).Scan(&u.ID, &u.TenantID, &u.Email, &u.Name, &u.Role, &u.IsActive, &u.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to insert user: %w", err)
	}

	// Commit the transaction
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("storage: failed to commit transaction: %w", err)
	}

	return &u, nil
}

// CreateLocalUserWithMustChange creates a new user for local authentication mode
// with the must_change_password flag set. Used for admin-created users.
// The password_hash should already be bcrypt-hashed.
// The invitedBy is the ID of the admin who created the user.
func CreateLocalUserWithMustChange(ctx context.Context, conn *pgxpool.Conn, input *CreateLocalUserInput, invitedBy string) (*User, error) {
	var u User
	var lastLoginAt *time.Time
	err := conn.QueryRow(ctx,
		`INSERT INTO users (tenant_id, email, display_name, password_hash, role, is_active, must_change_password, invited_by, invited_at, external_user_id)
		 VALUES ($1, $2, $3, $4, $5, true, true, $6, NOW(), NULL)
		 RETURNING id, tenant_id, email, display_name, role, is_active, must_change_password, last_login_at, created_at`,
		input.TenantID, input.Email, input.DisplayName, input.PasswordHash, input.Role, invitedBy,
	).Scan(&u.ID, &u.TenantID, &u.Email, &u.Name, &u.Role, &u.IsActive, &u.MustChangePassword, &lastLoginAt, &u.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("storage: insert local user with must change: %w", err)
	}
	u.LastLoginAt = lastLoginAt
	return &u, nil
}

// GetUserByIDFull retrieves a user by their internal ID with all fields including last_login_at.
// Returns ErrNotFound if the user does not exist.
// Note: This query is subject to RLS based on app.tenant_id.
func GetUserByIDFull(ctx context.Context, conn *pgxpool.Conn, id string) (*User, error) {
	var u User
	var lastLoginAt *time.Time
	err := conn.QueryRow(ctx,
		`SELECT id, tenant_id, COALESCE(external_user_id, ''), email,
		        COALESCE(display_name, ''), COALESCE(role, 'member'),
		        COALESCE(is_active, true), COALESCE(must_change_password, false),
		        last_login_at, created_at
		 FROM users WHERE id = $1`,
		id,
	).Scan(&u.ID, &u.TenantID, &u.ExternalUserID, &u.Email, &u.Name, &u.Role,
		&u.IsActive, &u.MustChangePassword, &lastLoginAt, &u.CreatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: query user by id full: %w", err)
	}
	u.LastLoginAt = lastLoginAt
	return &u, nil
}

// ListUsersByTenantFull retrieves all users for a tenant with full details including last_login_at.
// Note: This query is subject to RLS, so only the current tenant's users are returned.
//
// IMPORTANT: This function returns ALL users including soft-deleted (is_active=false) users.
// This is intentional to allow admins to see and manage deactivated users, including
// the ability to view user history or potentially reactivate users.
func ListUsersByTenantFull(ctx context.Context, conn *pgxpool.Conn) ([]*User, error) {
	rows, err := conn.Query(ctx,
		`SELECT id, tenant_id, COALESCE(external_user_id, ''), email,
		        COALESCE(display_name, ''), COALESCE(role, 'member'),
		        COALESCE(is_active, true), COALESCE(must_change_password, false),
		        last_login_at, created_at
		 FROM users ORDER BY created_at DESC`,
	)
	if err != nil {
		return nil, fmt.Errorf("storage: query users full: %w", err)
	}
	defer rows.Close()

	var users []*User
	for rows.Next() {
		var u User
		var lastLoginAt *time.Time
		if err := rows.Scan(&u.ID, &u.TenantID, &u.ExternalUserID, &u.Email, &u.Name,
			&u.Role, &u.IsActive, &u.MustChangePassword, &lastLoginAt, &u.CreatedAt); err != nil {
			return nil, fmt.Errorf("storage: scan user full: %w", err)
		}
		u.LastLoginAt = lastLoginAt
		users = append(users, &u)
	}
	return users, rows.Err()
}

// UpdateUserInput contains the fields that can be updated for a user.
type UpdateUserInput struct {
	DisplayName *string
	Role        *string
	IsActive    *bool
}

// UpdateUser updates user fields by ID.
// Returns ErrNotFound if the user does not exist.
// Note: This query is subject to RLS based on app.tenant_id.
func UpdateUser(ctx context.Context, conn *pgxpool.Conn, userID string, input *UpdateUserInput) (*User, error) {
	var u User
	var lastLoginAt *time.Time

	err := conn.QueryRow(ctx,
		`UPDATE users SET
		    display_name = COALESCE($2, display_name),
		    role = COALESCE($3, role),
		    is_active = COALESCE($4, is_active)
		 WHERE id = $1
		 RETURNING id, tenant_id, COALESCE(external_user_id, ''), email,
		           COALESCE(display_name, ''), COALESCE(role, 'member'),
		           COALESCE(is_active, true), COALESCE(must_change_password, false),
		           last_login_at, created_at`,
		userID, input.DisplayName, input.Role, input.IsActive,
	).Scan(&u.ID, &u.TenantID, &u.ExternalUserID, &u.Email, &u.Name, &u.Role,
		&u.IsActive, &u.MustChangePassword, &lastLoginAt, &u.CreatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: update user: %w", err)
	}
	u.LastLoginAt = lastLoginAt
	return &u, nil
}

// CountAdminUsers counts the number of active admin users in the tenant.
// Note: This query is subject to RLS based on app.tenant_id.
func CountAdminUsers(ctx context.Context, conn *pgxpool.Conn) (int64, error) {
	var count int64
	err := conn.QueryRow(ctx,
		`SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_active = true`,
	).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("storage: count admin users: %w", err)
	}
	return count, nil
}

// SoftDeleteUser sets is_active=false for a user.
// Returns ErrNotFound if the user does not exist.
// Note: This query is subject to RLS based on app.tenant_id.
func SoftDeleteUser(ctx context.Context, conn *pgxpool.Conn, userID string) error {
	result, err := conn.Exec(ctx,
		`UPDATE users SET is_active = false WHERE id = $1`,
		userID,
	)
	if err != nil {
		return fmt.Errorf("storage: soft delete user: %w", err)
	}
	if result.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// SetUserPassword updates the password hash and must_change_password flag for a user.
// Used for password reset by admin.
// Note: This query is subject to RLS based on app.tenant_id.
func SetUserPassword(ctx context.Context, conn *pgxpool.Conn, userID, passwordHash string, mustChange bool) error {
	result, err := conn.Exec(ctx,
		`UPDATE users SET password_hash = $2, must_change_password = $3 WHERE id = $1`,
		userID, passwordHash, mustChange,
	)
	if err != nil {
		return fmt.Errorf("storage: set user password: %w", err)
	}
	if result.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ErrEmailExists is returned when trying to create a user with an email that already exists.
var ErrEmailExists = errors.New("email already exists")

// ErrNoAdminUser is returned when no admin user exists in the tenant.
var ErrNoAdminUser = errors.New("no admin user exists")

// ResetAdminPassword resets the password for the first (oldest) admin user in a tenant.
// It uses a transaction with SELECT FOR UPDATE to safely find and update the admin.
// The admin is also reactivated (is_active=true) and must_change_password is set to true.
// Returns the admin's email address for logging, or ErrNoAdminUser if no admin exists.
func ResetAdminPassword(ctx context.Context, pool *pgxpool.Pool, tenantID, passwordHash string) (string, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return "", fmt.Errorf("storage: failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Set tenant context for RLS (transaction-local)
	_, err = tx.Exec(ctx, "SELECT set_config('app.tenant_id', $1, true)", tenantID)
	if err != nil {
		return "", fmt.Errorf("storage: failed to set tenant context: %w", err)
	}

	// Find the first (oldest) admin user, regardless of is_active status
	var userID, email string
	err = tx.QueryRow(ctx,
		`SELECT id, email FROM users
		 WHERE tenant_id = $1 AND role = 'admin'
		 ORDER BY created_at LIMIT 1
		 FOR UPDATE`,
		tenantID,
	).Scan(&userID, &email)

	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNoAdminUser
	}
	if err != nil {
		return "", fmt.Errorf("storage: failed to find admin user: %w", err)
	}

	// Update password, force change on next login, and reactivate
	_, err = tx.Exec(ctx,
		`UPDATE users SET password_hash = $2, must_change_password = true, is_active = true WHERE id = $1`,
		userID, passwordHash,
	)
	if err != nil {
		return "", fmt.Errorf("storage: failed to reset admin password: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return "", fmt.Errorf("storage: failed to commit transaction: %w", err)
	}

	return email, nil
}
