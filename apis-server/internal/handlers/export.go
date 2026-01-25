// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/services"
	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/rs/zerolog/log"
)

// ExportRequest represents the request body for generating an export.
type ExportRequest struct {
	HiveIDs []string      `json:"hive_ids"`
	Include IncludeConfig `json:"include"`
	Format  string        `json:"format"` // "summary", "markdown", "json"
}

// IncludeConfig specifies which fields to include in the export.
type IncludeConfig struct {
	Basics    []string `json:"basics,omitempty"`    // hive_name, queen_age, boxes, current_weight, location
	Details   []string `json:"details,omitempty"`   // inspection_log, hornet_data, weight_history, weather_correlations
	Analysis  []string `json:"analysis,omitempty"`  // beebrain_insights, health_summary, season_comparison
	Financial []string `json:"financial,omitempty"` // costs, harvest_revenue, roi_per_hive
}

// ExportResponse represents the response for a successful export.
type ExportResponse struct {
	Data ExportData `json:"data"`
}

// ExportData contains the generated export content.
type ExportData struct {
	Content     string `json:"content"`
	Format      string `json:"format"`
	HiveCount   int    `json:"hive_count"`
	GeneratedAt string `json:"generated_at"`
}

// ExportPresetRequest represents the request body for creating a preset.
type ExportPresetRequest struct {
	Name   string        `json:"name"`
	Config IncludeConfig `json:"config"`
}

// ExportPresetResponse represents a single preset response.
type ExportPresetResponse struct {
	Data storage.ExportPreset `json:"data"`
}

// ExportPresetsListResponse represents the list presets response.
type ExportPresetsListResponse struct {
	Data []storage.ExportPreset `json:"data"`
	Meta MetaResponse           `json:"meta"`
}

// GenerateExport handles POST /api/export - generates export in the requested format.
func GenerateExport(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())

	var req ExportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate format
	validFormats := map[string]bool{"summary": true, "markdown": true, "json": true}
	if !validFormats[req.Format] {
		respondError(w, "Invalid export format. Use: summary, markdown, json", http.StatusBadRequest)
		return
	}

	// Validate hive selection
	if len(req.HiveIDs) == 0 {
		respondError(w, "At least one hive must be selected", http.StatusBadRequest)
		return
	}

	// Resolve hive IDs - if "all" is specified, fetch all hives
	var hiveIDs []string
	if len(req.HiveIDs) == 1 && req.HiveIDs[0] == "all" {
		hives, err := storage.ListHives(r.Context(), conn)
		if err != nil {
			log.Error().Err(err).Str("tenant_id", tenantID).Msg("handler: failed to list hives for export")
			respondError(w, "Failed to list hives", http.StatusInternalServerError)
			return
		}
		for _, h := range hives {
			hiveIDs = append(hiveIDs, h.ID)
		}
		if len(hiveIDs) == 0 {
			respondError(w, "No hives found", http.StatusNotFound)
			return
		}
	} else {
		hiveIDs = req.HiveIDs
	}

	// Validate tenant has access to all requested hives
	for _, hiveID := range hiveIDs {
		hive, err := storage.GetHiveByID(r.Context(), conn, hiveID)
		if errors.Is(err, storage.ErrNotFound) {
			respondError(w, "Hive not found: "+hiveID, http.StatusNotFound)
			return
		}
		if err != nil {
			log.Error().Err(err).Str("hive_id", hiveID).Msg("handler: failed to get hive for export")
			respondError(w, "Failed to verify hive", http.StatusInternalServerError)
			return
		}
		// RLS ensures tenant_id matches, but we verify hive exists
		if hive.TenantID != tenantID {
			respondError(w, "Access denied to hive: "+hiveID, http.StatusForbidden)
			return
		}
	}

	// Create export service and generate export
	exportService := services.NewExportService(conn)
	opts := services.ExportOptions{
		TenantID: tenantID,
		HiveIDs:  hiveIDs,
		Include:  convertIncludeConfig(req.Include),
		Format:   req.Format,
	}

	result, err := exportService.Generate(r.Context(), opts)
	if err != nil {
		log.Error().Err(err).
			Str("tenant_id", tenantID).
			Str("format", req.Format).
			Int("hive_count", len(hiveIDs)).
			Msg("handler: failed to generate export")
		respondError(w, "Failed to generate export", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("tenant_id", tenantID).
		Str("format", req.Format).
		Int("hive_count", len(hiveIDs)).
		Msg("Export generated")

	respondJSON(w, ExportResponse{
		Data: ExportData{
			Content:     result.Content,
			Format:      result.Format,
			HiveCount:   result.HiveCount,
			GeneratedAt: result.GeneratedAt.Format(time.RFC3339),
		},
	}, http.StatusOK)
}

// ListExportPresets handles GET /api/export/presets - lists all presets for the tenant.
func ListExportPresets(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())

	presets, err := storage.ListExportPresets(r.Context(), conn, tenantID)
	if err != nil {
		log.Error().Err(err).Str("tenant_id", tenantID).Msg("handler: failed to list export presets")
		respondError(w, "Failed to list presets", http.StatusInternalServerError)
		return
	}

	respondJSON(w, ExportPresetsListResponse{
		Data: presets,
		Meta: MetaResponse{Total: len(presets)},
	}, http.StatusOK)
}

// CreateExportPreset handles POST /api/export/presets - creates a new preset.
func CreateExportPreset(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())

	var req ExportPresetRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate name
	if req.Name == "" {
		respondError(w, "Preset name is required", http.StatusBadRequest)
		return
	}

	// Convert config to JSON
	configJSON, err := json.Marshal(req.Config)
	if err != nil {
		respondError(w, "Invalid config format", http.StatusBadRequest)
		return
	}

	input := &storage.CreateExportPresetInput{
		Name:   req.Name,
		Config: configJSON,
	}

	preset, err := storage.CreateExportPreset(r.Context(), conn, tenantID, input)
	if err != nil {
		if errors.Is(err, storage.ErrDuplicateName) {
			respondError(w, "A preset with this name already exists", http.StatusConflict)
			return
		}
		log.Error().Err(err).Str("tenant_id", tenantID).Str("name", req.Name).Msg("handler: failed to create export preset")
		respondError(w, "Failed to create preset", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("preset_id", preset.ID).
		Str("tenant_id", tenantID).
		Str("name", preset.Name).
		Msg("Export preset created")

	respondJSON(w, ExportPresetResponse{Data: *preset}, http.StatusCreated)
}

// DeleteExportPreset handles DELETE /api/export/presets/{id} - deletes a preset.
func DeleteExportPreset(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	presetID := chi.URLParam(r, "id")

	if presetID == "" {
		respondError(w, "Preset ID is required", http.StatusBadRequest)
		return
	}

	err := storage.DeleteExportPreset(r.Context(), conn, presetID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Preset not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("preset_id", presetID).Msg("handler: failed to delete export preset")
		respondError(w, "Failed to delete preset", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("preset_id", presetID).
		Msg("Export preset deleted")

	w.WriteHeader(http.StatusNoContent)
}

// convertIncludeConfig converts handler IncludeConfig to services IncludeConfig.
func convertIncludeConfig(ic IncludeConfig) services.IncludeConfig {
	return services.IncludeConfig{
		Basics:    ic.Basics,
		Details:   ic.Details,
		Analysis:  ic.Analysis,
		Financial: ic.Financial,
	}
}
