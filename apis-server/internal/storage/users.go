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
// Users are synced from Zitadel user accounts.
type User struct {
	ID            string    `json:"id"`
	TenantID      string    `json:"tenant_id"`
	ZitadelUserID string    `json:"zitadel_user_id"`
	Email         string    `json:"email"`
	Name          string    `json:"name"`
	CreatedAt     time.Time `json:"created_at"`
}

// GetUserByZitadelID retrieves a user by their Zitadel user ID (sub claim).
// Returns ErrNotFound if the user does not exist.
// Note: This query IS subject to RLS - the tenant context (app.tenant_id) must
// be set before calling, otherwise RLS will return no rows even if user exists.
func GetUserByZitadelID(ctx context.Context, conn *pgxpool.Conn, zitadelUserID string) (*User, error) {
	var u User
	err := conn.QueryRow(ctx,
		`SELECT id, tenant_id, zitadel_user_id, email, name, created_at
		 FROM users WHERE zitadel_user_id = $1`,
		zitadelUserID,
	).Scan(&u.ID, &u.TenantID, &u.ZitadelUserID, &u.Email, &u.Name, &u.CreatedAt)

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
		`SELECT id, tenant_id, zitadel_user_id, email, name, created_at
		 FROM users WHERE id = $1`,
		id,
	).Scan(&u.ID, &u.TenantID, &u.ZitadelUserID, &u.Email, &u.Name, &u.CreatedAt)

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
		`INSERT INTO users (tenant_id, zitadel_user_id, email, name)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, tenant_id, zitadel_user_id, email, name, created_at`,
		u.TenantID, u.ZitadelUserID, u.Email, u.Name,
	).Scan(&created.ID, &created.TenantID, &created.ZitadelUserID, &created.Email, &created.Name, &created.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("insert user: %w", err)
	}
	return &created, nil
}

// ListUsersByTenant retrieves all users for a tenant.
// Note: This query is subject to RLS, so only the current tenant's users are returned.
func ListUsersByTenant(ctx context.Context, conn *pgxpool.Conn) ([]*User, error) {
	rows, err := conn.Query(ctx,
		`SELECT id, tenant_id, zitadel_user_id, email, name, created_at
		 FROM users ORDER BY created_at DESC`,
	)
	if err != nil {
		return nil, fmt.Errorf("query users: %w", err)
	}
	defer rows.Close()

	var users []*User
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.TenantID, &u.ZitadelUserID, &u.Email, &u.Name, &u.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}
		users = append(users, &u)
	}
	return users, rows.Err()
}
