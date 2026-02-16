// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"

	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/services"
	"github.com/jermoo/apis/apis-server/internal/storage"
)

// BeeBrainSystemConfigResponse represents the system config in API responses.
type BeeBrainSystemConfigResponse struct {
	Backend      string  `json:"backend"`
	Provider     *string `json:"provider,omitempty"`
	Endpoint     *string `json:"endpoint,omitempty"`
	Model        *string `json:"model,omitempty"`
	APIKeyStatus string  `json:"api_key_status"` // "configured" or "not_configured"
	UpdatedAt    string  `json:"updated_at"`
}

// BeeBrainTenantAccessResponse represents tenant access in API responses.
type BeeBrainTenantAccessResponse struct {
	TenantID   string `json:"tenant_id"`
	TenantName string `json:"tenant_name"`
	Enabled    bool   `json:"enabled"`
	HasBYOK    bool   `json:"has_byok"`
}

// AdminBeeBrainConfigResponse is the response for GET /api/admin/beebrain.
type AdminBeeBrainConfigResponse struct {
	Data AdminBeeBrainConfigData `json:"data"`
}

// AdminBeeBrainConfigData contains system config and tenant access list.
type AdminBeeBrainConfigData struct {
	SystemConfig BeeBrainSystemConfigResponse   `json:"system_config"`
	TenantAccess []BeeBrainTenantAccessResponse `json:"tenant_access"`
}

// UpdateBeeBrainConfigRequest is the request body for PUT /api/admin/beebrain.
type UpdateBeeBrainConfigRequest struct {
	Backend  string  `json:"backend"`
	Provider *string `json:"provider,omitempty"`
	Endpoint *string `json:"endpoint,omitempty"`
	APIKey   *string `json:"api_key,omitempty"` // Plaintext, will be encrypted
	Model    *string `json:"model,omitempty"`
}

// UpdateBeeBrainConfigResponse is the response for PUT /api/admin/beebrain.
type UpdateBeeBrainConfigResponse struct {
	Data BeeBrainSystemConfigResponse `json:"data"`
}

// SetTenantBeeBrainAccessRequest is the request body for PUT /api/admin/tenants/{id}/beebrain.
type SetTenantBeeBrainAccessRequest struct {
	Enabled bool `json:"enabled"`
}

// SetTenantBeeBrainAccessResponse is the response for tenant access update.
type SetTenantBeeBrainAccessResponse struct {
	Data SetTenantBeeBrainAccessData `json:"data"`
}

// SetTenantBeeBrainAccessData contains the result of tenant access update.
type SetTenantBeeBrainAccessData struct {
	TenantID string `json:"tenant_id"`
	Enabled  bool   `json:"enabled"`
	Message  string `json:"message"`
}

// validBackends defines the allowed backend values.
var validBackends = map[string]bool{
	"rules":    true,
	"local":    true,
	"external": true,
}

// AdminGetBeeBrainConfig returns a handler that gets system BeeBrain configuration.
// GET /api/admin/beebrain
//
// Super-admin only. Returns system config and per-tenant access list.
func AdminGetBeeBrainConfig(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := middleware.GetClaims(r.Context())

		// Get system config
		config, err := storage.GetSystemBeeBrainConfig(r.Context(), pool)
		if err != nil {
			log.Error().Err(err).
				Str("super_admin_id", claims.UserID).
				Msg("handler: failed to get system BeeBrain config")
			respondError(w, "Failed to get BeeBrain configuration", http.StatusInternalServerError)
			return
		}

		// Get tenant access list
		tenantAccess, err := storage.ListTenantBeeBrainAccess(r.Context(), pool)
		if err != nil {
			log.Error().Err(err).
				Str("super_admin_id", claims.UserID).
				Msg("handler: failed to list tenant BeeBrain access")
			respondError(w, "Failed to get BeeBrain configuration", http.StatusInternalServerError)
			return
		}

		// Determine API key status
		apiKeyStatus := "not_configured"
		if config.APIKeyEncrypted != nil && *config.APIKeyEncrypted != "" {
			apiKeyStatus = "configured"
		}

		// Convert tenant access to response format
		tenantAccessResp := make([]BeeBrainTenantAccessResponse, 0, len(tenantAccess))
		for _, ta := range tenantAccess {
			tenantAccessResp = append(tenantAccessResp, BeeBrainTenantAccessResponse{
				TenantID:   ta.TenantID,
				TenantName: ta.TenantName,
				Enabled:    ta.Enabled,
				HasBYOK:    ta.HasBYOK,
			})
		}

		log.Debug().
			Str("super_admin_id", claims.UserID).
			Str("backend", config.Backend).
			Int("tenant_count", len(tenantAccessResp)).
			Msg("Super-admin retrieved BeeBrain config")

		respondJSON(w, AdminBeeBrainConfigResponse{
			Data: AdminBeeBrainConfigData{
				SystemConfig: BeeBrainSystemConfigResponse{
					Backend:      config.Backend,
					Provider:     config.Provider,
					Endpoint:     config.Endpoint,
					Model:        config.Model,
					APIKeyStatus: apiKeyStatus,
					UpdatedAt:    config.UpdatedAt.Format(time.RFC3339),
				},
				TenantAccess: tenantAccessResp,
			},
		}, http.StatusOK)
	}
}

// AdminUpdateBeeBrainConfig returns a handler that updates system BeeBrain configuration.
// PUT /api/admin/beebrain
//
// Super-admin only. Updates system-wide BeeBrain backend configuration.
func AdminUpdateBeeBrainConfig(pool *pgxpool.Pool, encryptionSvc *services.EncryptionService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := middleware.GetClaims(r.Context())

		var req UpdateBeeBrainConfigRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			respondError(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		// Validate backend type
		if !validBackends[req.Backend] {
			respondError(w, "Invalid backend type. Must be one of: rules, local, external", http.StatusBadRequest)
			return
		}

		// Validate required fields based on backend type
		if req.Backend == "local" {
			if req.Provider == nil || *req.Provider == "" {
				respondError(w, "Provider is required for local backend", http.StatusBadRequest)
				return
			}
			if req.Endpoint == nil || *req.Endpoint == "" {
				respondError(w, "Endpoint is required for local backend", http.StatusBadRequest)
				return
			}
		}

		if req.Backend == "external" {
			if req.Provider == nil || *req.Provider == "" {
				respondError(w, "Provider is required for external backend", http.StatusBadRequest)
				return
			}
			// API key can be omitted on update (keeps existing key)
			// But if changing TO external from another backend, we need the key
			currentConfig, err := storage.GetSystemBeeBrainConfig(r.Context(), pool)
			if err != nil {
				log.Error().Err(err).Msg("handler: failed to get current config for validation")
				respondError(w, "Failed to update configuration", http.StatusInternalServerError)
				return
			}
			// If changing to external and no existing key, require new key
			if currentConfig.Backend != "external" && (req.APIKey == nil || *req.APIKey == "") {
				respondError(w, "API key is required when switching to external backend", http.StatusBadRequest)
				return
			}
		}

		// Encrypt API key if provided
		var encryptedKey *string
		if req.APIKey != nil && *req.APIKey != "" {
			if encryptionSvc == nil || !encryptionSvc.IsConfigured() {
				respondError(w, "Encryption not configured. Set BEEBRAIN_ENCRYPTION_KEY to use external backend.", http.StatusBadRequest)
				return
			}

			encrypted, err := encryptionSvc.EncryptAPIKey(*req.APIKey)
			if err != nil {
				log.Error().Err(err).Msg("handler: failed to encrypt API key")
				respondError(w, "Failed to encrypt API key", http.StatusInternalServerError)
				return
			}
			encryptedKey = &encrypted
		}

		// Update config
		input := &storage.SetSystemBeeBrainConfigInput{
			Backend:         req.Backend,
			Provider:        req.Provider,
			Endpoint:        req.Endpoint,
			APIKeyEncrypted: encryptedKey,
			Model:           req.Model,
		}

		config, err := storage.SetSystemBeeBrainConfig(r.Context(), pool, input)
		if err != nil {
			log.Error().Err(err).
				Str("super_admin_id", claims.UserID).
				Str("backend", req.Backend).
				Msg("handler: failed to update BeeBrain config")
			respondError(w, "Failed to update BeeBrain configuration", http.StatusInternalServerError)
			return
		}

		// Determine API key status
		apiKeyStatus := "not_configured"
		if config.APIKeyEncrypted != nil && *config.APIKeyEncrypted != "" {
			apiKeyStatus = "configured"
		}

		log.Info().
			Str("super_admin_id", claims.UserID).
			Str("backend", config.Backend).
			Str("api_key_status", apiKeyStatus).
			Msg("Super-admin updated BeeBrain config")

		respondJSON(w, UpdateBeeBrainConfigResponse{
			Data: BeeBrainSystemConfigResponse{
				Backend:      config.Backend,
				Provider:     config.Provider,
				Endpoint:     config.Endpoint,
				Model:        config.Model,
				APIKeyStatus: apiKeyStatus,
				UpdatedAt:    config.UpdatedAt.Format(time.RFC3339),
			},
		}, http.StatusOK)
	}
}

// AdminSetTenantBeeBrainAccess returns a handler that enables/disables BeeBrain for a tenant.
// PUT /api/admin/tenants/{id}/beebrain
//
// Super-admin only. Toggle tenant's access to BeeBrain features.
func AdminSetTenantBeeBrainAccess(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := middleware.GetClaims(r.Context())
		tenantID := chi.URLParam(r, "id")

		if tenantID == "" {
			respondError(w, "Tenant ID is required", http.StatusBadRequest)
			return
		}

		var req SetTenantBeeBrainAccessRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			respondError(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		// Verify tenant exists
		_, err := storage.AdminGetTenantByID(r.Context(), pool, tenantID)
		if errors.Is(err, storage.ErrNotFound) {
			respondError(w, "Tenant not found", http.StatusNotFound)
			return
		}
		if err != nil {
			log.Error().Err(err).
				Str("super_admin_id", claims.UserID).
				Str("tenant_id", tenantID).
				Msg("handler: failed to verify tenant")
			respondError(w, "Failed to update tenant BeeBrain access", http.StatusInternalServerError)
			return
		}

		// Update access
		if err := storage.SetTenantBeeBrainAccess(r.Context(), pool, tenantID, req.Enabled); err != nil {
			log.Error().Err(err).
				Str("super_admin_id", claims.UserID).
				Str("tenant_id", tenantID).
				Bool("enabled", req.Enabled).
				Msg("handler: failed to set tenant BeeBrain access")
			respondError(w, "Failed to update tenant BeeBrain access", http.StatusInternalServerError)
			return
		}

		action := "disabled"
		if req.Enabled {
			action = "enabled"
		}

		log.Info().
			Str("super_admin_id", claims.UserID).
			Str("tenant_id", tenantID).
			Bool("enabled", req.Enabled).
			Msg("Super-admin updated tenant BeeBrain access")

		respondJSON(w, SetTenantBeeBrainAccessResponse{
			Data: SetTenantBeeBrainAccessData{
				TenantID: tenantID,
				Enabled:  req.Enabled,
				Message:  "BeeBrain access " + action + " for tenant",
			},
		}, http.StatusOK)
	}
}
