package storage

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// InviteToken represents an invitation token for adding users to a tenant.
type InviteToken struct {
	ID        string     `json:"id"`
	TenantID  string     `json:"tenant_id"`
	Token     string     `json:"token"`               // Cryptographically secure random token
	Email     string     `json:"email,omitempty"`     // Target email for direct invites, empty for shareable links
	Role      string     `json:"role"`                // Role to assign when accepted (admin or member)
	Type      string     `json:"type"`                // "temp_password", "email", "link"
	UsedAt    *time.Time `json:"used_at,omitempty"`   // When token was used, nil if unused
	ExpiresAt time.Time  `json:"expires_at"`          // Token expiration time
	CreatedBy string     `json:"created_by"`          // User ID who created the invite
	CreatedAt time.Time  `json:"created_at"`
}

// InviteTokenInput contains the data needed to create an invite token.
type InviteTokenInput struct {
	TenantID  string
	Email     string // Optional, for email invites
	Role      string // "admin" or "member"
	Type      string // "temp_password", "email", "link"
	ExpiresAt time.Time
	CreatedBy string
}

// DefaultInviteExpiry is the default expiration time for invite tokens (7 days).
const DefaultInviteExpiry = 7 * 24 * time.Hour

// GenerateInviteToken generates a cryptographically secure random token.
// Returns a 64-character hex string (32 bytes of randomness).
// TODO (DL-M13): Invite tokens are currently stored in plaintext in the database.
// For improved security, store a SHA-256 hash of the token in the DB and compare
// hashes on validation (similar to how API keys use bcrypt). The raw token should
// only be shown once at creation time. This prevents token theft if the database
// is compromised.
func GenerateInviteToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("storage: failed to generate random token: %w", err)
	}
	return hex.EncodeToString(bytes), nil
}

// CreateInviteToken creates a new invite token in the database.
// The token field must be pre-generated using GenerateInviteToken().
func CreateInviteToken(ctx context.Context, conn *pgxpool.Conn, token string, input *InviteTokenInput) (*InviteToken, error) {
	var t InviteToken
	var usedAt *time.Time

	// Handle empty email for link invites
	var emailParam interface{}
	if input.Email != "" {
		emailParam = input.Email
	} else {
		emailParam = nil
	}

	err := conn.QueryRow(ctx,
		`INSERT INTO invite_tokens (tenant_id, token, email, role, created_by, expires_at)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, tenant_id, token, email, role, used_at, expires_at, created_by, created_at`,
		input.TenantID, token, emailParam, input.Role, input.CreatedBy, input.ExpiresAt,
	).Scan(&t.ID, &t.TenantID, &t.Token, &t.Email, &t.Role, &usedAt, &t.ExpiresAt, &t.CreatedBy, &t.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("storage: insert invite token: %w", err)
	}

	t.UsedAt = usedAt
	t.Type = input.Type
	return &t, nil
}

// GetInviteTokenByToken retrieves an invite token by its token value.
// This query bypasses RLS since it's used by public endpoints.
// Returns ErrNotFound if the token does not exist.
func GetInviteTokenByToken(ctx context.Context, pool *pgxpool.Pool, token string) (*InviteToken, error) {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return nil, fmt.Errorf("storage: acquire connection: %w", err)
	}
	defer conn.Release()

	var t InviteToken
	var usedAt *time.Time
	var email *string

	err = conn.QueryRow(ctx,
		`SELECT id, tenant_id, token, email, role, used_at, expires_at, created_by, created_at
		 FROM invite_tokens WHERE token = $1`,
		token,
	).Scan(&t.ID, &t.TenantID, &t.Token, &email, &t.Role, &usedAt, &t.ExpiresAt, &t.CreatedBy, &t.CreatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: query invite token: %w", err)
	}

	t.UsedAt = usedAt
	if email != nil {
		t.Email = *email
	}
	return &t, nil
}

// GetInviteTokenByTokenWithTenant retrieves an invite token and its associated tenant info.
// Used by the public accept endpoint to get tenant name.
// Returns ErrNotFound if the token does not exist.
func GetInviteTokenByTokenWithTenant(ctx context.Context, pool *pgxpool.Pool, token string) (*InviteToken, *Tenant, error) {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return nil, nil, fmt.Errorf("storage: acquire connection: %w", err)
	}
	defer conn.Release()

	var t InviteToken
	var tenant Tenant
	var usedAt *time.Time
	var email *string

	err = conn.QueryRow(ctx,
		`SELECT it.id, it.tenant_id, it.token, it.email, it.role, it.used_at, it.expires_at, it.created_by, it.created_at,
		        tn.id, tn.name, tn.plan, COALESCE(tn.status, 'active'), tn.settings, tn.created_at
		 FROM invite_tokens it
		 JOIN tenants tn ON it.tenant_id = tn.id
		 WHERE it.token = $1`,
		token,
	).Scan(&t.ID, &t.TenantID, &t.Token, &email, &t.Role, &usedAt, &t.ExpiresAt, &t.CreatedBy, &t.CreatedAt,
		&tenant.ID, &tenant.Name, &tenant.Plan, &tenant.Status, &tenant.Settings, &tenant.CreatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil, ErrNotFound
	}
	if err != nil {
		return nil, nil, fmt.Errorf("storage: query invite token with tenant: %w", err)
	}

	t.UsedAt = usedAt
	if email != nil {
		t.Email = *email
	}
	return &t, &tenant, nil
}

// MarkInviteTokenUsed marks an invite token as used.
// Returns ErrNotFound if the token does not exist.
func MarkInviteTokenUsed(ctx context.Context, pool *pgxpool.Pool, tokenID string) error {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("storage: acquire connection: %w", err)
	}
	defer conn.Release()

	result, err := conn.Exec(ctx,
		`UPDATE invite_tokens SET used_at = NOW() WHERE id = $1`,
		tokenID,
	)
	if err != nil {
		return fmt.Errorf("storage: mark invite token used: %w", err)
	}

	if result.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ListInviteTokensByTenant retrieves all invite tokens for the current tenant.
// Note: This query is subject to RLS based on app.tenant_id.
func ListInviteTokensByTenant(ctx context.Context, conn *pgxpool.Conn) ([]*InviteToken, error) {
	rows, err := conn.Query(ctx,
		`SELECT id, tenant_id, token, email, role, used_at, expires_at, created_by, created_at
		 FROM invite_tokens
		 ORDER BY created_at DESC`,
	)
	if err != nil {
		return nil, fmt.Errorf("storage: query invite tokens: %w", err)
	}
	defer rows.Close()

	var tokens []*InviteToken
	for rows.Next() {
		var t InviteToken
		var usedAt *time.Time
		var email *string

		if err := rows.Scan(&t.ID, &t.TenantID, &t.Token, &email, &t.Role, &usedAt, &t.ExpiresAt, &t.CreatedBy, &t.CreatedAt); err != nil {
			return nil, fmt.Errorf("storage: scan invite token: %w", err)
		}

		t.UsedAt = usedAt
		if email != nil {
			t.Email = *email
		}
		tokens = append(tokens, &t)
	}
	return tokens, rows.Err()
}

// DeleteInviteToken deletes an invite token by ID.
// Note: This query is subject to RLS based on app.tenant_id.
// Returns ErrNotFound if the token does not exist.
func DeleteInviteToken(ctx context.Context, conn *pgxpool.Conn, tokenID string) error {
	result, err := conn.Exec(ctx,
		`DELETE FROM invite_tokens WHERE id = $1`,
		tokenID,
	)
	if err != nil {
		return fmt.Errorf("storage: delete invite token: %w", err)
	}

	if result.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// IsInviteTokenValid checks if an invite token is valid (not expired and not used for single-use tokens).
// For link-type tokens, used_at is ignored (reusable).
// Returns true if the token can be used.
func IsInviteTokenValid(token *InviteToken, isLinkType bool) bool {
	// Check expiration
	if time.Now().After(token.ExpiresAt) {
		return false
	}

	// For link-type tokens, ignore used_at (reusable)
	if isLinkType {
		return true
	}

	// For email/temp_password tokens, check if already used
	return token.UsedAt == nil
}

// CreateUserFromInvite creates a user account from an invite token.
// This is an atomic operation that marks the token as used and creates the user.
// For link-type tokens (reusable), the token is not marked as used.
func CreateUserFromInvite(ctx context.Context, pool *pgxpool.Pool, token *InviteToken, input *CreateLocalUserInput, isLinkType bool) (*User, error) {
	// Begin transaction
	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("storage: begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// For non-link tokens, mark as used first to prevent race conditions
	if !isLinkType {
		result, err := tx.Exec(ctx,
			`UPDATE invite_tokens SET used_at = NOW() WHERE id = $1 AND used_at IS NULL`,
			token.ID,
		)
		if err != nil {
			return nil, fmt.Errorf("storage: mark token used: %w", err)
		}
		if result.RowsAffected() == 0 {
			return nil, fmt.Errorf("storage: token already used")
		}
	}

	// Create the user
	var u User
	var lastLoginAt *time.Time
	err = tx.QueryRow(ctx,
		`INSERT INTO users (tenant_id, email, display_name, password_hash, role, is_active, external_user_id)
		 VALUES ($1, $2, $3, $4, $5, true, NULL)
		 RETURNING id, tenant_id, email, display_name, role, is_active, must_change_password, last_login_at, created_at`,
		input.TenantID, input.Email, input.DisplayName, input.PasswordHash, input.Role,
	).Scan(&u.ID, &u.TenantID, &u.Email, &u.Name, &u.Role, &u.IsActive, &u.MustChangePassword, &lastLoginAt, &u.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("storage: insert user from invite: %w", err)
	}
	u.LastLoginAt = lastLoginAt

	// Commit transaction
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("storage: commit transaction: %w", err)
	}

	return &u, nil
}
