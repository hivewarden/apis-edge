package storage_test

import (
	"context"
	"testing"
	"time"

	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIsValidReminderType(t *testing.T) {
	tests := []struct {
		reminderType string
		valid        bool
	}{
		{"treatment_due", true},
		{"treatment_followup", true},
		{"custom", true},
		{"invalid", false},
		{"", false},
		{"TREATMENT_DUE", false}, // case sensitive
		{"treatment-due", false}, // wrong separator
	}

	for _, tt := range tests {
		t.Run(tt.reminderType, func(t *testing.T) {
			result := storage.IsValidReminderType(tt.reminderType)
			assert.Equal(t, tt.valid, result)
		})
	}
}

func TestValidReminderTypes(t *testing.T) {
	expected := []string{"treatment_due", "treatment_followup", "custom"}
	assert.Equal(t, expected, storage.ValidReminderTypes)
}

func TestReminderStruct(t *testing.T) {
	now := time.Now()
	hiveID := "hive-1"
	completedAt := now.Add(-time.Hour)
	snoozedUntil := now.Add(7 * 24 * time.Hour)

	reminder := storage.Reminder{
		ID:           "reminder-1",
		TenantID:     "tenant-1",
		HiveID:       &hiveID,
		ReminderType: "treatment_due",
		Title:        "Oxalic acid treatment due",
		DueAt:        now,
		CompletedAt:  &completedAt,
		SnoozedUntil: &snoozedUntil,
		Metadata:     map[string]any{"treatment_type": "oxalic_acid"},
		CreatedAt:    now,
	}

	assert.Equal(t, "reminder-1", reminder.ID)
	assert.Equal(t, "tenant-1", reminder.TenantID)
	assert.Equal(t, &hiveID, reminder.HiveID)
	assert.Equal(t, "treatment_due", reminder.ReminderType)
	assert.Equal(t, "Oxalic acid treatment due", reminder.Title)
	assert.NotNil(t, reminder.CompletedAt)
	assert.NotNil(t, reminder.SnoozedUntil)
}

func TestReminderStructWithNilOptionals(t *testing.T) {
	now := time.Now()

	reminder := storage.Reminder{
		ID:           "reminder-2",
		TenantID:     "tenant-1",
		HiveID:       nil, // Tenant-wide reminder
		ReminderType: "custom",
		Title:        "Annual inspection reminder",
		DueAt:        now,
		CompletedAt:  nil,
		SnoozedUntil: nil,
		Metadata:     nil,
		CreatedAt:    now,
	}

	assert.Nil(t, reminder.HiveID)
	assert.Nil(t, reminder.CompletedAt)
	assert.Nil(t, reminder.SnoozedUntil)
	assert.Nil(t, reminder.Metadata)
}

func TestCreateReminderInput(t *testing.T) {
	hiveID := "hive-1"
	input := storage.CreateReminderInput{
		HiveID:       &hiveID,
		ReminderType: "treatment_followup",
		Title:        "Check for mites",
		DueAt:        "2026-03-15",
		Metadata:     map[string]any{"note": "follow-up"},
	}

	assert.Equal(t, &hiveID, input.HiveID)
	assert.Equal(t, "treatment_followup", input.ReminderType)
	assert.Equal(t, "Check for mites", input.Title)
	assert.Equal(t, "2026-03-15", input.DueAt)
}

func TestUpdateReminderInput(t *testing.T) {
	newTitle := "Updated title"
	newDueAt := "2026-04-01"
	newSnoozed := "2026-04-08"

	input := storage.UpdateReminderInput{
		Title:        &newTitle,
		DueAt:        &newDueAt,
		SnoozedUntil: &newSnoozed,
		Metadata:     map[string]any{"updated": true},
	}

	assert.Equal(t, &newTitle, input.Title)
	assert.Equal(t, &newDueAt, input.DueAt)
	assert.Equal(t, &newSnoozed, input.SnoozedUntil)
}

// Integration tests with real database

func TestCreateReminderIntegration(t *testing.T) {
	conn, tenantID, cleanup := storage.SetupTestDB(t)
	defer cleanup()

	ctx := context.Background()

	input := &storage.CreateReminderInput{
		ReminderType: "custom",
		Title:        "Test reminder",
		DueAt:        "2026-03-15",
	}

	reminder, err := storage.CreateReminder(ctx, conn.Conn, tenantID, input)
	require.NoError(t, err)
	require.NotNil(t, reminder)

	assert.NotEmpty(t, reminder.ID)
	assert.Equal(t, tenantID, reminder.TenantID)
	assert.Equal(t, "custom", reminder.ReminderType)
	assert.Equal(t, "Test reminder", reminder.Title)
	assert.Equal(t, "2026-03-15", reminder.DueAt.Format("2006-01-02"))
	assert.Nil(t, reminder.CompletedAt)
	assert.Nil(t, reminder.SnoozedUntil)
}

func TestCreateReminderValidation(t *testing.T) {
	conn, tenantID, cleanup := storage.SetupTestDB(t)
	defer cleanup()

	ctx := context.Background()

	t.Run("empty title fails", func(t *testing.T) {
		input := &storage.CreateReminderInput{
			ReminderType: "custom",
			Title:        "",
			DueAt:        "2026-03-15",
		}

		_, err := storage.CreateReminder(ctx, conn.Conn, tenantID, input)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "title is required")
	})

	t.Run("invalid reminder type fails", func(t *testing.T) {
		input := &storage.CreateReminderInput{
			ReminderType: "invalid_type",
			Title:        "Test",
			DueAt:        "2026-03-15",
		}

		_, err := storage.CreateReminder(ctx, conn.Conn, tenantID, input)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "invalid reminder type")
	})

	t.Run("invalid date format fails", func(t *testing.T) {
		input := &storage.CreateReminderInput{
			ReminderType: "custom",
			Title:        "Test",
			DueAt:        "15-03-2026", // Wrong format
		}

		_, err := storage.CreateReminder(ctx, conn.Conn, tenantID, input)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "invalid due_at date format")
	})
}

func TestListRemindersForDateRangeIntegration(t *testing.T) {
	conn, tenantID, cleanup := storage.SetupTestDB(t)
	defer cleanup()

	ctx := context.Background()

	// Create reminders with various due dates
	dates := []string{"2026-03-01", "2026-03-15", "2026-03-31", "2026-04-15"}
	for i, date := range dates {
		input := &storage.CreateReminderInput{
			ReminderType: "custom",
			Title:        "Reminder " + string(rune('A'+i)),
			DueAt:        date,
		}
		_, err := storage.CreateReminder(ctx, conn.Conn, tenantID, input)
		require.NoError(t, err)
	}

	// Query for March only
	startDate, _ := time.Parse("2006-01-02", "2026-03-01")
	endDate, _ := time.Parse("2006-01-02", "2026-03-31")

	reminders, err := storage.ListRemindersForDateRange(ctx, conn.Conn, tenantID, startDate, endDate)
	require.NoError(t, err)
	assert.Len(t, reminders, 3) // March 1, 15, 31 - not April 15
}

func TestListPendingRemindersIntegration(t *testing.T) {
	conn, tenantID, cleanup := storage.SetupTestDB(t)
	defer cleanup()

	ctx := context.Background()

	// Create a pending reminder
	pendingInput := &storage.CreateReminderInput{
		ReminderType: "custom",
		Title:        "Pending reminder",
		DueAt:        time.Now().AddDate(0, 0, -1).Format("2006-01-02"), // Due yesterday
	}
	pending, err := storage.CreateReminder(ctx, conn.Conn, tenantID, pendingInput)
	require.NoError(t, err)

	// Create and complete a reminder
	completedInput := &storage.CreateReminderInput{
		ReminderType: "custom",
		Title:        "Completed reminder",
		DueAt:        time.Now().AddDate(0, 0, -1).Format("2006-01-02"),
	}
	completed, err := storage.CreateReminder(ctx, conn.Conn, tenantID, completedInput)
	require.NoError(t, err)
	_, err = storage.CompleteReminder(ctx, conn.Conn, tenantID, completed.ID)
	require.NoError(t, err)

	// Create and snooze a reminder (snoozed until future)
	snoozedInput := &storage.CreateReminderInput{
		ReminderType: "custom",
		Title:        "Snoozed reminder",
		DueAt:        time.Now().AddDate(0, 0, -1).Format("2006-01-02"),
	}
	snoozed, err := storage.CreateReminder(ctx, conn.Conn, tenantID, snoozedInput)
	require.NoError(t, err)
	_, err = storage.SnoozeReminder(ctx, conn.Conn, tenantID, snoozed.ID, 7)
	require.NoError(t, err)

	// List pending - should only include the truly pending one
	reminders, err := storage.ListPendingReminders(ctx, conn.Conn, tenantID)
	require.NoError(t, err)
	assert.Len(t, reminders, 1)
	assert.Equal(t, pending.ID, reminders[0].ID)
}

func TestSnoozeReminderIntegration(t *testing.T) {
	conn, tenantID, cleanup := storage.SetupTestDB(t)
	defer cleanup()

	ctx := context.Background()

	input := &storage.CreateReminderInput{
		ReminderType: "custom",
		Title:        "To be snoozed",
		DueAt:        "2026-03-15",
	}
	reminder, err := storage.CreateReminder(ctx, conn.Conn, tenantID, input)
	require.NoError(t, err)

	// Snooze for 7 days
	snoozed, err := storage.SnoozeReminder(ctx, conn.Conn, tenantID, reminder.ID, 7)
	require.NoError(t, err)
	require.NotNil(t, snoozed.SnoozedUntil)

	// Snoozed until should be approximately 7 days from now
	expectedSnooze := time.Now().AddDate(0, 0, 7)
	assert.WithinDuration(t, expectedSnooze, *snoozed.SnoozedUntil, 24*time.Hour)
}

func TestCompleteReminderIntegration(t *testing.T) {
	conn, tenantID, cleanup := storage.SetupTestDB(t)
	defer cleanup()

	ctx := context.Background()

	input := &storage.CreateReminderInput{
		ReminderType: "custom",
		Title:        "To be completed",
		DueAt:        "2026-03-15",
	}
	reminder, err := storage.CreateReminder(ctx, conn.Conn, tenantID, input)
	require.NoError(t, err)
	assert.Nil(t, reminder.CompletedAt)

	// Complete the reminder
	completed, err := storage.CompleteReminder(ctx, conn.Conn, tenantID, reminder.ID)
	require.NoError(t, err)
	require.NotNil(t, completed.CompletedAt)

	// Completed_at should be approximately now
	assert.WithinDuration(t, time.Now(), *completed.CompletedAt, time.Minute)
}

func TestDeleteReminderIntegration(t *testing.T) {
	conn, tenantID, cleanup := storage.SetupTestDB(t)
	defer cleanup()

	ctx := context.Background()

	input := &storage.CreateReminderInput{
		ReminderType: "custom",
		Title:        "To be deleted",
		DueAt:        "2026-03-15",
	}
	reminder, err := storage.CreateReminder(ctx, conn.Conn, tenantID, input)
	require.NoError(t, err)

	// Delete it
	err = storage.DeleteReminder(ctx, conn.Conn, tenantID, reminder.ID)
	require.NoError(t, err)

	// Verify it's gone
	_, err = storage.GetReminderByID(ctx, conn.Conn, tenantID, reminder.ID)
	assert.ErrorIs(t, err, storage.ErrNotFound)
}

func TestDeleteNonExistentReminder(t *testing.T) {
	conn, tenantID, cleanup := storage.SetupTestDB(t)
	defer cleanup()

	ctx := context.Background()

	err := storage.DeleteReminder(ctx, conn.Conn, tenantID, "non-existent-id")
	assert.ErrorIs(t, err, storage.ErrNotFound)
}

func TestFindTreatmentDueSnoozeReminderIntegration(t *testing.T) {
	conn, tenantID, cleanup := storage.SetupTestDB(t)
	defer cleanup()

	ctx := context.Background()

	// Create a test hive first
	hive, err := storage.CreateHive(ctx, conn.Conn, tenantID, &storage.CreateHiveInput{
		Name:   "Test Hive",
		SiteID: "", // Will use default site
	})
	require.NoError(t, err)

	// Create a treatment_due reminder with metadata
	input := &storage.CreateReminderInput{
		HiveID:       &hive.ID,
		ReminderType: "treatment_due",
		Title:        "Oxalic acid treatment snoozed",
		DueAt:        "2026-03-15",
		Metadata: map[string]any{
			"treatment_type": "oxalic_acid",
			"snoozed":        true,
		},
	}
	_, err = storage.CreateReminder(ctx, conn.Conn, tenantID, input)
	require.NoError(t, err)

	// Find it
	found, err := storage.FindTreatmentDueSnoozeReminder(ctx, conn.Conn, tenantID, hive.ID, "oxalic_acid")
	require.NoError(t, err)
	require.NotNil(t, found)
	assert.Equal(t, "treatment_due", found.ReminderType)

	// Try finding non-existent combo
	notFound, err := storage.FindTreatmentDueSnoozeReminder(ctx, conn.Conn, tenantID, hive.ID, "formic_acid")
	require.NoError(t, err)
	assert.Nil(t, notFound) // Should be nil, not error
}

func TestReminderTenantIsolationIntegration(t *testing.T) {
	conn, tenantID, cleanup := storage.SetupTestDB(t)
	defer cleanup()

	ctx := context.Background()

	// Create reminder for tenant A (the test tenant)
	input := &storage.CreateReminderInput{
		ReminderType: "custom",
		Title:        "Tenant A reminder",
		DueAt:        "2026-03-15",
	}
	reminder, err := storage.CreateReminder(ctx, conn.Conn, tenantID, input)
	require.NoError(t, err)

	// Try to access with different tenant ID
	otherTenantID := "other-tenant-that-does-not-own-this"
	_, err = storage.GetReminderByID(ctx, conn.Conn, otherTenantID, reminder.ID)
	assert.ErrorIs(t, err, storage.ErrNotFound)

	// Verify it still exists for original tenant
	found, err := storage.GetReminderByID(ctx, conn.Conn, tenantID, reminder.ID)
	require.NoError(t, err)
	assert.Equal(t, reminder.ID, found.ID)
}

// Ensure ErrNotFound is the expected sentinel error for reminders
func TestReminderErrNotFoundExists(t *testing.T) {
	require.NotNil(t, storage.ErrNotFound)
}
