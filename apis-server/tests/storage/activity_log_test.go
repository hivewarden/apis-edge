package storage_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestActivityLogEntry_JSONSerialization(t *testing.T) {
	t.Run("serializes entry with all fields", func(t *testing.T) {
		metadata := json.RawMessage(`{"task_id":"task-123","task_name":"Replace Queen","auto_applied":true,"changes":["Set queen_introduced_at to 2026-01-30"]}`)

		entry := storage.ActivityLogEntry{
			ID:        "activity-001",
			TenantID:  "tenant-123",
			HiveID:    "hive-456",
			Type:      "task_completion",
			Content:   "Completed task: Replace Queen",
			Metadata:  metadata,
			CreatedBy: "user-789",
			CreatedAt: time.Date(2026, 1, 30, 10, 30, 0, 0, time.UTC),
		}

		data, err := json.Marshal(entry)
		assert.NoError(t, err)

		var decoded map[string]interface{}
		err = json.Unmarshal(data, &decoded)
		assert.NoError(t, err)

		assert.Equal(t, "activity-001", decoded["id"])
		assert.Equal(t, "tenant-123", decoded["tenant_id"])
		assert.Equal(t, "hive-456", decoded["hive_id"])
		assert.Equal(t, "task_completion", decoded["type"])
		assert.Equal(t, "Completed task: Replace Queen", decoded["content"])
		assert.Equal(t, "user-789", decoded["created_by"])
		assert.NotNil(t, decoded["metadata"])
	})

	t.Run("omits nil metadata", func(t *testing.T) {
		entry := storage.ActivityLogEntry{
			ID:        "activity-002",
			TenantID:  "tenant-123",
			HiveID:    "hive-456",
			Type:      "inspection",
			Content:   "Inspection recorded",
			Metadata:  nil,
			CreatedBy: "user-789",
			CreatedAt: time.Now(),
		}

		data, err := json.Marshal(entry)
		assert.NoError(t, err)

		var decoded map[string]interface{}
		err = json.Unmarshal(data, &decoded)
		assert.NoError(t, err)

		_, hasMetadata := decoded["metadata"]
		assert.False(t, hasMetadata, "metadata should be omitted when nil")
	})
}

func TestActivityLogMetadata_JSONSerialization(t *testing.T) {
	t.Run("serializes task completion metadata", func(t *testing.T) {
		metadata := storage.ActivityLogMetadata{
			TaskID:   "task-123",
			TaskName: "Add Honey Super",
			CompletionData: map[string]any{
				"notes":    "Strong honey flow",
				"box_type": "super",
			},
			Notes:       "Hive is thriving",
			AutoApplied: true,
			Changes:     []string{"Incremented honey_supers from 1 to 2"},
		}

		data, err := json.Marshal(metadata)
		assert.NoError(t, err)

		var decoded map[string]interface{}
		err = json.Unmarshal(data, &decoded)
		assert.NoError(t, err)

		assert.Equal(t, "task-123", decoded["task_id"])
		assert.Equal(t, "Add Honey Super", decoded["task_name"])
		assert.Equal(t, true, decoded["auto_applied"])
		assert.Equal(t, "Hive is thriving", decoded["notes"])

		changes, ok := decoded["changes"].([]interface{})
		require.True(t, ok)
		assert.Len(t, changes, 1)
		assert.Equal(t, "Incremented honey_supers from 1 to 2", changes[0])
	})

	t.Run("omits empty optional fields", func(t *testing.T) {
		metadata := storage.ActivityLogMetadata{
			TaskID:      "task-456",
			TaskName:    "Feed Bees",
			AutoApplied: false,
			// No notes, changes, or completion_data
		}

		data, err := json.Marshal(metadata)
		assert.NoError(t, err)

		var decoded map[string]interface{}
		err = json.Unmarshal(data, &decoded)
		assert.NoError(t, err)

		_, hasNotes := decoded["notes"]
		_, hasChanges := decoded["changes"]
		_, hasCompletionData := decoded["completion_data"]

		assert.False(t, hasNotes, "notes should be omitted when empty")
		assert.False(t, hasChanges, "changes should be omitted when empty")
		assert.False(t, hasCompletionData, "completion_data should be omitted when empty")
	})
}

func TestCreateActivityLogInput_Fields(t *testing.T) {
	t.Run("accepts all required fields", func(t *testing.T) {
		metadata := json.RawMessage(`{"task_id":"t1","auto_applied":true}`)

		input := storage.CreateActivityLogInput{
			HiveID:    "hive-123",
			Type:      "task_completion",
			Content:   "Completed: Check Queen",
			Metadata:  metadata,
			CreatedBy: "user-456",
		}

		assert.Equal(t, "hive-123", input.HiveID)
		assert.Equal(t, "task_completion", input.Type)
		assert.Equal(t, "Completed: Check Queen", input.Content)
		assert.NotNil(t, input.Metadata)
		assert.Equal(t, "user-456", input.CreatedBy)
	})

	t.Run("allows nil metadata", func(t *testing.T) {
		input := storage.CreateActivityLogInput{
			HiveID:    "hive-789",
			Type:      "note",
			Content:   "Manual note added",
			Metadata:  nil,
			CreatedBy: "user-012",
		}

		assert.Nil(t, input.Metadata)
	})
}

func TestActivityLogListResult_Structure(t *testing.T) {
	t.Run("contains pagination info", func(t *testing.T) {
		result := storage.ActivityLogListResult{
			Entries: []storage.ActivityLogEntry{
				{ID: "entry-1"},
				{ID: "entry-2"},
			},
			Total:   50,
			Page:    2,
			PerPage: 10,
		}

		assert.Len(t, result.Entries, 2)
		assert.Equal(t, 50, result.Total)
		assert.Equal(t, 2, result.Page)
		assert.Equal(t, 10, result.PerPage)
	})

	t.Run("handles empty results", func(t *testing.T) {
		result := storage.ActivityLogListResult{
			Entries: []storage.ActivityLogEntry{},
			Total:   0,
			Page:    1,
			PerPage: 20,
		}

		assert.Empty(t, result.Entries)
		assert.Equal(t, 0, result.Total)
	})
}

func TestActivityLogTypes(t *testing.T) {
	t.Run("task_completion is the primary type for Story 14.13", func(t *testing.T) {
		// Document the expected activity type for task completions
		entry := storage.ActivityLogEntry{
			ID:   "test",
			Type: "task_completion",
		}

		assert.Equal(t, "task_completion", entry.Type)
	})

	t.Run("supports extensible types", func(t *testing.T) {
		// The type field is a string to allow future activity types
		validTypes := []string{
			"task_completion",
			"inspection",
			"note",
			"status_change",
		}

		for _, activityType := range validTypes {
			entry := storage.ActivityLogEntry{
				ID:   "test",
				Type: activityType,
			}
			assert.Equal(t, activityType, entry.Type)
		}
	})
}
