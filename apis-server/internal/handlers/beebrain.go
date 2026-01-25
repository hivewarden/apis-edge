// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/services"
	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/rs/zerolog/log"
)

// BeeBrainHandler handles BeeBrain-related HTTP requests.
type BeeBrainHandler struct {
	service *services.BeeBrainService
}

// NewBeeBrainHandler creates a new BeeBrain handler with the given service.
func NewBeeBrainHandler(service *services.BeeBrainService) *BeeBrainHandler {
	return &BeeBrainHandler{
		service: service,
	}
}

// DashboardResponse represents the BeeBrain dashboard API response.
type DashboardResponse struct {
	Data DashboardData `json:"data"`
}

// DashboardData contains the dashboard analysis data.
type DashboardData struct {
	Summary      string             `json:"summary"`
	LastAnalysis time.Time          `json:"last_analysis"`
	Insights     []services.Insight `json:"insights"`
	AllGood      bool               `json:"all_good"`
}

// HiveAnalysisResponse represents the BeeBrain hive analysis API response.
type HiveAnalysisResponse struct {
	Data services.HiveAnalysisResult `json:"data"`
}

// RefreshResponse represents the response from triggering a refresh.
type RefreshResponse struct {
	Data RefreshData `json:"data"`
}

// RefreshData contains the refresh result data.
type RefreshData struct {
	Message       string    `json:"message"`
	InsightsFound int       `json:"insights_found"`
	AnalyzedAt    time.Time `json:"analyzed_at"`
}

// GetDashboard handles GET /api/beebrain/dashboard - returns tenant-wide analysis summary.
func (h *BeeBrainHandler) GetDashboard(w http.ResponseWriter, r *http.Request) {
	if h.service == nil {
		log.Error().Msg("handler: BeeBrain service is nil")
		respondError(w, "Service unavailable", http.StatusInternalServerError)
		return
	}

	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())

	result, err := h.service.GetDashboardAnalysis(r.Context(), conn, tenantID)
	if err != nil {
		log.Error().Err(err).Str("tenant_id", tenantID).Msg("handler: failed to get BeeBrain dashboard")
		respondError(w, "Failed to get dashboard analysis", http.StatusInternalServerError)
		return
	}

	respondJSON(w, DashboardResponse{
		Data: DashboardData{
			Summary:      result.Summary,
			LastAnalysis: result.LastAnalysis,
			Insights:     result.Insights,
			AllGood:      result.AllGood,
		},
	}, http.StatusOK)
}

// GetHiveAnalysis handles GET /api/beebrain/hive/{id} - returns hive-specific analysis.
func (h *BeeBrainHandler) GetHiveAnalysis(w http.ResponseWriter, r *http.Request) {
	if h.service == nil {
		log.Error().Msg("handler: BeeBrain service is nil")
		respondError(w, "Service unavailable", http.StatusInternalServerError)
		return
	}

	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())
	hiveID := chi.URLParam(r, "id")

	if hiveID == "" {
		respondError(w, "Hive ID is required", http.StatusBadRequest)
		return
	}

	// Verify hive exists
	_, err := storage.GetHiveByID(r.Context(), conn, hiveID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Hive not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("hive_id", hiveID).Msg("handler: failed to get hive")
		respondError(w, "Failed to get hive", http.StatusInternalServerError)
		return
	}

	result, err := h.service.AnalyzeHive(r.Context(), conn, tenantID, hiveID)
	if err != nil {
		log.Error().Err(err).
			Str("tenant_id", tenantID).
			Str("hive_id", hiveID).
			Msg("handler: failed to analyze hive")
		respondError(w, "Failed to analyze hive", http.StatusInternalServerError)
		return
	}

	respondJSON(w, HiveAnalysisResponse{Data: *result}, http.StatusOK)
}

// RefreshAnalysis handles POST /api/beebrain/refresh - triggers new analysis.
func (h *BeeBrainHandler) RefreshAnalysis(w http.ResponseWriter, r *http.Request) {
	if h.service == nil {
		log.Error().Msg("handler: BeeBrain service is nil")
		respondError(w, "Service unavailable", http.StatusInternalServerError)
		return
	}

	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())

	result, err := h.service.AnalyzeTenant(r.Context(), conn, tenantID)
	if err != nil {
		log.Error().Err(err).Str("tenant_id", tenantID).Msg("handler: failed to refresh BeeBrain analysis")
		respondError(w, "Failed to refresh analysis", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("tenant_id", tenantID).
		Int("insights_found", len(result.Insights)).
		Bool("all_good", result.AllGood).
		Msg("BeeBrain analysis refreshed")

	respondJSON(w, RefreshResponse{
		Data: RefreshData{
			Message:       result.Summary,
			InsightsFound: len(result.Insights),
			AnalyzedAt:    result.LastAnalysis,
		},
	}, http.StatusOK)
}

// DismissInsight handles POST /api/beebrain/insights/{id}/dismiss - dismisses an insight.
func (h *BeeBrainHandler) DismissInsight(w http.ResponseWriter, r *http.Request) {
	if h.service == nil {
		log.Error().Msg("handler: BeeBrain service is nil")
		respondError(w, "Service unavailable", http.StatusInternalServerError)
		return
	}

	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())
	insightID := chi.URLParam(r, "id")

	if insightID == "" {
		respondError(w, "Insight ID is required", http.StatusBadRequest)
		return
	}

	// Verify insight exists and belongs to tenant
	insight, err := storage.GetInsightByID(r.Context(), conn, insightID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Insight not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("insight_id", insightID).Msg("handler: failed to get insight")
		respondError(w, "Failed to get insight", http.StatusInternalServerError)
		return
	}

	// Defense-in-depth: verify insight belongs to authenticated tenant
	if insight.TenantID != tenantID {
		log.Warn().
			Str("insight_id", insightID).
			Str("insight_tenant", insight.TenantID).
			Str("request_tenant", tenantID).
			Msg("handler: tenant mismatch on dismiss insight")
		respondError(w, "Insight not found", http.StatusNotFound)
		return
	}

	err = storage.DismissInsight(r.Context(), conn, insightID)
	if err != nil {
		log.Error().Err(err).Str("insight_id", insightID).Msg("handler: failed to dismiss insight")
		respondError(w, "Failed to dismiss insight", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("insight_id", insightID).
		Str("rule_id", insight.RuleID).
		Msg("Insight dismissed")

	respondJSON(w, map[string]interface{}{
		"data": map[string]string{
			"message": "Insight dismissed successfully",
			"id":      insightID,
		},
	}, http.StatusOK)
}

// SnoozeInsightRequest represents the request body for snoozing an insight.
type SnoozeInsightRequest struct {
	Days int `json:"days"`
}

// MaintenanceResponse represents the maintenance API response.
type MaintenanceResponse struct {
	Data MaintenanceData `json:"data"`
}

// MaintenanceData contains the maintenance items and metadata.
type MaintenanceData struct {
	Items             []services.MaintenanceItem         `json:"items"`
	RecentlyCompleted []services.RecentlyCompletedItem   `json:"recently_completed"`
	TotalCount        int                                `json:"total_count"`
	AllCaughtUp       bool                               `json:"all_caught_up"`
}

// GetMaintenance handles GET /api/beebrain/maintenance - returns hives needing attention.
func (h *BeeBrainHandler) GetMaintenance(w http.ResponseWriter, r *http.Request) {
	if h.service == nil {
		log.Error().Msg("handler: BeeBrain service is nil")
		respondError(w, "Service unavailable", http.StatusInternalServerError)
		return
	}

	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())
	siteID := r.URL.Query().Get("site_id") // Optional filter

	// Validate site_id if provided (must be valid UUID)
	if siteID != "" {
		if _, err := uuid.Parse(siteID); err != nil {
			respondError(w, "Invalid site_id format: must be a valid UUID", http.StatusBadRequest)
			return
		}
	}

	items, err := h.service.GetMaintenanceItems(r.Context(), conn, tenantID, siteID)
	if err != nil {
		log.Error().Err(err).Str("tenant_id", tenantID).Msg("handler: failed to get maintenance items")
		respondError(w, "Failed to get maintenance items", http.StatusInternalServerError)
		return
	}

	// Get recently completed (last 7 days, max 10)
	completed, err := h.service.GetRecentlyCompletedInsights(r.Context(), conn, tenantID, siteID)
	if err != nil {
		log.Warn().Err(err).Str("tenant_id", tenantID).Msg("handler: failed to get recently completed insights")
		// Don't fail the whole request, just return empty completed list
		completed = []services.RecentlyCompletedItem{}
	}

	// Ensure non-nil slices in response
	if items == nil {
		items = []services.MaintenanceItem{}
	}
	if completed == nil {
		completed = []services.RecentlyCompletedItem{}
	}

	respondJSON(w, MaintenanceResponse{
		Data: MaintenanceData{
			Items:             items,
			RecentlyCompleted: completed,
			TotalCount:        len(items),
			AllCaughtUp:       len(items) == 0,
		},
	}, http.StatusOK)
}

// SnoozeInsight handles POST /api/beebrain/insights/{id}/snooze - snoozes an insight.
func (h *BeeBrainHandler) SnoozeInsight(w http.ResponseWriter, r *http.Request) {
	if h.service == nil {
		log.Error().Msg("handler: BeeBrain service is nil")
		respondError(w, "Service unavailable", http.StatusInternalServerError)
		return
	}

	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())
	insightID := chi.URLParam(r, "id")

	if insightID == "" {
		respondError(w, "Insight ID is required", http.StatusBadRequest)
		return
	}

	// Parse days from query param or body
	days := 7 // default
	if daysStr := r.URL.Query().Get("days"); daysStr != "" {
		parsedDays, err := strconv.Atoi(daysStr)
		if err != nil || parsedDays <= 0 || parsedDays > 90 {
			respondError(w, "Days must be between 1 and 90", http.StatusBadRequest)
			return
		}
		days = parsedDays
	} else if r.Body != nil && r.ContentLength > 0 {
		var req SnoozeInsightRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err == nil && req.Days > 0 {
			if req.Days > 90 {
				respondError(w, "Days must be between 1 and 90", http.StatusBadRequest)
				return
			}
			days = req.Days
		}
	}

	// Verify insight exists and belongs to tenant
	insight, err := storage.GetInsightByID(r.Context(), conn, insightID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Insight not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("insight_id", insightID).Msg("handler: failed to get insight")
		respondError(w, "Failed to get insight", http.StatusInternalServerError)
		return
	}

	// Defense-in-depth: verify insight belongs to authenticated tenant
	if insight.TenantID != tenantID {
		log.Warn().
			Str("insight_id", insightID).
			Str("insight_tenant", insight.TenantID).
			Str("request_tenant", tenantID).
			Msg("handler: tenant mismatch on snooze insight")
		respondError(w, "Insight not found", http.StatusNotFound)
		return
	}

	snoozedUntil := time.Now().AddDate(0, 0, days)
	err = storage.SnoozeInsight(r.Context(), conn, insightID, snoozedUntil)
	if err != nil {
		log.Error().Err(err).Str("insight_id", insightID).Msg("handler: failed to snooze insight")
		respondError(w, "Failed to snooze insight", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("insight_id", insightID).
		Str("rule_id", insight.RuleID).
		Int("days", days).
		Time("snoozed_until", snoozedUntil).
		Msg("Insight snoozed")

	respondJSON(w, map[string]interface{}{
		"data": map[string]interface{}{
			"message":       "Insight snoozed successfully",
			"id":            insightID,
			"snoozed_until": snoozedUntil.Format(time.RFC3339),
			"days":          days,
		},
	}, http.StatusOK)
}
