// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"encoding/json"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"

	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/services"
	"github.com/jermoo/apis/apis-server/internal/storage"
)

// BeeBrainSettingsResponse is the response for GET /api/settings/beebrain.
type BeeBrainSettingsResponse struct {
	Data BeeBrainSettingsData `json:"data"`
}

// BeeBrainSettingsData contains the effective BeeBrain configuration for a tenant.
type BeeBrainSettingsData struct {
	Mode               string  `json:"mode"`                 // "system", "custom", "rules_only"
	EffectiveBackend   string  `json:"effective_backend"`    // "rules", "local", "external"
	EffectiveProvider  *string `json:"effective_provider"`   // Provider name if applicable
	EffectiveModel     *string `json:"effective_model"`      // Model name if applicable
	CustomConfigStatus string  `json:"custom_config_status"` // "configured" or "not_configured"
	SystemAvailable    bool    `json:"system_available"`     // Whether system default is available
	UpdatedAt          string  `json:"updated_at"`
	Message            string  `json:"message,omitempty"`
}

// UpdateBeeBrainSettingsRequest is the request body for PUT /api/settings/beebrain.
type UpdateBeeBrainSettingsRequest struct {
	Mode     string  `json:"mode"`               // "system", "custom", "rules_only"
	Provider *string `json:"provider,omitempty"` // Required for custom mode
	Endpoint *string `json:"endpoint,omitempty"` // Required for ollama/local
	APIKey   *string `json:"api_key,omitempty"`  // Required for external providers
	Model    *string `json:"model,omitempty"`    // Optional model name
}

// validModes defines the allowed mode values for tenant settings.
var validModes = map[string]bool{
	"system":     true,
	"custom":     true,
	"rules_only": true,
}

// validProviders defines the allowed provider values.
var validProviders = map[string]bool{
	"openai":    true,
	"anthropic": true,
	"ollama":    true,
}

// GetTenantBeeBrainSettings returns a handler that gets the current tenant's BeeBrain settings.
// GET /api/settings/beebrain
//
// Returns the effective configuration for the authenticated tenant.
// Does not require admin role - any authenticated user can view settings.
func GetTenantBeeBrainSettings(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := middleware.GetClaims(r.Context())
		tenantID := claims.TenantID

		// Get effective config
		config, err := storage.GetEffectiveBeeBrainConfig(r.Context(), pool, tenantID)
		if err != nil {
			log.Error().Err(err).
				Str("tenant_id", tenantID).
				Str("user_id", claims.UserID).
				Msg("handler: failed to get BeeBrain settings")
			respondError(w, "Failed to get BeeBrain settings", http.StatusInternalServerError)
			return
		}

		log.Debug().
			Str("tenant_id", tenantID).
			Str("user_id", claims.UserID).
			Str("mode", config.Mode).
			Str("backend", config.Backend).
			Msg("Tenant retrieved BeeBrain settings")

		respondJSON(w, BeeBrainSettingsResponse{
			Data: BeeBrainSettingsData{
				Mode:               config.Mode,
				EffectiveBackend:   config.Backend,
				EffectiveProvider:  config.Provider,
				EffectiveModel:     config.Model,
				CustomConfigStatus: config.CustomConfigStatus,
				SystemAvailable:    config.SystemAvailable,
				UpdatedAt:          config.UpdatedAt.Format(time.RFC3339),
			},
		}, http.StatusOK)
	}
}

// UpdateTenantBeeBrainSettings returns a handler that updates the tenant's BeeBrain settings.
// PUT /api/settings/beebrain
//
// Admin role required. Allows switching between system/custom/rules_only modes.
// When custom mode is selected, provider and API key configuration is required.
func UpdateTenantBeeBrainSettings(pool *pgxpool.Pool, encryptionSvc *services.EncryptionService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := middleware.GetClaims(r.Context())
		tenantID := claims.TenantID

		// Check admin role
		if claims.Role != "admin" {
			log.Debug().
				Str("tenant_id", tenantID).
				Str("user_id", claims.UserID).
				Str("role", claims.Role).
				Msg("Non-admin attempted to update BeeBrain settings")
			respondError(w, "Admin role required", http.StatusForbidden)
			return
		}

		var req UpdateBeeBrainSettingsRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			respondError(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		// Validate mode
		if !validModes[req.Mode] {
			respondError(w, "Invalid mode. Must be one of: system, custom, rules_only", http.StatusBadRequest)
			return
		}

		var config *storage.EffectiveBeeBrainConfig
		var err error

		switch req.Mode {
		case "system":
			// Delete any existing custom config to revert to system default
			if deleteErr := storage.DeleteTenantBeeBrainConfig(r.Context(), pool, tenantID); deleteErr != nil {
				// Ignore not found error - it just means no custom config existed
				if deleteErr != storage.ErrNotFound {
					log.Error().Err(deleteErr).
						Str("tenant_id", tenantID).
						Msg("handler: failed to delete tenant BeeBrain config")
					respondError(w, "Failed to update BeeBrain settings", http.StatusInternalServerError)
					return
				}
			}

			// Get the effective config (should now be system)
			config, err = storage.GetEffectiveBeeBrainConfig(r.Context(), pool, tenantID)
			if err != nil {
				log.Error().Err(err).
					Str("tenant_id", tenantID).
					Msg("handler: failed to get effective BeeBrain config")
				respondError(w, "Failed to update BeeBrain settings", http.StatusInternalServerError)
				return
			}

			log.Info().
				Str("tenant_id", tenantID).
				Str("user_id", claims.UserID).
				Str("mode", "system").
				Msg("Tenant switched to system BeeBrain config")

		case "rules_only":
			// Set up tenant config with rules backend (no AI)
			input := &storage.SetTenantBeeBrainConfigInput{
				Backend: "rules",
			}

			_, err = storage.SetTenantBeeBrainConfig(r.Context(), pool, tenantID, input)
			if err != nil {
				log.Error().Err(err).
					Str("tenant_id", tenantID).
					Msg("handler: failed to set tenant BeeBrain config to rules_only")
				respondError(w, "Failed to update BeeBrain settings", http.StatusInternalServerError)
				return
			}

			config, err = storage.GetEffectiveBeeBrainConfig(r.Context(), pool, tenantID)
			if err != nil {
				log.Error().Err(err).
					Str("tenant_id", tenantID).
					Msg("handler: failed to get effective BeeBrain config")
				respondError(w, "Failed to update BeeBrain settings", http.StatusInternalServerError)
				return
			}

			log.Info().
				Str("tenant_id", tenantID).
				Str("user_id", claims.UserID).
				Str("mode", "rules_only").
				Msg("Tenant switched to rules-only BeeBrain mode")

		case "custom":
			// Validate provider
			if req.Provider == nil || *req.Provider == "" {
				respondError(w, "Provider is required for custom mode", http.StatusBadRequest)
				return
			}

			if !validProviders[*req.Provider] {
				respondError(w, "Invalid provider. Must be one of: openai, anthropic, ollama", http.StatusBadRequest)
				return
			}

			// Validate provider-specific requirements
			switch *req.Provider {
			case "openai":
				// OpenAI requires API key with sk-... prefix
				// Check if we're updating an existing config
				existingConfig, _ := storage.GetTenantBeeBrainConfig(r.Context(), pool, tenantID)
				hasExistingKey := existingConfig != nil && existingConfig.APIKeyEncrypted != nil && *existingConfig.APIKeyEncrypted != ""

				if (req.APIKey == nil || *req.APIKey == "") && !hasExistingKey {
					respondError(w, "API key is required for OpenAI provider", http.StatusBadRequest)
					return
				}

				// Validate OpenAI key format (sk-... prefix) if a new key is provided
				if req.APIKey != nil && *req.APIKey != "" {
					if !strings.HasPrefix(*req.APIKey, "sk-") {
						respondError(w, "Invalid OpenAI API key format. Key must start with 'sk-'", http.StatusBadRequest)
						return
					}
				}

			case "anthropic":
				// Anthropic requires API key
				existingConfig, _ := storage.GetTenantBeeBrainConfig(r.Context(), pool, tenantID)
				hasExistingKey := existingConfig != nil && existingConfig.APIKeyEncrypted != nil && *existingConfig.APIKeyEncrypted != ""

				if (req.APIKey == nil || *req.APIKey == "") && !hasExistingKey {
					respondError(w, "API key is required for Anthropic provider", http.StatusBadRequest)
					return
				}

			case "ollama":
				// Ollama requires endpoint, API key is optional
				if req.Endpoint == nil || *req.Endpoint == "" {
					respondError(w, "Endpoint is required for Ollama provider", http.StatusBadRequest)
					return
				}

				// Validate endpoint URL format
				if !isValidOllamaEndpoint(*req.Endpoint) {
					respondError(w, "Invalid Ollama endpoint URL. Must be a valid HTTP or HTTPS URL", http.StatusBadRequest)
					return
				}
			}

			// Encrypt API key if provided
			var encryptedKey *string
			if req.APIKey != nil && *req.APIKey != "" {
				if encryptionSvc == nil || !encryptionSvc.IsConfigured() {
					log.Warn().Str("tenant_id", tenantID).Msg("handler: encryption service not configured")
					respondError(w, "Unable to save API key. Please contact your administrator.", http.StatusInternalServerError)
					return
				}

				encrypted, encErr := encryptionSvc.EncryptAPIKey(*req.APIKey)
				if encErr != nil {
					log.Error().Err(encErr).
						Str("tenant_id", tenantID).
						Msg("handler: failed to encrypt API key")
					respondError(w, "Failed to encrypt API key", http.StatusInternalServerError)
					return
				}
				encryptedKey = &encrypted
			}

			// Determine backend based on provider
			backend := "external"
			if *req.Provider == "ollama" {
				backend = "local"
			}

			input := &storage.SetTenantBeeBrainConfigInput{
				Backend:         backend,
				Provider:        req.Provider,
				Endpoint:        req.Endpoint,
				APIKeyEncrypted: encryptedKey,
				Model:           req.Model,
			}

			_, err = storage.SetTenantBeeBrainConfig(r.Context(), pool, tenantID, input)
			if err != nil {
				log.Error().Err(err).
					Str("tenant_id", tenantID).
					Str("provider", *req.Provider).
					Msg("handler: failed to set tenant BeeBrain config")
				respondError(w, "Failed to update BeeBrain settings", http.StatusInternalServerError)
				return
			}

			config, err = storage.GetEffectiveBeeBrainConfig(r.Context(), pool, tenantID)
			if err != nil {
				log.Error().Err(err).
					Str("tenant_id", tenantID).
					Msg("handler: failed to get effective BeeBrain config")
				respondError(w, "Failed to update BeeBrain settings", http.StatusInternalServerError)
				return
			}

			log.Info().
				Str("tenant_id", tenantID).
				Str("user_id", claims.UserID).
				Str("mode", "custom").
				Str("provider", *req.Provider).
				Str("backend", backend).
				Msg("Tenant configured custom BeeBrain settings")
		}

		respondJSON(w, BeeBrainSettingsResponse{
			Data: BeeBrainSettingsData{
				Mode:               config.Mode,
				EffectiveBackend:   config.Backend,
				EffectiveProvider:  config.Provider,
				EffectiveModel:     config.Model,
				CustomConfigStatus: config.CustomConfigStatus,
				SystemAvailable:    config.SystemAvailable,
				UpdatedAt:          config.UpdatedAt.Format(time.RFC3339),
				Message:            "BeeBrain configuration updated",
			},
		}, http.StatusOK)
	}
}

// isValidOllamaEndpoint validates an Ollama endpoint URL.
// Accepts HTTP or HTTPS URLs with a valid, non-private host.
//
// SECURITY FIX (S3B-H1): Added private IP blocklist to prevent SSRF attacks
// where a malicious user could configure an Ollama endpoint pointing to
// internal services (e.g., metadata endpoints, internal APIs).
func isValidOllamaEndpoint(endpoint string) bool {
	// Parse the URL
	parsed, err := url.Parse(endpoint)
	if err != nil {
		return false
	}

	// Must be HTTP or HTTPS
	scheme := strings.ToLower(parsed.Scheme)
	if scheme != "http" && scheme != "https" {
		return false
	}

	// Must have a host
	if parsed.Host == "" {
		return false
	}

	// Reject URLs with user info (could be used for credential injection)
	if parsed.User != nil {
		return false
	}

	// SSRF protection: resolve hostname and reject private/internal IPs
	hostname := parsed.Hostname()
	if isPrivateHostname(hostname) {
		return false
	}

	return true
}

// isPrivateHostname checks if a hostname resolves to a private or internal IP address.
// This prevents SSRF attacks by blocking access to internal network resources.
// Uses the isPrivateIP function defined in stream.go for IP range checking.
func isPrivateHostname(hostname string) bool {
	// Check for obviously private hostnames
	if hostname == "localhost" || hostname == "0.0.0.0" {
		return true
	}

	// Try to parse as IP first
	if ip := net.ParseIP(hostname); ip != nil {
		return isPrivateIP(ip)
	}

	// Resolve hostname to IPs
	ips, err := net.LookupIP(hostname)
	if err != nil {
		// If we can't resolve, reject to be safe
		return true
	}

	for _, ip := range ips {
		if isPrivateIP(ip) {
			return true
		}
	}

	return false
}
