package services

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestGeneratePath(t *testing.T) {
	service := NewClipStorageService("/data/clips")

	tests := []struct {
		name       string
		tenantID   string
		siteID     string
		clipID     string
		recordedAt time.Time
		expected   string
	}{
		{
			name:       "basic path generation",
			tenantID:   "tenant123",
			siteID:     "site456",
			clipID:     "clip789",
			recordedAt: time.Date(2026, 1, 15, 14, 30, 0, 0, time.UTC),
			expected:   "/data/clips/tenant123/site456/2026-01/clip789.mp4",
		},
		{
			name:       "different month",
			tenantID:   "tenant123",
			siteID:     "site456",
			clipID:     "clipabc",
			recordedAt: time.Date(2025, 12, 31, 23, 59, 59, 0, time.UTC),
			expected:   "/data/clips/tenant123/site456/2025-12/clipabc.mp4",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := service.GeneratePath(tt.tenantID, tt.siteID, tt.clipID, tt.recordedAt)
			if result != tt.expected {
				t.Errorf("GeneratePath() = %q, want %q", result, tt.expected)
			}
		})
	}
}

func TestGenerateThumbnailPath(t *testing.T) {
	service := NewClipStorageService("/data/clips")

	tests := []struct {
		name       string
		tenantID   string
		siteID     string
		clipID     string
		recordedAt time.Time
		expected   string
	}{
		{
			name:       "basic thumbnail path",
			tenantID:   "tenant123",
			siteID:     "site456",
			clipID:     "clip789",
			recordedAt: time.Date(2026, 1, 15, 14, 30, 0, 0, time.UTC),
			expected:   "/data/clips/tenant123/site456/2026-01/clip789.jpg",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := service.GenerateThumbnailPath(tt.tenantID, tt.siteID, tt.clipID, tt.recordedAt)
			if result != tt.expected {
				t.Errorf("GenerateThumbnailPath() = %q, want %q", result, tt.expected)
			}
		})
	}
}

func TestValidateMP4(t *testing.T) {
	tests := []struct {
		name    string
		data    []byte
		wantErr bool
	}{
		{
			name:    "valid MP4 with isom brand",
			data:    []byte{0x00, 0x00, 0x00, 0x1C, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm', 0x00, 0x00, 0x02, 0x00},
			wantErr: false,
		},
		{
			name:    "valid MP4 with mp42 brand",
			data:    []byte{0x00, 0x00, 0x00, 0x1C, 'f', 't', 'y', 'p', 'm', 'p', '4', '2', 0x00, 0x00, 0x00, 0x00},
			wantErr: false,
		},
		{
			name:    "invalid - not an MP4",
			data:    []byte{0x00, 0x00, 0x00, 0x1C, 'm', 'o', 'o', 'v', 0x00, 0x00, 0x00, 0x00},
			wantErr: true,
		},
		{
			name:    "too small",
			data:    []byte{0x00, 0x00, 0x00},
			wantErr: true,
		},
		{
			name:    "empty data",
			data:    []byte{},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateMP4(tt.data)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateMP4() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestSaveClipFile(t *testing.T) {
	// Create temporary directory for test
	tmpDir, err := os.MkdirTemp("", "clip_storage_test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	service := NewClipStorageService(tmpDir)

	// Create a minimal valid MP4 header
	validMP4 := []byte{0x00, 0x00, 0x00, 0x1C, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm', 0x00, 0x00, 0x02, 0x00}

	t.Run("saves valid MP4 file", func(t *testing.T) {
		filePath := filepath.Join(tmpDir, "tenant1", "site1", "2026-01", "test.mp4")
		size, err := service.SaveClipFile(validMP4, filePath)
		if err != nil {
			t.Errorf("SaveClipFile() error = %v", err)
		}
		if size != int64(len(validMP4)) {
			t.Errorf("SaveClipFile() size = %d, want %d", size, len(validMP4))
		}

		// Verify file exists
		if _, err := os.Stat(filePath); os.IsNotExist(err) {
			t.Error("SaveClipFile() did not create file")
		}
	})

	t.Run("rejects invalid MP4", func(t *testing.T) {
		invalidData := []byte{0x00, 0x00, 0x00, 0x00, 'n', 'o', 't', ' ', 'm', 'p', '4', '!'}
		filePath := filepath.Join(tmpDir, "tenant2", "site2", "2026-01", "invalid.mp4")
		_, err := service.SaveClipFile(invalidData, filePath)
		if err == nil {
			t.Error("SaveClipFile() expected error for invalid MP4")
		}
	})
}

func TestGetPlaceholder(t *testing.T) {
	// Create temporary directory for test
	tmpDir, err := os.MkdirTemp("", "clip_storage_test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	service := NewClipStorageService(tmpDir)

	// Call getPlaceholder
	placeholderPath := service.getPlaceholder()

	if placeholderPath == "" {
		t.Error("getPlaceholder() returned empty path")
	}

	// Verify placeholder file was created
	if _, err := os.Stat(placeholderPath); os.IsNotExist(err) {
		t.Error("getPlaceholder() did not create placeholder file")
	}
}
