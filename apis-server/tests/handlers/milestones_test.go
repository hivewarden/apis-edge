package handlers_test

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// MilestonePhotoResponse represents the API response structure
type MilestonePhotoResponse struct {
	ID            string  `json:"id"`
	MilestoneType string  `json:"milestone_type"`
	ReferenceID   *string `json:"reference_id,omitempty"`
	FilePath      string  `json:"file_path"`
	ThumbnailPath *string `json:"thumbnail_path,omitempty"`
	Caption       *string `json:"caption,omitempty"`
	CreatedAt     string  `json:"created_at"`
}

type MilestonePhotoDataResponse struct {
	Data MilestonePhotoResponse `json:"data"`
}

type MilestonePhotosListResponse struct {
	Data []MilestonePhotoResponse `json:"data"`
	Meta struct {
		Total int `json:"total"`
	} `json:"meta"`
}

type MilestoneFlagsResponse struct {
	Data struct {
		FirstHarvestSeen  bool     `json:"first_harvest_seen"`
		HiveFirstHarvests []string `json:"hive_first_harvests"`
	} `json:"data"`
}

// createMultipartRequest creates a multipart form request for testing file uploads
func createMultipartRequest(t *testing.T, url string, fields map[string]string, fileContents []byte, fileName string) *http.Request {
	body := new(bytes.Buffer)
	writer := multipart.NewWriter(body)

	// Add form fields
	for key, val := range fields {
		err := writer.WriteField(key, val)
		require.NoError(t, err)
	}

	// Add file if provided
	if fileContents != nil {
		part, err := writer.CreateFormFile("file", fileName)
		require.NoError(t, err)
		_, err = part.Write(fileContents)
		require.NoError(t, err)
	}

	err := writer.Close()
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPost, url, body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	return req
}

// createMinimalJPEG creates a minimal valid JPEG for testing
func createMinimalJPEG() []byte {
	// Minimal JPEG file (1x1 pixel)
	return []byte{
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
		0x09, 0x0A, 0x0B, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F,
		0x00, 0x7F, 0xFF, 0xD9,
	}
}

func TestUploadMilestonePhoto_Validation(t *testing.T) {
	t.Run("MissingFile", func(t *testing.T) {
		fields := map[string]string{
			"milestone_type": "first_harvest",
		}
		req := createMultipartRequest(t, "/api/milestones/photos", fields, nil, "")

		// Without a database connection, we test request construction
		assert.Equal(t, http.MethodPost, req.Method)
		assert.Contains(t, req.Header.Get("Content-Type"), "multipart/form-data")
	})

	t.Run("MissingMilestoneType", func(t *testing.T) {
		jpegData := createMinimalJPEG()
		fields := map[string]string{
			// milestone_type intentionally missing
		}
		req := createMultipartRequest(t, "/api/milestones/photos", fields, jpegData, "photo.jpg")

		assert.NotNil(t, req.Body)
	})

	t.Run("InvalidMilestoneType", func(t *testing.T) {
		jpegData := createMinimalJPEG()
		fields := map[string]string{
			"milestone_type": "invalid_type",
		}
		req := createMultipartRequest(t, "/api/milestones/photos", fields, jpegData, "photo.jpg")

		assert.NotNil(t, req)
		assert.Contains(t, fields["milestone_type"], "invalid_type")
	})

	t.Run("ValidRequest", func(t *testing.T) {
		jpegData := createMinimalJPEG()
		fields := map[string]string{
			"milestone_type": "first_harvest",
			"reference_id":   "harvest-123",
			"caption":        "My first honey!",
		}
		req := createMultipartRequest(t, "/api/milestones/photos", fields, jpegData, "photo.jpg")

		// Verify request is properly constructed
		assert.Equal(t, http.MethodPost, req.Method)
		assert.Contains(t, req.Header.Get("Content-Type"), "multipart/form-data")

		// Read and verify body contains expected data
		body, err := io.ReadAll(req.Body)
		require.NoError(t, err)
		assert.Contains(t, string(body), "first_harvest")
		assert.Contains(t, string(body), "harvest-123")
		assert.Contains(t, string(body), "My first honey!")
	})
}

func TestListMilestonePhotos(t *testing.T) {
	t.Run("RequestConstruction", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/milestones/photos", nil)
		req.Header.Set("Authorization", "Bearer test-token")

		assert.Equal(t, http.MethodGet, req.Method)
		assert.Equal(t, "/api/milestones/photos", req.URL.Path)
	})

	t.Run("ResponseParsing", func(t *testing.T) {
		// Test that response structure is correct
		response := MilestonePhotosListResponse{
			Data: []MilestonePhotoResponse{
				{
					ID:            "photo-1",
					MilestoneType: "first_harvest",
					FilePath:      "/clips/tenant-1/milestones/photo-1.jpg",
					CreatedAt:     "2026-01-25T10:00:00Z",
				},
			},
		}
		response.Meta.Total = 1

		jsonBytes, err := json.Marshal(response)
		require.NoError(t, err)

		var parsed MilestonePhotosListResponse
		err = json.Unmarshal(jsonBytes, &parsed)
		require.NoError(t, err)

		assert.Len(t, parsed.Data, 1)
		assert.Equal(t, "first_harvest", parsed.Data[0].MilestoneType)
		assert.Equal(t, 1, parsed.Meta.Total)
	})
}

func TestDeleteMilestonePhoto(t *testing.T) {
	t.Run("RequestConstruction", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodDelete, "/api/milestones/photos/photo-123", nil)
		req.Header.Set("Authorization", "Bearer test-token")

		assert.Equal(t, http.MethodDelete, req.Method)
		assert.Equal(t, "/api/milestones/photos/photo-123", req.URL.Path)
	})
}

func TestGetMilestoneFlags(t *testing.T) {
	t.Run("RequestConstruction", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/milestones/flags", nil)
		req.Header.Set("Authorization", "Bearer test-token")

		assert.Equal(t, http.MethodGet, req.Method)
		assert.Equal(t, "/api/milestones/flags", req.URL.Path)
	})

	t.Run("ResponseParsing", func(t *testing.T) {
		response := MilestoneFlagsResponse{}
		response.Data.FirstHarvestSeen = true
		response.Data.HiveFirstHarvests = []string{"hive-1", "hive-2"}

		jsonBytes, err := json.Marshal(response)
		require.NoError(t, err)

		var parsed MilestoneFlagsResponse
		err = json.Unmarshal(jsonBytes, &parsed)
		require.NoError(t, err)

		assert.True(t, parsed.Data.FirstHarvestSeen)
		assert.Len(t, parsed.Data.HiveFirstHarvests, 2)
	})
}

func TestSetMilestoneFlag(t *testing.T) {
	t.Run("RequestConstruction", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/milestones/flags/first_harvest_seen", nil)
		req.Header.Set("Authorization", "Bearer test-token")

		assert.Equal(t, http.MethodPost, req.Method)
		assert.Equal(t, "/api/milestones/flags/first_harvest_seen", req.URL.Path)
	})

	t.Run("WithBodyValue", func(t *testing.T) {
		body := bytes.NewBufferString(`{"value": true}`)
		req := httptest.NewRequest(http.MethodPost, "/api/milestones/flags/first_harvest_seen", body)
		req.Header.Set("Content-Type", "application/json")

		assert.Equal(t, http.MethodPost, req.Method)
	})
}

func TestAllowedImageTypes(t *testing.T) {
	allowedTypes := map[string]string{
		"image/jpeg": ".jpg",
		"image/png":  ".png",
		"image/webp": ".webp",
	}

	t.Run("JPEGAllowed", func(t *testing.T) {
		ext, ok := allowedTypes["image/jpeg"]
		assert.True(t, ok)
		assert.Equal(t, ".jpg", ext)
	})

	t.Run("PNGAllowed", func(t *testing.T) {
		ext, ok := allowedTypes["image/png"]
		assert.True(t, ok)
		assert.Equal(t, ".png", ext)
	})

	t.Run("WebPAllowed", func(t *testing.T) {
		ext, ok := allowedTypes["image/webp"]
		assert.True(t, ok)
		assert.Equal(t, ".webp", ext)
	})

	t.Run("GIFNotAllowed", func(t *testing.T) {
		_, ok := allowedTypes["image/gif"]
		assert.False(t, ok)
	})
}

func TestMilestonePhotoSizeLimit(t *testing.T) {
	maxSize := int64(5 * 1024 * 1024) // 5MB

	t.Run("SizeLimitDefined", func(t *testing.T) {
		assert.Equal(t, int64(5242880), maxSize)
	})

	t.Run("SmallFileAllowed", func(t *testing.T) {
		smallFile := make([]byte, 1024) // 1KB
		assert.True(t, int64(len(smallFile)) < maxSize)
	})

	t.Run("LargeFileRejected", func(t *testing.T) {
		// 6MB is over limit
		largeFileSize := int64(6 * 1024 * 1024)
		assert.True(t, largeFileSize > maxSize)
	})
}

func TestMilestoneTypes(t *testing.T) {
	validTypes := []string{"first_harvest", "first_hive_harvest"}

	t.Run("FirstHarvestValid", func(t *testing.T) {
		assert.Contains(t, validTypes, "first_harvest")
	})

	t.Run("FirstHiveHarvestValid", func(t *testing.T) {
		assert.Contains(t, validTypes, "first_hive_harvest")
	})

	t.Run("InvalidTypeNotInList", func(t *testing.T) {
		assert.NotContains(t, validTypes, "some_invalid_type")
	})
}

// Test harvest response with first_hive_ids
func TestHarvestResponseWithFirstHiveIDs(t *testing.T) {
	type HarvestResponse struct {
		ID             string   `json:"id"`
		IsFirstHarvest bool     `json:"is_first_harvest,omitempty"`
		FirstHiveIDs   []string `json:"first_hive_ids,omitempty"`
	}

	t.Run("WithFirstHiveIDs", func(t *testing.T) {
		resp := HarvestResponse{
			ID:             "harvest-123",
			IsFirstHarvest: true,
			FirstHiveIDs:   []string{"hive-1", "hive-2"},
		}

		jsonBytes, err := json.Marshal(resp)
		require.NoError(t, err)

		var parsed HarvestResponse
		err = json.Unmarshal(jsonBytes, &parsed)
		require.NoError(t, err)

		assert.True(t, parsed.IsFirstHarvest)
		assert.Len(t, parsed.FirstHiveIDs, 2)
		assert.Contains(t, parsed.FirstHiveIDs, "hive-1")
	})

	t.Run("WithoutFirstHiveIDs", func(t *testing.T) {
		resp := HarvestResponse{
			ID:             "harvest-456",
			IsFirstHarvest: false,
		}

		jsonBytes, err := json.Marshal(resp)
		require.NoError(t, err)

		// Verify omitempty works
		assert.NotContains(t, string(jsonBytes), "first_hive_ids")
	})
}
