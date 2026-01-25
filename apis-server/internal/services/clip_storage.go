// Package services provides business logic services for the APIS server.
package services

import (
	"bytes"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/rs/zerolog/log"
)

const (
	// MaxClipSize is the maximum allowed clip file size (10MB).
	MaxClipSize = 10 * 1024 * 1024

	// ThumbnailWidth is the width of generated thumbnails.
	ThumbnailWidth = 320
	// ThumbnailHeight is the height of generated thumbnails.
	ThumbnailHeight = 240
)

// Valid MP4 brand identifiers (at offset 4-8 after ftyp atom start).
var validMP4Brands = []string{"ftyp", "isom", "mp41", "mp42", "avc1", "M4V ", "M4A "}

// ClipStorageService handles file system operations for video clips.
type ClipStorageService struct {
	BasePath        string // Base path for clip storage (e.g., /data/clips)
	PlaceholderPath string // Path to placeholder thumbnail image
}

// NewClipStorageService creates a new ClipStorageService.
func NewClipStorageService(basePath string) *ClipStorageService {
	return &ClipStorageService{
		BasePath:        basePath,
		PlaceholderPath: filepath.Join(basePath, ".placeholder.jpg"),
	}
}

// GeneratePath creates the storage path for a clip file.
// Format: {basePath}/{tenantID}/{siteID}/{YYYY-MM}/{clipID}.mp4
func (s *ClipStorageService) GeneratePath(tenantID, siteID, clipID string, recordedAt time.Time) string {
	yearMonth := recordedAt.Format("2006-01")
	return filepath.Join(s.BasePath, tenantID, siteID, yearMonth, clipID+".mp4")
}

// GenerateThumbnailPath creates the storage path for a clip's thumbnail.
// Format: {basePath}/{tenantID}/{siteID}/{YYYY-MM}/{clipID}.jpg
func (s *ClipStorageService) GenerateThumbnailPath(tenantID, siteID, clipID string, recordedAt time.Time) string {
	yearMonth := recordedAt.Format("2006-01")
	return filepath.Join(s.BasePath, tenantID, siteID, yearMonth, clipID+".jpg")
}

// ValidateMP4 checks if the given data represents a valid MP4 file.
// It checks for the presence of the "ftyp" box which should be at the start.
func ValidateMP4(data []byte) error {
	if len(data) < 12 {
		return fmt.Errorf("file too small to be valid MP4")
	}

	// MP4 files start with a box size (4 bytes) + box type (4 bytes)
	// The first box should be "ftyp" (file type box)
	boxType := string(data[4:8])

	// Check if this is an ftyp box
	if boxType != "ftyp" {
		return fmt.Errorf("not a valid MP4 file: missing ftyp box, found %q", boxType)
	}

	// Read the brand identifier (bytes 8-12)
	if len(data) >= 12 {
		brand := string(data[8:12])
		// Brand should be one of the known MP4 brands
		validBrand := false
		for _, valid := range validMP4Brands {
			if brand == valid || strings.HasPrefix(brand, "M4") || strings.HasPrefix(brand, "mp4") || strings.HasPrefix(brand, "iso") {
				validBrand = true
				break
			}
		}
		if !validBrand {
			log.Debug().Str("brand", brand).Msg("Unknown MP4 brand, but accepting ftyp box")
		}
	}

	return nil
}

// SaveClipFile saves a clip file to the storage path, creating directories as needed.
// Returns the file size and any error.
func (s *ClipStorageService) SaveClipFile(data []byte, filePath string) (int64, error) {
	// Validate MP4 format
	if err := ValidateMP4(data); err != nil {
		return 0, fmt.Errorf("invalid MP4 file: %w", err)
	}

	// Create directory structure
	dir := filepath.Dir(filePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return 0, fmt.Errorf("failed to create directory %s: %w", dir, err)
	}

	// Write file
	if err := os.WriteFile(filePath, data, 0644); err != nil {
		return 0, fmt.Errorf("failed to write clip file: %w", err)
	}

	return int64(len(data)), nil
}

// GenerateThumbnail extracts the first frame from an MP4 file and saves it as JPEG.
// Returns the thumbnail path and any error. If ffmpeg fails, returns placeholder path.
func (s *ClipStorageService) GenerateThumbnail(clipPath, thumbnailPath string) (string, error) {
	// Create directory for thumbnail
	dir := filepath.Dir(thumbnailPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return s.getPlaceholder(), fmt.Errorf("failed to create thumbnail directory: %w", err)
	}

	// Check if ffmpeg is available
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		log.Warn().Msg("ffmpeg not available, using placeholder thumbnail")
		return s.getPlaceholder(), nil
	}

	// Generate thumbnail using ffmpeg
	// -i: input file
	// -vframes 1: extract only 1 frame
	// -vf: video filter for scaling
	// -y: overwrite output file without asking
	cmd := exec.Command("ffmpeg",
		"-i", clipPath,
		"-vframes", "1",
		"-vf", fmt.Sprintf("scale=%d:%d:force_original_aspect_ratio=decrease", ThumbnailWidth, ThumbnailHeight),
		"-y",
		thumbnailPath,
	)

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		log.Error().
			Err(err).
			Str("stderr", stderr.String()).
			Str("clip_path", clipPath).
			Msg("ffmpeg thumbnail generation failed, using placeholder")
		return s.getPlaceholder(), nil
	}

	log.Debug().
		Str("clip_path", clipPath).
		Str("thumbnail_path", thumbnailPath).
		Msg("Thumbnail generated successfully")

	return thumbnailPath, nil
}

// getPlaceholder returns the placeholder thumbnail path, creating it if needed.
func (s *ClipStorageService) getPlaceholder() string {
	// Check if placeholder exists
	if _, err := os.Stat(s.PlaceholderPath); err == nil {
		return s.PlaceholderPath
	}

	// Create a simple placeholder (1x1 gray JPEG)
	// This is a minimal valid JPEG file
	placeholder := []byte{
		0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
		0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
		0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
		0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
		0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
		0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
		0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
		0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
		0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00,
		0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
		0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
		0x09, 0x0A, 0x0B, 0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03,
		0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
		0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
		0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08,
		0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72,
		0x82, 0x09, 0x0A, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28,
		0x29, 0x2A, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44, 0x45,
		0x46, 0x47, 0x48, 0x49, 0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
		0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x73, 0x74, 0x75,
		0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
		0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2, 0xA3,
		0xA4, 0xA5, 0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6,
		0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5, 0xC6, 0xC7, 0xC8, 0xC9,
		0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA, 0xE1, 0xE2,
		0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF1, 0xF2, 0xF3, 0xF4,
		0xF5, 0xF6, 0xF7, 0xF8, 0xF9, 0xFA, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01,
		0x00, 0x00, 0x3F, 0x00, 0xFB, 0xD5, 0xDB, 0x20, 0xA8, 0xBA, 0xB3, 0x32,
		0xCA, 0x60, 0x00, 0x00, 0x00, 0xFF, 0xD9,
	}

	// Try to create placeholder directory and file
	dir := filepath.Dir(s.PlaceholderPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		log.Error().Err(err).Msg("Failed to create placeholder directory")
		return ""
	}

	if err := os.WriteFile(s.PlaceholderPath, placeholder, 0644); err != nil {
		log.Error().Err(err).Msg("Failed to write placeholder image")
		return ""
	}

	return s.PlaceholderPath
}

// DeleteClipFile removes a clip file and its thumbnail from storage.
func (s *ClipStorageService) DeleteClipFile(filePath string, thumbnailPath *string) error {
	// Remove the clip file
	if err := os.Remove(filePath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to delete clip file: %w", err)
	}

	// Remove the thumbnail if it exists and isn't the placeholder
	if thumbnailPath != nil && *thumbnailPath != "" && *thumbnailPath != s.PlaceholderPath {
		if err := os.Remove(*thumbnailPath); err != nil && !os.IsNotExist(err) {
			log.Warn().Err(err).Str("thumbnail_path", *thumbnailPath).Msg("Failed to delete thumbnail")
		}
	}

	return nil
}

// GetFileReader returns an io.ReadSeekCloser for streaming a clip file.
func (s *ClipStorageService) GetFileReader(filePath string) (io.ReadSeekCloser, int64, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to open clip file: %w", err)
	}

	stat, err := file.Stat()
	if err != nil {
		file.Close()
		return nil, 0, fmt.Errorf("failed to stat clip file: %w", err)
	}

	return file, stat.Size(), nil
}
