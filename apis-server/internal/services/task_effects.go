// Package services provides business logic services for the APIS server.
package services

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/rs/zerolog/log"
	"github.com/shopspring/decimal"
)

// AutoEffects represents the complete auto_effects schema from a task template.
type AutoEffects struct {
	Prompts []AutoEffectPrompt  `json:"prompts,omitempty"`
	Updates []AutoEffectUpdate  `json:"updates,omitempty"`
	Creates []AutoEffectCreate  `json:"creates,omitempty"`
}

// AutoEffectPrompt represents a prompt configuration in auto_effects.
type AutoEffectPrompt struct {
	Key      string   `json:"key"`
	Label    string   `json:"label"`
	Type     string   `json:"type"`
	Options  []string `json:"options,omitempty"`
	Required bool     `json:"required"`
}

// AutoEffectUpdate represents an update action in auto_effects.
type AutoEffectUpdate struct {
	Target    string `json:"target"`              // e.g., "hive.queen_introduced_at"
	Action    string `json:"action"`              // "set", "increment", "decrement"
	Value     any    `json:"value,omitempty"`     // Direct value
	ValueFrom string `json:"value_from,omitempty"` // Reference like "completion_data.source"
	Condition string `json:"condition,omitempty"` // e.g., "completion_data.box_type == 'brood'"
}

// AutoEffectCreate represents a create action in auto_effects.
type AutoEffectCreate struct {
	Entity string         `json:"entity"` // "harvest", "feeding", "treatment"
	Fields map[string]any `json:"fields,omitempty"`
}

// UpdateResult tracks old and new values for an update.
type UpdateResult struct {
	Old any `json:"old"`
	New any `json:"new"`
}

// AppliedChanges tracks all changes applied during auto-effects processing.
// This struct is serialized to JSON and stored in the database, so Errors
// uses []string instead of []error for proper JSON marshaling.
type AppliedChanges struct {
	Updates map[string]UpdateResult `json:"updates,omitempty"`
	Creates map[string]string       `json:"creates,omitempty"`
	Errors  []string                `json:"errors,omitempty"`
}

// ParseAutoEffects parses JSON bytes into an AutoEffects struct.
func ParseAutoEffects(data json.RawMessage) (*AutoEffects, error) {
	if data == nil || len(data) == 0 {
		return nil, nil
	}

	var effects AutoEffects
	if err := json.Unmarshal(data, &effects); err != nil {
		return nil, fmt.Errorf("services: failed to parse auto_effects: %w", err)
	}

	return &effects, nil
}

// ProcessAutoEffects processes all auto-effects for a completed task.
// It returns AppliedChanges with results, even if some effects fail.
// Errors are logged and recorded but do not cause the function to fail.
//
// Thread safety: This function uses the provided connection for all database
// operations. Each update/create is executed independently (not atomic).
// The caller is responsible for connection management.
func ProcessAutoEffects(ctx context.Context, conn *pgxpool.Conn, tenantID string, task *storage.TaskWithTemplate, completionData map[string]any) *AppliedChanges {
	result := &AppliedChanges{
		Updates: make(map[string]UpdateResult),
		Creates: make(map[string]string),
		Errors:  []string{},
	}

	// Parse auto_effects from template
	effects, err := ParseAutoEffects(task.TemplateAutoEffects)
	if err != nil {
		log.Error().Err(err).Str("task_id", task.ID).Msg("Failed to parse auto_effects")
		result.Errors = append(result.Errors, fmt.Sprintf("Failed to parse auto_effects: %v", err))
		return result
	}

	if effects == nil {
		return result
	}

	// Validate hive exists before processing updates (fail-fast for orphaned tasks)
	if task.HiveID != "" && len(effects.Updates) > 0 {
		_, err := storage.GetHiveByID(ctx, conn, task.HiveID)
		if err != nil {
			log.Error().Err(err).
				Str("task_id", task.ID).
				Str("hive_id", task.HiveID).
				Msg("Hive not found for auto-effects processing")
			result.Errors = append(result.Errors, fmt.Sprintf("Hive %s not found: %v", task.HiveID, err))
			// Continue to process creates which may not require hive
		}
	}

	// Process updates
	for _, update := range effects.Updates {
		if err := processUpdate(ctx, conn, task.HiveID, update, completionData, result); err != nil {
			log.Error().Err(err).
				Str("task_id", task.ID).
				Str("target", update.Target).
				Msg("Auto-effect update failed")
			result.Errors = append(result.Errors, fmt.Sprintf("Failed to update %s: %v", update.Target, err))
		}
	}

	// Process creates
	for _, create := range effects.Creates {
		if err := processCreate(ctx, conn, tenantID, task.HiveID, create, completionData, result); err != nil {
			log.Error().Err(err).
				Str("task_id", task.ID).
				Str("entity", create.Entity).
				Msg("Auto-effect create failed")
			result.Errors = append(result.Errors, fmt.Sprintf("Failed to create %s: %v", create.Entity, err))
		}
	}

	log.Info().
		Str("task_id", task.ID).
		Str("hive_id", task.HiveID).
		Int("updates_count", len(result.Updates)).
		Int("creates_count", len(result.Creates)).
		Int("errors_count", len(result.Errors)).
		Msg("Auto-effects processed for task completion")

	return result
}

// processUpdate handles a single update action.
func processUpdate(ctx context.Context, conn *pgxpool.Conn, hiveID string, update AutoEffectUpdate, completionData map[string]any, result *AppliedChanges) error {
	// Check condition if present
	if update.Condition != "" {
		if !evaluateCondition(update.Condition, completionData) {
			// Condition not met, skip this update
			log.Debug().
				Str("target", update.Target).
				Str("condition", update.Condition).
				Interface("completion_data", completionData).
				Msg("Skipping auto-effect update: condition not met")
			return nil
		}
	}

	// Parse target field (e.g., "hive.queen_introduced_at" -> "queen_introduced_at")
	field := parseTargetField(update.Target)
	if field == "" {
		return fmt.Errorf("invalid target: %s", update.Target)
	}

	// Validate allowed fields
	if !isAllowedHiveField(field) {
		return fmt.Errorf("field not allowed for auto-update: %s", field)
	}

	// Resolve the value
	value := resolveValue(update.Value, update.ValueFrom, completionData)

	switch update.Action {
	case "set":
		return applySetAction(ctx, conn, hiveID, field, value, result)
	case "increment":
		return applyIncrementAction(ctx, conn, hiveID, field, value, result)
	case "decrement":
		return applyDecrementAction(ctx, conn, hiveID, field, value, result)
	default:
		return fmt.Errorf("unknown action: %s", update.Action)
	}
}

// processCreate handles a single create action.
func processCreate(ctx context.Context, conn *pgxpool.Conn, tenantID, hiveID string, create AutoEffectCreate, completionData map[string]any, result *AppliedChanges) error {
	// Merge create.Fields with completionData (completionData takes precedence)
	fields := mergeFields(create.Fields, completionData)

	// Resolve any remaining {{completion_data.*}} template strings in field values
	for k, v := range fields {
		if strVal, ok := v.(string); ok {
			fields[k] = resolveTemplateString(strVal, completionData)
		}
	}

	switch create.Entity {
	case "harvest":
		harvest, err := storage.CreateHarvestFromTask(ctx, conn, tenantID, hiveID, fields)
		if err != nil {
			return err
		}
		result.Creates["harvest_id"] = harvest.ID
		log.Info().Str("harvest_id", harvest.ID).Str("hive_id", hiveID).Msg("Harvest created from task")
		return nil

	case "feeding":
		feeding, err := storage.CreateFeedingFromTask(ctx, conn, tenantID, hiveID, fields)
		if err != nil {
			return err
		}
		result.Creates["feeding_id"] = feeding.ID
		log.Info().Str("feeding_id", feeding.ID).Str("hive_id", hiveID).Msg("Feeding created from task")
		return nil

	case "treatment":
		treatment, err := storage.CreateTreatmentFromTask(ctx, conn, tenantID, hiveID, fields)
		if err != nil {
			return err
		}
		result.Creates["treatment_id"] = treatment.ID
		log.Info().Str("treatment_id", treatment.ID).Str("hive_id", hiveID).Msg("Treatment created from task")
		return nil

	default:
		return fmt.Errorf("unknown entity type: %s", create.Entity)
	}
}

// resolveValue resolves a value from direct value, value_from reference, or template.
func resolveValue(directValue any, valueFrom string, completionData map[string]any) any {
	// If valueFrom is specified, resolve from completion_data
	if valueFrom != "" {
		return resolveValueFrom(valueFrom, completionData)
	}

	// Handle template strings in direct value
	if strVal, ok := directValue.(string); ok {
		return resolveTemplateString(strVal, completionData)
	}

	return directValue
}

// resolveValueFrom resolves a value from a path like "completion_data.source".
func resolveValueFrom(path string, completionData map[string]any) any {
	// Strip "completion_data." prefix if present
	path = strings.TrimPrefix(path, "completion_data.")

	// Support nested paths like "source.name"
	parts := strings.Split(path, ".")
	var current any = completionData

	for _, part := range parts {
		if m, ok := current.(map[string]any); ok {
			current = m[part]
		} else {
			return nil
		}
	}

	return current
}

// resolveTemplateString resolves template variables in a string.
func resolveTemplateString(template string, completionData map[string]any) any {
	// Handle {{current_date}}
	if template == "{{current_date}}" {
		return time.Now().Format("2006-01-02")
	}

	// Handle {{completion_data.field}}
	if strings.HasPrefix(template, "{{completion_data.") && strings.HasSuffix(template, "}}") {
		field := strings.TrimSuffix(strings.TrimPrefix(template, "{{completion_data."), "}}")
		return resolveValueFrom(field, completionData)
	}

	// Return as-is if no template
	return template
}

// evaluateCondition evaluates a simple equality condition.
// Supports: "completion_data.field == 'value'"
func evaluateCondition(condition string, completionData map[string]any) bool {
	// Parse "completion_data.field == 'value'"
	parts := strings.Split(condition, " == ")
	if len(parts) != 2 {
		// Invalid condition format, return false to skip
		log.Warn().Str("condition", condition).Msg("Invalid condition format, skipping update")
		return false
	}

	// Get the field path
	fieldPath := strings.TrimSpace(parts[0])
	fieldPath = strings.TrimPrefix(fieldPath, "completion_data.")

	// Get the expected value (strip quotes)
	expected := strings.TrimSpace(parts[1])
	expected = strings.Trim(expected, "'\"")

	// Get actual value
	actual := resolveValueFrom(fieldPath, completionData)
	actualStr, _ := actual.(string)

	return actualStr == expected
}

// parseTargetField extracts the field name from a target like "hive.queen_introduced_at".
func parseTargetField(target string) string {
	parts := strings.Split(target, ".")
	if len(parts) != 2 || parts[0] != "hive" {
		return ""
	}
	return parts[1]
}

// isAllowedHiveField checks if a field is allowed for auto-update.
var allowedHiveFields = map[string]bool{
	"queen_introduced_at": true,
	"queen_source":        true,
	"brood_boxes":         true,
	"honey_supers":        true,
}

func isAllowedHiveField(field string) bool {
	return allowedHiveFields[field]
}

// applySetAction applies a "set" action to a hive field.
func applySetAction(ctx context.Context, conn *pgxpool.Conn, hiveID, field string, value any, result *AppliedChanges) error {
	oldValue, err := storage.UpdateHiveField(ctx, conn, hiveID, field, value)
	if err != nil {
		return err
	}

	result.Updates[field] = UpdateResult{Old: oldValue, New: value}
	return nil
}

// applyIncrementAction applies an "increment" action to a numeric hive field.
func applyIncrementAction(ctx context.Context, conn *pgxpool.Conn, hiveID, field string, value any, result *AppliedChanges) error {
	amount := toInt(value)
	if amount == 0 {
		amount = 1 // Default increment by 1
	}

	oldValue, newValue, err := storage.IncrementHiveField(ctx, conn, hiveID, field, amount)
	if err != nil {
		return err
	}

	result.Updates[field] = UpdateResult{Old: oldValue, New: newValue}
	return nil
}

// applyDecrementAction applies a "decrement" action to a numeric hive field.
// The result is clamped to 0 (cannot go negative).
func applyDecrementAction(ctx context.Context, conn *pgxpool.Conn, hiveID, field string, value any, result *AppliedChanges) error {
	amount := toInt(value)
	if amount == 0 {
		amount = 1 // Default decrement by 1
	}

	oldValue, newValue, err := storage.DecrementHiveField(ctx, conn, hiveID, field, amount)
	if err != nil {
		return err
	}

	result.Updates[field] = UpdateResult{Old: oldValue, New: newValue}
	return nil
}

// toInt converts a value to int, returning 0 if conversion fails.
// Logs a warning on conversion failure to aid debugging.
func toInt(v any) int {
	switch val := v.(type) {
	case int:
		return val
	case int64:
		return int(val)
	case float64:
		return int(val)
	case string:
		i, err := strconv.Atoi(val)
		if err != nil {
			log.Warn().Str("value", val).Msg("Failed to convert string to int in auto-effect, using 0")
			return 0
		}
		return i
	case json.Number:
		i, err := val.Int64()
		if err != nil {
			log.Warn().Str("value", val.String()).Msg("Failed to convert json.Number to int in auto-effect, using 0")
			return 0
		}
		return int(i)
	default:
		log.Warn().Interface("value", v).Msg("Unsupported type for int conversion in auto-effect, using 0")
		return 0
	}
}

// mergeFields merges two maps, with the second map taking precedence.
func mergeFields(base map[string]any, override map[string]any) map[string]any {
	result := make(map[string]any)

	// Copy base fields
	for k, v := range base {
		result[k] = v
	}

	// Override with completion data
	for k, v := range override {
		result[k] = v
	}

	return result
}

// ToJSON converts AppliedChanges to JSON for storage.
func (ac *AppliedChanges) ToJSON() json.RawMessage {
	data, err := json.Marshal(ac)
	if err != nil {
		log.Error().Err(err).Msg("Failed to marshal AppliedChanges")
		return nil
	}
	return data
}

// ParseCompletionData parses completion_data JSON into a map.
func ParseCompletionData(data json.RawMessage) map[string]any {
	if data == nil || len(data) == 0 {
		return make(map[string]any)
	}

	// Use decoder with UseNumber to preserve numeric types
	decoder := json.NewDecoder(strings.NewReader(string(data)))
	decoder.UseNumber()

	var result map[string]any
	if err := decoder.Decode(&result); err != nil {
		log.Warn().Err(err).Msg("Failed to parse completion_data")
		return make(map[string]any)
	}

	return result
}

// Helper functions for storage package to parse completion data fields.
// NOTE: These canonical helpers should be used by storage/feedings.go,
// storage/treatments.go, and storage/harvests.go instead of their local
// duplicates (parseStringField, parseTreatmentStringField, etc.).
// TODO: Refactor storage packages to use these shared helpers.

// ParseAmountFromFields extracts and parses an amount from a fields map.
func ParseAmountFromFields(fields map[string]any, key string) decimal.Decimal {
	if val, ok := fields[key]; ok {
		switch v := val.(type) {
		case float64:
			return decimal.NewFromFloat(v)
		case int:
			return decimal.NewFromInt(int64(v))
		case int64:
			return decimal.NewFromInt(v)
		case string:
			// Try to parse as decimal, handling formats like "2L" or "12.5"
			cleaned := strings.TrimRight(v, "LlKkGgMm ") // Remove common unit suffixes
			d, err := decimal.NewFromString(cleaned)
			if err == nil {
				return d
			}
		case json.Number:
			f, _ := v.Float64()
			return decimal.NewFromFloat(f)
		}
	}
	return decimal.Zero
}

// ParseStringFromFields extracts a string from a fields map.
func ParseStringFromFields(fields map[string]any, key string, defaultVal string) string {
	if val, ok := fields[key]; ok {
		if s, ok := val.(string); ok && s != "" {
			return s
		}
	}
	return defaultVal
}

// ParseIntFromFields extracts an int from a fields map.
func ParseIntFromFields(fields map[string]any, key string) *int {
	if val, ok := fields[key]; ok {
		switch v := val.(type) {
		case float64:
			i := int(v)
			return &i
		case int:
			return &v
		case int64:
			i := int(v)
			return &i
		case string:
			if i, err := strconv.Atoi(v); err == nil {
				return &i
			}
		case json.Number:
			if i, err := v.Int64(); err == nil {
				ii := int(i)
				return &ii
			}
		}
	}
	return nil
}

// ParseDateFromFields extracts a date from a fields map.
func ParseDateFromFields(fields map[string]any, key string) time.Time {
	if val, ok := fields[key]; ok {
		if dateStr, ok := val.(string); ok {
			if parsed, err := time.Parse("2006-01-02", dateStr); err == nil {
				return parsed
			}
			// Try ISO format
			if parsed, err := time.Parse(time.RFC3339, dateStr); err == nil {
				return parsed
			}
		}
	}
	return time.Now()
}

// PtrIfNotEmpty returns a pointer to the string if not empty, otherwise nil.
func PtrIfNotEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// CreateTaskCompletionLog creates an activity log entry for a completed task.
// This records the task completion in the hive's activity history.
// Parameters:
//   - ctx: context for the request
//   - conn: database connection
//   - tenantID: tenant ID for the activity log entry
//   - task: the completed task with template details
//   - userID: ID of the user who completed the task
//   - appliedChanges: optional changes that were auto-applied (can be nil)
//
// Returns error only for logging; callers should not fail on activity log errors.
func CreateTaskCompletionLog(ctx context.Context, conn *pgxpool.Conn, tenantID string, task *storage.TaskWithTemplate, userID string, appliedChanges *AppliedChanges) error {
	// Determine task name (template name or custom title)
	taskName := ""
	if task.TemplateName != nil && *task.TemplateName != "" {
		taskName = *task.TemplateName
	} else if task.CustomTitle != nil && *task.CustomTitle != "" {
		taskName = *task.CustomTitle
	} else {
		taskName = "Task"
	}

	// Build content string
	content := fmt.Sprintf("Task completed: %s", taskName)

	// Determine if auto-effects were applied and format changes
	autoApplied := false
	var changes []string
	if appliedChanges != nil && (len(appliedChanges.Updates) > 0 || len(appliedChanges.Creates) > 0) {
		autoApplied = true
		changes = formatChangesForLog(appliedChanges)
		if len(changes) > 0 {
			// Append summary of changed fields to content
			fieldNames := make([]string, 0)
			for field := range appliedChanges.Updates {
				fieldNames = append(fieldNames, field)
			}
			for entity := range appliedChanges.Creates {
				fieldNames = append(fieldNames, entity)
			}
			content = fmt.Sprintf("Task completed: %s. Auto-updated: %s", taskName, strings.Join(fieldNames, ", "))
		}
	}

	// Build metadata
	metadata := storage.ActivityLogMetadata{
		TaskID:      task.ID,
		TaskName:    taskName,
		AutoApplied: autoApplied,
		Changes:     changes,
	}

	// Include completion data if present
	if len(task.CompletionData) > 0 {
		var completionData map[string]any
		if err := json.Unmarshal(task.CompletionData, &completionData); err == nil {
			metadata.CompletionData = completionData
		}
	}

	// Include task notes/description if present
	if task.Description != nil && *task.Description != "" {
		metadata.Notes = *task.Description
	}

	// Marshal metadata to JSON
	metadataJSON, err := json.Marshal(metadata)
	if err != nil {
		return fmt.Errorf("services: failed to marshal activity log metadata: %w", err)
	}

	// Create the activity log entry
	input := &storage.CreateActivityLogInput{
		HiveID:    task.HiveID,
		Type:      "task_completion",
		Content:   content,
		Metadata:  metadataJSON,
		CreatedBy: userID,
	}

	_, err = storage.CreateActivityLogEntry(ctx, conn, tenantID, input)
	if err != nil {
		return fmt.Errorf("services: failed to create activity log entry: %w", err)
	}

	log.Info().
		Str("task_id", task.ID).
		Str("hive_id", task.HiveID).
		Str("activity_type", "task_completion").
		Bool("auto_applied", autoApplied).
		Msg("Task completion activity logged")

	return nil
}

// formatChangesForLog formats AppliedChanges into human-readable change descriptions.
// Example output: ["queen_introduced_at -> 2026-01-30", "queen_source -> Local breeder"]
func formatChangesForLog(changes *AppliedChanges) []string {
	result := make([]string, 0)

	// Format updates
	for field, update := range changes.Updates {
		result = append(result, fmt.Sprintf("%s -> %v", field, update.New))
	}

	// Format creates
	for entity, id := range changes.Creates {
		result = append(result, fmt.Sprintf("created %s (%s)", entity, id))
	}

	return result
}
