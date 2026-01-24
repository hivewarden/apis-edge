// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/rs/zerolog/log"
)

// MeResponse contains the current user's identity information.
// Field naming convention:
//   - id: Internal database UUID (stable, for internal references)
//   - user_id: External Zitadel user ID (JWT "sub" claim, for IdP operations)
//   - tenant_id: Organization ID (JWT "org_id" claim, for multi-tenant isolation)
type MeResponse struct {
	// ID is the internal database user ID (UUID)
	ID string `json:"id"`
	// UserID is the external Zitadel user identifier (JWT "sub" claim)
	UserID string `json:"user_id"`
	// TenantID is the organization/tenant ID (JWT "org_id" claim)
	TenantID string `json:"tenant_id"`
	// Email is the user's email address
	Email string `json:"email"`
	// Name is the user's display name
	Name string `json:"name"`
	// Roles contains the user's assigned roles (from JWT)
	Roles []string `json:"roles"`
}

// GetMe returns the current authenticated user's information.
// This endpoint requires authentication and returns user info from the database.
// The user is automatically provisioned on first login.
//
// Response:
//
//	{
//	  "id": "abc-123",
//	  "user_id": "zitadel-sub-123",
//	  "tenant_id": "org_789",
//	  "email": "user@example.com",
//	  "name": "John Doe",
//	  "roles": ["owner"]
//	}
func GetMe(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	if claims == nil {
		// This shouldn't happen if auth middleware is properly applied
		log.Error().Msg("GetMe called without authentication claims")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]any{
			"error": "not authenticated",
			"code":  http.StatusUnauthorized,
		})
		return
	}

	// Get user from context (set by tenant middleware)
	user := middleware.GetUser(r.Context())
	if user == nil {
		// This shouldn't happen if tenant middleware is properly applied
		log.Error().Msg("GetMe called without user in context")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]any{
			"error": "user not found",
			"code":  http.StatusInternalServerError,
		})
		return
	}

	response := MeResponse{
		ID:       user.ID,
		UserID:   user.ZitadelUserID,
		TenantID: user.TenantID,
		Email:    user.Email,
		Name:     user.Name,
		Roles:    claims.Roles,
	}

	log.Debug().
		Str("user_id", user.ID).
		Str("tenant_id", user.TenantID).
		Msg("User info requested")

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(response); err != nil {
		// Note: Headers already sent, can only log the error
		log.Error().Err(err).Msg("Failed to encode me response")
	}
}
