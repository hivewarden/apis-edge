package services

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jermoo/apis/apis-server/internal/storage"
)

// ActivityItem is the API response format for activity feed items.
type ActivityItem struct {
	ID           string  `json:"id"`
	ActivityType string  `json:"activity_type"`  // inspection_created, treatment_recorded, etc.
	Icon         string  `json:"icon"`           // ant-design icon name
	Message      string  `json:"message"`        // Human-readable message
	RelativeTime string  `json:"relative_time"`  // "2 hours ago", "yesterday"
	Timestamp    string  `json:"timestamp"`      // ISO 8601
	EntityType   string  `json:"entity_type"`
	EntityID     string  `json:"entity_id"`
	EntityName   *string `json:"entity_name,omitempty"`
	HiveID       *string `json:"hive_id,omitempty"`
	HiveName     *string `json:"hive_name,omitempty"`
}

// ActivityFeedResult contains the activity items and pagination info.
type ActivityFeedResult struct {
	Items      []ActivityItem `json:"items"`
	Cursor     *string        `json:"cursor,omitempty"`
	CursorTime *string        `json:"cursor_time,omitempty"`
	HasMore    bool           `json:"has_more"`
}

// ActivityService handles activity feed operations.
type ActivityService struct {
	pool *pgxpool.Pool
}

// NewActivityService creates a new activity service.
func NewActivityService(pool *pgxpool.Pool) *ActivityService {
	return &ActivityService{pool: pool}
}

// Icon mapping for activity types
var activityIcons = map[string]string{
	"inspection_created":  "FileSearchOutlined",
	"treatment_recorded":  "MedicineBoxOutlined",
	"feeding_recorded":    "CoffeeOutlined",
	"harvest_recorded":    "GiftOutlined",
	"hive_created":        "HomeOutlined",
	"hive_updated":        "EditOutlined",
	"hive_deleted":        "DeleteOutlined",
	"clip_uploaded":       "VideoCameraOutlined",
	"user_joined":         "UserAddOutlined",
	"site_created":        "EnvironmentOutlined",
	"site_updated":        "EditOutlined",
	"site_deleted":        "DeleteOutlined",
}

// GetActivityFeed retrieves and transforms activity entries for the feed.
func (s *ActivityService) GetActivityFeed(ctx context.Context, filters *storage.ActivityFilters) (*ActivityFeedResult, error) {
	entries, hasMore, err := storage.ListActivity(ctx, s.pool, filters)
	if err != nil {
		return nil, fmt.Errorf("service: get activity feed: %w", err)
	}

	items := make([]ActivityItem, 0, len(entries))
	for _, entry := range entries {
		item := transformToActivityItem(&entry)
		if item != nil {
			items = append(items, *item)
		}
	}

	result := &ActivityFeedResult{
		Items:   items,
		HasMore: hasMore,
	}

	// Set cursor (id and timestamp) if there are items for tuple-based pagination
	if len(entries) > 0 {
		lastEntry := entries[len(entries)-1]
		cursor := lastEntry.ID
		cursorTime := lastEntry.CreatedAt.Format(time.RFC3339Nano)
		result.Cursor = &cursor
		result.CursorTime = &cursorTime
	}

	return result, nil
}

// transformToActivityItem converts an audit entry to an activity item.
func transformToActivityItem(entry *storage.ActivityEntry) *ActivityItem {
	activityType := getActivityType(entry.EntityType, entry.Action)
	if activityType == "" {
		return nil // Skip unsupported activity types
	}

	message := generateMessage(entry)
	icon := activityIcons[activityType]
	if icon == "" {
		icon = "ClockCircleOutlined" // Default icon
	}

	return &ActivityItem{
		ID:           entry.ID,
		ActivityType: activityType,
		Icon:         icon,
		Message:      message,
		RelativeTime: formatRelativeTime(entry.CreatedAt),
		Timestamp:    entry.CreatedAt.Format(time.RFC3339),
		EntityType:   entry.EntityType,
		EntityID:     entry.EntityID,
		EntityName:   entry.EntityName,
		HiveID:       entry.HiveID,
		HiveName:     entry.HiveName,
	}
}

// getActivityType maps entity_type and action to activity_type.
func getActivityType(entityType, action string) string {
	switch entityType {
	case "inspections":
		if action == "create" {
			return "inspection_created"
		}
	case "treatments":
		if action == "create" {
			return "treatment_recorded"
		}
	case "feedings":
		if action == "create" {
			return "feeding_recorded"
		}
	case "harvests":
		if action == "create" {
			return "harvest_recorded"
		}
	case "hives":
		switch action {
		case "create":
			return "hive_created"
		case "update":
			return "hive_updated"
		case "delete":
			return "hive_deleted"
		}
	case "clips":
		if action == "create" {
			return "clip_uploaded"
		}
	case "users":
		if action == "create" {
			return "user_joined"
		}
	case "sites":
		switch action {
		case "create":
			return "site_created"
		case "update":
			return "site_updated"
		case "delete":
			return "site_deleted"
		}
	}
	return "" // Unsupported activity type
}

// generateMessage creates a human-readable message for the activity.
func generateMessage(entry *storage.ActivityEntry) string {
	userName := "Someone"
	if entry.UserName != nil && *entry.UserName != "" {
		userName = *entry.UserName
	}

	hiveName := "a hive"
	if entry.HiveName != nil && *entry.HiveName != "" {
		hiveName = *entry.HiveName
	}

	switch entry.EntityType {
	case "inspections":
		return fmt.Sprintf("%s recorded an inspection on %s", userName, hiveName)

	case "treatments":
		treatmentType := extractFromNewValues(entry.NewValues, "treatment_type")
		if treatmentType != "" {
			return fmt.Sprintf("%s applied %s treatment to %s", userName, formatTreatmentType(treatmentType), hiveName)
		}
		return fmt.Sprintf("%s applied a treatment to %s", userName, hiveName)

	case "feedings":
		feedType := extractFromNewValues(entry.NewValues, "feed_type")
		amount := extractFromNewValues(entry.NewValues, "amount")
		unit := extractFromNewValues(entry.NewValues, "unit")
		if feedType != "" && amount != "" {
			return fmt.Sprintf("%s fed %s %s of %s to %s", userName, amount, unit, formatFeedType(feedType), hiveName)
		}
		return fmt.Sprintf("%s fed %s", userName, hiveName)

	case "harvests":
		totalKg := extractFromNewValues(entry.NewValues, "total_kg")
		if totalKg != "" {
			return fmt.Sprintf("%s harvested %s kg of honey", userName, totalKg)
		}
		return fmt.Sprintf("%s recorded a harvest", userName)

	case "hives":
		switch entry.Action {
		case "create":
			if entry.EntityName != nil && *entry.EntityName != "" {
				return fmt.Sprintf("%s created a new hive: %s", userName, *entry.EntityName)
			}
			return fmt.Sprintf("%s created a new hive", userName)
		case "update":
			return fmt.Sprintf("%s updated hive %s", userName, hiveName)
		case "delete":
			return fmt.Sprintf("%s removed hive %s", userName, hiveName)
		}

	case "clips":
		if entry.UnitName != nil && *entry.UnitName != "" {
			return fmt.Sprintf("Unit %s uploaded a detection clip", *entry.UnitName)
		}
		return "A unit uploaded a detection clip"

	case "users":
		if entry.EntityName != nil && *entry.EntityName != "" {
			return fmt.Sprintf("%s joined the team", *entry.EntityName)
		}
		return "A new user joined the team"

	case "sites":
		switch entry.Action {
		case "create":
			if entry.EntityName != nil && *entry.EntityName != "" {
				return fmt.Sprintf("%s created a new site: %s", userName, *entry.EntityName)
			}
			return fmt.Sprintf("%s created a new site", userName)
		case "update":
			if entry.EntityName != nil && *entry.EntityName != "" {
				return fmt.Sprintf("%s updated site %s", userName, *entry.EntityName)
			}
			return fmt.Sprintf("%s updated a site", userName)
		case "delete":
			return fmt.Sprintf("%s removed a site", userName)
		}
	}

	return fmt.Sprintf("%s performed an action", userName)
}

// extractFromNewValues extracts a value from the new_values JSON.
func extractFromNewValues(newValues json.RawMessage, key string) string {
	if len(newValues) == 0 {
		return ""
	}

	var data map[string]any
	if err := json.Unmarshal(newValues, &data); err != nil {
		return ""
	}

	if val, ok := data[key]; ok {
		switch v := val.(type) {
		case string:
			return v
		case float64:
			return fmt.Sprintf("%.1f", v)
		case int:
			return fmt.Sprintf("%d", v)
		}
	}
	return ""
}

// formatTreatmentType formats treatment type for display.
func formatTreatmentType(treatmentType string) string {
	typeMap := map[string]string{
		"oxalic_acid":   "Oxalic acid",
		"formic_acid":   "Formic acid",
		"apivar":        "Apivar",
		"apiguard":      "Apiguard",
		"apistan":       "Apistan",
		"hop_guard":     "Hop Guard",
		"mite_away":     "Mite Away",
		"thymovar":      "Thymovar",
		"other":         "a",
	}

	if formatted, ok := typeMap[treatmentType]; ok {
		return formatted
	}
	return treatmentType
}

// formatFeedType formats feed type for display.
func formatFeedType(feedType string) string {
	typeMap := map[string]string{
		"sugar_syrup":      "sugar syrup",
		"fondant":          "fondant",
		"pollen_patty":     "pollen patty",
		"pollen_substitute": "pollen substitute",
		"dry_sugar":        "dry sugar",
		"honey":            "honey",
		"other":            "feed",
	}

	if formatted, ok := typeMap[feedType]; ok {
		return formatted
	}
	return feedType
}

// formatRelativeTime formats a timestamp as a human-readable relative time.
func formatRelativeTime(t time.Time) string {
	now := time.Now()
	diff := now.Sub(t)

	switch {
	case diff < time.Minute:
		return "just now"
	case diff < time.Hour:
		mins := int(diff.Minutes())
		if mins == 1 {
			return "1 minute ago"
		}
		return fmt.Sprintf("%d minutes ago", mins)
	case diff < 24*time.Hour:
		hours := int(diff.Hours())
		if hours == 1 {
			return "1 hour ago"
		}
		return fmt.Sprintf("%d hours ago", hours)
	case diff < 48*time.Hour:
		return "yesterday"
	case diff < 7*24*time.Hour:
		days := int(diff.Hours() / 24)
		return fmt.Sprintf("%d days ago", days)
	default:
		return t.Format("Jan 2, 2006")
	}
}
