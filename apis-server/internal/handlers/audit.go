// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"

	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/storage"
)

// AuditLogResponse represents the response for audit log listing.
type AuditLogResponse struct {
	Data []storage.AuditLogEntry `json:"data"`
	Meta AuditLogMeta            `json:"meta"`
}

// AuditLogMeta contains pagination metadata.
type AuditLogMeta struct {
	Total  int `json:"total"`
	Limit  int `json:"limit"`
	Offset int `json:"offset"`
}

// EntityAuditResponse represents the response for entity audit history.
type EntityAuditResponse struct {
	Data []storage.AuditLogEntry `json:"data"`
	Meta EntityAuditMeta         `json:"meta"`
}

// EntityAuditMeta contains metadata for entity audit history.
type EntityAuditMeta struct {
	Total int `json:"total"`
}

// ListAuditLog returns a handler that lists audit log entries.
// GET /api/audit
//
// Query Parameters:
//   - entity_type: Filter by entity type (e.g., "hives", "inspections")
//   - user_id: Filter by user who made changes
//   - action: Filter by action (create, update, delete)
//   - start_date: ISO 8601 date, filter entries >= date
//   - end_date: ISO 8601 date, filter entries <= date
//   - limit: Max results, default 50, max 100
//   - offset: Pagination offset, default 0
//
// Requires admin role. Results are scoped to tenant via RLS.
func ListAuditLog(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := middleware.GetClaims(r.Context())
		if claims == nil {
			respondError(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		// Check admin role
		if !hasRole(claims.Roles, "admin") {
			respondError(w, "Admin role required", http.StatusForbidden)
			return
		}

		// Parse filters
		filters, err := parseAuditFilters(r)
		if err != nil {
			respondError(w, err.Error(), http.StatusBadRequest)
			return
		}

		// Query audit log
		entries, total, err := storage.ListAuditLog(r.Context(), pool, filters)
		if err != nil {
			log.Error().Err(err).
				Str("user_id", claims.UserID).
				Str("tenant_id", claims.TenantID).
				Msg("handler: failed to list audit log")
			respondError(w, "Failed to list audit log", http.StatusInternalServerError)
			return
		}

		// Ensure entries is not nil for consistent JSON output
		if entries == nil {
			entries = []storage.AuditLogEntry{}
		}

		response := AuditLogResponse{
			Data: entries,
			Meta: AuditLogMeta{
				Total:  total,
				Limit:  filters.Limit,
				Offset: filters.Offset,
			},
		}

		respondJSON(w, response, http.StatusOK)
	}
}

// GetEntityHistory returns a handler that gets audit history for a specific entity.
// GET /api/audit/entity/{type}/{id}
//
// Requires admin role. Results are scoped to tenant via RLS.
func GetEntityHistory(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := middleware.GetClaims(r.Context())
		if claims == nil {
			respondError(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		// Check admin role
		if !hasRole(claims.Roles, "admin") {
			respondError(w, "Admin role required", http.StatusForbidden)
			return
		}

		entityType := chi.URLParam(r, "type")
		entityID := chi.URLParam(r, "id")

		if entityType == "" || entityID == "" {
			respondError(w, "Entity type and ID are required", http.StatusBadRequest)
			return
		}

		// Validate entity type
		validTypes := map[string]bool{
			"hives":       true,
			"inspections": true,
			"treatments":  true,
			"feedings":    true,
			"harvests":    true,
			"sites":       true,
			"units":       true,
			"users":       true,
			"clips":       true,
		}
		if !validTypes[entityType] {
			respondError(w, "Invalid entity type", http.StatusBadRequest)
			return
		}

		// Query entity audit history
		entries, err := storage.GetEntityAuditHistory(r.Context(), pool, entityType, entityID)
		if err != nil {
			log.Error().Err(err).
				Str("user_id", claims.UserID).
				Str("tenant_id", claims.TenantID).
				Str("entity_type", entityType).
				Str("entity_id", entityID).
				Msg("handler: failed to get entity audit history")
			respondError(w, "Failed to get entity audit history", http.StatusInternalServerError)
			return
		}

		// Ensure entries is not nil for consistent JSON output
		if entries == nil {
			entries = []storage.AuditLogEntry{}
		}

		response := EntityAuditResponse{
			Data: entries,
			Meta: EntityAuditMeta{
				Total: len(entries),
			},
		}

		respondJSON(w, response, http.StatusOK)
	}
}

// parseAuditFilters extracts and validates audit log filter parameters from the request.
func parseAuditFilters(r *http.Request) (*storage.AuditLogFilters, error) {
	filters := &storage.AuditLogFilters{
		Limit:  50,
		Offset: 0,
	}

	// Entity type filter with validation
	if entityType := r.URL.Query().Get("entity_type"); entityType != "" {
		validTypes := map[string]bool{
			"hives":       true,
			"inspections": true,
			"treatments":  true,
			"feedings":    true,
			"harvests":    true,
			"sites":       true,
			"units":       true,
			"users":       true,
			"clips":       true,
		}
		if !validTypes[entityType] {
			return nil, &validationError{message: "Invalid entity_type. Must be one of: hives, inspections, treatments, feedings, harvests, sites, units, users, clips"}
		}
		filters.EntityType = &entityType
	}

	// User ID filter
	if userID := r.URL.Query().Get("user_id"); userID != "" {
		filters.UserID = &userID
	}

	// Action filter
	if action := r.URL.Query().Get("action"); action != "" {
		validActions := map[string]bool{"create": true, "update": true, "delete": true}
		if !validActions[action] {
			return nil, &validationError{message: "Invalid action. Must be: create, update, or delete"}
		}
		filters.Action = &action
	}

	// Start date filter
	if startDateStr := r.URL.Query().Get("start_date"); startDateStr != "" {
		startDate, err := time.Parse(time.RFC3339, startDateStr)
		if err != nil {
			// Try date-only format
			startDate, err = time.Parse("2006-01-02", startDateStr)
			if err != nil {
				return nil, &validationError{message: "Invalid start_date format. Use ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ)"}
			}
		}
		filters.StartDate = &startDate
	}

	// End date filter
	if endDateStr := r.URL.Query().Get("end_date"); endDateStr != "" {
		endDate, err := time.Parse(time.RFC3339, endDateStr)
		if err != nil {
			// Try date-only format, set to end of day
			endDate, err = time.Parse("2006-01-02", endDateStr)
			if err != nil {
				return nil, &validationError{message: "Invalid end_date format. Use ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ)"}
			}
			endDate = endDate.Add(24*time.Hour - time.Second) // End of day
		}
		filters.EndDate = &endDate
	}

	// Limit (default 50, max 100)
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		limit, err := strconv.Atoi(limitStr)
		if err != nil || limit < 1 {
			return nil, &validationError{message: "Invalid limit. Must be a positive integer"}
		}
		if limit > 100 {
			limit = 100
		}
		filters.Limit = limit
	}

	// Offset (default 0)
	if offsetStr := r.URL.Query().Get("offset"); offsetStr != "" {
		offset, err := strconv.Atoi(offsetStr)
		if err != nil || offset < 0 {
			return nil, &validationError{message: "Invalid offset. Must be a non-negative integer"}
		}
		filters.Offset = offset
	}

	return filters, nil
}

// validationError represents a validation error for filter parsing.
type validationError struct {
	message string
}

func (e *validationError) Error() string {
	return e.message
}

// hasRole checks if a role exists in the roles slice.
func hasRole(roles []string, role string) bool {
	for _, r := range roles {
		if r == role {
			return true
		}
	}
	return false
}
