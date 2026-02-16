// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"

	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/storage"
)

// TenantResponse represents a tenant in admin API responses.
type TenantResponse struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Plan        string `json:"plan"`
	Status      string `json:"status"`
	UserCount   int    `json:"user_count"`
	HiveCount   int    `json:"hive_count"`
	StorageUsed int64  `json:"storage_used"` // bytes
	CreatedAt   string `json:"created_at"`
}

// TenantsListResponse represents the list tenants admin API response.
type TenantsListResponse struct {
	Data []TenantResponse `json:"data"`
	Meta MetaResponse     `json:"meta"`
}

// TenantDataResponse represents a single tenant admin API response.
type TenantDataResponse struct {
	Data TenantResponse `json:"data"`
}

// CreateTenantRequest represents the request body for creating a tenant.
type CreateTenantRequest struct {
	Name string `json:"name"`
	Plan string `json:"plan"` // 'free', 'hobby', 'pro'
}

// UpdateTenantRequest represents the request body for updating a tenant.
type UpdateTenantRequest struct {
	Name   *string `json:"name,omitempty"`
	Plan   *string `json:"plan,omitempty"`
	Status *string `json:"status,omitempty"` // 'active', 'suspended'
}

// tenantToResponse converts a storage.TenantSummary to a TenantResponse.
func tenantToResponse(t *storage.TenantSummary) TenantResponse {
	return TenantResponse{
		ID:          t.ID,
		Name:        t.Name,
		Plan:        t.Plan,
		Status:      t.Status,
		UserCount:   t.UserCount,
		HiveCount:   t.HiveCount,
		StorageUsed: t.StorageUsed,
		CreatedAt:   t.CreatedAt.Format(time.RFC3339),
	}
}

// validPlans defines the allowed tenant plan values.
var validPlans = map[string]bool{
	"free":  true,
	"hobby": true,
	"pro":   true,
}

// validStatuses defines the allowed tenant status values for updates.
// Note: 'deleted' is only set via the DELETE endpoint, not via PUT.
var validStatuses = map[string]bool{
	"active":    true,
	"suspended": true,
}

// AdminListTenants returns a handler that lists all tenants with usage stats.
// GET /api/admin/tenants
//
// Super-admin only. Returns all tenants in the system with their usage statistics.
func AdminListTenants(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := middleware.GetClaims(r.Context())

		tenants, err := storage.AdminListAllTenants(r.Context(), pool)
		if err != nil {
			log.Error().Err(err).
				Str("super_admin_id", claims.UserID).
				Msg("handler: failed to list tenants")
			respondError(w, "Failed to list tenants", http.StatusInternalServerError)
			return
		}

		// Convert to response format
		tenantResponses := make([]TenantResponse, 0, len(tenants))
		for _, t := range tenants {
			tenantResponses = append(tenantResponses, tenantToResponse(t))
		}

		log.Info().
			Str("super_admin_id", claims.UserID).
			Int("count", len(tenantResponses)).
			Msg("Super-admin listed tenants")

		respondJSON(w, TenantsListResponse{
			Data: tenantResponses,
			Meta: MetaResponse{Total: len(tenantResponses)},
		}, http.StatusOK)
	}
}

// AdminGetTenant returns a handler that gets a single tenant by ID.
// GET /api/admin/tenants/{id}
//
// Super-admin only. Returns tenant details with usage statistics.
func AdminGetTenant(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := middleware.GetClaims(r.Context())
		tenantID := chi.URLParam(r, "id")

		if tenantID == "" {
			respondError(w, "Tenant ID is required", http.StatusBadRequest)
			return
		}

		tenant, err := storage.AdminGetTenantByID(r.Context(), pool, tenantID)
		if errors.Is(err, storage.ErrNotFound) {
			respondError(w, "Tenant not found", http.StatusNotFound)
			return
		}
		if err != nil {
			log.Error().Err(err).
				Str("super_admin_id", claims.UserID).
				Str("tenant_id", tenantID).
				Msg("handler: failed to get tenant")
			respondError(w, "Failed to get tenant", http.StatusInternalServerError)
			return
		}

		log.Debug().
			Str("super_admin_id", claims.UserID).
			Str("tenant_id", tenantID).
			Msg("Super-admin retrieved tenant")

		respondJSON(w, TenantDataResponse{Data: tenantToResponse(tenant)}, http.StatusOK)
	}
}

// AdminCreateTenant returns a handler that creates a new tenant.
// POST /api/admin/tenants
//
// Super-admin only. Creates a new tenant with the specified name and plan.
func AdminCreateTenant(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := middleware.GetClaims(r.Context())

		var req CreateTenantRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			respondError(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		// Validate name
		req.Name = strings.TrimSpace(req.Name)
		if req.Name == "" {
			respondError(w, "Name is required", http.StatusBadRequest)
			return
		}
		if len(req.Name) > 100 {
			respondError(w, "Name must be 100 characters or less", http.StatusBadRequest)
			return
		}

		// Validate plan
		if req.Plan != "" && !validPlans[req.Plan] {
			respondError(w, "Plan must be 'free', 'hobby', or 'pro'", http.StatusBadRequest)
			return
		}

		input := &storage.AdminCreateTenantInput{
			Name: req.Name,
			Plan: req.Plan,
		}

		tenant, err := storage.AdminCreateTenant(r.Context(), pool, input)
		if err != nil {
			log.Error().Err(err).
				Str("super_admin_id", claims.UserID).
				Str("tenant_name", req.Name).
				Msg("handler: failed to create tenant")
			respondError(w, "Failed to create tenant", http.StatusInternalServerError)
			return
		}

		log.Info().
			Str("super_admin_id", claims.UserID).
			Str("tenant_id", tenant.ID).
			Str("tenant_name", tenant.Name).
			Str("plan", tenant.Plan).
			Msg("Super-admin created tenant")

		respondJSON(w, TenantDataResponse{Data: tenantToResponse(tenant)}, http.StatusCreated)
	}
}

// AdminUpdateTenant returns a handler that updates a tenant.
// PUT /api/admin/tenants/{id}
//
// Super-admin only. Updates tenant name, plan, and/or status.
// Status can be set to 'active' or 'suspended'. For deletion, use DELETE endpoint.
func AdminUpdateTenant(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := middleware.GetClaims(r.Context())
		tenantID := chi.URLParam(r, "id")

		if tenantID == "" {
			respondError(w, "Tenant ID is required", http.StatusBadRequest)
			return
		}

		var req UpdateTenantRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			respondError(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		// Validate name if provided
		if req.Name != nil {
			trimmed := strings.TrimSpace(*req.Name)
			if trimmed == "" {
				respondError(w, "Name cannot be empty", http.StatusBadRequest)
				return
			}
			if len(trimmed) > 100 {
				respondError(w, "Name must be 100 characters or less", http.StatusBadRequest)
				return
			}
			req.Name = &trimmed
		}

		// Validate plan if provided
		if req.Plan != nil && !validPlans[*req.Plan] {
			respondError(w, "Plan must be 'free', 'hobby', or 'pro'", http.StatusBadRequest)
			return
		}

		// Validate status if provided
		if req.Status != nil && !validStatuses[*req.Status] {
			respondError(w, "Status must be 'active' or 'suspended'", http.StatusBadRequest)
			return
		}

		input := &storage.AdminUpdateTenantInput{
			Name:   req.Name,
			Plan:   req.Plan,
			Status: req.Status,
		}

		tenant, err := storage.AdminUpdateTenant(r.Context(), pool, tenantID, input)
		if errors.Is(err, storage.ErrNotFound) {
			respondError(w, "Tenant not found", http.StatusNotFound)
			return
		}
		if err != nil {
			log.Error().Err(err).
				Str("super_admin_id", claims.UserID).
				Str("tenant_id", tenantID).
				Msg("handler: failed to update tenant")
			respondError(w, "Failed to update tenant", http.StatusInternalServerError)
			return
		}

		log.Info().
			Str("super_admin_id", claims.UserID).
			Str("tenant_id", tenant.ID).
			Str("tenant_name", tenant.Name).
			Str("status", tenant.Status).
			Msg("Super-admin updated tenant")

		respondJSON(w, TenantDataResponse{Data: tenantToResponse(tenant)}, http.StatusOK)
	}
}

// AdminDeleteTenant returns a handler that soft-deletes a tenant.
// DELETE /api/admin/tenants/{id}
//
// Super-admin only. Sets the tenant status to 'deleted'.
// This is a soft delete - data is preserved but the tenant cannot be used.
func AdminDeleteTenant(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := middleware.GetClaims(r.Context())
		tenantID := chi.URLParam(r, "id")

		if tenantID == "" {
			respondError(w, "Tenant ID is required", http.StatusBadRequest)
			return
		}

		// Verify tenant exists first
		tenant, err := storage.AdminGetTenantByID(r.Context(), pool, tenantID)
		if errors.Is(err, storage.ErrNotFound) {
			respondError(w, "Tenant not found", http.StatusNotFound)
			return
		}
		if err != nil {
			log.Error().Err(err).
				Str("super_admin_id", claims.UserID).
				Str("tenant_id", tenantID).
				Msg("handler: failed to get tenant for delete")
			respondError(w, "Failed to delete tenant", http.StatusInternalServerError)
			return
		}

		// Check if already deleted
		if tenant.Status == "deleted" {
			respondError(w, "Tenant is already deleted", http.StatusBadRequest)
			return
		}

		// Soft delete by setting status to 'deleted'
		err = storage.AdminSetTenantStatus(r.Context(), pool, tenantID, "deleted")
		if errors.Is(err, storage.ErrNotFound) {
			respondError(w, "Tenant not found", http.StatusNotFound)
			return
		}
		if err != nil {
			log.Error().Err(err).
				Str("super_admin_id", claims.UserID).
				Str("tenant_id", tenantID).
				Msg("handler: failed to delete tenant")
			respondError(w, "Failed to delete tenant", http.StatusInternalServerError)
			return
		}

		log.Info().
			Str("super_admin_id", claims.UserID).
			Str("tenant_id", tenantID).
			Str("tenant_name", tenant.Name).
			Msg("Super-admin soft-deleted tenant")

		w.WriteHeader(http.StatusNoContent)
	}
}
