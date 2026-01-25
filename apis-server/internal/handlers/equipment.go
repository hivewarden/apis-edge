// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/rs/zerolog/log"
)

// Valid equipment actions
var validEquipmentActions = []string{
	"installed",
	"removed",
}

// equipmentTypeLabels maps equipment type values to human-readable labels
var equipmentTypeLabels = map[string]string{
	"entrance_reducer":  "Entrance Reducer",
	"mouse_guard":       "Mouse Guard",
	"queen_excluder":    "Queen Excluder",
	"robbing_screen":    "Robbing Screen",
	"feeder":            "Feeder",
	"top_feeder":        "Top Feeder",
	"bottom_board":      "Bottom Board",
	"slatted_rack":      "Slatted Rack",
	"inner_cover":       "Inner Cover",
	"outer_cover":       "Outer Cover",
	"hive_beetle_trap":  "Hive Beetle Trap",
	"other":             "Other",
}

// EquipmentLogResponse represents an equipment log in API responses.
type EquipmentLogResponse struct {
	ID             string  `json:"id"`
	HiveID         string  `json:"hive_id"`
	EquipmentType  string  `json:"equipment_type"`
	EquipmentLabel string  `json:"equipment_label"`
	Action         string  `json:"action"`
	LoggedAt       string  `json:"logged_at"`
	Notes          *string `json:"notes,omitempty"`
	CreatedAt      string  `json:"created_at"`
	UpdatedAt      string  `json:"updated_at"`
}

// CurrentlyInstalledResponse represents currently installed equipment in API responses.
type CurrentlyInstalledResponse struct {
	ID             string  `json:"id"`
	EquipmentType  string  `json:"equipment_type"`
	EquipmentLabel string  `json:"equipment_label"`
	InstalledAt    string  `json:"installed_at"`
	DaysInstalled  int     `json:"days_installed"`
	Notes          *string `json:"notes,omitempty"`
}

// EquipmentHistoryResponse represents equipment history in API responses.
type EquipmentHistoryResponse struct {
	EquipmentType  string  `json:"equipment_type"`
	EquipmentLabel string  `json:"equipment_label"`
	InstalledAt    string  `json:"installed_at"`
	RemovedAt      string  `json:"removed_at"`
	DurationDays   int     `json:"duration_days"`
	Notes          *string `json:"notes,omitempty"`
}

// EquipmentLogsListResponse represents the list equipment logs API response.
type EquipmentLogsListResponse struct {
	Data []EquipmentLogResponse `json:"data"`
	Meta MetaResponse           `json:"meta"`
}

// EquipmentLogDataResponse represents a single equipment log API response.
type EquipmentLogDataResponse struct {
	Data EquipmentLogResponse `json:"data"`
}

// CurrentlyInstalledListResponse represents the currently installed equipment API response.
type CurrentlyInstalledListResponse struct {
	Data []CurrentlyInstalledResponse `json:"data"`
}

// EquipmentHistoryListResponse represents the equipment history API response.
type EquipmentHistoryListResponse struct {
	Data []EquipmentHistoryResponse `json:"data"`
}

// CreateEquipmentLogRequest represents the request body for creating an equipment log.
type CreateEquipmentLogRequest struct {
	EquipmentType string  `json:"equipment_type"`
	Action        string  `json:"action"`
	LoggedAt      string  `json:"logged_at"`
	Notes         *string `json:"notes,omitempty"`
}

// UpdateEquipmentLogRequest represents the request body for updating an equipment log.
type UpdateEquipmentLogRequest struct {
	EquipmentType *string `json:"equipment_type,omitempty"`
	Action        *string `json:"action,omitempty"`
	LoggedAt      *string `json:"logged_at,omitempty"`
	Notes         *string `json:"notes,omitempty"`
}

// equipmentLogToResponse converts a storage.EquipmentLog to an EquipmentLogResponse.
func equipmentLogToResponse(e *storage.EquipmentLog) EquipmentLogResponse {
	label := equipmentTypeLabels[e.EquipmentType]
	if label == "" {
		label = e.EquipmentType // Fallback to raw value if not found
	}

	return EquipmentLogResponse{
		ID:             e.ID,
		HiveID:         e.HiveID,
		EquipmentType:  e.EquipmentType,
		EquipmentLabel: label,
		Action:         e.Action,
		LoggedAt:       e.LoggedAt.Format("2006-01-02"),
		Notes:          e.Notes,
		CreatedAt:      e.CreatedAt.Format(time.RFC3339),
		UpdatedAt:      e.UpdatedAt.Format(time.RFC3339),
	}
}

// isValidEquipmentType checks if the equipment type is valid.
// Now accepts any non-empty string to support custom equipment types (AC#1).
func isValidEquipmentType(t string) bool {
	// Allow any non-empty string (custom types are allowed per AC#1)
	return len(t) >= 2 && len(t) <= 100
}

// isValidEquipmentAction checks if the equipment action is valid.
func isValidEquipmentAction(a string) bool {
	for _, valid := range validEquipmentActions {
		if a == valid {
			return true
		}
	}
	return false
}

// CreateEquipmentLog handles POST /api/hives/{hive_id}/equipment - creates an equipment log.
func CreateEquipmentLog(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())
	hiveID := chi.URLParam(r, "hive_id")

	if hiveID == "" {
		respondError(w, "Hive ID is required", http.StatusBadRequest)
		return
	}

	var req CreateEquipmentLogRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate required fields
	if req.EquipmentType == "" {
		respondError(w, "equipment_type is required", http.StatusBadRequest)
		return
	}

	if req.Action == "" {
		respondError(w, "action is required", http.StatusBadRequest)
		return
	}

	if req.LoggedAt == "" {
		respondError(w, "logged_at is required", http.StatusBadRequest)
		return
	}

	// Parse date
	loggedAt, err := time.Parse("2006-01-02", req.LoggedAt)
	if err != nil {
		respondError(w, "Invalid logged_at format. Use YYYY-MM-DD", http.StatusBadRequest)
		return
	}

	// Validate equipment type (must be 2-100 chars)
	if !isValidEquipmentType(req.EquipmentType) {
		respondError(w, "equipment_type must be 2-100 characters", http.StatusBadRequest)
		return
	}

	// Validate action
	if !isValidEquipmentAction(req.Action) {
		respondError(w, "Invalid action. Must be 'installed' or 'removed'", http.StatusBadRequest)
		return
	}

	// Validate notes length (max 500 chars)
	if req.Notes != nil && len(*req.Notes) > 500 {
		respondError(w, "notes must be 500 characters or less", http.StatusBadRequest)
		return
	}

	// Verify hive exists
	_, err = storage.GetHiveByID(r.Context(), conn, hiveID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Hive not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("hive_id", hiveID).Msg("handler: failed to get hive")
		respondError(w, "Failed to verify hive", http.StatusInternalServerError)
		return
	}

	// Check equipment state consistency
	isInstalled, err := storage.IsEquipmentCurrentlyInstalled(r.Context(), conn, hiveID, req.EquipmentType)
	if err != nil {
		log.Error().Err(err).Str("hive_id", hiveID).Str("equipment_type", req.EquipmentType).Msg("handler: failed to check equipment status")
		respondError(w, "Failed to check equipment status", http.StatusInternalServerError)
		return
	}

	// Prevent duplicate installations
	if req.Action == "installed" && isInstalled {
		respondError(w, "This equipment is already installed. Remove it first before reinstalling.", http.StatusConflict)
		return
	}

	// Prevent removing equipment that isn't installed
	if req.Action == "removed" && !isInstalled {
		respondError(w, "This equipment is not currently installed.", http.StatusConflict)
		return
	}

	input := &storage.CreateEquipmentLogInput{
		EquipmentType: req.EquipmentType,
		Action:        req.Action,
		LoggedAt:      loggedAt,
		Notes:         req.Notes,
	}

	equipmentLog, err := storage.CreateEquipmentLog(r.Context(), conn, tenantID, hiveID, input)
	if err != nil {
		log.Error().Err(err).Str("tenant_id", tenantID).Str("hive_id", hiveID).Msg("handler: failed to create equipment log")
		respondError(w, "Failed to create equipment log", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("equipment_log_id", equipmentLog.ID).
		Str("hive_id", hiveID).
		Str("equipment_type", req.EquipmentType).
		Str("action", req.Action).
		Msg("Equipment log created")

	respondJSON(w, EquipmentLogDataResponse{Data: equipmentLogToResponse(equipmentLog)}, http.StatusCreated)
}

// ListEquipmentByHive handles GET /api/hives/{hive_id}/equipment - returns all equipment logs for a hive.
func ListEquipmentByHive(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	hiveID := chi.URLParam(r, "hive_id")

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

	logs, err := storage.ListEquipmentByHive(r.Context(), conn, hiveID)
	if err != nil {
		log.Error().Err(err).Str("hive_id", hiveID).Msg("handler: failed to list equipment logs")
		respondError(w, "Failed to list equipment logs", http.StatusInternalServerError)
		return
	}

	// Convert to response format
	responses := make([]EquipmentLogResponse, 0, len(logs))
	for _, l := range logs {
		responses = append(responses, equipmentLogToResponse(&l))
	}

	respondJSON(w, EquipmentLogsListResponse{
		Data: responses,
		Meta: MetaResponse{Total: len(responses)},
	}, http.StatusOK)
}

// GetCurrentlyInstalled handles GET /api/hives/{hive_id}/equipment/current - returns currently installed equipment.
func GetCurrentlyInstalled(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	hiveID := chi.URLParam(r, "hive_id")

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

	items, err := storage.GetCurrentlyInstalledByHive(r.Context(), conn, hiveID)
	if err != nil {
		log.Error().Err(err).Str("hive_id", hiveID).Msg("handler: failed to get currently installed equipment")
		respondError(w, "Failed to get currently installed equipment", http.StatusInternalServerError)
		return
	}

	// Convert to response format
	responses := make([]CurrentlyInstalledResponse, 0, len(items))
	for _, item := range items {
		label := equipmentTypeLabels[item.EquipmentType]
		if label == "" {
			label = item.EquipmentType
		}
		responses = append(responses, CurrentlyInstalledResponse{
			ID:             item.ID,
			EquipmentType:  item.EquipmentType,
			EquipmentLabel: label,
			InstalledAt:    item.InstalledAt.Format("2006-01-02"),
			DaysInstalled:  item.DaysInstalled,
			Notes:          item.Notes,
		})
	}

	respondJSON(w, CurrentlyInstalledListResponse{Data: responses}, http.StatusOK)
}

// GetEquipmentHistory handles GET /api/hives/{hive_id}/equipment/history - returns equipment history.
func GetEquipmentHistory(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	hiveID := chi.URLParam(r, "hive_id")

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

	items, err := storage.GetEquipmentHistoryByHive(r.Context(), conn, hiveID)
	if err != nil {
		log.Error().Err(err).Str("hive_id", hiveID).Msg("handler: failed to get equipment history")
		respondError(w, "Failed to get equipment history", http.StatusInternalServerError)
		return
	}

	// Convert to response format
	responses := make([]EquipmentHistoryResponse, 0, len(items))
	for _, item := range items {
		label := equipmentTypeLabels[item.EquipmentType]
		if label == "" {
			label = item.EquipmentType
		}
		responses = append(responses, EquipmentHistoryResponse{
			EquipmentType:  item.EquipmentType,
			EquipmentLabel: label,
			InstalledAt:    item.InstalledAt.Format("2006-01-02"),
			RemovedAt:      item.RemovedAt.Format("2006-01-02"),
			DurationDays:   item.DurationDays,
			Notes:          item.Notes,
		})
	}

	respondJSON(w, EquipmentHistoryListResponse{Data: responses}, http.StatusOK)
}

// GetEquipmentLog handles GET /api/equipment/{id} - returns a specific equipment log.
func GetEquipmentLog(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	equipmentID := chi.URLParam(r, "id")

	if equipmentID == "" {
		respondError(w, "Equipment log ID is required", http.StatusBadRequest)
		return
	}

	equipmentLog, err := storage.GetEquipmentLogByID(r.Context(), conn, equipmentID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Equipment log not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("equipment_id", equipmentID).Msg("handler: failed to get equipment log")
		respondError(w, "Failed to get equipment log", http.StatusInternalServerError)
		return
	}

	respondJSON(w, EquipmentLogDataResponse{Data: equipmentLogToResponse(equipmentLog)}, http.StatusOK)
}

// UpdateEquipmentLog handles PUT /api/equipment/{id} - updates an existing equipment log.
func UpdateEquipmentLog(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	equipmentID := chi.URLParam(r, "id")

	if equipmentID == "" {
		respondError(w, "Equipment log ID is required", http.StatusBadRequest)
		return
	}

	var req UpdateEquipmentLogRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Parse date if provided
	var loggedAt *time.Time
	if req.LoggedAt != nil && *req.LoggedAt != "" {
		t, err := time.Parse("2006-01-02", *req.LoggedAt)
		if err != nil {
			respondError(w, "Invalid logged_at format. Use YYYY-MM-DD", http.StatusBadRequest)
			return
		}
		loggedAt = &t
	}

	// Validate equipment type if provided (must be 2-100 chars)
	if req.EquipmentType != nil && *req.EquipmentType != "" {
		if !isValidEquipmentType(*req.EquipmentType) {
			respondError(w, "equipment_type must be 2-100 characters", http.StatusBadRequest)
			return
		}
	}

	// Validate action if provided
	if req.Action != nil && *req.Action != "" {
		if !isValidEquipmentAction(*req.Action) {
			respondError(w, "Invalid action. Must be 'installed' or 'removed'", http.StatusBadRequest)
			return
		}
	}

	// Validate notes length if provided (max 500 chars)
	if req.Notes != nil && len(*req.Notes) > 500 {
		respondError(w, "notes must be 500 characters or less", http.StatusBadRequest)
		return
	}

	// Get current equipment log to check state consistency
	currentLog, err := storage.GetEquipmentLogByID(r.Context(), conn, equipmentID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Equipment log not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("equipment_id", equipmentID).Msg("handler: failed to get equipment log")
		respondError(w, "Failed to get equipment log", http.StatusInternalServerError)
		return
	}

	// Determine final action and equipment type after update
	finalAction := currentLog.Action
	if req.Action != nil && *req.Action != "" {
		finalAction = *req.Action
	}
	finalEquipmentType := currentLog.EquipmentType
	if req.EquipmentType != nil && *req.EquipmentType != "" {
		finalEquipmentType = *req.EquipmentType
	}

	// Check equipment state consistency if action or equipment type is changing
	if (req.Action != nil && *req.Action != currentLog.Action) || (req.EquipmentType != nil && *req.EquipmentType != currentLog.EquipmentType) {
		isInstalled, err := storage.IsEquipmentCurrentlyInstalled(r.Context(), conn, currentLog.HiveID, finalEquipmentType)
		if err != nil {
			log.Error().Err(err).Str("hive_id", currentLog.HiveID).Str("equipment_type", finalEquipmentType).Msg("handler: failed to check equipment status")
			respondError(w, "Failed to check equipment status", http.StatusInternalServerError)
			return
		}

		// If changing to "installed", the equipment must not already be installed (unless this is the install record)
		if finalAction == "installed" && isInstalled && currentLog.Action != "installed" {
			respondError(w, "This equipment is already installed. Remove it first before reinstalling.", http.StatusConflict)
			return
		}

		// If changing to "removed", the equipment must be installed
		if finalAction == "removed" && !isInstalled && currentLog.Action != "removed" {
			respondError(w, "This equipment is not currently installed.", http.StatusConflict)
			return
		}
	}

	input := &storage.UpdateEquipmentLogInput{
		EquipmentType: req.EquipmentType,
		Action:        req.Action,
		LoggedAt:      loggedAt,
		Notes:         req.Notes,
	}

	equipmentLog, err := storage.UpdateEquipmentLog(r.Context(), conn, equipmentID, input)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Equipment log not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("equipment_id", equipmentID).Msg("handler: failed to update equipment log")
		respondError(w, "Failed to update equipment log", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("equipment_log_id", equipmentLog.ID).
		Msg("Equipment log updated")

	respondJSON(w, EquipmentLogDataResponse{Data: equipmentLogToResponse(equipmentLog)}, http.StatusOK)
}

// DeleteEquipmentLog handles DELETE /api/equipment/{id} - deletes an equipment log.
func DeleteEquipmentLog(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	equipmentID := chi.URLParam(r, "id")

	if equipmentID == "" {
		respondError(w, "Equipment log ID is required", http.StatusBadRequest)
		return
	}

	err := storage.DeleteEquipmentLog(r.Context(), conn, equipmentID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Equipment log not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("equipment_id", equipmentID).Msg("handler: failed to delete equipment log")
		respondError(w, "Failed to delete equipment log", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("equipment_log_id", equipmentID).
		Msg("Equipment log deleted")

	w.WriteHeader(http.StatusNoContent)
}
