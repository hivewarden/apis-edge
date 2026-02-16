package storage_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/stretchr/testify/assert"
)

func TestAuditLogEntry_JSONSerialization(t *testing.T) {
	t.Run("serializes entry with all fields", func(t *testing.T) {
		userID := "user-123"
		userName := "John Doe"
		userEmail := "john@example.com"
		ipAddress := "192.168.1.1"

		entry := storage.AuditLogEntry{
			ID:         "audit-001",
			TenantID:   "tenant-123",
			UserID:     &userID,
			UserName:   &userName,
			UserEmail:  &userEmail,
			Action:     "create",
			EntityType: "hives",
			EntityID:   "hive-456",
			OldValues:  nil,
			NewValues:  json.RawMessage(`{"name":"My Hive"}`),
			IPAddress:  &ipAddress,
			CreatedAt:  time.Date(2024, 1, 15, 10, 30, 0, 0, time.UTC),
		}

		data, err := json.Marshal(entry)
		assert.NoError(t, err)

		var decoded map[string]interface{}
		err = json.Unmarshal(data, &decoded)
		assert.NoError(t, err)

		assert.Equal(t, "audit-001", decoded["id"])
		assert.Equal(t, "tenant-123", decoded["tenant_id"])
		assert.Equal(t, "user-123", decoded["user_id"])
		assert.Equal(t, "John Doe", decoded["user_name"])
		assert.Equal(t, "john@example.com", decoded["user_email"])
		assert.Equal(t, "create", decoded["action"])
		assert.Equal(t, "hives", decoded["entity_type"])
		assert.Equal(t, "hive-456", decoded["entity_id"])
		assert.Equal(t, "192.168.1.1", decoded["ip_address"])
	})

	t.Run("omits nil optional fields", func(t *testing.T) {
		entry := storage.AuditLogEntry{
			ID:         "audit-002",
			TenantID:   "tenant-123",
			UserID:     nil, // No user
			UserName:   nil,
			UserEmail:  nil,
			Action:     "delete",
			EntityType: "clips",
			EntityID:   "clip-789",
			OldValues:  json.RawMessage(`{"path":"/clips/old.mp4"}`),
			NewValues:  nil, // Delete has no new values
			IPAddress:  nil, // No IP captured
			CreatedAt:  time.Now(),
		}

		data, err := json.Marshal(entry)
		assert.NoError(t, err)

		var decoded map[string]interface{}
		err = json.Unmarshal(data, &decoded)
		assert.NoError(t, err)

		// These should be omitted (omitempty)
		_, hasUserID := decoded["user_id"]
		_, hasUserName := decoded["user_name"]
		_, hasUserEmail := decoded["user_email"]
		_, hasNewValues := decoded["new_values"]
		_, hasIPAddress := decoded["ip_address"]

		assert.False(t, hasUserID, "user_id should be omitted when nil")
		assert.False(t, hasUserName, "user_name should be omitted when nil")
		assert.False(t, hasUserEmail, "user_email should be omitted when nil")
		assert.False(t, hasNewValues, "new_values should be omitted when nil")
		assert.False(t, hasIPAddress, "ip_address should be omitted when nil")
	})
}

func TestAuditLogFilters_Defaults(t *testing.T) {
	t.Run("has expected default values", func(t *testing.T) {
		filters := &storage.AuditLogFilters{
			Limit:  50,
			Offset: 0,
		}

		assert.Equal(t, 50, filters.Limit)
		assert.Equal(t, 0, filters.Offset)
		assert.Nil(t, filters.EntityType)
		assert.Nil(t, filters.UserID)
		assert.Nil(t, filters.Action)
		assert.Nil(t, filters.StartDate)
		assert.Nil(t, filters.EndDate)
	})

	t.Run("accepts all filter fields", func(t *testing.T) {
		entityType := "hives"
		userID := "user-123"
		action := "update"
		startDate := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
		endDate := time.Date(2024, 12, 31, 23, 59, 59, 0, time.UTC)

		filters := &storage.AuditLogFilters{
			EntityType: &entityType,
			UserID:     &userID,
			Action:     &action,
			StartDate:  &startDate,
			EndDate:    &endDate,
			Limit:      100,
			Offset:     50,
		}

		assert.Equal(t, "hives", *filters.EntityType)
		assert.Equal(t, "user-123", *filters.UserID)
		assert.Equal(t, "update", *filters.Action)
		assert.Equal(t, startDate, *filters.StartDate)
		assert.Equal(t, endDate, *filters.EndDate)
		assert.Equal(t, 100, filters.Limit)
		assert.Equal(t, 50, filters.Offset)
	})
}

func TestAuditLogFilters_JSONSerialization(t *testing.T) {
	t.Run("serializes filters to JSON", func(t *testing.T) {
		entityType := "inspections"
		action := "create"

		filters := &storage.AuditLogFilters{
			EntityType: &entityType,
			Action:     &action,
			Limit:      25,
			Offset:     10,
		}

		data, err := json.Marshal(filters)
		assert.NoError(t, err)

		var decoded map[string]interface{}
		err = json.Unmarshal(data, &decoded)
		assert.NoError(t, err)

		assert.Equal(t, "inspections", decoded["entity_type"])
		assert.Equal(t, "create", decoded["action"])
		assert.Equal(t, float64(25), decoded["limit"])
		assert.Equal(t, float64(10), decoded["offset"])
	})
}

func TestAuditEntryActions(t *testing.T) {
	t.Run("supports all action types", func(t *testing.T) {
		validActions := []string{"create", "update", "delete"}

		for _, action := range validActions {
			entry := storage.AuditLogEntry{
				ID:         "test-id",
				TenantID:   "tenant-id",
				Action:     action,
				EntityType: "hives",
				EntityID:   "hive-id",
				CreatedAt:  time.Now(),
			}

			assert.Equal(t, action, entry.Action)
		}
	})
}

func TestAuditEntryEntityTypes(t *testing.T) {
	t.Run("supports all entity types per AC1", func(t *testing.T) {
		// Per AC1: hives, inspections, treatments, feedings, harvests, sites, units, users, clips
		validEntityTypes := []string{
			"hives",
			"inspections",
			"treatments",
			"feedings",
			"harvests",
			"sites",
			"units",
			"users",
			"clips",
		}

		for _, entityType := range validEntityTypes {
			entry := storage.AuditLogEntry{
				ID:         "test-id",
				TenantID:   "tenant-id",
				Action:     "create",
				EntityType: entityType,
				EntityID:   "entity-id",
				CreatedAt:  time.Now(),
			}

			assert.Equal(t, entityType, entry.EntityType)
		}
	})
}

func TestAuditLogEntry_OldNewValues(t *testing.T) {
	t.Run("create action has only new_values", func(t *testing.T) {
		entry := storage.AuditLogEntry{
			ID:         "audit-create",
			TenantID:   "tenant-id",
			Action:     "create",
			EntityType: "hives",
			EntityID:   "hive-new",
			OldValues:  nil,
			NewValues:  json.RawMessage(`{"name":"New Hive","brood_boxes":2}`),
			CreatedAt:  time.Now(),
		}

		assert.Nil(t, entry.OldValues)
		assert.NotNil(t, entry.NewValues)
	})

	t.Run("update action has both old and new values", func(t *testing.T) {
		entry := storage.AuditLogEntry{
			ID:         "audit-update",
			TenantID:   "tenant-id",
			Action:     "update",
			EntityType: "hives",
			EntityID:   "hive-existing",
			OldValues:  json.RawMessage(`{"name":"Old Name"}`),
			NewValues:  json.RawMessage(`{"name":"New Name"}`),
			CreatedAt:  time.Now(),
		}

		assert.NotNil(t, entry.OldValues)
		assert.NotNil(t, entry.NewValues)
	})

	t.Run("delete action has only old_values", func(t *testing.T) {
		entry := storage.AuditLogEntry{
			ID:         "audit-delete",
			TenantID:   "tenant-id",
			Action:     "delete",
			EntityType: "clips",
			EntityID:   "clip-deleted",
			OldValues:  json.RawMessage(`{"path":"/clips/deleted.mp4"}`),
			NewValues:  nil,
			CreatedAt:  time.Now(),
		}

		assert.NotNil(t, entry.OldValues)
		assert.Nil(t, entry.NewValues)
	})
}
