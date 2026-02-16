// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"

	"github.com/jermoo/apis/apis-server/internal/config"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/storage"
)

// TenantInfo represents basic tenant information for settings.
type TenantInfo struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Plan      string `json:"plan"`
	CreatedAt string `json:"created_at"`
}

// UsageInfo represents current resource usage.
type UsageInfo struct {
	HiveCount    int   `json:"hive_count"`
	UnitCount    int   `json:"unit_count"`
	UserCount    int   `json:"user_count"`
	StorageBytes int64 `json:"storage_bytes"`
}

// LimitsInfo represents resource limits.
type LimitsInfo struct {
	MaxHives        int   `json:"max_hives"`
	MaxUnits        int   `json:"max_units"`
	MaxUsers        int   `json:"max_users"`
	MaxStorageBytes int64 `json:"max_storage_bytes"`
}

// PercentagesInfo represents usage percentages.
type PercentagesInfo struct {
	HivesPercent   int `json:"hives_percent"`
	UnitsPercent   int `json:"units_percent"`
	UsersPercent   int `json:"users_percent"`
	StoragePercent int `json:"storage_percent"`
}

// TenantSettingsResponse represents the response for GET /api/settings/tenant.
type TenantSettingsResponse struct {
	Tenant      TenantInfo      `json:"tenant"`
	Usage       UsageInfo       `json:"usage"`
	Limits      LimitsInfo      `json:"limits"`
	Percentages PercentagesInfo `json:"percentages"`
}

// TenantSettingsDataResponse wraps the tenant settings response.
type TenantSettingsDataResponse struct {
	Data TenantSettingsResponse `json:"data"`
}

// UpdateProfileRequest represents the request body for PUT /api/settings/profile.
type UpdateProfileRequest struct {
	Name string `json:"name"`
}

// ProfileResponse represents a user's profile in API responses.
type ProfileResponse struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
	Role  string `json:"role"`
}

// ProfileDataResponse wraps the profile response.
type ProfileDataResponse struct {
	Data ProfileResponse `json:"data"`
}

// calculatePercent safely calculates percentage, returning 0 if max is 0.
func calculatePercent(current, max int) int {
	if max == 0 {
		return 0
	}
	percent := (current * 100) / max
	if percent > 100 {
		return 100
	}
	return percent
}

// calculateStoragePercent safely calculates storage percentage.
func calculateStoragePercent(currentBytes, maxBytes int64) int {
	if maxBytes == 0 {
		return 0
	}
	percent := int((currentBytes * 100) / maxBytes)
	if percent > 100 {
		return 100
	}
	return percent
}

// GetTenantSettings returns a handler that gets tenant settings including usage and limits.
// GET /api/settings/tenant
//
// Returns tenant info, current usage, limits, and calculated percentages.
// Uses tenant from JWT claims (no URL param needed).
func GetTenantSettings(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := middleware.GetClaims(r.Context())
		if claims == nil {
			respondError(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		tenantID := claims.TenantID

		// Get tenant info
		tenant, err := storage.GetTenantByIDPool(r.Context(), pool, tenantID)
		if err != nil {
			if errors.Is(err, storage.ErrNotFound) {
				respondError(w, "Tenant not found", http.StatusNotFound)
				return
			}
			log.Error().Err(err).
				Str("user_id", claims.UserID).
				Str("tenant_id", tenantID).
				Msg("handler: failed to get tenant")
			respondError(w, "Failed to get tenant settings", http.StatusInternalServerError)
			return
		}

		// Get usage
		usage, err := storage.GetTenantUsage(r.Context(), pool, tenantID)
		if err != nil {
			log.Error().Err(err).
				Str("user_id", claims.UserID).
				Str("tenant_id", tenantID).
				Msg("handler: failed to get tenant usage")
			respondError(w, "Failed to get tenant settings", http.StatusInternalServerError)
			return
		}

		// Get limits
		limits, err := storage.GetTenantLimits(r.Context(), pool, tenantID)
		if err != nil {
			log.Error().Err(err).
				Str("user_id", claims.UserID).
				Str("tenant_id", tenantID).
				Msg("handler: failed to get tenant limits")
			respondError(w, "Failed to get tenant settings", http.StatusInternalServerError)
			return
		}

		// Build response
		response := TenantSettingsDataResponse{
			Data: TenantSettingsResponse{
				Tenant: TenantInfo{
					ID:        tenant.ID,
					Name:      tenant.Name,
					Plan:      tenant.Plan,
					CreatedAt: tenant.CreatedAt.Format(time.RFC3339),
				},
				Usage: UsageInfo{
					HiveCount:    usage.HiveCount,
					UnitCount:    usage.UnitCount,
					UserCount:    usage.UserCount,
					StorageBytes: usage.StorageBytes,
				},
				Limits: LimitsInfo{
					MaxHives:        limits.MaxHives,
					MaxUnits:        limits.MaxUnits,
					MaxUsers:        limits.MaxUsers,
					MaxStorageBytes: limits.MaxStorageBytes,
				},
				Percentages: PercentagesInfo{
					HivesPercent:   calculatePercent(usage.HiveCount, limits.MaxHives),
					UnitsPercent:   calculatePercent(usage.UnitCount, limits.MaxUnits),
					UsersPercent:   calculatePercent(usage.UserCount, limits.MaxUsers),
					StoragePercent: calculateStoragePercent(usage.StorageBytes, limits.MaxStorageBytes),
				},
			},
		}

		log.Debug().
			Str("user_id", claims.UserID).
			Str("tenant_id", tenantID).
			Msg("User retrieved tenant settings")

		respondJSON(w, response, http.StatusOK)
	}
}

// UpdateUserProfile returns a handler that updates the current user's profile.
// PUT /api/settings/profile
//
// Updates the user's display name. Only available in local auth mode.
// Returns 403 if called in SaaS mode.
func UpdateUserProfile(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Check if we're in local auth mode
		if !config.IsLocalAuth() {
			respondError(w, "Profile updates are not available in SaaS mode", http.StatusForbidden)
			return
		}

		claims := middleware.GetClaims(r.Context())
		if claims == nil {
			respondError(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		// Parse request body
		var req UpdateProfileRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			respondError(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		// Validate name
		name := strings.TrimSpace(req.Name)
		if name == "" {
			respondError(w, "Name is required", http.StatusBadRequest)
			return
		}

		// FIX (S3B-LOW-01): Validate maximum name length to prevent memory pressure
		// from extremely long values.
		if len(name) > 200 {
			respondError(w, "Name must not exceed 200 characters", http.StatusBadRequest)
			return
		}

		// Acquire connection
		conn, err := pool.Acquire(r.Context())
		if err != nil {
			log.Error().Err(err).
				Str("user_id", claims.UserID).
				Msg("handler: failed to acquire connection")
			respondError(w, "Failed to update profile", http.StatusInternalServerError)
			return
		}
		defer conn.Release()

		// Set tenant context for RLS
		_, err = conn.Exec(r.Context(), "SELECT set_config('app.tenant_id', $1, true)", claims.TenantID)
		if err != nil {
			log.Error().Err(err).
				Str("user_id", claims.UserID).
				Msg("handler: failed to set tenant context")
			respondError(w, "Failed to update profile", http.StatusInternalServerError)
			return
		}

		// Update user's display name
		user, err := storage.UpdateUser(r.Context(), conn, claims.UserID, &storage.UpdateUserInput{
			DisplayName: &name,
		})
		if err != nil {
			if errors.Is(err, storage.ErrNotFound) {
				respondError(w, "User not found", http.StatusNotFound)
				return
			}
			log.Error().Err(err).
				Str("user_id", claims.UserID).
				Msg("handler: failed to update user profile")
			respondError(w, "Failed to update profile", http.StatusInternalServerError)
			return
		}

		log.Info().
			Str("user_id", claims.UserID).
			Str("tenant_id", claims.TenantID).
			Str("new_name", name).
			Msg("User updated profile")

		respondJSON(w, ProfileDataResponse{
			Data: ProfileResponse{
				ID:    user.ID,
				Name:  user.Name,
				Email: user.Email,
				Role:  user.Role,
			},
		}, http.StatusOK)
	}
}
