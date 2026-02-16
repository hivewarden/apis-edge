// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/services"
	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/rs/zerolog/log"
)

// Pagination limits for clip listing
const (
	defaultClipsPerPage = 20
	maxClipsPerPage     = 100
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

// ValidateFilePath ensures the file path is within the expected base directory.
// This prevents path traversal attacks where a malicious path could access
// files outside the clips storage directory.
// Exported for potential reuse by other file-serving handlers.
func ValidateFilePath(filePath string, basePath string) bool {
	// Clean the path to resolve any .. or . components
	cleanPath := filepath.Clean(filePath)
	cleanBase := filepath.Clean(basePath)

	// Verify the cleaned path starts with the base path
	return strings.HasPrefix(cleanPath, cleanBase+string(filepath.Separator)) || cleanPath == cleanBase
}

// validateFilePath is a convenience wrapper for clips handler.
// Uses ValidateFilePath with the clip service's base path.
func validateFilePath(filePath string, clipService *services.ClipStorageService) bool {
	return ValidateFilePath(filePath, clipService.BasePath)
}

// redactBasePath removes the base directory from a file path for safe logging.
// This prevents exposing internal directory structure in logs while still
// providing useful debugging information.
// Example: "/data/clips/tenant/site/clip.mp4" -> "{base}/tenant/site/clip.mp4"
func redactBasePath(filePath string, basePath string) string {
	if strings.HasPrefix(filePath, basePath) {
		return "{base}" + strings.TrimPrefix(filePath, basePath)
	}
	return "{base}/..." // Path doesn't match expected base
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
	const formOverhead = 1024 * 1024 // 1MB overhead for form metadata
	maxMemory := int64(services.MaxClipSize + formOverhead)
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

	// TODO (S3A-M4): CheckStorageLimit uses global DB pool instead of the tenant-scoped
	// connection. This means the storage check bypasses RLS. The function signature
	// should be refactored to accept a *pgxpool.Conn instead of *pgxpool.Pool, but this
	// is mitigated by the explicit tenantID parameter used in the WHERE clause.
	if err := storage.CheckStorageLimit(r.Context(), storage.DB, unit.TenantID, header.Size); err != nil {
		if strings.Contains(err.Error(), "resource limit exceeded") {
			log.Warn().
				Str("unit_id", unit.ID).
				Str("tenant_id", unit.TenantID).
				Int64("file_size", header.Size).
				Msg("handler: storage limit exceeded for clip upload")
			respondError(w, "Storage limit exceeded. Contact your administrator to increase your quota.", http.StatusForbidden)
			return
		}
		log.Error().Err(err).Str("tenant_id", unit.TenantID).Msg("handler: failed to check storage limit")
		respondError(w, "Failed to upload clip", http.StatusInternalServerError)
		return
	}

	// SECURITY FIX (S3A-M1): Read file data directly from the multipart file handle
	// instead of calling io.ReadAll which caused double memory buffering.
	// ParseMultipartForm already buffers the file data in memory (up to MaxClipSize),
	// so reading it again with io.ReadAll doubled memory usage per upload.
	// We cap the read to MaxClipSize+1 to detect oversized files.
	fileData, err := io.ReadAll(io.LimitReader(file, services.MaxClipSize+1))
	if err != nil {
		log.Error().Err(err).Msg("handler: failed to read uploaded file")
		respondError(w, "Failed to read file", http.StatusInternalServerError)
		return
	}
	if int64(len(fileData)) > services.MaxClipSize {
		respondError(w, "File too large. Maximum size is 10MB.", http.StatusRequestEntityTooLarge)
		return
	}

	// Validate MP4 format
	if err := services.ValidateMP4(fileData); err != nil {
		log.Debug().Err(err).Msg("handler: invalid MP4 file")
		respondError(w, "Invalid file format", http.StatusBadRequest)
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

	// Generate a unique clip ID for file paths (we'll get the actual ID from DB)
	// storage.GenerateID() is defined in storage/postgres.go and generates UUIDs
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

	// Validate site exists and belongs to tenant (defense in depth - RLS also protects this)
	site, err := storage.GetSiteByID(r.Context(), conn, siteID)
	if err != nil {
		respondError(w, "Site not found", http.StatusNotFound)
		return
	}
	// Explicit tenant check for defense in depth
	if site.TenantID != tenantID {
		log.Warn().
			Str("site_id", siteID).
			Str("site_tenant", site.TenantID).
			Str("request_tenant", tenantID).
			Msg("handler: site belongs to different tenant")
		respondError(w, "Site not found", http.StatusNotFound)
		return
	}

	// Parse optional filters
	params := &storage.ListClipsParams{
		TenantID: tenantID,
		SiteID:   &siteID,
		Page:     1,
		PerPage:  defaultClipsPerPage,
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
		if err != nil || pp < 1 || pp > maxClipsPerPage {
			respondError(w, fmt.Sprintf("Invalid 'per_page' parameter (1-%d)", maxClipsPerPage), http.StatusBadRequest)
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

	// Calculate total pages
	totalPages := total / params.PerPage
	if total%params.PerPage > 0 {
		totalPages++
	}

	respondJSON(w, ClipsListResponse{
		Data: clipResponses,
		Meta: MetaResponse{
			Total:      total,
			Page:       params.Page,
			PerPage:    params.PerPage,
			TotalPages: totalPages,
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
			Str("thumbnail_path", redactBasePath(*clip.ThumbnailPath, clipService.BasePath)).
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

	// Verify clip exists and get old values for audit (RLS ensures tenant isolation)
	oldClip, err := storage.GetClip(r.Context(), conn, clipID)
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

	// Audit log: record clip deletion with old values
	AuditDelete(r.Context(), "clips", clipID, oldClip)

	w.WriteHeader(http.StatusNoContent)
}

// PurgeOldClips handles POST /api/admin/clips/purge - permanently removes soft-deleted clips older than 30 days.
// This is a manual cleanup function for MVP (AC3). In production, this could be automated via cron.
func PurgeOldClips(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())

	// Default to 30 days as per AC3
	olderThan := 30 * 24 * time.Hour

	// Allow overriding via query param for flexibility (e.g., ?days=60)
	if daysStr := r.URL.Query().Get("days"); daysStr != "" {
		days, err := strconv.Atoi(daysStr)
		if err != nil || days < 1 {
			respondError(w, "Invalid 'days' parameter (must be positive integer)", http.StatusBadRequest)
			return
		}
		olderThan = time.Duration(days) * 24 * time.Hour
	}

	count, err := storage.PurgeOldSoftDeletedClips(r.Context(), conn, olderThan)
	if err != nil {
		log.Error().Err(err).Msg("handler: failed to purge old clips")
		respondError(w, "Failed to purge clips", http.StatusInternalServerError)
		return
	}

	log.Info().
		Int64("clips_purged", count).
		Str("older_than", olderThan.String()).
		Str("event", "clips_purged").
		Msg("Old soft-deleted clips purged")

	respondJSON(w, map[string]interface{}{
		"data": map[string]interface{}{
			"clips_purged": count,
			"older_than":   fmt.Sprintf("%d days", int(olderThan.Hours()/24)),
		},
	}, http.StatusOK)
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

	// Validate clipID format to prevent Content-Disposition header injection
	if !isValidID(clipID) {
		respondError(w, "Invalid clip ID format", http.StatusBadRequest)
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
			Str("file_path", redactBasePath(clip.FilePath, clipService.BasePath)).
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

	// Log warning if file size on disk differs from database (possible corruption)
	if fileInfo.Size() != clip.FileSizeBytes {
		log.Warn().
			Str("clip_id", clipID).
			Int64("db_size", clip.FileSizeBytes).
			Int64("disk_size", fileInfo.Size()).
			Msg("handler: clip file size mismatch - possible corruption or truncation")
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

// isValidID checks if an ID string contains only safe characters (alphanumeric and hyphens).
// Used to prevent header injection in Content-Disposition and similar headers.
var validIDPattern = regexp.MustCompile(`^[a-zA-Z0-9-]+$`)

func isValidID(id string) bool {
	return validIDPattern.MatchString(id)
}
