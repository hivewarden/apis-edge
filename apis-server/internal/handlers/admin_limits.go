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
	"github.com/jermoo/apis/apis-server/internal/storage"
)

// TenantLimitsResponse represents tenant limits in API responses.
type TenantLimitsResponse struct {
	TenantID      string `json:"tenant_id"`
	MaxHives      int    `json:"max_hives"`
	MaxStorageGB  int    `json:"max_storage_gb"` // Converted from bytes for UI
	MaxUnits      int    `json:"max_units"`
	MaxUsers      int    `json:"max_users"`
	UpdatedAt     string `json:"updated_at"`
	// Current usage for context
	CurrentHives   int   `json:"current_hives"`
	CurrentUnits   int   `json:"current_units"`
	CurrentUsers   int   `json:"current_users"`
	CurrentStorage int64 `json:"current_storage_bytes"`
}

// TenantLimitsDataResponse represents the API response for tenant limits.
type TenantLimitsDataResponse struct {
	Data TenantLimitsResponse `json:"data"`
}

// UpdateTenantLimitsRequest represents the request body for updating tenant limits.
type UpdateTenantLimitsRequest struct {
	MaxHives     *int `json:"max_hives,omitempty"`
	MaxStorageGB *int `json:"max_storage_gb,omitempty"` // In GB for easier UI input
	MaxUnits     *int `json:"max_units,omitempty"`
	MaxUsers     *int `json:"max_users,omitempty"`
}

// bytesToGB converts bytes to gigabytes (integer).
func bytesToGB(bytes int64) int {
	return int(bytes / (1024 * 1024 * 1024))
}

// gbToBytes converts gigabytes to bytes.
func gbToBytes(gb int) int64 {
	return int64(gb) * 1024 * 1024 * 1024
}

// AdminGetTenantLimits returns a handler that gets tenant limits.
// GET /api/admin/tenants/{id}/limits
//
// Super-admin only. Returns tenant limits with current usage.
func AdminGetTenantLimits(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := middleware.GetClaims(r.Context())
		tenantID := chi.URLParam(r, "id")

		if tenantID == "" {
			respondError(w, "Tenant ID is required", http.StatusBadRequest)
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
			respondError(w, "Failed to get tenant limits", http.StatusInternalServerError)
			return
		}

		// Get limits
		limits, err := storage.GetTenantLimits(r.Context(), pool, tenantID)
		if err != nil {
			log.Error().Err(err).
				Str("super_admin_id", claims.UserID).
				Str("tenant_id", tenantID).
				Msg("handler: failed to get tenant limits")
			respondError(w, "Failed to get tenant limits", http.StatusInternalServerError)
			return
		}

		// Get current usage
		usage, err := storage.GetTenantUsage(r.Context(), pool, tenantID)
		if err != nil {
			log.Error().Err(err).
				Str("super_admin_id", claims.UserID).
				Str("tenant_id", tenantID).
				Msg("handler: failed to get tenant usage")
			respondError(w, "Failed to get tenant limits", http.StatusInternalServerError)
			return
		}

		log.Debug().
			Str("super_admin_id", claims.UserID).
			Str("tenant_id", tenantID).
			Msg("Super-admin retrieved tenant limits")

		respondJSON(w, TenantLimitsDataResponse{
			Data: TenantLimitsResponse{
				TenantID:       limits.TenantID,
				MaxHives:       limits.MaxHives,
				MaxStorageGB:   bytesToGB(limits.MaxStorageBytes),
				MaxUnits:       limits.MaxUnits,
				MaxUsers:       limits.MaxUsers,
				UpdatedAt:      limits.UpdatedAt.Format(time.RFC3339),
				CurrentHives:   usage.HiveCount,
				CurrentUnits:   usage.UnitCount,
				CurrentUsers:   usage.UserCount,
				CurrentStorage: usage.StorageBytes,
			},
		}, http.StatusOK)
	}
}

// AdminUpdateTenantLimits returns a handler that updates tenant limits.
// PUT /api/admin/tenants/{id}/limits
//
// Super-admin only. Updates resource limits for a tenant.
// Only non-nil fields in the request are updated.
func AdminUpdateTenantLimits(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := middleware.GetClaims(r.Context())
		tenantID := chi.URLParam(r, "id")

		if tenantID == "" {
			respondError(w, "Tenant ID is required", http.StatusBadRequest)
			return
		}

		var req UpdateTenantLimitsRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			respondError(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		// Validate limits - all must be positive
		if req.MaxHives != nil && *req.MaxHives < 1 {
			respondError(w, "Max hives must be at least 1", http.StatusBadRequest)
			return
		}
		if req.MaxStorageGB != nil && *req.MaxStorageGB < 1 {
			respondError(w, "Max storage must be at least 1 GB", http.StatusBadRequest)
			return
		}
		// FIX (S3B-LOW-03): Align MaxUnits validation with other limits (min 1).
		// A tenant with 0 units may still be valid (no detection hardware), but
		// consistent validation prevents accidental misconfiguration.
		if req.MaxUnits != nil && *req.MaxUnits < 0 {
			respondError(w, "Max units cannot be negative", http.StatusBadRequest)
			return
		}
		if req.MaxUsers != nil && *req.MaxUsers < 1 {
			respondError(w, "Max users must be at least 1", http.StatusBadRequest)
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
			respondError(w, "Failed to update tenant limits", http.StatusInternalServerError)
			return
		}

		// Get current limits
		currentLimits, err := storage.GetTenantLimits(r.Context(), pool, tenantID)
		if err != nil {
			log.Error().Err(err).
				Str("super_admin_id", claims.UserID).
				Str("tenant_id", tenantID).
				Msg("handler: failed to get current tenant limits")
			respondError(w, "Failed to update tenant limits", http.StatusInternalServerError)
			return
		}

		// Apply updates
		newLimits := &storage.TenantLimits{
			TenantID:        tenantID,
			MaxHives:        currentLimits.MaxHives,
			MaxStorageBytes: currentLimits.MaxStorageBytes,
			MaxUnits:        currentLimits.MaxUnits,
			MaxUsers:        currentLimits.MaxUsers,
		}

		if req.MaxHives != nil {
			newLimits.MaxHives = *req.MaxHives
		}
		if req.MaxStorageGB != nil {
			newLimits.MaxStorageBytes = gbToBytes(*req.MaxStorageGB)
		}
		if req.MaxUnits != nil {
			newLimits.MaxUnits = *req.MaxUnits
		}
		if req.MaxUsers != nil {
			newLimits.MaxUsers = *req.MaxUsers
		}

		// Save limits
		if err := storage.SetTenantLimits(r.Context(), pool, tenantID, newLimits); err != nil {
			log.Error().Err(err).
				Str("super_admin_id", claims.UserID).
				Str("tenant_id", tenantID).
				Msg("handler: failed to set tenant limits")
			respondError(w, "Failed to update tenant limits", http.StatusInternalServerError)
			return
		}

		// Get updated limits for response
		updatedLimits, err := storage.GetTenantLimits(r.Context(), pool, tenantID)
		if err != nil {
			log.Error().Err(err).
				Str("super_admin_id", claims.UserID).
				Str("tenant_id", tenantID).
				Msg("handler: failed to get updated tenant limits")
			respondError(w, "Failed to update tenant limits", http.StatusInternalServerError)
			return
		}

		// Get current usage
		usage, err := storage.GetTenantUsage(r.Context(), pool, tenantID)
		if err != nil {
			log.Error().Err(err).
				Str("super_admin_id", claims.UserID).
				Str("tenant_id", tenantID).
				Msg("handler: failed to get tenant usage")
			respondError(w, "Failed to update tenant limits", http.StatusInternalServerError)
			return
		}

		log.Info().
			Str("super_admin_id", claims.UserID).
			Str("tenant_id", tenantID).
			Int("max_hives", updatedLimits.MaxHives).
			Int("max_storage_gb", bytesToGB(updatedLimits.MaxStorageBytes)).
			Int("max_units", updatedLimits.MaxUnits).
			Int("max_users", updatedLimits.MaxUsers).
			Msg("Super-admin updated tenant limits")

		respondJSON(w, TenantLimitsDataResponse{
			Data: TenantLimitsResponse{
				TenantID:       updatedLimits.TenantID,
				MaxHives:       updatedLimits.MaxHives,
				MaxStorageGB:   bytesToGB(updatedLimits.MaxStorageBytes),
				MaxUnits:       updatedLimits.MaxUnits,
				MaxUsers:       updatedLimits.MaxUsers,
				UpdatedAt:      updatedLimits.UpdatedAt.Format(time.RFC3339),
				CurrentHives:   usage.HiveCount,
				CurrentUnits:   usage.UnitCount,
				CurrentUsers:   usage.UserCount,
				CurrentStorage: usage.StorageBytes,
			},
		}, http.StatusOK)
	}
}
