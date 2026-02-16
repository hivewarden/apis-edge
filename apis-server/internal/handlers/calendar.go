// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/rs/zerolog/log"
)

// CalendarEvent represents an event on the calendar.
type CalendarEvent struct {
	ID        string         `json:"id"`
	Date      string         `json:"date"`
	Type      string         `json:"type"` // "treatment_past", "treatment_due", "reminder"
	Title     string         `json:"title"`
	HiveID    *string        `json:"hive_id,omitempty"`
	HiveName  *string        `json:"hive_name,omitempty"`
	ReminderID *string       `json:"reminder_id,omitempty"`
	Metadata  map[string]any `json:"metadata,omitempty"`
}

// CalendarResponse represents the calendar API response.
type CalendarResponse struct {
	Data []CalendarEvent `json:"data"`
}

// ReminderResponse represents a reminder in API responses.
type ReminderResponse struct {
	ID           string  `json:"id"`
	HiveID       *string `json:"hive_id,omitempty"`
	HiveName     *string `json:"hive_name,omitempty"`
	ReminderType string  `json:"reminder_type"`
	Title        string  `json:"title"`
	DueAt        string  `json:"due_at"`
	CompletedAt  *string `json:"completed_at,omitempty"`
	SnoozedUntil *string `json:"snoozed_until,omitempty"`
	Metadata     any     `json:"metadata,omitempty"`
	CreatedAt    string  `json:"created_at"`
}

// RemindersListResponse represents the list reminders API response.
type RemindersListResponse struct {
	Data []ReminderResponse `json:"data"`
}

// ReminderDataResponse represents a single reminder API response.
type ReminderDataResponse struct {
	Data ReminderResponse `json:"data"`
}

// CreateReminderRequest represents the request body for creating a reminder.
type CreateReminderRequest struct {
	HiveID       *string `json:"hive_id,omitempty"`
	ReminderType string  `json:"reminder_type"`
	Title        string  `json:"title"`
	DueAt        string  `json:"due_at"`
	Metadata     any     `json:"metadata,omitempty"`
}

// UpdateReminderRequest represents the request body for updating a reminder.
type UpdateReminderRequest struct {
	Title        *string `json:"title,omitempty"`
	DueAt        *string `json:"due_at,omitempty"`
	SnoozedUntil *string `json:"snoozed_until,omitempty"`
	Metadata     any     `json:"metadata,omitempty"`
}

// SnoozeReminderRequest represents the request body for snoozing a reminder.
type SnoozeReminderRequest struct {
	Days int `json:"days"`
}

// TreatmentIntervalsResponse represents the treatment intervals API response.
type TreatmentIntervalsResponse struct {
	Data map[string]int `json:"data"`
}

// reminderToResponse converts a storage.Reminder to a ReminderResponse.
func reminderToResponse(r *storage.Reminder, hiveName *string) ReminderResponse {
	resp := ReminderResponse{
		ID:           r.ID,
		HiveID:       r.HiveID,
		HiveName:     hiveName,
		ReminderType: r.ReminderType,
		Title:        r.Title,
		DueAt:        r.DueAt.Format("2006-01-02"),
		Metadata:     r.Metadata,
		CreatedAt:    r.CreatedAt.Format(time.RFC3339),
	}
	if r.CompletedAt != nil {
		completed := r.CompletedAt.Format(time.RFC3339)
		resp.CompletedAt = &completed
	}
	if r.SnoozedUntil != nil {
		snoozed := r.SnoozedUntil.Format("2006-01-02")
		resp.SnoozedUntil = &snoozed
	}
	return resp
}

// GetCalendar handles GET /api/calendar - returns calendar events for a date range.
// Query params: start (YYYY-MM-DD), end (YYYY-MM-DD)
func GetCalendar(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())

	// Parse date range
	startStr := r.URL.Query().Get("start")
	endStr := r.URL.Query().Get("end")

	if startStr == "" || endStr == "" {
		respondError(w, "start and end query params are required (YYYY-MM-DD)", http.StatusBadRequest)
		return
	}

	startDate, err := time.Parse("2006-01-02", startStr)
	if err != nil {
		respondError(w, "Invalid start date format, expected YYYY-MM-DD", http.StatusBadRequest)
		return
	}

	endDate, err := time.Parse("2006-01-02", endStr)
	if err != nil {
		respondError(w, "Invalid end date format, expected YYYY-MM-DD", http.StatusBadRequest)
		return
	}

	// SECURITY FIX (S3B-M3): Validate date range to prevent resource exhaustion.
	// Large ranges cause combinatorial expansion when computing treatment schedules.
	if endDate.Before(startDate) {
		respondError(w, "end date must be after start date", http.StatusBadRequest)
		return
	}
	if endDate.Sub(startDate) > 366*24*time.Hour {
		respondError(w, "date range cannot exceed 366 days", http.StatusBadRequest)
		return
	}

	// Get all hives with their names
	hives, err := storage.ListHives(r.Context(), conn)
	if err != nil {
		log.Error().Err(err).Msg("handler: failed to list hives for calendar")
		respondError(w, "Failed to load calendar", http.StatusInternalServerError)
		return
	}

	hiveNames := make(map[string]string)
	for _, h := range hives {
		hiveNames[h.ID] = h.Name
	}

	// Get treatment intervals for tenant
	intervals, err := storage.GetTreatmentIntervals(r.Context(), conn, tenantID)
	if err != nil {
		log.Error().Err(err).Msg("handler: failed to get treatment intervals")
		respondError(w, "Failed to load calendar", http.StatusInternalServerError)
		return
	}

	var events []CalendarEvent

	// 1. Add past treatments as completed events
	treatments, err := storage.ListTreatmentsForDateRange(r.Context(), conn, tenantID, startDate, endDate)
	if err != nil {
		log.Error().Err(err).Msg("handler: failed to list treatments")
		respondError(w, "Failed to load calendar", http.StatusInternalServerError)
		return
	}

	for _, t := range treatments {
		hiveName := hiveNames[t.HiveID]
		events = append(events, CalendarEvent{
			ID:       "treatment-" + t.ID,
			Date:     t.TreatedAt.Format("2006-01-02"),
			Type:     "treatment_past",
			Title:    formatTreatmentType(t.TreatmentType) + " - " + hiveName,
			HiveID:   &t.HiveID,
			HiveName: &hiveName,
			Metadata: map[string]any{
				"treatment_id":   t.ID,
				"treatment_type": t.TreatmentType,
			},
		})
	}

	// 2. Compute treatment due dates for each hive
	// Get snoozed treatment reminders to exclude from due date display
	snoozedReminders, err := storage.ListRemindersForDateRange(r.Context(), conn, tenantID, startDate, endDate)
	if err != nil {
		log.Error().Err(err).Msg("handler: failed to list snoozed reminders")
		// Continue without snoozed data
		snoozedReminders = nil
	}

	// Build map of snoozed treatment types per hive
	snoozedMap := make(map[string]time.Time) // hiveID+treatmentType -> snoozedUntil
	for _, rem := range snoozedReminders {
		if rem.ReminderType == "treatment_due" && rem.SnoozedUntil != nil && rem.HiveID != nil {
			// Get treatment type from metadata
			if metadata, ok := rem.Metadata.(map[string]any); ok {
				if treatmentType, ok := metadata["treatment_type"].(string); ok {
					key := *rem.HiveID + ":" + treatmentType
					snoozedMap[key] = *rem.SnoozedUntil
				}
			}
		}
	}

	now := time.Now()
	for _, hive := range hives {
		// Skip non-active hives (lost, archived) - no treatment reminders needed
		if hive.Status != "active" {
			continue
		}

		lastTreatments, err := storage.GetLastTreatmentsByTypeForHive(r.Context(), conn, hive.ID)
		if err != nil {
			log.Warn().Err(err).Str("hive_id", hive.ID).Msg("handler: failed to get last treatments for hive")
			continue
		}

		for treatmentType, lastTreatment := range lastTreatments {
			interval, ok := intervals[treatmentType]
			if !ok || interval == 0 {
				continue
			}

			dueDate := lastTreatment.TreatedAt.AddDate(0, 0, interval)

			// Skip if due date is outside range
			if dueDate.Before(startDate) || dueDate.After(endDate) {
				continue
			}

			// Skip if snoozed
			key := hive.ID + ":" + treatmentType
			if snoozedUntil, isSnoozed := snoozedMap[key]; isSnoozed && now.Before(snoozedUntil) {
				continue
			}

			daysSince := int(now.Sub(lastTreatment.TreatedAt).Hours() / 24)
			hiveName := hive.Name

			events = append(events, CalendarEvent{
				ID:       "due-" + hive.ID + "-" + treatmentType,
				Date:     dueDate.Format("2006-01-02"),
				Type:     "treatment_due",
				Title:    formatTreatmentType(treatmentType) + " due - " + hiveName,
				HiveID:   &hive.ID,
				HiveName: &hiveName,
				Metadata: map[string]any{
					"treatment_type":      treatmentType,
					"days_since_last":     daysSince,
					"last_treatment_date": lastTreatment.TreatedAt.Format("2006-01-02"),
				},
			})
		}
	}

	// 3. Add manual reminders
	reminders, err := storage.ListRemindersForDateRange(r.Context(), conn, tenantID, startDate, endDate)
	if err != nil {
		log.Error().Err(err).Msg("handler: failed to list reminders")
		respondError(w, "Failed to load calendar", http.StatusInternalServerError)
		return
	}

	for _, rem := range reminders {
		// Skip completed reminders and snoozed reminders (unless snoozed_until has passed)
		if rem.CompletedAt != nil {
			continue
		}
		if rem.SnoozedUntil != nil && now.Before(*rem.SnoozedUntil) {
			continue
		}

		// For treatment_due type reminders that were created from snoozing, skip
		// (they're already represented in computed events)
		if rem.ReminderType == "treatment_due" {
			continue
		}

		var hiveName *string
		if rem.HiveID != nil {
			if name, ok := hiveNames[*rem.HiveID]; ok {
				hiveName = &name
			}
		}

		reminderID := rem.ID
		// Safely extract metadata, defaulting to empty map if nil or wrong type
		var metadata map[string]any
		if rem.Metadata != nil {
			if m, ok := rem.Metadata.(map[string]any); ok {
				metadata = m
			}
		}
		events = append(events, CalendarEvent{
			ID:         "reminder-" + rem.ID,
			Date:       rem.DueAt.Format("2006-01-02"),
			Type:       "reminder",
			Title:      rem.Title,
			HiveID:     rem.HiveID,
			HiveName:   hiveName,
			ReminderID: &reminderID,
			Metadata:   metadata,
		})
	}

	respondJSON(w, CalendarResponse{Data: events}, http.StatusOK)
}

// formatTreatmentType converts treatment type slugs to display names.
func formatTreatmentType(t string) string {
	switch t {
	case "oxalic_acid":
		return "Oxalic Acid"
	case "formic_acid":
		return "Formic Acid"
	case "apiguard":
		return "Apiguard"
	case "apivar":
		return "Apivar"
	case "maqs":
		return "MAQS"
	case "api_bioxal":
		return "Api-Bioxal"
	default:
		return t
	}
}

// ListReminders handles GET /api/reminders - returns all reminders with optional filters.
// Query params: pending (bool), hive_id (string)
func ListReminders(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())

	var reminders []storage.Reminder
	var err error

	// Check if we should only list pending reminders
	if r.URL.Query().Get("pending") == "true" {
		reminders, err = storage.ListPendingReminders(r.Context(), conn, tenantID)
	} else if hiveID := r.URL.Query().Get("hive_id"); hiveID != "" {
		reminders, err = storage.ListRemindersByHive(r.Context(), conn, tenantID, hiveID)
	} else {
		// List all reminders for current month by default
		now := time.Now()
		startOfMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
		endOfMonth := startOfMonth.AddDate(0, 1, -1)
		reminders, err = storage.ListRemindersForDateRange(r.Context(), conn, tenantID, startOfMonth, endOfMonth)
	}

	if err != nil {
		log.Error().Err(err).Msg("handler: failed to list reminders")
		respondError(w, "Failed to list reminders", http.StatusInternalServerError)
		return
	}

	// Get hive names for enrichment
	hives, err := storage.ListHives(r.Context(), conn)
	if err != nil {
		log.Warn().Err(err).Msg("handler: failed to list hives for reminder enrichment")
	}
	hiveNames := make(map[string]string)
	for _, h := range hives {
		hiveNames[h.ID] = h.Name
	}

	responses := make([]ReminderResponse, 0, len(reminders))
	for _, rem := range reminders {
		var hiveName *string
		if rem.HiveID != nil {
			if name, ok := hiveNames[*rem.HiveID]; ok {
				hiveName = &name
			}
		}
		responses = append(responses, reminderToResponse(&rem, hiveName))
	}

	respondJSON(w, RemindersListResponse{Data: responses}, http.StatusOK)
}

// CreateReminder handles POST /api/reminders - creates a new reminder.
func CreateReminder(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())

	var req CreateReminderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate required fields
	if req.Title == "" {
		respondError(w, "title is required", http.StatusBadRequest)
		return
	}
	if req.DueAt == "" {
		respondError(w, "due_at is required", http.StatusBadRequest)
		return
	}
	if req.ReminderType == "" {
		req.ReminderType = "custom" // Default to custom if not specified
	}
	if !storage.IsValidReminderType(req.ReminderType) {
		respondError(w, "Invalid reminder_type. Must be one of: treatment_due, treatment_followup, custom", http.StatusBadRequest)
		return
	}

	input := &storage.CreateReminderInput{
		HiveID:       req.HiveID,
		ReminderType: req.ReminderType,
		Title:        req.Title,
		DueAt:        req.DueAt,
		Metadata:     req.Metadata,
	}

	reminder, err := storage.CreateReminder(r.Context(), conn, tenantID, input)
	if err != nil {
		log.Error().Err(err).Msg("handler: failed to create reminder")
		respondError(w, "Failed to create reminder", http.StatusInternalServerError)
		return
	}

	// Get hive name if applicable
	var hiveName *string
	if reminder.HiveID != nil {
		if hive, err := storage.GetHiveByID(r.Context(), conn, *reminder.HiveID); err == nil {
			hiveName = &hive.Name
		}
	}

	log.Info().
		Str("reminder_id", reminder.ID).
		Str("title", reminder.Title).
		Msg("Reminder created")

	respondJSON(w, ReminderDataResponse{Data: reminderToResponse(reminder, hiveName)}, http.StatusCreated)
}

// GetReminder handles GET /api/reminders/{id} - returns a specific reminder.
func GetReminder(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())
	reminderID := chi.URLParam(r, "id")

	if reminderID == "" {
		respondError(w, "Reminder ID is required", http.StatusBadRequest)
		return
	}

	reminder, err := storage.GetReminderByID(r.Context(), conn, tenantID, reminderID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Reminder not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("reminder_id", reminderID).Msg("handler: failed to get reminder")
		respondError(w, "Failed to get reminder", http.StatusInternalServerError)
		return
	}

	// Get hive name if applicable
	var hiveName *string
	if reminder.HiveID != nil {
		if hive, err := storage.GetHiveByID(r.Context(), conn, *reminder.HiveID); err == nil {
			hiveName = &hive.Name
		}
	}

	respondJSON(w, ReminderDataResponse{Data: reminderToResponse(reminder, hiveName)}, http.StatusOK)
}

// UpdateReminder handles PUT /api/reminders/{id} - updates a reminder.
func UpdateReminder(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())
	reminderID := chi.URLParam(r, "id")

	if reminderID == "" {
		respondError(w, "Reminder ID is required", http.StatusBadRequest)
		return
	}

	var req UpdateReminderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	input := &storage.UpdateReminderInput{
		Title:        req.Title,
		DueAt:        req.DueAt,
		SnoozedUntil: req.SnoozedUntil,
		Metadata:     req.Metadata,
	}

	reminder, err := storage.UpdateReminder(r.Context(), conn, tenantID, reminderID, input)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Reminder not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("reminder_id", reminderID).Msg("handler: failed to update reminder")
		respondError(w, "Failed to update reminder", http.StatusInternalServerError)
		return
	}

	// Get hive name if applicable
	var hiveName *string
	if reminder.HiveID != nil {
		if hive, err := storage.GetHiveByID(r.Context(), conn, *reminder.HiveID); err == nil {
			hiveName = &hive.Name
		}
	}

	log.Info().
		Str("reminder_id", reminder.ID).
		Msg("Reminder updated")

	respondJSON(w, ReminderDataResponse{Data: reminderToResponse(reminder, hiveName)}, http.StatusOK)
}

// DeleteReminder handles DELETE /api/reminders/{id} - deletes a reminder.
func DeleteReminder(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())
	reminderID := chi.URLParam(r, "id")

	if reminderID == "" {
		respondError(w, "Reminder ID is required", http.StatusBadRequest)
		return
	}

	err := storage.DeleteReminder(r.Context(), conn, tenantID, reminderID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Reminder not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("reminder_id", reminderID).Msg("handler: failed to delete reminder")
		respondError(w, "Failed to delete reminder", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("reminder_id", reminderID).
		Msg("Reminder deleted")

	w.WriteHeader(http.StatusNoContent)
}

// SnoozeReminder handles POST /api/reminders/{id}/snooze - snoozes a reminder.
func SnoozeReminder(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())
	reminderID := chi.URLParam(r, "id")

	if reminderID == "" {
		respondError(w, "Reminder ID is required", http.StatusBadRequest)
		return
	}

	var req SnoozeReminderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Days <= 0 {
		req.Days = DefaultSnoozeDays
	}

	reminder, err := storage.SnoozeReminder(r.Context(), conn, tenantID, reminderID, req.Days)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Reminder not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("reminder_id", reminderID).Msg("handler: failed to snooze reminder")
		respondError(w, "Failed to snooze reminder", http.StatusInternalServerError)
		return
	}

	// Get hive name if applicable
	var hiveName *string
	if reminder.HiveID != nil {
		if hive, err := storage.GetHiveByID(r.Context(), conn, *reminder.HiveID); err == nil {
			hiveName = &hive.Name
		}
	}

	log.Info().
		Str("reminder_id", reminder.ID).
		Int("days", req.Days).
		Msg("Reminder snoozed")

	respondJSON(w, ReminderDataResponse{Data: reminderToResponse(reminder, hiveName)}, http.StatusOK)
}

// CompleteReminder handles POST /api/reminders/{id}/complete - marks a reminder as done.
func CompleteReminder(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())
	reminderID := chi.URLParam(r, "id")

	if reminderID == "" {
		respondError(w, "Reminder ID is required", http.StatusBadRequest)
		return
	}

	reminder, err := storage.CompleteReminder(r.Context(), conn, tenantID, reminderID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Reminder not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("reminder_id", reminderID).Msg("handler: failed to complete reminder")
		respondError(w, "Failed to complete reminder", http.StatusInternalServerError)
		return
	}

	// Get hive name if applicable
	var hiveName *string
	if reminder.HiveID != nil {
		if hive, err := storage.GetHiveByID(r.Context(), conn, *reminder.HiveID); err == nil {
			hiveName = &hive.Name
		}
	}

	log.Info().
		Str("reminder_id", reminder.ID).
		Msg("Reminder completed")

	respondJSON(w, ReminderDataResponse{Data: reminderToResponse(reminder, hiveName)}, http.StatusOK)
}

// GetTreatmentIntervals handles GET /api/settings/treatment-intervals.
func GetTreatmentIntervals(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())

	intervals, err := storage.GetTreatmentIntervals(r.Context(), conn, tenantID)
	if err != nil {
		log.Error().Err(err).Msg("handler: failed to get treatment intervals")
		respondError(w, "Failed to get treatment intervals", http.StatusInternalServerError)
		return
	}

	respondJSON(w, TreatmentIntervalsResponse{Data: intervals}, http.StatusOK)
}

// UpdateTreatmentIntervals handles PUT /api/settings/treatment-intervals.
func UpdateTreatmentIntervals(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())

	var intervals map[string]int
	if err := json.NewDecoder(r.Body).Decode(&intervals); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// FIX (S3B-LOW-04): Validate treatment type keys against a known allowlist
	// to avoid reflecting arbitrary user input in error messages.
	validTreatmentTypes := map[string]bool{
		"oxalic_acid": true, "formic_acid": true, "apiguard": true,
		"apivar": true, "maqs": true, "api_bioxal": true,
	}
	// Validate intervals (must be positive integers with known treatment types)
	for k, v := range intervals {
		if !validTreatmentTypes[k] {
			respondError(w, "Unknown treatment type in intervals", http.StatusBadRequest)
			return
		}
		if v <= 0 {
			respondError(w, "All intervals must be positive", http.StatusBadRequest)
			return
		}
		if v > 365 {
			respondError(w, "Intervals cannot exceed 365 days", http.StatusBadRequest)
			return
		}
	}

	err := storage.UpdateTreatmentIntervals(r.Context(), conn, tenantID, intervals)
	if err != nil {
		log.Error().Err(err).Msg("handler: failed to update treatment intervals")
		respondError(w, "Failed to update treatment intervals", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("tenant_id", tenantID).
		Msg("Treatment intervals updated")

	// Return the merged intervals
	mergedIntervals, _ := storage.GetTreatmentIntervals(r.Context(), conn, tenantID)
	respondJSON(w, TreatmentIntervalsResponse{Data: mergedIntervals}, http.StatusOK)
}

// DefaultSnoozeDays is the default number of days to snooze a reminder.
const DefaultSnoozeDays = 7

// SkipTreatmentDue handles POST /api/calendar/skip-treatment - permanently dismisses a computed treatment due.
// This creates a completed reminder record so the treatment due won't appear again (until new treatment resets cycle).
func SkipTreatmentDue(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())

	var req struct {
		HiveID        string `json:"hive_id"`
		TreatmentType string `json:"treatment_type"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.HiveID == "" || req.TreatmentType == "" {
		respondError(w, "hive_id and treatment_type are required", http.StatusBadRequest)
		return
	}

	// Check if a reminder already exists for this hive + treatment type
	existingReminder, err := storage.FindTreatmentDueSnoozeReminder(r.Context(), conn, tenantID, req.HiveID, req.TreatmentType)
	if err != nil {
		log.Error().Err(err).Msg("handler: failed to check for existing reminder")
		respondError(w, "Failed to skip treatment due", http.StatusInternalServerError)
		return
	}

	if existingReminder != nil {
		// Complete existing reminder to permanently dismiss
		_, err = storage.CompleteReminder(r.Context(), conn, tenantID, existingReminder.ID)
	} else {
		// Create a new completed reminder to track the skip
		dueAt := time.Now().Format("2006-01-02")
		input := &storage.CreateReminderInput{
			HiveID:       &req.HiveID,
			ReminderType: "treatment_due",
			Title:        formatTreatmentType(req.TreatmentType) + " treatment skipped",
			DueAt:        dueAt,
			Metadata: map[string]any{
				"treatment_type": req.TreatmentType,
				"skipped":        true,
			},
		}

		reminder, createErr := storage.CreateReminder(r.Context(), conn, tenantID, input)
		if createErr != nil {
			log.Error().Err(createErr).Msg("handler: failed to create skip reminder")
			respondError(w, "Failed to skip treatment due", http.StatusInternalServerError)
			return
		}

		// Immediately complete it
		_, err = storage.CompleteReminder(r.Context(), conn, tenantID, reminder.ID)
	}
	if err != nil {
		log.Error().Err(err).Msg("handler: failed to complete skip reminder")
		respondError(w, "Failed to skip treatment due", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("hive_id", req.HiveID).
		Str("treatment_type", req.TreatmentType).
		Msg("Treatment due skipped")

	respondJSON(w, map[string]any{
		"message": "Treatment due skipped",
	}, http.StatusOK)
}

// SnoozeTreatmentDue handles POST /api/calendar/snooze-treatment - snoozes a computed treatment due.
// This creates a reminder record to track the snooze.
func SnoozeTreatmentDue(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())

	var req struct {
		HiveID        string `json:"hive_id"`
		TreatmentType string `json:"treatment_type"`
		Days          int    `json:"days"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.HiveID == "" || req.TreatmentType == "" {
		respondError(w, "hive_id and treatment_type are required", http.StatusBadRequest)
		return
	}

	if req.Days <= 0 {
		req.Days = DefaultSnoozeDays
	}

	snoozedUntil := time.Now().AddDate(0, 0, req.Days).Format("2006-01-02")

	// Check if a snooze reminder already exists for this hive + treatment type
	existingReminder, err := storage.FindTreatmentDueSnoozeReminder(r.Context(), conn, tenantID, req.HiveID, req.TreatmentType)
	if err != nil {
		log.Error().Err(err).Msg("handler: failed to check for existing snooze reminder")
		respondError(w, "Failed to snooze treatment due", http.StatusInternalServerError)
		return
	}

	var reminder *storage.Reminder
	if existingReminder != nil {
		// Update existing reminder instead of creating new one
		reminder, err = storage.SnoozeReminder(r.Context(), conn, tenantID, existingReminder.ID, req.Days)
	} else {
		// Create a new reminder to track this snooze
		dueAt := time.Now().Format("2006-01-02")
		input := &storage.CreateReminderInput{
			HiveID:       &req.HiveID,
			ReminderType: "treatment_due",
			Title:        formatTreatmentType(req.TreatmentType) + " treatment snoozed",
			DueAt:        dueAt,
			Metadata: map[string]any{
				"treatment_type": req.TreatmentType,
				"snoozed":        true,
			},
		}

		reminder, err = storage.CreateReminder(r.Context(), conn, tenantID, input)
		if err != nil {
			log.Error().Err(err).Msg("handler: failed to create snooze reminder")
			respondError(w, "Failed to snooze treatment due", http.StatusInternalServerError)
			return
		}

		// Now snooze the reminder we just created
		reminder, err = storage.SnoozeReminder(r.Context(), conn, tenantID, reminder.ID, req.Days)
	}
	if err != nil {
		log.Error().Err(err).Msg("handler: failed to set snooze date")
		respondError(w, "Failed to snooze treatment due", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("hive_id", req.HiveID).
		Str("treatment_type", req.TreatmentType).
		Str("snoozed_until", snoozedUntil).
		Msg("Treatment due snoozed")

	respondJSON(w, map[string]any{
		"message":       "Treatment due snoozed",
		"snoozed_until": snoozedUntil,
	}, http.StatusOK)
}
