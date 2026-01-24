// Package services provides business logic services for the APIS server.
package services

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"

	"github.com/jermoo/apis/apis-server/internal/storage"
)

// ProvisioningClaims contains the claims needed for user provisioning.
// This avoids an import cycle with the middleware package.
type ProvisioningClaims struct {
	UserID string // Zitadel sub claim
	OrgID  string // Zitadel organization ID
	Email  string // User email
	Name   string // User display name
}

// EnsureUserProvisioned creates tenant and user if they don't exist.
// Called on every authenticated request (fast path: user exists).
//
// Uses OrgID as tenant_id because:
// - Zitadel Organizations map 1:1 to APIS tenants
// - org_id is stable across user sessions
// - org_id is already validated in AuthMiddleware
//
// The function is designed to be fast for the common case (user exists)
// and only does extra work on first login.
//
// Requires tenant context (app.tenant_id) to be set before calling,
// because RLS is enabled on the users table.
func EnsureUserProvisioned(ctx context.Context, conn *pgxpool.Conn, claims *ProvisioningClaims) (*storage.User, error) {
	if claims == nil {
		return nil, fmt.Errorf("claims required for provisioning")
	}

	// Validate required fields
	if claims.UserID == "" {
		return nil, fmt.Errorf("claims.UserID (sub) is required")
	}
	if claims.OrgID == "" {
		return nil, fmt.Errorf("claims.OrgID (organization) is required")
	}
	if claims.Email == "" {
		return nil, fmt.Errorf("claims.Email is required")
	}

	// Fast path: user already exists
	user, err := storage.GetUserByZitadelID(ctx, conn, claims.UserID)
	if err == nil {
		return user, nil
	}
	if !errors.Is(err, storage.ErrNotFound) {
		return nil, fmt.Errorf("lookup user: %w", err)
	}

	// User doesn't exist - need to create tenant and/or user
	// This is a rare path (first login only)

	log.Info().
		Str("zitadel_user_id", claims.UserID).
		Str("org_id", claims.OrgID).
		Str("email", claims.Email).
		Msg("Provisioning new user")

	// Ensure tenant exists (create if needed)
	// Use the user's name as a fallback for tenant name
	tenant, err := storage.GetOrCreateTenant(ctx, conn, claims.OrgID, claims.Name)
	if err != nil {
		return nil, fmt.Errorf("ensure tenant: %w", err)
	}

	// Create user
	user, err = storage.CreateUser(ctx, conn, &storage.User{
		TenantID:      tenant.ID,
		ZitadelUserID: claims.UserID,
		Email:         claims.Email,
		Name:          claims.Name,
	})
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}

	log.Info().
		Str("tenant_id", tenant.ID).
		Str("user_id", user.ID).
		Str("email", user.Email).
		Msg("New user provisioned")

	return user, nil
}
