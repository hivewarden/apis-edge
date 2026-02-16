package handlers

import (
	"context"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jermoo/apis/apis-server/internal/config"
	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/rs/zerolog/log"
)

// AuthConfigResponse represents the auth configuration response for the frontend.
// The response structure varies based on the current auth mode.
type AuthConfigResponse struct {
	// Mode is the authentication mode: "local" or "keycloak"
	Mode string `json:"mode"`

	// SetupRequired is true when in local mode and no users exist yet (first-time setup)
	// Only present in local mode.
	SetupRequired *bool `json:"setup_required,omitempty"`

	// KeycloakAuthority is the Keycloak issuer URL
	// Only present in keycloak mode.
	KeycloakAuthority string `json:"keycloak_authority,omitempty"`

	// ClientID is the OIDC client ID for the identity provider. Only present in keycloak mode.
	ClientID string `json:"client_id,omitempty"`
}

// AuthConfigHandler provides dependency injection for the auth config endpoint.
// This allows us to mock the database for testing.
type AuthConfigHandler struct {
	pool *pgxpool.Pool
}

// NewAuthConfigHandler creates a new auth config handler with the given database pool.
func NewAuthConfigHandler(pool *pgxpool.Pool) *AuthConfigHandler {
	return &AuthConfigHandler{pool: pool}
}

// GetAuthConfig returns the authentication configuration for frontend clients.
// This endpoint is public (no authentication required) so the frontend
// can fetch configuration before attempting login.
//
// Local mode response:
//
//	{
//	  "mode": "local",
//	  "setup_required": true
//	}
//
// SaaS mode response:
//
//	{
//	  "mode": "keycloak",
//	  "keycloak_authority": "https://keycloak.example.com/realms/honeybee",
//	  "client_id": "apis-dashboard"
//	}
func (h *AuthConfigHandler) GetAuthConfig(w http.ResponseWriter, r *http.Request) {
	mode := config.AuthMode()

	log.Debug().
		Str("mode", mode).
		Msg("Auth config requested")

	var resp AuthConfigResponse
	resp.Mode = mode

	if config.IsLocalAuth() {
		// Local mode: Check if setup is required (no users exist)
		setupRequired, err := h.checkSetupRequired(r.Context())
		if err != nil {
			log.Error().Err(err).Msg("handler: failed to check setup required")
			// Don't fail the request, just assume setup is not required
			setupRequired = false
		}
		resp.SetupRequired = &setupRequired
	} else {
		// SaaS mode: Return Keycloak configuration
		resp.KeycloakAuthority = config.KeycloakIssuer()
		resp.ClientID = config.KeycloakClientID()

		// Warn if configuration is missing (shouldn't happen if InitAuthConfig succeeded)
		if resp.KeycloakAuthority == "" {
			log.Warn().Msg("handler: KEYCLOAK_ISSUER not available for auth config response")
		}
		if resp.ClientID == "" {
			log.Warn().Msg("handler: KEYCLOAK_CLIENT_ID not available for auth config response")
		}
	}

	respondJSON(w, resp, http.StatusOK)
}

// checkSetupRequired returns true if no users exist in the default tenant.
// This indicates that the initial setup wizard should be shown.
func (h *AuthConfigHandler) checkSetupRequired(ctx context.Context) (bool, error) {
	if h.pool == nil {
		// No database pool, assume setup is required
		return true, nil
	}

	count, err := storage.CountUsersInTenant(ctx, h.pool, config.DefaultTenantUUID())
	if err != nil {
		return false, err
	}

	return count == 0, nil
}

// GetAuthConfigFunc returns a handler function for use with chi router.
// This is a convenience function for the main.go route registration.
func GetAuthConfigFunc(pool *pgxpool.Pool) http.HandlerFunc {
	handler := NewAuthConfigHandler(pool)
	return handler.GetAuthConfig
}
