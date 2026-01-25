// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/rs/zerolog/log"
)

// InspectionResponse represents an inspection in API responses.
type InspectionResponse struct {
	ID           string          `json:"id"`
	HiveID       string          `json:"hive_id"`
	InspectedAt  string          `json:"inspected_at"`
	QueenSeen    *bool           `json:"queen_seen,omitempty"`
	EggsSeen     *bool           `json:"eggs_seen,omitempty"`
	QueenCells   *bool           `json:"queen_cells,omitempty"`
	BroodFrames  *int            `json:"brood_frames,omitempty"`
	BroodPattern *string         `json:"brood_pattern,omitempty"`
	HoneyLevel   *string         `json:"honey_level,omitempty"`
	PollenLevel  *string         `json:"pollen_level,omitempty"`
	Temperament  *string         `json:"temperament,omitempty"`
	Issues       []string        `json:"issues"`
	Notes        *string         `json:"notes,omitempty"`
	Frames       []FrameResponse `json:"frames,omitempty"`
	CreatedAt    string          `json:"created_at"`
	UpdatedAt    string          `json:"updated_at"`
}

// FrameResponse represents frame-level data in API responses.
type FrameResponse struct {
	BoxPosition  int    `json:"box_position"`
	BoxType      string `json:"box_type"`
	TotalFrames  int    `json:"total_frames"`
	DrawnFrames  int    `json:"drawn_frames"`
	BroodFrames  int    `json:"brood_frames"`
	HoneyFrames  int    `json:"honey_frames"`
	PollenFrames int    `json:"pollen_frames"`
}

// InspectionsListResponse represents the list inspections API response.
type InspectionsListResponse struct {
	Data []InspectionResponse `json:"data"`
	Meta MetaResponse         `json:"meta"`
}

// InspectionDataResponse represents a single inspection API response.
type InspectionDataResponse struct {
	Data InspectionResponse `json:"data"`
}

// CreateInspectionRequest represents the request body for creating an inspection.
type CreateInspectionRequest struct {
	InspectedAt  *string        `json:"inspected_at,omitempty"`
	QueenSeen    *bool          `json:"queen_seen,omitempty"`
	EggsSeen     *bool          `json:"eggs_seen,omitempty"`
	QueenCells   *bool          `json:"queen_cells,omitempty"`
	BroodFrames  *int           `json:"brood_frames,omitempty"`
	BroodPattern *string        `json:"brood_pattern,omitempty"`
	HoneyLevel   *string        `json:"honey_level,omitempty"`
	PollenLevel  *string        `json:"pollen_level,omitempty"`
	Temperament  *string        `json:"temperament,omitempty"`
	Issues       []string       `json:"issues,omitempty"`
	Notes        *string        `json:"notes,omitempty"`
	Frames       []FrameRequest `json:"frames,omitempty"` // Advanced mode: per-box frame data
}

// FrameRequest represents frame-level data in API requests.
type FrameRequest struct {
	BoxPosition  int    `json:"box_position"`
	BoxType      string `json:"box_type"`
	TotalFrames  int    `json:"total_frames"`
	DrawnFrames  int    `json:"drawn_frames"`
	BroodFrames  int    `json:"brood_frames"`
	HoneyFrames  int    `json:"honey_frames"`
	PollenFrames int    `json:"pollen_frames"`
}

// UpdateInspectionRequest represents the request body for updating an inspection.
type UpdateInspectionRequest struct {
	InspectedAt  *string        `json:"inspected_at,omitempty"`
	QueenSeen    *bool          `json:"queen_seen,omitempty"`
	EggsSeen     *bool          `json:"eggs_seen,omitempty"`
	QueenCells   *bool          `json:"queen_cells,omitempty"`
	BroodFrames  *int           `json:"brood_frames,omitempty"`
	BroodPattern *string        `json:"brood_pattern,omitempty"`
	HoneyLevel   *string        `json:"honey_level,omitempty"`
	PollenLevel  *string        `json:"pollen_level,omitempty"`
	Temperament  *string        `json:"temperament,omitempty"`
	Issues       []string       `json:"issues,omitempty"`
	Notes        *string        `json:"notes,omitempty"`
	Frames       []FrameRequest `json:"frames,omitempty"` // Advanced mode: per-box frame data
}

// inspectionToResponse converts a storage.Inspection to an InspectionResponse.
func inspectionToResponse(inspection *storage.Inspection) InspectionResponse {
	issues := inspection.Issues
	if issues == nil {
		issues = []string{}
	}

	return InspectionResponse{
		ID:           inspection.ID,
		HiveID:       inspection.HiveID,
		InspectedAt:  inspection.InspectedAt.Format("2006-01-02"),
		QueenSeen:    inspection.QueenSeen,
		EggsSeen:     inspection.EggsSeen,
		QueenCells:   inspection.QueenCells,
		BroodFrames:  inspection.BroodFrames,
		BroodPattern: inspection.BroodPattern,
		HoneyLevel:   inspection.HoneyLevel,
		PollenLevel:  inspection.PollenLevel,
		Temperament:  inspection.Temperament,
		Issues:       issues,
		Notes:        inspection.Notes,
		CreatedAt:    inspection.CreatedAt.Format(time.RFC3339),
		UpdatedAt:    inspection.UpdatedAt.Format(time.RFC3339),
	}
}

// framesToResponse converts storage.InspectionFrame slice to FrameResponse slice.
func framesToResponse(frames []storage.InspectionFrame) []FrameResponse {
	if len(frames) == 0 {
		return nil
	}
	result := make([]FrameResponse, len(frames))
	for i, f := range frames {
		result[i] = FrameResponse{
			BoxPosition:  f.BoxPosition,
			BoxType:      f.BoxType,
			TotalFrames:  f.TotalFrames,
			DrawnFrames:  f.DrawnFrames,
			BroodFrames:  f.BroodFrames,
			HoneyFrames:  f.HoneyFrames,
			PollenFrames: f.PollenFrames,
		}
	}
	return result
}

// validateBroodPattern checks if brood pattern value is valid.
func validateBroodPattern(pattern *string) bool {
	if pattern == nil || *pattern == "" {
		return true
	}
	valid := []string{"good", "spotty", "poor"}
	for _, v := range valid {
		if *pattern == v {
			return true
		}
	}
	return false
}

// validateLevel checks if honey/pollen level value is valid.
func validateLevel(level *string) bool {
	if level == nil || *level == "" {
		return true
	}
	valid := []string{"low", "medium", "high"}
	for _, v := range valid {
		if *level == v {
			return true
		}
	}
	return false
}

// validateTemperament checks if temperament value is valid.
func validateTemperament(temperament *string) bool {
	if temperament == nil || *temperament == "" {
		return true
	}
	valid := []string{"calm", "nervous", "aggressive"}
	for _, v := range valid {
		if *temperament == v {
			return true
		}
	}
	return false
}

// validateIssues checks if all issue codes are valid.
// Valid codes: dwv, chalkbrood, wax_moth, robbing, or other:{description}
func validateIssues(issues []string) bool {
	if issues == nil {
		return true
	}
	validCodes := []string{"dwv", "chalkbrood", "wax_moth", "robbing"}
	for _, issue := range issues {
		// Check if it's a valid predefined code
		isValid := false
		for _, code := range validCodes {
			if issue == code {
				isValid = true
				break
			}
		}
		// Check if it's an "other:" prefixed custom issue
		if !isValid && len(issue) > 6 && issue[:6] == "other:" {
			// Custom issues must have a description
			if len(issue) > 6 && len(issue) <= 206 { // "other:" + up to 200 chars
				isValid = true
			}
		}
		if !isValid {
			return false
		}
	}
	return true
}

// validateNotes checks if notes length is within acceptable range.
func validateNotes(notes *string) bool {
	if notes == nil {
		return true
	}
	return len(*notes) <= 2000
}

// ListInspectionsByHive handles GET /api/hives/{hive_id}/inspections - returns paginated inspections for a hive.
func ListInspectionsByHive(w http.ResponseWriter, r *http.Request) {
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

	// Get pagination params
	limit := 20
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 100 {
			limit = l
		}
	}

	offset := 0
	if offsetStr := r.URL.Query().Get("offset"); offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil && o >= 0 {
			offset = o
		}
	}

	// Get sort order (default descending = newest first)
	sortAsc := false
	if sortStr := r.URL.Query().Get("sort"); sortStr == "asc" {
		sortAsc = true
	}

	inspections, total, err := storage.ListInspectionsPaginated(r.Context(), conn, hiveID, limit, offset, sortAsc)
	if err != nil {
		log.Error().Err(err).Str("hive_id", hiveID).Msg("handler: failed to list inspections")
		respondError(w, "Failed to list inspections", http.StatusInternalServerError)
		return
	}

	// Convert to response format
	responses := make([]InspectionResponse, 0, len(inspections))
	for _, inspection := range inspections {
		responses = append(responses, inspectionToResponse(&inspection))
	}

	respondJSON(w, InspectionsListResponse{
		Data: responses,
		Meta: MetaResponse{Total: total},
	}, http.StatusOK)
}

// GetInspection handles GET /api/inspections/{id} - returns a specific inspection.
func GetInspection(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	inspectionID := chi.URLParam(r, "id")

	if inspectionID == "" {
		respondError(w, "Inspection ID is required", http.StatusBadRequest)
		return
	}

	inspection, err := storage.GetInspectionByID(r.Context(), conn, inspectionID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Inspection not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("inspection_id", inspectionID).Msg("handler: failed to get inspection")
		respondError(w, "Failed to get inspection", http.StatusInternalServerError)
		return
	}

	// Get frame data for this inspection
	frames, err := storage.GetFramesByInspectionID(r.Context(), conn, inspectionID)
	if err != nil {
		log.Error().Err(err).Str("inspection_id", inspectionID).Msg("handler: failed to get inspection frames")
		// Continue without frames - not a fatal error
		frames = nil
	}

	response := inspectionToResponse(inspection)
	response.Frames = framesToResponse(frames)
	respondJSON(w, InspectionDataResponse{Data: response}, http.StatusOK)
}

// CreateInspection handles POST /api/hives/{hive_id}/inspections - creates a new inspection.
func CreateInspection(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())
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

	var req CreateInspectionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate brood pattern
	if !validateBroodPattern(req.BroodPattern) {
		respondError(w, "Invalid brood_pattern. Must be one of: good, spotty, poor", http.StatusBadRequest)
		return
	}

	// Validate honey level
	if !validateLevel(req.HoneyLevel) {
		respondError(w, "Invalid honey_level. Must be one of: low, medium, high", http.StatusBadRequest)
		return
	}

	// Validate pollen level
	if !validateLevel(req.PollenLevel) {
		respondError(w, "Invalid pollen_level. Must be one of: low, medium, high", http.StatusBadRequest)
		return
	}

	// Validate temperament
	if !validateTemperament(req.Temperament) {
		respondError(w, "Invalid temperament. Must be one of: calm, nervous, aggressive", http.StatusBadRequest)
		return
	}

	// Validate brood frames
	if req.BroodFrames != nil && (*req.BroodFrames < 0 || *req.BroodFrames > 20) {
		respondError(w, "Brood frames must be between 0 and 20", http.StatusBadRequest)
		return
	}

	// Validate issues
	if !validateIssues(req.Issues) {
		respondError(w, "Invalid issue code. Must be one of: dwv, chalkbrood, wax_moth, robbing, or other:{description}", http.StatusBadRequest)
		return
	}

	// Validate notes length
	if !validateNotes(req.Notes) {
		respondError(w, "Notes must not exceed 2000 characters", http.StatusBadRequest)
		return
	}

	// Parse inspection date
	inspectedAt := time.Now()
	if req.InspectedAt != nil && *req.InspectedAt != "" {
		t, err := time.Parse("2006-01-02", *req.InspectedAt)
		if err != nil {
			respondError(w, "Invalid inspected_at format. Use YYYY-MM-DD", http.StatusBadRequest)
			return
		}
		// Don't allow future inspection dates
		if t.After(time.Now().AddDate(0, 0, 1)) {
			respondError(w, "Inspection date cannot be in the future", http.StatusBadRequest)
			return
		}
		inspectedAt = t
	}

	input := &storage.CreateInspectionInput{
		HiveID:       hiveID,
		InspectedAt:  inspectedAt,
		QueenSeen:    req.QueenSeen,
		EggsSeen:     req.EggsSeen,
		QueenCells:   req.QueenCells,
		BroodFrames:  req.BroodFrames,
		BroodPattern: req.BroodPattern,
		HoneyLevel:   req.HoneyLevel,
		PollenLevel:  req.PollenLevel,
		Temperament:  req.Temperament,
		Issues:       req.Issues,
		Notes:        req.Notes,
	}

	inspection, err := storage.CreateInspection(r.Context(), conn, tenantID, input)
	if err != nil {
		log.Error().Err(err).Str("tenant_id", tenantID).Str("hive_id", hiveID).Msg("handler: failed to create inspection")
		respondError(w, "Failed to create inspection", http.StatusInternalServerError)
		return
	}

	// Create frame data if provided (advanced mode)
	var frames []storage.InspectionFrame
	if len(req.Frames) > 0 {
		frameInputs := make([]storage.CreateInspectionFrameInput, len(req.Frames))
		for i, f := range req.Frames {
			frameInputs[i] = storage.CreateInspectionFrameInput{
				BoxPosition:  f.BoxPosition,
				BoxType:      f.BoxType,
				TotalFrames:  f.TotalFrames,
				DrawnFrames:  f.DrawnFrames,
				BroodFrames:  f.BroodFrames,
				HoneyFrames:  f.HoneyFrames,
				PollenFrames: f.PollenFrames,
			}
		}
		frames, err = storage.CreateInspectionFrames(r.Context(), conn, inspection.ID, frameInputs)
		if err != nil {
			log.Error().Err(err).Str("inspection_id", inspection.ID).Msg("handler: failed to create inspection frames")
			respondError(w, "Failed to save frame data", http.StatusInternalServerError)
			return
		}
	}

	log.Info().
		Str("inspection_id", inspection.ID).
		Str("tenant_id", tenantID).
		Str("hive_id", hiveID).
		Time("inspected_at", inspectedAt).
		Int("frame_count", len(frames)).
		Msg("Inspection created")

	response := inspectionToResponse(inspection)
	response.Frames = framesToResponse(frames)
	respondJSON(w, InspectionDataResponse{Data: response}, http.StatusCreated)
}

// UpdateInspection handles PUT /api/inspections/{id} - updates an existing inspection.
// Edits are only allowed within 24 hours of creation.
func UpdateInspection(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	inspectionID := chi.URLParam(r, "id")

	if inspectionID == "" {
		respondError(w, "Inspection ID is required", http.StatusBadRequest)
		return
	}

	// Get existing inspection to check edit window
	existing, err := storage.GetInspectionByID(r.Context(), conn, inspectionID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Inspection not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("inspection_id", inspectionID).Msg("handler: failed to get inspection for edit check")
		respondError(w, "Failed to get inspection", http.StatusInternalServerError)
		return
	}

	// Check 24-hour edit window
	hoursSinceCreation := time.Since(existing.CreatedAt).Hours()
	if hoursSinceCreation >= 24 {
		log.Warn().
			Str("inspection_id", inspectionID).
			Float64("hours_since_creation", hoursSinceCreation).
			Msg("Edit attempt outside 24-hour window")
		respondError(w, "Edit window expired. Inspections can only be edited within 24 hours of creation.", http.StatusForbidden)
		return
	}

	var req UpdateInspectionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate brood pattern
	if !validateBroodPattern(req.BroodPattern) {
		respondError(w, "Invalid brood_pattern. Must be one of: good, spotty, poor", http.StatusBadRequest)
		return
	}

	// Validate honey level
	if !validateLevel(req.HoneyLevel) {
		respondError(w, "Invalid honey_level. Must be one of: low, medium, high", http.StatusBadRequest)
		return
	}

	// Validate pollen level
	if !validateLevel(req.PollenLevel) {
		respondError(w, "Invalid pollen_level. Must be one of: low, medium, high", http.StatusBadRequest)
		return
	}

	// Validate temperament
	if !validateTemperament(req.Temperament) {
		respondError(w, "Invalid temperament. Must be one of: calm, nervous, aggressive", http.StatusBadRequest)
		return
	}

	// Validate brood frames
	if req.BroodFrames != nil && (*req.BroodFrames < 0 || *req.BroodFrames > 20) {
		respondError(w, "Brood frames must be between 0 and 20", http.StatusBadRequest)
		return
	}

	// Validate issues
	if !validateIssues(req.Issues) {
		respondError(w, "Invalid issue code. Must be one of: dwv, chalkbrood, wax_moth, robbing, or other:{description}", http.StatusBadRequest)
		return
	}

	// Validate notes length
	if !validateNotes(req.Notes) {
		respondError(w, "Notes must not exceed 2000 characters", http.StatusBadRequest)
		return
	}

	// Parse inspection date if provided
	var inspectedAt *time.Time
	if req.InspectedAt != nil && *req.InspectedAt != "" {
		t, err := time.Parse("2006-01-02", *req.InspectedAt)
		if err != nil {
			respondError(w, "Invalid inspected_at format. Use YYYY-MM-DD", http.StatusBadRequest)
			return
		}
		// Don't allow future inspection dates
		if t.After(time.Now().AddDate(0, 0, 1)) {
			respondError(w, "Inspection date cannot be in the future", http.StatusBadRequest)
			return
		}
		inspectedAt = &t
	}

	input := &storage.UpdateInspectionInput{
		InspectedAt:  inspectedAt,
		QueenSeen:    req.QueenSeen,
		EggsSeen:     req.EggsSeen,
		QueenCells:   req.QueenCells,
		BroodFrames:  req.BroodFrames,
		BroodPattern: req.BroodPattern,
		HoneyLevel:   req.HoneyLevel,
		PollenLevel:  req.PollenLevel,
		Temperament:  req.Temperament,
		Issues:       req.Issues,
		Notes:        req.Notes,
	}

	inspection, err := storage.UpdateInspection(r.Context(), conn, inspectionID, input)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Inspection not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("inspection_id", inspectionID).Msg("handler: failed to update inspection")
		respondError(w, "Failed to update inspection", http.StatusInternalServerError)
		return
	}

	// Update frame data if provided
	var frames []storage.InspectionFrame
	if req.Frames != nil {
		// Delete existing frames and create new ones
		_ = storage.DeleteFramesByInspectionID(r.Context(), conn, inspectionID)

		if len(req.Frames) > 0 {
			frameInputs := make([]storage.CreateInspectionFrameInput, len(req.Frames))
			for i, f := range req.Frames {
				frameInputs[i] = storage.CreateInspectionFrameInput{
					BoxPosition:  f.BoxPosition,
					BoxType:      f.BoxType,
					TotalFrames:  f.TotalFrames,
					DrawnFrames:  f.DrawnFrames,
					BroodFrames:  f.BroodFrames,
					HoneyFrames:  f.HoneyFrames,
					PollenFrames: f.PollenFrames,
				}
			}
			frames, err = storage.CreateInspectionFrames(r.Context(), conn, inspectionID, frameInputs)
			if err != nil {
				log.Error().Err(err).Str("inspection_id", inspectionID).Msg("handler: failed to update inspection frames")
				respondError(w, "Failed to update frame data", http.StatusInternalServerError)
				return
			}
		}
	} else {
		// Fetch existing frames if not updating
		frames, _ = storage.GetFramesByInspectionID(r.Context(), conn, inspectionID)
	}

	log.Info().
		Str("inspection_id", inspection.ID).
		Int("frame_count", len(frames)).
		Msg("Inspection updated")

	response := inspectionToResponse(inspection)
	response.Frames = framesToResponse(frames)
	respondJSON(w, InspectionDataResponse{Data: response}, http.StatusOK)
}

// DeleteInspection handles DELETE /api/inspections/{id} - deletes an inspection.
func DeleteInspection(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	inspectionID := chi.URLParam(r, "id")

	if inspectionID == "" {
		respondError(w, "Inspection ID is required", http.StatusBadRequest)
		return
	}

	err := storage.DeleteInspection(r.Context(), conn, inspectionID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Inspection not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("inspection_id", inspectionID).Msg("handler: failed to delete inspection")
		respondError(w, "Failed to delete inspection", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("inspection_id", inspectionID).
		Msg("Inspection deleted")

	w.WriteHeader(http.StatusNoContent)
}

// ExportInspections handles GET /api/hives/{hive_id}/inspections/export - exports inspections as CSV.
func ExportInspections(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	hiveID := chi.URLParam(r, "hive_id")

	if hiveID == "" {
		respondError(w, "Hive ID is required", http.StatusBadRequest)
		return
	}

	// Verify hive exists and get name for filename
	hive, err := storage.GetHiveByID(r.Context(), conn, hiveID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Hive not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("hive_id", hiveID).Msg("handler: failed to get hive for export")
		respondError(w, "Failed to get hive", http.StatusInternalServerError)
		return
	}

	// Get all inspections for this hive
	inspections, err := storage.ListAllInspectionsByHive(r.Context(), conn, hiveID)
	if err != nil {
		log.Error().Err(err).Str("hive_id", hiveID).Msg("handler: failed to list inspections for export")
		respondError(w, "Failed to export inspections", http.StatusInternalServerError)
		return
	}

	// Set CSV headers
	filename := fmt.Sprintf("%s-inspections-%s.csv", sanitizeFilename(hive.Name), time.Now().Format("2006-01-02"))
	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))

	// Write CSV header
	_, _ = w.Write([]byte("Date,Queen Seen,Eggs Seen,Queen Cells,Brood Frames,Brood Pattern,Honey Level,Pollen Level,Temperament,Issues,Notes\n"))

	// Write each inspection row
	for _, insp := range inspections {
		queenSeen := ""
		if insp.QueenSeen != nil {
			if *insp.QueenSeen {
				queenSeen = "Yes"
			} else {
				queenSeen = "No"
			}
		}

		eggsSeen := ""
		if insp.EggsSeen != nil {
			if *insp.EggsSeen {
				eggsSeen = "Yes"
			} else {
				eggsSeen = "No"
			}
		}

		queenCells := ""
		if insp.QueenCells != nil {
			if *insp.QueenCells {
				queenCells = "Yes"
			} else {
				queenCells = "No"
			}
		}

		broodFrames := ""
		if insp.BroodFrames != nil {
			broodFrames = strconv.Itoa(*insp.BroodFrames)
		}

		broodPattern := ""
		if insp.BroodPattern != nil {
			broodPattern = *insp.BroodPattern
		}

		honeyLevel := ""
		if insp.HoneyLevel != nil {
			honeyLevel = *insp.HoneyLevel
		}

		pollenLevel := ""
		if insp.PollenLevel != nil {
			pollenLevel = *insp.PollenLevel
		}

		temperament := ""
		if insp.Temperament != nil {
			temperament = *insp.Temperament
		}

		issues := ""
		if len(insp.Issues) > 0 {
			issues = escapeCSV(fmt.Sprintf("%v", insp.Issues))
		}

		notes := ""
		if insp.Notes != nil {
			notes = escapeCSV(*insp.Notes)
		}

		row := fmt.Sprintf("%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s\n",
			insp.InspectedAt.Format("2006-01-02"),
			queenSeen, eggsSeen, queenCells,
			broodFrames, broodPattern,
			honeyLevel, pollenLevel, temperament,
			issues, notes)
		_, _ = w.Write([]byte(row))
	}

	log.Info().
		Str("hive_id", hiveID).
		Int("inspection_count", len(inspections)).
		Msg("Inspections exported")
}

// sanitizeFilename removes characters that shouldn't be in filenames.
func sanitizeFilename(name string) string {
	// Replace spaces and special chars with underscores
	var result strings.Builder
	result.Grow(len(name))
	for _, c := range name {
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '_' {
			result.WriteRune(c)
		} else if c == ' ' {
			result.WriteByte('_')
		}
	}
	return result.String()
}

// escapeCSV escapes a string for CSV output.
func escapeCSV(s string) string {
	// If string contains comma, newline, or quote, wrap in quotes and escape internal quotes
	if containsSpecialCSVChars(s) {
		// Replace double quotes with two double quotes
		var escaped strings.Builder
		escaped.Grow(len(s) + 2)
		escaped.WriteByte('"')
		for _, c := range s {
			if c == '"' {
				escaped.WriteString("\"\"")
			} else {
				escaped.WriteRune(c)
			}
		}
		escaped.WriteByte('"')
		return escaped.String()
	}
	return s
}

// containsSpecialCSVChars checks if string needs CSV escaping.
func containsSpecialCSVChars(s string) bool {
	for _, c := range s {
		if c == ',' || c == '\n' || c == '\r' || c == '"' {
			return true
		}
	}
	return false
}

// FrameHistoryEntry represents aggregated frame data for chart display.
type FrameHistoryEntry struct {
	InspectionID string `json:"inspection_id"`
	InspectedAt  string `json:"inspected_at"`
	TotalBrood   int    `json:"total_brood"`
	TotalHoney   int    `json:"total_honey"`
	TotalPollen  int    `json:"total_pollen"`
	TotalDrawn   int    `json:"total_drawn"`
}

// FrameHistoryResponse represents the frame history API response.
type FrameHistoryResponse struct {
	Data []FrameHistoryEntry `json:"data"`
	Meta MetaResponse        `json:"meta"`
}

// GetFrameHistory handles GET /api/hives/{hive_id}/frame-history - returns aggregated frame data for charts.
func GetFrameHistory(w http.ResponseWriter, r *http.Request) {
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
		log.Error().Err(err).Str("hive_id", hiveID).Msg("handler: failed to get hive for frame history")
		respondError(w, "Failed to get hive", http.StatusInternalServerError)
		return
	}

	// Get limit from query params
	limit := 50
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 100 {
			limit = l
		}
	}

	history, err := storage.GetFrameHistoryByHive(r.Context(), conn, hiveID, limit)
	if err != nil {
		log.Error().Err(err).Str("hive_id", hiveID).Msg("handler: failed to get frame history")
		respondError(w, "Failed to get frame history", http.StatusInternalServerError)
		return
	}

	// Convert to response format
	entries := make([]FrameHistoryEntry, len(history))
	for i, h := range history {
		entries[i] = FrameHistoryEntry{
			InspectionID: h.InspectionID,
			InspectedAt:  h.InspectedAt.Format("2006-01-02"),
			TotalBrood:   h.TotalBrood,
			TotalHoney:   h.TotalHoney,
			TotalPollen:  h.TotalPollen,
			TotalDrawn:   h.TotalDrawn,
		}
	}

	respondJSON(w, FrameHistoryResponse{
		Data: entries,
		Meta: MetaResponse{Total: len(entries)},
	}, http.StatusOK)
}
