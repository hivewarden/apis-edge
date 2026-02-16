package storage_test

import (
	"context"
	"testing"
	"time"

	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIsValidCategory(t *testing.T) {
	tests := []struct {
		category string
		valid    bool
	}{
		{"feed", true},
		{"treatment", true},
		{"equipment", true},
		{"issue", true},
		{"invalid", false},
		{"", false},
		{"FEED", false}, // case sensitive
	}

	for _, tt := range tests {
		t.Run(tt.category, func(t *testing.T) {
			result := storage.IsValidCategory(tt.category)
			assert.Equal(t, tt.valid, result)
		})
	}
}

func TestCustomLabelStruct(t *testing.T) {
	label := storage.CustomLabel{
		ID:        "test-id",
		TenantID:  "tenant-1",
		Category:  "treatment",
		Name:      "Thymovar",
		CreatedAt: time.Now(),
		DeletedAt: nil,
	}

	assert.Equal(t, "test-id", label.ID)
	assert.Equal(t, "tenant-1", label.TenantID)
	assert.Equal(t, "treatment", label.Category)
	assert.Equal(t, "Thymovar", label.Name)
	assert.Nil(t, label.DeletedAt)
}

func TestCreateLabelInput(t *testing.T) {
	input := storage.CreateLabelInput{
		Category: "feed",
		Name:     "Honey-B-Healthy",
	}

	assert.Equal(t, "feed", input.Category)
	assert.Equal(t, "Honey-B-Healthy", input.Name)
}

func TestUpdateLabelInput(t *testing.T) {
	input := storage.UpdateLabelInput{
		Name: "New Name",
	}

	assert.Equal(t, "New Name", input.Name)
}

func TestLabelUsageCount(t *testing.T) {
	usage := storage.LabelUsageCount{
		Total:      10,
		Treatments: 5,
		Feedings:   3,
		Equipment:  2,
	}

	assert.Equal(t, 10, usage.Total)
	assert.Equal(t, 5, usage.Treatments)
	assert.Equal(t, 3, usage.Feedings)
	assert.Equal(t, 2, usage.Equipment)
}

func TestValidCategories(t *testing.T) {
	expected := []string{"feed", "treatment", "equipment", "issue"}
	assert.Equal(t, expected, storage.ValidCategories)
}

// Integration tests would require a test database connection
// These would be placed in a separate integration test file

func TestCreateLabelIntegration(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}

	// This test requires a running PostgreSQL database
	// Setup would include:
	// 1. Create test database connection
	// 2. Run migrations
	// 3. Create test tenant
	// 4. Test CreateLabel
	// 5. Verify label exists
	// 6. Clean up

	t.Skip("Requires database connection - implement with test fixtures")
}

func TestListLabelsByCategoryIntegration(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}

	t.Skip("Requires database connection - implement with test fixtures")
}

func TestUpdateLabelCascadeIntegration(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}

	// This test should verify that updating a label name
	// cascades the change to all historical records (AC #3)
	//
	// Steps:
	// 1. Create a custom label "Thymovar" in treatment category
	// 2. Create several treatment records using "Thymovar" type
	// 3. Update label name to "ThymovarPlus"
	// 4. Verify custom_labels table has new name
	// 5. Verify ALL treatment records now have "ThymovarPlus" type

	t.Skip("Requires database connection - implement with test fixtures")
}

func TestDeleteLabelSoftDeleteIntegration(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}

	// This test should verify soft delete behavior:
	// 1. Create a label
	// 2. Delete it
	// 3. Verify deleted_at is set (not NULL)
	// 4. Verify label no longer appears in ListLabelsByCategory
	// 5. Verify label can still be retrieved by ID (for historical purposes)

	t.Skip("Requires database connection - implement with test fixtures")
}

func TestTenantIsolationIntegration(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}

	// This test should verify tenant isolation:
	// 1. Create label for tenant A
	// 2. Try to get/update/delete with tenant B
	// 3. Verify ErrNotFound is returned
	// 4. Verify label still exists for tenant A

	t.Skip("Requires database connection - implement with test fixtures")
}

// Helper to create a test context
func testContext() context.Context {
	return context.Background()
}

// Ensure ErrNotFound is the expected sentinel error
func TestErrNotFoundExists(t *testing.T) {
	require.NotNil(t, storage.ErrNotFound)
}
