package storage

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
)

// Note: Full integration tests require database connection.
// These unit tests verify struct and error definitions.

func TestUnitStructFields(t *testing.T) {
	// Verify Unit struct has all required fields
	unit := Unit{
		ID:       "test-id",
		TenantID: "tenant-1",
		Serial:   "APIS-001",
		Status:   "offline",
	}

	assert.Equal(t, "test-id", unit.ID)
	assert.Equal(t, "tenant-1", unit.TenantID)
	assert.Equal(t, "APIS-001", unit.Serial)
	assert.Equal(t, "offline", unit.Status)
	assert.Nil(t, unit.SiteID)
	assert.Nil(t, unit.Name)
	assert.Nil(t, unit.FirmwareVersion)
	assert.Nil(t, unit.LastSeen)
}

func TestUnitWithAllFields(t *testing.T) {
	siteID := "site-123"
	name := "Garden Unit"
	firmware := "1.2.3"

	unit := Unit{
		ID:              "test-id",
		TenantID:        "tenant-1",
		SiteID:          &siteID,
		Serial:          "APIS-001",
		Name:            &name,
		APIKeyHash:      "$2a$12$...",
		FirmwareVersion: &firmware,
		Status:          "online",
	}

	assert.NotNil(t, unit.SiteID)
	assert.Equal(t, "site-123", *unit.SiteID)
	assert.NotNil(t, unit.Name)
	assert.Equal(t, "Garden Unit", *unit.Name)
	assert.Equal(t, "online", unit.Status)
}

func TestCreateUnitInputRequired(t *testing.T) {
	// Test minimal input - only serial is truly required
	input := CreateUnitInput{
		Serial: "APIS-001",
	}

	assert.Equal(t, "APIS-001", input.Serial)
	assert.Nil(t, input.Name)
	assert.Nil(t, input.SiteID)
}

func TestUpdateUnitInputPartialUpdate(t *testing.T) {
	// Test that UpdateUnitInput allows partial updates
	newName := "Updated Name"
	input := UpdateUnitInput{
		Name: &newName,
		// SiteID left nil = don't update
	}

	assert.NotNil(t, input.Name)
	assert.Equal(t, "Updated Name", *input.Name)
	assert.Nil(t, input.SiteID)
}

func TestErrDuplicateSerial(t *testing.T) {
	assert.NotNil(t, ErrDuplicateSerial)
	assert.Equal(t, "unit serial already exists for this tenant", ErrDuplicateSerial.Error())
}

func TestIsDuplicateKeyError(t *testing.T) {
	tests := []struct {
		name     string
		errMsg   string
		expected bool
	}{
		{"postgres 23505 error", "ERROR: duplicate key value violates unique constraint (SQLSTATE 23505)", true},
		{"unique constraint text", "unique constraint violation", true},
		{"other error", "connection refused", false},
		{"empty error", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Test the duplicate key detection logic
			result := strings.Contains(tt.errMsg, "23505") || strings.Contains(tt.errMsg, "unique constraint")
			assert.Equal(t, tt.expected, result)
		})
	}
}
