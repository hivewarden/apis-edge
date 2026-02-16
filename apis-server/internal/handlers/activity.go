package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"

	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/services"
	"github.com/jermoo/apis/apis-server/internal/storage"
)

// ActivityResponse represents the response for activity feed listing.
type ActivityResponse struct {
	Data []services.ActivityItem `json:"data"`
	Meta ActivityMeta            `json:"meta"`
}

// ActivityMeta contains pagination metadata for activity feed.
type ActivityMeta struct {
	Cursor     *string `json:"cursor,omitempty"`
	CursorTime *string `json:"cursor_time,omitempty"`
	HasMore    bool    `json:"has_more"`
}

// ListActivity returns a handler that lists activity feed entries.
// GET /api/activity
//
// Query Parameters:
//   - entity_type: Filter by entity types (comma-separated, e.g., "inspections,treatments")
//   - hive_id: Filter by hive ID
//   - site_id: Filter by site ID
//   - cursor: Pagination cursor (last item's ID from previous page)
//   - limit: Max results, default 20, max 100
//
// Available to all authenticated users (no admin role required).
// Results are scoped to tenant via RLS.
func ListActivity(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := middleware.GetClaims(r.Context())
		if claims == nil {
			respondError(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		// Parse filters
		filters, err := parseActivityFilters(r)
		if err != nil {
			respondError(w, err.Error(), http.StatusBadRequest)
			return
		}

		// Set tenant_id from claims for defense-in-depth filtering
		filters.TenantID = claims.TenantID

		// Create activity service and fetch feed
		activityService := services.NewActivityService(pool)
		result, err := activityService.GetActivityFeed(r.Context(), filters)
		if err != nil {
			log.Error().Err(err).
				Str("user_id", claims.UserID).
				Str("tenant_id", claims.TenantID).
				Msg("handler: failed to list activity")
			respondError(w, "Failed to list activity", http.StatusInternalServerError)
			return
		}

		// Ensure items is not nil for consistent JSON output
		items := result.Items
		if items == nil {
			items = []services.ActivityItem{}
		}

		response := ActivityResponse{
			Data: items,
			Meta: ActivityMeta{
				Cursor:     result.Cursor,
				CursorTime: result.CursorTime,
				HasMore:    result.HasMore,
			},
		}

		respondJSON(w, response, http.StatusOK)
	}
}

// parseActivityFilters extracts and validates activity filter parameters from the request.
func parseActivityFilters(r *http.Request) (*storage.ActivityFilters, error) {
	filters := &storage.ActivityFilters{
		Limit: 20,
	}

	// Entity types filter (comma-separated)
	if entityTypes := r.URL.Query().Get("entity_type"); entityTypes != "" {
		types := strings.Split(entityTypes, ",")
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

		for _, t := range types {
			t = strings.TrimSpace(t)
			if t != "" && !validTypes[t] {
				return nil, &validationError{message: "Invalid entity_type: " + t + ". Must be one of: hives, inspections, treatments, feedings, harvests, sites, units, users, clips"}
			}
			if t != "" {
				filters.EntityTypes = append(filters.EntityTypes, t)
			}
		}
	}

	// Hive ID filter
	if hiveID := r.URL.Query().Get("hive_id"); hiveID != "" {
		filters.HiveID = &hiveID
	}

	// Site ID filter
	if siteID := r.URL.Query().Get("site_id"); siteID != "" {
		filters.SiteID = &siteID
	}

	// Cursor for pagination (requires both cursor and cursor_time for tuple comparison)
	if cursor := r.URL.Query().Get("cursor"); cursor != "" {
		filters.Cursor = &cursor
	}
	if cursorTime := r.URL.Query().Get("cursor_time"); cursorTime != "" {
		filters.CursorTime = &cursorTime
	}

	// Limit (default 20, max 100)
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

	return filters, nil
}
