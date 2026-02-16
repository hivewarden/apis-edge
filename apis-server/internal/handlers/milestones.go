// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/rs/zerolog/log"
)

const (
	// MaxMilestonePhotoSize is the maximum allowed photo size (5MB).
	MaxMilestonePhotoSize = 5 * 1024 * 1024

	// MilestonePhotoThumbnailWidth is the width of generated thumbnails.
	MilestonePhotoThumbnailWidth = 320
)

// Allowed image MIME types for milestone photos.
var allowedImageTypes = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
}

// MilestonePhotoResponse represents a milestone photo in API responses.
// SECURITY FIX (S3A-H1): Returns API-relative URLs instead of internal file paths
// to prevent exposing internal filesystem structure.
type MilestonePhotoResponse struct {
	ID            string  `json:"id"`
	MilestoneType string  `json:"milestone_type"`
	ReferenceID   *string `json:"reference_id,omitempty"`
	PhotoURL      string  `json:"photo_url"`
	ThumbnailURL  *string `json:"thumbnail_url,omitempty"`
	Caption       *string `json:"caption,omitempty"`
	CreatedAt     string  `json:"created_at"`
}

// MilestonePhotosListResponse represents the list milestone photos API response.
type MilestonePhotosListResponse struct {
	Data []MilestonePhotoResponse `json:"data"`
	Meta MetaResponse             `json:"meta"`
}

// MilestonePhotoDataResponse represents a single milestone photo API response.
type MilestonePhotoDataResponse struct {
	Data MilestonePhotoResponse `json:"data"`
}

// MilestoneFlagsResponse represents the milestone flags API response.
type MilestoneFlagsResponse struct {
	Data storage.MilestoneFlags `json:"data"`
}

// milestonePhotoToResponse converts a storage.MilestonePhoto to a MilestonePhotoResponse.
// SECURITY FIX (S3A-H1): Returns API-relative URLs instead of raw file paths.
func milestonePhotoToResponse(p *storage.MilestonePhoto) MilestonePhotoResponse {
	photoURL := fmt.Sprintf("/api/milestones/photos/%s/image", p.ID)
	var thumbnailURL *string
	if p.ThumbnailPath != nil {
		u := fmt.Sprintf("/api/milestones/photos/%s/thumbnail", p.ID)
		thumbnailURL = &u
	}
	return MilestonePhotoResponse{
		ID:            p.ID,
		MilestoneType: p.MilestoneType,
		ReferenceID:   p.ReferenceID,
		PhotoURL:      photoURL,
		ThumbnailURL:  thumbnailURL,
		Caption:       p.Caption,
		CreatedAt:     p.CreatedAt.Format(time.RFC3339),
	}
}

// getMilestoneStoragePath returns the storage path for milestone photos.
func getMilestoneStoragePath() string {
	basePath := os.Getenv("CLIP_STORAGE_PATH")
	if basePath == "" {
		basePath = "/data/clips"
	}
	return basePath
}

// UploadMilestonePhoto handles POST /api/milestones/photos - uploads a milestone photo.
func UploadMilestonePhoto(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())

	// Parse multipart form with size limit
	if err := r.ParseMultipartForm(MaxMilestonePhotoSize); err != nil {
		respondError(w, "File too large or invalid form data", http.StatusBadRequest)
		return
	}

	// Get the file from the form
	file, header, err := r.FormFile("file")
	if err != nil {
		respondError(w, "No file provided", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Validate file size
	if header.Size > MaxMilestonePhotoSize {
		respondError(w, fmt.Sprintf("File too large. Maximum size is %d MB", MaxMilestonePhotoSize/(1024*1024)), http.StatusBadRequest)
		return
	}

	// Validate file type by sniffing actual content (not trusting Content-Type header)
	// This prevents malicious uploads with spoofed Content-Type headers
	sniffBuffer := make([]byte, 512)
	n, err := file.Read(sniffBuffer)
	if err != nil && err != io.EOF {
		respondError(w, "Failed to read file", http.StatusBadRequest)
		return
	}
	detectedType := http.DetectContentType(sniffBuffer[:n])
	ext, ok := allowedImageTypes[detectedType]
	if !ok {
		respondError(w, "Invalid file type. Only JPEG, PNG, and WebP images are allowed", http.StatusBadRequest)
		return
	}
	// Seek back to beginning for full file copy
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		respondError(w, "Failed to process file", http.StatusInternalServerError)
		return
	}

	// Get form fields
	milestoneType := r.FormValue("milestone_type")
	if milestoneType == "" {
		respondError(w, "milestone_type is required", http.StatusBadRequest)
		return
	}

	// Validate milestone type
	validTypes := []string{"first_harvest", "first_hive_harvest"}
	isValidType := false
	for _, vt := range validTypes {
		if milestoneType == vt {
			isValidType = true
			break
		}
	}
	if !isValidType {
		respondError(w, "Invalid milestone_type. Must be 'first_harvest' or 'first_hive_harvest'", http.StatusBadRequest)
		return
	}

	referenceID := r.FormValue("reference_id")
	caption := r.FormValue("caption")

	// FIX (S3A-L6): Validate caption length to prevent excessive database storage.
	if len(caption) > 500 {
		respondError(w, "Caption must not exceed 500 characters", http.StatusBadRequest)
		return
	}

	// Generate unique ID for the photo
	photoID := uuid.New().String()

	// Create storage directory
	basePath := getMilestoneStoragePath()
	photoDir := filepath.Join(basePath, tenantID, "milestones")
	if err := os.MkdirAll(photoDir, 0755); err != nil {
		log.Error().Err(err).Str("path", photoDir).Msg("handler: failed to create milestone photo directory")
		respondError(w, "Failed to create storage directory", http.StatusInternalServerError)
		return
	}

	// Save the photo file
	photoPath := filepath.Join(photoDir, photoID+ext)
	dst, err := os.Create(photoPath)
	if err != nil {
		log.Error().Err(err).Str("path", photoPath).Msg("handler: failed to create photo file")
		respondError(w, "Failed to save photo", http.StatusInternalServerError)
		return
	}

	written, err := io.Copy(dst, file)
	dst.Close()
	if err != nil {
		os.Remove(photoPath)
		log.Error().Err(err).Str("path", photoPath).Msg("handler: failed to write photo file")
		respondError(w, "Failed to save photo", http.StatusInternalServerError)
		return
	}

	log.Debug().
		Str("photo_id", photoID).
		Int64("bytes", written).
		Str("path", photoPath).
		Msg("Milestone photo saved")

	// Note: Thumbnail generation intentionally omitted.
	// The frontend handles responsive images via CSS max-width/object-fit.
	// This avoids storing duplicate files and simplifies the codebase.
	// If real thumbnails are needed later, use an image processing library.

	// Construct relative path for database storage
	relativePhotoPath := filepath.Join("/clips", tenantID, "milestones", photoID+ext)

	// Prepare input
	var refIDPtr *string
	if referenceID != "" {
		refIDPtr = &referenceID
	}

	var captionPtr *string
	if caption != "" {
		captionPtr = &caption
	}

	input := &storage.CreateMilestonePhotoInput{
		MilestoneType: milestoneType,
		ReferenceID:   refIDPtr,
		FilePath:      relativePhotoPath,
		ThumbnailPath: nil, // No separate thumbnail - frontend handles responsive images
		Caption:       captionPtr,
	}

	photo, err := storage.CreateMilestonePhoto(r.Context(), conn, tenantID, input)
	if err != nil {
		log.Error().Err(err).Str("tenant_id", tenantID).Msg("handler: failed to create milestone photo record")
		// Clean up file on database error
		os.Remove(photoPath)
		respondError(w, "Failed to save milestone photo", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("photo_id", photo.ID).
		Str("tenant_id", tenantID).
		Str("milestone_type", milestoneType).
		Msg("Milestone photo uploaded")

	respondJSON(w, MilestonePhotoDataResponse{Data: milestonePhotoToResponse(photo)}, http.StatusCreated)
}

// ListMilestonePhotos handles GET /api/milestones/photos - lists all milestone photos.
func ListMilestonePhotos(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())

	photos, err := storage.ListMilestonePhotos(r.Context(), conn, tenantID)
	if err != nil {
		log.Error().Err(err).Str("tenant_id", tenantID).Msg("handler: failed to list milestone photos")
		respondError(w, "Failed to list milestone photos", http.StatusInternalServerError)
		return
	}

	// Convert to response format
	responses := make([]MilestonePhotoResponse, 0, len(photos))
	for _, p := range photos {
		responses = append(responses, milestonePhotoToResponse(&p))
	}

	respondJSON(w, MilestonePhotosListResponse{
		Data: responses,
		Meta: MetaResponse{Total: len(responses)},
	}, http.StatusOK)
}

// DeleteMilestonePhoto handles DELETE /api/milestones/photos/{id} - deletes a milestone photo.
func DeleteMilestonePhoto(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())
	photoID := chi.URLParam(r, "id")

	if photoID == "" {
		respondError(w, "Photo ID is required", http.StatusBadRequest)
		return
	}

	// Get the photo to find file paths before deleting
	photo, err := storage.GetMilestonePhoto(r.Context(), conn, photoID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Milestone photo not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("photo_id", photoID).Msg("handler: failed to get milestone photo")
		respondError(w, "Failed to get milestone photo", http.StatusInternalServerError)
		return
	}

	// Verify tenant ownership
	if photo.TenantID != tenantID {
		respondError(w, "Milestone photo not found", http.StatusNotFound)
		return
	}

	// Delete database record
	err = storage.DeleteMilestonePhoto(r.Context(), conn, photoID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Milestone photo not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("photo_id", photoID).Msg("handler: failed to delete milestone photo")
		respondError(w, "Failed to delete milestone photo", http.StatusInternalServerError)
		return
	}

	// Delete files from disk
	// SECURITY FIX (S3A-H3): Validate file path before deletion to prevent path traversal
	basePath := getMilestoneStoragePath()
	// Convert relative path back to absolute
	filePath := strings.Replace(photo.FilePath, "/clips/", basePath+"/", 1)
	if !ValidateFilePath(filePath, basePath) {
		log.Error().Str("path", filePath).Str("base", basePath).Msg("handler: path traversal attempt in milestone deletion")
	} else if err := os.Remove(filePath); err != nil && !os.IsNotExist(err) {
		log.Warn().Err(err).Msg("Failed to delete milestone photo file")
	}

	if photo.ThumbnailPath != nil {
		thumbPath := strings.Replace(*photo.ThumbnailPath, "/clips/", basePath+"/", 1)
		if !ValidateFilePath(thumbPath, basePath) {
			log.Error().Str("path", thumbPath).Str("base", basePath).Msg("handler: path traversal attempt in milestone thumbnail deletion")
		} else if err := os.Remove(thumbPath); err != nil && !os.IsNotExist(err) {
			log.Warn().Err(err).Msg("Failed to delete milestone thumbnail file")
		}
	}

	log.Info().
		Str("photo_id", photoID).
		Str("tenant_id", tenantID).
		Msg("Milestone photo deleted")

	w.WriteHeader(http.StatusNoContent)
}

// GetMilestoneFlags handles GET /api/milestones/flags - returns user's milestone flags.
func GetMilestoneFlags(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())

	flags, err := storage.GetMilestoneFlags(r.Context(), conn, tenantID)
	if err != nil {
		log.Error().Err(err).Str("tenant_id", tenantID).Msg("handler: failed to get milestone flags")
		respondError(w, "Failed to get milestone flags", http.StatusInternalServerError)
		return
	}

	respondJSON(w, MilestoneFlagsResponse{Data: *flags}, http.StatusOK)
}

// SetMilestoneFlag handles POST /api/milestones/flags/{flag} - marks a milestone as seen.
func SetMilestoneFlag(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())
	flag := chi.URLParam(r, "flag")

	if flag == "" {
		respondError(w, "Flag name is required", http.StatusBadRequest)
		return
	}

	// Validate flag name
	validFlags := []string{"first_harvest_seen"}
	isValid := false
	for _, vf := range validFlags {
		if flag == vf {
			isValid = true
			break
		}
	}
	if !isValid {
		respondError(w, "Invalid flag name", http.StatusBadRequest)
		return
	}

	// Optionally parse request body for value (default to true)
	value := true
	if r.ContentLength > 0 {
		var body struct {
			Value bool `json:"value"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err == nil {
			value = body.Value
		}
	}

	err := storage.SetMilestoneFlag(r.Context(), conn, tenantID, flag, value)
	if err != nil {
		log.Error().Err(err).Str("tenant_id", tenantID).Str("flag", flag).Msg("handler: failed to set milestone flag")
		respondError(w, "Failed to set milestone flag", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("tenant_id", tenantID).
		Str("flag", flag).
		Bool("value", value).
		Msg("Milestone flag set")

	w.WriteHeader(http.StatusNoContent)
}
