// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/services"
	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/rs/zerolog/log"
)

// ClipResponse represents a clip in API responses.
// Note: FilePath and ThumbnailPath are omitted to avoid exposing internal paths.
// Clients should use /api/clips/{id}/video and /api/clips/{id}/thumbnail endpoints.
type ClipResponse struct {
	ID              string     `json:"id"`
	UnitID          string     `json:"unit_id"`
	UnitName        *string    `json:"unit_name,omitempty"`
	SiteID          string     `json:"site_id"`
	DetectionID     *string    `json:"detection_id,omitempty"`
	DurationSeconds *float64   `json:"duration_seconds,omitempty"`
	FileSizeBytes   int64      `json:"file_size_bytes"`
	RecordedAt      time.Time  `json:"recorded_at"`
	CreatedAt       time.Time  `json:"created_at"`
	ThumbnailURL    string     `json:"thumbnail_url,omitempty"`
}

// ClipDataResponse wraps a single clip response.
type ClipDataResponse struct {
	Data ClipResponse `json:"data"`
}

// ClipsListResponse represents the list clips API response.
type ClipsListResponse struct {
	Data []ClipResponse `json:"data"`
	Meta MetaResponse   `json:"meta"`
}

// getClipStorageService returns a ClipStorageService configured from environment.
func getClipStorageService() *services.ClipStorageService {
	basePath := os.Getenv("CLIPS_PATH")
	if basePath == "" {
		basePath = "/data/clips"
	}
	return services.NewClipStorageService(basePath)
}

// validateFilePath ensures the file path is within the expected base directory.
// This prevents path traversal attacks where a malicious path could access
// files outside the clips storage directory.
func validateFilePath(filePath string, clipService *services.ClipStorageService) bool {
	// Clean the path to resolve any .. or . components
	cleanPath := filepath.Clean(filePath)
	basePath := filepath.Clean(clipService.BasePath)

	// Verify the cleaned path starts with the base path
	return strings.HasPrefix(cleanPath, basePath+string(filepath.Separator)) || cleanPath == basePath
}

// UploadClip handles POST /api/units/clips - receives a clip upload from a unit.
// The unit is authenticated via the UnitAuth middleware using X-API-Key header.
// Expects multipart form data with:
// - file: MP4 video file (max 10MB)
// - detection_id: UUID of associated detection (optional)
// - recorded_at: ISO timestamp when clip was recorded
func UploadClip(w http.ResponseWriter, r *http.Request) {
	// Get unit from UnitAuth middleware
	unit := middleware.GetUnit(r.Context())
	if unit == nil {
		log.Error().Msg("handler: upload clip called without unit in context")
		respondError(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	conn := storage.GetConn(r.Context())
	if conn == nil {
		log.Error().Msg("handler: upload clip called without database connection")
		respondError(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Validate unit has a site assigned - units must be assigned to a site before uploading clips
	if unit.SiteID == nil {
		log.Warn().
			Str("unit_id", unit.ID).
			Str("serial", unit.Serial).
			Msg("handler: unit has no site assigned, cannot upload clips")
		respondError(w, "Unit must be assigned to a site before uploading clips", http.StatusBadRequest)
		return
	}

	// Parse multipart form (max 10MB + overhead for form fields)
	maxMemory := int64(services.MaxClipSize + 1024*1024) // 11MB total
	if err := r.ParseMultipartForm(maxMemory); err != nil {
		log.Debug().Err(err).Msg("handler: failed to parse multipart form")
		respondError(w, "Invalid multipart form", http.StatusBadRequest)
		return
	}
	// Clean up temp files after request completes
	defer func() {
		if r.MultipartForm != nil {
			r.MultipartForm.RemoveAll()
		}
	}()

	// Get the uploaded file
	file, header, err := r.FormFile("file")
	if err != nil {
		log.Debug().Err(err).Msg("handler: missing file in multipart form")
		respondError(w, "Missing 'file' field", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Check file size
	if header.Size > services.MaxClipSize {
		log.Debug().
			Int64("file_size", header.Size).
			Int64("max_size", services.MaxClipSize).
			Msg("handler: clip file too large")
		respondError(w, "File too large. Maximum size is 10MB.", http.StatusRequestEntityTooLarge)
		return
	}

	// Read file contents
	fileData, err := io.ReadAll(file)
	if err != nil {
		log.Error().Err(err).Msg("handler: failed to read uploaded file")
		respondError(w, "Failed to read file", http.StatusInternalServerError)
		return
	}

	// Validate MP4 format
	if err := services.ValidateMP4(fileData); err != nil {
		log.Debug().Err(err).Msg("handler: invalid MP4 file")
		respondError(w, "Invalid MP4 file: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Get optional detection_id
	var detectionID *string
	if detIDStr := r.FormValue("detection_id"); detIDStr != "" {
		// Validate detection exists and belongs to this unit
		detection, err := storage.GetDetection(r.Context(), conn, detIDStr)
		if err == nil && detection != nil {
			// Check that detection belongs to this unit
			if detection.UnitID != unit.ID {
				log.Warn().
					Str("detection_id", detIDStr).
					Str("detection_unit", detection.UnitID).
					Str("auth_unit", unit.ID).
					Msg("handler: detection belongs to different unit")
				respondError(w, "Detection belongs to different unit", http.StatusForbidden)
				return
			}
			detectionID = &detIDStr
		} else {
			// Detection not found - still accept the clip but log warning
			log.Warn().Str("detection_id", detIDStr).Msg("handler: detection not found, clip will be orphaned")
		}
	}

	// Parse recorded_at timestamp (required)
	recordedAtStr := r.FormValue("recorded_at")
	if recordedAtStr == "" {
		respondError(w, "Missing 'recorded_at' field", http.StatusBadRequest)
		return
	}
	recordedAt, err := time.Parse(time.RFC3339, recordedAtStr)
	if err != nil {
		log.Debug().Err(err).Str("recorded_at", recordedAtStr).Msg("handler: invalid recorded_at format")
		respondError(w, "Invalid 'recorded_at' format. Use ISO 8601 (RFC3339).", http.StatusBadRequest)
		return
	}

	// Create clip storage service
	clipService := getClipStorageService()

	// Generate a unique clip ID (we'll get the actual ID from DB)
	// For now use a temp ID, we'll update the path after DB insert
	tempID := storage.GenerateID()

	// Generate storage paths
	filePath := clipService.GeneratePath(unit.TenantID, *unit.SiteID, tempID, recordedAt)
	thumbnailPath := clipService.GenerateThumbnailPath(unit.TenantID, *unit.SiteID, tempID, recordedAt)

	// Save the clip file
	fileSize, err := clipService.SaveClipFile(fileData, filePath)
	if err != nil {
		log.Error().Err(err).Str("file_path", filePath).Msg("handler: failed to save clip file")
		respondError(w, "Failed to save clip", http.StatusInternalServerError)
		return
	}

	// Generate thumbnail (non-blocking - placeholder if fails)
	actualThumbnailPath, err := clipService.GenerateThumbnail(filePath, thumbnailPath)
	if err != nil {
		log.Error().Err(err).Msg("handler: thumbnail generation failed")
		// actualThumbnailPath will be placeholder path
	}

	// Create database record
	input := &storage.CreateClipInput{
		TenantID:      unit.TenantID,
		UnitID:        unit.ID,
		SiteID:        *unit.SiteID,
		DetectionID:   detectionID,
		FilePath:      filePath,
		ThumbnailPath: &actualThumbnailPath,
		FileSizeBytes: fileSize,
		RecordedAt:    recordedAt,
	}

	clip, err := storage.CreateClip(r.Context(), conn, input)
	if err != nil {
		log.Error().Err(err).Msg("handler: failed to create clip record")
		// Clean up the saved file
		if removeErr := os.Remove(filePath); removeErr != nil {
			log.Error().Err(removeErr).Str("file_path", filePath).Msg("handler: failed to clean up clip file")
		}
		// Clean up thumbnail if it was created and isn't the placeholder
		if actualThumbnailPath != "" && actualThumbnailPath != clipService.PlaceholderPath {
			if removeErr := os.Remove(actualThumbnailPath); removeErr != nil {
				log.Error().Err(removeErr).Str("thumbnail_path", actualThumbnailPath).Msg("handler: failed to clean up thumbnail")
			}
		}
		respondError(w, "Failed to save clip", http.StatusInternalServerError)
		return
	}

	// If detection was provided, update detection's clip_id reference
	if detectionID != nil {
		if err := storage.UpdateDetectionClipID(r.Context(), conn, *detectionID, clip.ID); err != nil {
			// Non-fatal - log but don't fail the request
			log.Warn().Err(err).Str("detection_id", *detectionID).Str("clip_id", clip.ID).Msg("handler: failed to link clip to detection")
		}
	}

	log.Info().
		Str("clip_id", clip.ID).
		Str("unit_id", unit.ID).
		Str("serial", unit.Serial).
		Int64("file_size", fileSize).
		Str("event", "clip_uploaded").
		Msg("Clip uploaded successfully")

	// Build response (omit internal file paths for security)
	resp := ClipDataResponse{
		Data: ClipResponse{
			ID:              clip.ID,
			UnitID:          clip.UnitID,
			SiteID:          clip.SiteID,
			DetectionID:     clip.DetectionID,
			DurationSeconds: clip.DurationSeconds,
			FileSizeBytes:   clip.FileSizeBytes,
			RecordedAt:      clip.RecordedAt,
			CreatedAt:       clip.CreatedAt,
		},
	}

	respondJSON(w, resp, http.StatusCreated)
}

// ListClips handles GET /api/clips - returns clips for a site with optional filters.
func ListClips(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())

	// Parse required site_id
	siteID := r.URL.Query().Get("site_id")
	if siteID == "" {
		respondError(w, "site_id query parameter is required", http.StatusBadRequest)
		return
	}

	// Validate site exists and belongs to tenant
	_, err := storage.GetSiteByID(r.Context(), conn, siteID)
	if err != nil {
		respondError(w, "Site not found", http.StatusNotFound)
		return
	}

	// Parse optional filters
	params := &storage.ListClipsParams{
		TenantID: tenantID,
		SiteID:   &siteID,
		Page:     1,
		PerPage:  20,
	}

	// Parse unit_id filter
	if unitID := r.URL.Query().Get("unit_id"); unitID != "" {
		params.UnitID = &unitID
	}

	// Parse date range
	if from := r.URL.Query().Get("from"); from != "" {
		t, err := time.Parse(time.RFC3339, from)
		if err != nil {
			// Try date-only format
			t, err = time.Parse("2006-01-02", from)
			if err != nil {
				respondError(w, "Invalid 'from' date format. Use ISO 8601.", http.StatusBadRequest)
				return
			}
		}
		params.From = &t
	}

	if to := r.URL.Query().Get("to"); to != "" {
		t, err := time.Parse(time.RFC3339, to)
		if err != nil {
			// Try date-only format
			t, err = time.Parse("2006-01-02", to)
			if err != nil {
				respondError(w, "Invalid 'to' date format. Use ISO 8601.", http.StatusBadRequest)
				return
			}
			// If date-only, set to end of day
			t = t.Add(24*time.Hour - time.Second)
		}
		params.To = &t
	}

	// Parse pagination
	if page := r.URL.Query().Get("page"); page != "" {
		p, err := strconv.Atoi(page)
		if err != nil || p < 1 {
			respondError(w, "Invalid 'page' parameter", http.StatusBadRequest)
			return
		}
		params.Page = p
	}

	if perPage := r.URL.Query().Get("per_page"); perPage != "" {
		pp, err := strconv.Atoi(perPage)
		if err != nil || pp < 1 || pp > 100 {
			respondError(w, "Invalid 'per_page' parameter (1-100)", http.StatusBadRequest)
			return
		}
		params.PerPage = pp
	}

	// Fetch clips with unit names
	clips, total, err := storage.ListClipsWithUnitName(r.Context(), conn, params)
	if err != nil {
		log.Error().Err(err).Msg("handler: failed to list clips")
		respondError(w, "Failed to fetch clips", http.StatusInternalServerError)
		return
	}

	// Build response
	clipResponses := make([]ClipResponse, len(clips))
	for i, c := range clips {
		clipResponses[i] = ClipResponse{
			ID:              c.ID,
			UnitID:          c.UnitID,
			UnitName:        c.UnitName,
			SiteID:          c.SiteID,
			DetectionID:     c.DetectionID,
			DurationSeconds: c.DurationSeconds,
			FileSizeBytes:   c.FileSizeBytes,
			RecordedAt:      c.RecordedAt,
			CreatedAt:       c.CreatedAt,
			ThumbnailURL:    fmt.Sprintf("/api/clips/%s/thumbnail", c.ID),
		}
	}

	respondJSON(w, ClipsListResponse{
		Data: clipResponses,
		Meta: MetaResponse{
			Total:   total,
			Page:    params.Page,
			PerPage: params.PerPage,
		},
	}, http.StatusOK)
}

// GetClipThumbnail handles GET /api/clips/{id}/thumbnail - serves the clip thumbnail image.
func GetClipThumbnail(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	clipID := chi.URLParam(r, "id")

	if clipID == "" {
		respondError(w, "Clip ID is required", http.StatusBadRequest)
		return
	}

	clipService := getClipStorageService()

	// Get clip from database
	clip, err := storage.GetClip(r.Context(), conn, clipID)
	if err != nil {
		respondError(w, "Clip not found", http.StatusNotFound)
		return
	}

	// Check if thumbnail exists
	if clip.ThumbnailPath == nil || *clip.ThumbnailPath == "" {
		// Use placeholder
		http.ServeFile(w, r, clipService.PlaceholderPath)
		return
	}

	// Security: Validate thumbnail path is within allowed directory
	if !validateFilePath(*clip.ThumbnailPath, clipService) {
		log.Warn().
			Str("clip_id", clipID).
			Str("thumbnail_path", *clip.ThumbnailPath).
			Msg("handler: suspicious thumbnail path detected, possible path traversal")
		http.ServeFile(w, r, clipService.PlaceholderPath)
		return
	}

	// Check if file exists
	if _, err := os.Stat(*clip.ThumbnailPath); os.IsNotExist(err) {
		http.ServeFile(w, r, clipService.PlaceholderPath)
		return
	}

	// Set caching headers - thumbnails don't change
	w.Header().Set("Cache-Control", "public, max-age=86400")
	w.Header().Set("Content-Type", "image/jpeg")

	http.ServeFile(w, r, *clip.ThumbnailPath)
}

// DeleteClip handles DELETE /api/clips/{id} - soft deletes a clip.
func DeleteClip(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	clipID := chi.URLParam(r, "id")

	if clipID == "" {
		respondError(w, "Clip ID is required", http.StatusBadRequest)
		return
	}

	// Verify clip exists (RLS ensures tenant isolation)
	_, err := storage.GetClip(r.Context(), conn, clipID)
	if err != nil {
		log.Debug().Err(err).Str("clip_id", clipID).Msg("handler: clip not found for delete")
		respondError(w, "Clip not found", http.StatusNotFound)
		return
	}

	// Soft delete the clip
	if err := storage.SoftDeleteClip(r.Context(), conn, clipID); err != nil {
		log.Error().Err(err).Str("clip_id", clipID).Msg("handler: failed to soft delete clip")
		respondError(w, "Failed to delete clip", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("clip_id", clipID).
		Str("event", "clip_deleted").
		Msg("Clip soft deleted")

	w.WriteHeader(http.StatusNoContent)
}

// GetClipVideo handles GET /api/clips/{id}/video - serves the clip video file.
// Supports HTTP Range headers for seeking within the video.
// Optional query parameter: download=1 to trigger download instead of inline playback.
func GetClipVideo(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	clipID := chi.URLParam(r, "id")

	if clipID == "" {
		respondError(w, "Clip ID is required", http.StatusBadRequest)
		return
	}

	clipService := getClipStorageService()

	// Get clip from database (RLS ensures tenant isolation)
	clip, err := storage.GetClip(r.Context(), conn, clipID)
	if err != nil {
		log.Debug().Err(err).Str("clip_id", clipID).Msg("handler: clip not found")
		respondError(w, "Clip not found", http.StatusNotFound)
		return
	}

	// Security: Validate file path is within allowed directory
	if !validateFilePath(clip.FilePath, clipService) {
		log.Warn().
			Str("clip_id", clipID).
			Str("file_path", clip.FilePath).
			Msg("handler: suspicious file path detected, possible path traversal attempt")
		respondError(w, "Invalid file path", http.StatusBadRequest)
		return
	}

	// Check if file exists
	fileInfo, err := os.Stat(clip.FilePath)
	if os.IsNotExist(err) {
		log.Warn().Str("clip_id", clipID).Str("file_path", clip.FilePath).Msg("handler: clip file not found on disk")
		respondError(w, "Video file unavailable", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("file_path", clip.FilePath).Msg("handler: failed to stat clip file")
		respondError(w, "Failed to access video file", http.StatusInternalServerError)
		return
	}

	// Open the file
	file, err := os.Open(clip.FilePath)
	if err != nil {
		log.Error().Err(err).Str("file_path", clip.FilePath).Msg("handler: failed to open clip file")
		respondError(w, "Failed to read video file", http.StatusInternalServerError)
		return
	}
	defer file.Close()

	// Set headers for video streaming
	w.Header().Set("Content-Type", "video/mp4")
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("Cache-Control", "public, max-age=3600") // Cache for 1 hour

	// Check if download was requested
	if r.URL.Query().Get("download") == "1" {
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"clip-%s.mp4\"", clipID))
	} else {
		w.Header().Set("Content-Disposition", fmt.Sprintf("inline; filename=\"clip-%s.mp4\"", clipID))
	}

	// Use http.ServeContent which handles Range headers automatically
	http.ServeContent(w, r, clip.FilePath, fileInfo.ModTime(), file)
}
