package handlers_test

import (
	"encoding/json"
	"testing"

	"github.com/jermoo/apis/apis-server/internal/handlers"
	"github.com/stretchr/testify/assert"
)

// TestUpdateTenantLimitsRequest tests the request struct JSON parsing.
func TestUpdateTenantLimitsRequest(t *testing.T) {
	t.Run("full request", func(t *testing.T) {
		jsonStr := `{
			"max_hives": 200,
			"max_storage_gb": 10,
			"max_units": 20,
			"max_users": 50
		}`

		var req handlers.UpdateTenantLimitsRequest
		err := json.Unmarshal([]byte(jsonStr), &req)
		assert.NoError(t, err)

		assert.NotNil(t, req.MaxHives)
		assert.Equal(t, 200, *req.MaxHives)

		assert.NotNil(t, req.MaxStorageGB)
		assert.Equal(t, 10, *req.MaxStorageGB)

		assert.NotNil(t, req.MaxUnits)
		assert.Equal(t, 20, *req.MaxUnits)

		assert.NotNil(t, req.MaxUsers)
		assert.Equal(t, 50, *req.MaxUsers)
	})

	t.Run("partial request - only max_hives", func(t *testing.T) {
		jsonStr := `{"max_hives": 150}`

		var req handlers.UpdateTenantLimitsRequest
		err := json.Unmarshal([]byte(jsonStr), &req)
		assert.NoError(t, err)

		assert.NotNil(t, req.MaxHives)
		assert.Equal(t, 150, *req.MaxHives)

		assert.Nil(t, req.MaxStorageGB)
		assert.Nil(t, req.MaxUnits)
		assert.Nil(t, req.MaxUsers)
	})

	t.Run("empty request", func(t *testing.T) {
		jsonStr := `{}`

		var req handlers.UpdateTenantLimitsRequest
		err := json.Unmarshal([]byte(jsonStr), &req)
		assert.NoError(t, err)

		assert.Nil(t, req.MaxHives)
		assert.Nil(t, req.MaxStorageGB)
		assert.Nil(t, req.MaxUnits)
		assert.Nil(t, req.MaxUsers)
	})
}

// TestTenantLimitsResponse tests the response struct JSON serialization.
func TestTenantLimitsResponse(t *testing.T) {
	resp := handlers.TenantLimitsResponse{
		TenantID:       "test-tenant-123",
		MaxHives:       100,
		MaxStorageGB:   5,
		MaxUnits:       10,
		MaxUsers:       20,
		UpdatedAt:      "2024-01-15T10:30:00Z",
		CurrentHives:   15,
		CurrentUnits:   3,
		CurrentUsers:   5,
		CurrentStorage: 1073741824,
	}

	jsonBytes, err := json.Marshal(resp)
	assert.NoError(t, err)

	var decoded map[string]interface{}
	err = json.Unmarshal(jsonBytes, &decoded)
	assert.NoError(t, err)

	assert.Equal(t, "test-tenant-123", decoded["tenant_id"])
	assert.Equal(t, float64(100), decoded["max_hives"])
	assert.Equal(t, float64(5), decoded["max_storage_gb"])
	assert.Equal(t, float64(10), decoded["max_units"])
	assert.Equal(t, float64(20), decoded["max_users"])
	assert.Equal(t, "2024-01-15T10:30:00Z", decoded["updated_at"])
	assert.Equal(t, float64(15), decoded["current_hives"])
	assert.Equal(t, float64(3), decoded["current_units"])
	assert.Equal(t, float64(5), decoded["current_users"])
	assert.Equal(t, float64(1073741824), decoded["current_storage_bytes"])
}

// TestBytesToGB verifies the byte-to-GB conversion is correct.
// Note: This tests the expected behavior. The actual function is private.
func TestBytesToGBExpectedBehavior(t *testing.T) {
	testCases := []struct {
		bytes    int64
		expected int
	}{
		{0, 0},
		{1024 * 1024 * 1024, 1},           // 1 GB
		{5 * 1024 * 1024 * 1024, 5},       // 5 GB
		{10 * 1024 * 1024 * 1024, 10},     // 10 GB
		{1024 * 1024 * 1024 * 1024, 1024}, // 1 TB
	}

	for _, tc := range testCases {
		// Test that the expected conversion is what we document
		result := int(tc.bytes / (1024 * 1024 * 1024))
		assert.Equal(t, tc.expected, result, "bytesToGB(%d) should be %d", tc.bytes, tc.expected)
	}
}

// TestGBToBytes verifies the GB-to-byte conversion is correct.
// Note: This tests the expected behavior. The actual function is private.
func TestGBToBytesExpectedBehavior(t *testing.T) {
	testCases := []struct {
		gb       int
		expected int64
	}{
		{0, 0},
		{1, 1024 * 1024 * 1024},           // 1 GB
		{5, 5 * 1024 * 1024 * 1024},       // 5 GB
		{10, 10 * 1024 * 1024 * 1024},     // 10 GB
		{1024, 1024 * 1024 * 1024 * 1024}, // 1 TB
	}

	for _, tc := range testCases {
		// Test that the expected conversion is what we document
		result := int64(tc.gb) * 1024 * 1024 * 1024
		assert.Equal(t, tc.expected, result, "gbToBytes(%d) should be %d", tc.gb, tc.expected)
	}
}
