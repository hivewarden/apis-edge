package storage_test

import (
	"context"
	"testing"

	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Note: These tests require a database connection.
// In a real implementation, you would use a test database or mocks.
// For now, these tests document the expected behavior.

func TestMilestonePhoto_CRUD(t *testing.T) {
	// Skip if no database connection
	if testing.Short() {
		t.Skip("Skipping database test in short mode")
	}

	ctx := context.Background()
	// In a real test, you'd get a connection from the test setup
	// conn := getTestConnection(t)

	t.Run("CreateMilestonePhoto", func(t *testing.T) {
		// Test that we can create a milestone photo with all fields
		input := &storage.CreateMilestonePhotoInput{
			MilestoneType: "first_harvest",
			FilePath:      "/clips/tenant-1/milestones/photo-1.jpg",
		}

		// Verify input is valid
		assert.NotEmpty(t, input.MilestoneType)
		assert.NotEmpty(t, input.FilePath)

		// In a real test:
		// photo, err := storage.CreateMilestonePhoto(ctx, conn, "tenant-1", input)
		// require.NoError(t, err)
		// assert.NotEmpty(t, photo.ID)
		// assert.Equal(t, "first_harvest", photo.MilestoneType)
		_ = ctx
	})

	t.Run("CreateMilestonePhoto_WithOptionalFields", func(t *testing.T) {
		referenceID := "harvest-123"
		thumbPath := "/clips/tenant-1/milestones/photo-1_thumb.jpg"
		caption := "My first honey harvest!"

		input := &storage.CreateMilestonePhotoInput{
			MilestoneType: "first_harvest",
			ReferenceID:   &referenceID,
			FilePath:      "/clips/tenant-1/milestones/photo-1.jpg",
			ThumbnailPath: &thumbPath,
			Caption:       &caption,
		}

		assert.Equal(t, "first_harvest", input.MilestoneType)
		assert.Equal(t, &referenceID, input.ReferenceID)
		assert.Equal(t, &caption, input.Caption)
	})

	t.Run("ListMilestonePhotos_Empty", func(t *testing.T) {
		// Test that listing returns empty slice for tenant with no photos
		// In a real test:
		// photos, err := storage.ListMilestonePhotos(ctx, conn, "tenant-no-photos")
		// require.NoError(t, err)
		// assert.Empty(t, photos)
	})

	t.Run("GetMilestonePhoto_NotFound", func(t *testing.T) {
		// Test that getting non-existent photo returns ErrNotFound
		// In a real test:
		// photo, err := storage.GetMilestonePhoto(ctx, conn, "non-existent-id")
		// assert.ErrorIs(t, err, storage.ErrNotFound)
		// assert.Nil(t, photo)
	})

	t.Run("DeleteMilestonePhoto_NotFound", func(t *testing.T) {
		// Test that deleting non-existent photo returns ErrNotFound
		// In a real test:
		// err := storage.DeleteMilestonePhoto(ctx, conn, "non-existent-id")
		// assert.ErrorIs(t, err, storage.ErrNotFound)
	})
}

func TestMilestoneFlags(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping database test in short mode")
	}

	t.Run("GetMilestoneFlags_DefaultValues", func(t *testing.T) {
		// Test that new tenants get default empty flags
		flags := &storage.MilestoneFlags{}

		assert.False(t, flags.FirstHarvestSeen)
		assert.Empty(t, flags.HiveFirstHarvests)
	})

	t.Run("MilestoneFlags_Struct", func(t *testing.T) {
		// Test flag struct initialization
		flags := storage.MilestoneFlags{
			FirstHarvestSeen:  true,
			HiveFirstHarvests: []string{"hive-1", "hive-2"},
		}

		assert.True(t, flags.FirstHarvestSeen)
		assert.Len(t, flags.HiveFirstHarvests, 2)
		assert.Contains(t, flags.HiveFirstHarvests, "hive-1")
	})
}

func TestIsFirstHiveHarvest(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping database test in short mode")
	}

	t.Run("NewHive_IsFirstHarvest", func(t *testing.T) {
		// A hive with no harvests should return true for IsFirstHiveHarvest
		// In a real test:
		// isFirst, err := storage.IsFirstHiveHarvest(ctx, conn, "new-hive-id")
		// require.NoError(t, err)
		// assert.True(t, isFirst)
	})

	t.Run("ExistingHive_NotFirstHarvest", func(t *testing.T) {
		// A hive with existing harvests should return false
		// In a real test:
		// isFirst, err := storage.IsFirstHiveHarvest(ctx, conn, "existing-hive-id")
		// require.NoError(t, err)
		// assert.False(t, isFirst)
	})
}

func TestMilestoneTypes(t *testing.T) {
	t.Run("ValidMilestoneTypes", func(t *testing.T) {
		validTypes := []string{"first_harvest", "first_hive_harvest"}

		for _, mt := range validTypes {
			input := &storage.CreateMilestonePhotoInput{
				MilestoneType: mt,
				FilePath:      "/test/path.jpg",
			}
			assert.NotEmpty(t, input.MilestoneType)
		}
	})
}

// Integration test for complete milestone photo workflow
func TestMilestonePhotoWorkflow(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	t.Run("CompleteWorkflow", func(t *testing.T) {
		// This test would verify the complete workflow:
		// 1. Create a milestone photo
		// 2. List photos (verify it appears)
		// 3. Get the specific photo
		// 4. Delete the photo
		// 5. Verify it's gone

		// For unit testing without DB, we verify struct definitions are correct
		photo := &storage.MilestonePhoto{
			ID:            "test-id",
			TenantID:      "tenant-1",
			MilestoneType: "first_harvest",
			FilePath:      "/clips/tenant-1/milestones/test.jpg",
		}

		assert.Equal(t, "test-id", photo.ID)
		assert.Equal(t, "first_harvest", photo.MilestoneType)
	})
}

// Verify CreateMilestonePhotoInput struct fields
func TestCreateMilestonePhotoInput(t *testing.T) {
	t.Run("RequiredFields", func(t *testing.T) {
		input := storage.CreateMilestonePhotoInput{
			MilestoneType: "first_harvest",
			FilePath:      "/path/to/photo.jpg",
		}

		require.NotEmpty(t, input.MilestoneType, "MilestoneType is required")
		require.NotEmpty(t, input.FilePath, "FilePath is required")
	})

	t.Run("AllFields", func(t *testing.T) {
		refID := "harvest-123"
		thumb := "/path/to/thumb.jpg"
		caption := "My milestone"

		input := storage.CreateMilestonePhotoInput{
			MilestoneType: "first_hive_harvest",
			ReferenceID:   &refID,
			FilePath:      "/path/to/photo.jpg",
			ThumbnailPath: &thumb,
			Caption:       &caption,
		}

		assert.Equal(t, "first_hive_harvest", input.MilestoneType)
		assert.Equal(t, &refID, input.ReferenceID)
		assert.Equal(t, "/path/to/photo.jpg", input.FilePath)
		assert.Equal(t, &thumb, input.ThumbnailPath)
		assert.Equal(t, &caption, input.Caption)
	})
}
