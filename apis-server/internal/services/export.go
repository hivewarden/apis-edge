// Package services provides business logic services for the APIS server.
package services

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jermoo/apis/apis-server/internal/storage"
)

// ExportService provides data export functionality.
type ExportService struct {
	conn *pgxpool.Conn
}

// ExportOptions specifies what data to export and in what format.
type ExportOptions struct {
	TenantID string
	HiveIDs  []string
	Include  IncludeConfig
	Format   string // "summary", "markdown", "json"
}

// IncludeConfig specifies which fields to include in the export.
type IncludeConfig struct {
	Basics    []string `json:"basics,omitempty"`    // hive_name, queen_age, boxes, current_weight, location
	Details   []string `json:"details,omitempty"`   // inspection_log, hornet_data, weight_history, weather_correlations
	Analysis  []string `json:"analysis,omitempty"`  // beebrain_insights, health_summary, season_comparison
	Financial []string `json:"financial,omitempty"` // costs, harvest_revenue, roi_per_hive
}

// ExportResult contains the generated export.
type ExportResult struct {
	Content     string
	Format      string
	HiveCount   int
	GeneratedAt time.Time
}

// HiveExportData contains all exportable data for a single hive.
type HiveExportData struct {
	Hive        *storage.Hive
	Site        *storage.Site // For location data
	Inspections []storage.Inspection
	Treatments  []storage.Treatment
	Feedings    []storage.Feeding
	Harvests    []storage.Harvest
	Detections  []storage.Detection
	// BeeBrain insights (if available)
	Insights []storage.Insight
}

// NewExportService creates a new export service.
func NewExportService(conn *pgxpool.Conn) *ExportService {
	return &ExportService{conn: conn}
}

// Generate creates an export in the requested format.
func (s *ExportService) Generate(ctx context.Context, opts ExportOptions) (*ExportResult, error) {
	// Aggregate data for all requested hives
	hiveData := make([]HiveExportData, 0, len(opts.HiveIDs))

	for _, hiveID := range opts.HiveIDs {
		data, err := s.aggregateHiveData(ctx, hiveID, opts.Include)
		if err != nil {
			return nil, fmt.Errorf("export: failed to aggregate data for hive %s: %w", hiveID, err)
		}
		hiveData = append(hiveData, *data)
	}

	// Generate output in requested format
	var content string
	var err error

	switch opts.Format {
	case "summary":
		content, err = s.formatSummary(hiveData, opts.Include)
	case "markdown":
		content, err = s.formatMarkdown(hiveData, opts.Include)
	case "json":
		content, err = s.formatJSON(hiveData, opts.Include)
	default:
		return nil, fmt.Errorf("export: unknown format: %s", opts.Format)
	}

	if err != nil {
		return nil, fmt.Errorf("export: failed to format output: %w", err)
	}

	return &ExportResult{
		Content:     content,
		Format:      opts.Format,
		HiveCount:   len(hiveData),
		GeneratedAt: time.Now(),
	}, nil
}

// aggregateHiveData collects all relevant data for a hive based on include config.
func (s *ExportService) aggregateHiveData(ctx context.Context, hiveID string, include IncludeConfig) (*HiveExportData, error) {
	data := &HiveExportData{}

	// Always get hive info
	hive, err := storage.GetHiveByID(ctx, s.conn, hiveID)
	if err != nil {
		return nil, fmt.Errorf("failed to get hive: %w", err)
	}
	data.Hive = hive

	// Get site info for location data
	if containsAny(include.Basics, "location") {
		site, err := storage.GetSiteByID(ctx, s.conn, hive.SiteID)
		if err != nil {
			// Non-critical, continue without site data
			data.Site = nil
		} else {
			data.Site = site
		}
	}

	// Get inspections if requested
	if containsAny(include.Details, "inspection_log") {
		inspections, err := storage.ListAllInspectionsByHive(ctx, s.conn, hiveID)
		if err != nil {
			return nil, fmt.Errorf("failed to get inspections: %w", err)
		}
		data.Inspections = inspections
	}

	// Get treatments if requested
	if containsAny(include.Details, "inspection_log") || containsAny(include.Analysis, "health_summary") {
		treatments, err := storage.ListTreatmentsByHive(ctx, s.conn, hiveID)
		if err != nil {
			return nil, fmt.Errorf("failed to get treatments: %w", err)
		}
		data.Treatments = treatments
	}

	// Get feedings if requested
	if containsAny(include.Details, "inspection_log") {
		feedings, err := storage.ListFeedingsByHive(ctx, s.conn, hiveID)
		if err != nil {
			return nil, fmt.Errorf("failed to get feedings: %w", err)
		}
		data.Feedings = feedings
	}

	// Get harvests if requested
	// NOTE: Financial fields implementation status:
	// - harvest_revenue: IMPLEMENTED (via Harvests data)
	// - costs: NOT YET IMPLEMENTED - requires cost tracking feature (deferred to future epic)
	// - roi_per_hive: NOT YET IMPLEMENTED - requires costs to calculate ROI (deferred to future epic)
	if containsAny(include.Financial, "harvest_revenue", "costs", "roi_per_hive") || containsAny(include.Analysis, "season_comparison") {
		harvests, err := storage.ListHarvestsByHive(ctx, s.conn, hiveID)
		if err != nil {
			return nil, fmt.Errorf("failed to get harvests: %w", err)
		}
		data.Harvests = harvests
	}

	// Get detections if requested (from the hive's site)
	if containsAny(include.Details, "hornet_data") {
		// We need to get detections for the site, not directly for the hive
		// Detections are site-level, so we'll include all detections for the site
		detections, _, err := storage.ListDetections(ctx, s.conn, &storage.ListDetectionsParams{
			SiteID:  hive.SiteID,
			From:    time.Now().AddDate(-1, 0, 0), // Last year
			To:      time.Now(),
			Page:    1,
			PerPage: 1000, // Get a reasonable amount
		})
		if err != nil {
			return nil, fmt.Errorf("failed to get detections: %w", err)
		}
		data.Detections = detections
	}

	// Get BeeBrain insights if requested
	// NOTE: Analysis fields implementation status:
	// - beebrain_insights: IMPLEMENTED (via Insights data)
	// - health_summary: NOT YET IMPLEMENTED - requires health scoring algorithm (deferred to future epic)
	// - season_comparison: NOT YET IMPLEMENTED - requires historical season data comparison (deferred to future epic)
	if containsAny(include.Analysis, "beebrain_insights", "health_summary", "season_comparison") {
		insights, err := storage.ListInsightsByHive(ctx, s.conn, hiveID)
		if err != nil {
			// Non-critical, continue without insights
			data.Insights = []storage.Insight{}
		} else {
			data.Insights = insights
		}
	}

	return data, nil
}

// formatSummary generates a quick human-readable summary.
func (s *ExportService) formatSummary(hiveData []HiveExportData, include IncludeConfig) (string, error) {
	var sb strings.Builder

	for i, data := range hiveData {
		if i > 0 {
			sb.WriteString("\n---\n\n")
		}

		sb.WriteString(sanitize(data.Hive.Name))
		sb.WriteString(" - Quick Summary\n")

		// Basics
		if containsAny(include.Basics, "queen_age") && data.Hive.QueenIntroducedAt != nil {
			queenAge := calculateQueenAge(*data.Hive.QueenIntroducedAt)
			source := ""
			if data.Hive.QueenSource != nil {
				source = fmt.Sprintf(" (%s)", sanitize(*data.Hive.QueenSource))
			}
			fmt.Fprintf(&sb, "- Queen: %s old%s\n", queenAge, source)
		}

		if containsAny(include.Basics, "boxes") {
			fmt.Fprintf(&sb, "- Setup: %d brood box(es) + %d honey super(s)\n",
			data.Hive.BroodBoxes, data.Hive.HoneySupers)
		}

		// Location (from site data)
		if containsAny(include.Basics, "location") && data.Site != nil {
			fmt.Fprintf(&sb, "- Location: %s", sanitize(data.Site.Name))
			if data.Site.Latitude != nil && data.Site.Longitude != nil {
				fmt.Fprintf(&sb, " (%.4f, %.4f)", *data.Site.Latitude, *data.Site.Longitude)
			}
			sb.WriteString("\n")
		}

		// Current weight - TODO: Requires weight tracking feature (not yet implemented)
		// When weight sensors are added, this will show the latest weight reading
		if containsAny(include.Basics, "current_weight") {
			// Weight tracking not yet implemented - skip silently
		}

		// Season stats
		if len(data.Harvests) > 0 {
			totalKg := calculateTotalHarvest(data.Harvests)
			fmt.Fprintf(&sb, "- Season harvest: %.1f kg\n", totalKg)
		}

		if len(data.Detections) > 0 {
			fmt.Fprintf(&sb, "- Hornets deterred: %d\n", len(data.Detections))
		}

		if len(data.Inspections) > 0 {
			fmt.Fprintf(&sb, "- Inspections completed: %d\n", len(data.Inspections))
		}
	}

	return sb.String(), nil
}

// formatMarkdown generates detailed markdown suitable for AI assistants.
func (s *ExportService) formatMarkdown(hiveData []HiveExportData, include IncludeConfig) (string, error) {
	var sb strings.Builder

	for i, data := range hiveData {
		if i > 0 {
			sb.WriteString("\n---\n\n")
		}

		// Hive header
		sb.WriteString("## ")
		sb.WriteString(sanitize(data.Hive.Name))
		sb.WriteString(" Details\n\n")

		// Configuration section
		if len(include.Basics) > 0 {
			sb.WriteString("### Configuration\n")

			if containsAny(include.Basics, "queen_age") && data.Hive.QueenIntroducedAt != nil {
				queenAge := calculateQueenAge(*data.Hive.QueenIntroducedAt)
				fmt.Fprintf(&sb, "- Queen age: %s (introduced: %s)\n",
				queenAge, data.Hive.QueenIntroducedAt.Format("2006-01-02"))
				if data.Hive.QueenSource != nil {
					fmt.Fprintf(&sb, "- Queen source: %s\n", sanitize(*data.Hive.QueenSource))
				}
			}

			if containsAny(include.Basics, "boxes") {
				fmt.Fprintf(&sb, "- Structure: %d brood box(es), %d honey super(s)\n",
				data.Hive.BroodBoxes, data.Hive.HoneySupers)
			}

			if data.Hive.Notes != nil && containsAny(include.Basics, "hive_name") {
				fmt.Fprintf(&sb, "- Notes: %s\n", sanitize(*data.Hive.Notes))
			}

			// Location (from site data)
			if containsAny(include.Basics, "location") && data.Site != nil {
				fmt.Fprintf(&sb, "- Location: %s", sanitize(data.Site.Name))
				if data.Site.Latitude != nil && data.Site.Longitude != nil {
					fmt.Fprintf(&sb, " (%.4f, %.4f)", *data.Site.Latitude, *data.Site.Longitude)
				}
				sb.WriteString("\n")
			}

			// Current weight - TODO: Requires weight tracking feature (not yet implemented)
			// When weight sensors are added, this will show the latest weight reading
			if containsAny(include.Basics, "current_weight") {
				// Weight tracking not yet implemented - skip silently
			}

			sb.WriteString("\n")
		}

		// Season summary
		sb.WriteString("### Season Summary\n")

		if len(data.Harvests) > 0 {
			totalKg := calculateTotalHarvest(data.Harvests)
			fmt.Fprintf(&sb, "- Total harvested: %.1f kg\n", totalKg)
		}

		if len(data.Detections) > 0 {
			fmt.Fprintf(&sb, "- Hornets deterred: %d\n", len(data.Detections))
		}

		fmt.Fprintf(&sb, "- Inspections completed: %d\n", len(data.Inspections))
		fmt.Fprintf(&sb, "- Treatments applied: %d\n", len(data.Treatments))
		fmt.Fprintf(&sb, "- Feedings given: %d\n", len(data.Feedings))
		sb.WriteString("\n")

		// Recent inspections table
		if containsAny(include.Details, "inspection_log") && len(data.Inspections) > 0 {
			sb.WriteString("### Recent Inspections\n")
			sb.WriteString("| Date | Queen | Brood | Stores | Notes |\n")
			sb.WriteString("|------|-------|-------|--------|-------|\n")

			limit := min(10, len(data.Inspections))
			for j := 0; j < limit; j++ {
				insp := data.Inspections[j]
				queenStatus := "-"
				if insp.QueenSeen != nil && *insp.QueenSeen {
					queenStatus = "Seen"
				} else if insp.EggsSeen != nil && *insp.EggsSeen {
					queenStatus = "Eggs"
				}

				broodStatus := "-"
				if insp.BroodFrames != nil {
					broodStatus = fmt.Sprintf("%d frames", *insp.BroodFrames)
				}

				storesStatus := "-"
				if insp.HoneyLevel != nil {
					storesStatus = sanitize(*insp.HoneyLevel)
				}

				notes := "-"
				if insp.Notes != nil && len(*insp.Notes) > 0 {
					notes = sanitize(truncate(*insp.Notes, 50))
				}

				fmt.Fprintf(&sb, "| %s | %s | %s | %s | %s |\n",
				insp.InspectedAt.Format("2006-01-02"),
				queenStatus, broodStatus, storesStatus, notes)
			}
			sb.WriteString("\n")
		}

		// BeeBrain insights
		if containsAny(include.Analysis, "beebrain_insights") && len(data.Insights) > 0 {
			sb.WriteString("### BeeBrain Insights\n")
			for _, insight := range data.Insights {
				fmt.Fprintf(&sb, "- %s\n", sanitize(insight.Message))
			}
			sb.WriteString("\n")
		}

		// Weight history - TODO: Requires weight tracking feature (not yet implemented)
		// When weight sensors are added, this will show historical weight readings
		if containsAny(include.Details, "weight_history") {
			// Weight tracking not yet implemented - skip silently
		}

		// Weather correlations - TODO: Requires weather history storage (not yet implemented)
		// When weather data is persisted alongside detections/inspections, this will
		// show correlations between weather conditions and hive activity
		if containsAny(include.Details, "weather_correlations") {
			// Weather correlation analysis not yet implemented - skip silently
		}
	}

	return sb.String(), nil
}

// formatJSON generates complete structured data.
func (s *ExportService) formatJSON(hiveData []HiveExportData, include IncludeConfig) (string, error) {
	output := make(map[string]interface{})
	hives := make([]map[string]interface{}, 0, len(hiveData))

	for _, data := range hiveData {
		hive := make(map[string]interface{})

		// Use name instead of internal ID in JSON export
		hive["name"] = data.Hive.Name

		// Basics
		if containsAny(include.Basics, "queen_age", "hive_name", "boxes") {
			if data.Hive.QueenIntroducedAt != nil {
				queenAge := calculateQueenAgeYears(*data.Hive.QueenIntroducedAt)
				queen := map[string]interface{}{
					"age_years": queenAge,
				}
				if data.Hive.QueenSource != nil {
					queen["source"] = *data.Hive.QueenSource
				}
				queen["introduced_at"] = data.Hive.QueenIntroducedAt.Format("2006-01-02")
				hive["queen"] = queen
			}

			if containsAny(include.Basics, "boxes") {
				hive["structure"] = map[string]interface{}{
					"brood_boxes":  data.Hive.BroodBoxes,
					"honey_supers": data.Hive.HoneySupers,
				}
			}
		}

		// Location (from site data)
		if containsAny(include.Basics, "location") && data.Site != nil {
			location := map[string]interface{}{
				"site_name": data.Site.Name,
			}
			if data.Site.Latitude != nil {
				location["latitude"] = *data.Site.Latitude
			}
			if data.Site.Longitude != nil {
				location["longitude"] = *data.Site.Longitude
			}
			if data.Site.Timezone != "" {
				location["timezone"] = data.Site.Timezone
			}
			hive["location"] = location
		}

		// Current weight - TODO: Requires weight tracking feature (not yet implemented)
		// When weight sensors are added, this will show the latest weight reading
		// if containsAny(include.Basics, "current_weight") { ... }

		// Season stats
		seasonYear := time.Now().Year()
		if time.Now().Month() < time.April {
			seasonYear--
		}
		seasonKey := fmt.Sprintf("season_%d", seasonYear)
		seasonStats := make(map[string]interface{})

		if len(data.Harvests) > 0 {
			totalKg := calculateTotalHarvest(data.Harvests)
			seasonStats["harvested_kg"] = totalKg
		}

		if len(data.Detections) > 0 {
			seasonStats["hornets_deterred"] = len(data.Detections)
		}

		seasonStats["inspections_count"] = len(data.Inspections)
		hive[seasonKey] = seasonStats

		// Recent inspections
		if containsAny(include.Details, "inspection_log") && len(data.Inspections) > 0 {
			inspections := make([]map[string]interface{}, 0, min(10, len(data.Inspections)))
			for j := 0; j < min(10, len(data.Inspections)); j++ {
				insp := data.Inspections[j]
				inspMap := map[string]interface{}{
					"date": insp.InspectedAt.Format("2006-01-02"),
				}
				if insp.QueenSeen != nil {
					inspMap["queen_seen"] = *insp.QueenSeen
				}
				if insp.BroodFrames != nil {
					inspMap["brood_frames"] = *insp.BroodFrames
				}
				if insp.HoneyLevel != nil {
					inspMap["honey_level"] = *insp.HoneyLevel
				}
				if insp.Notes != nil {
					inspMap["notes"] = *insp.Notes
				}
				inspections = append(inspections, inspMap)
			}
			hive["recent_inspections"] = inspections
		}

		// BeeBrain insights
		if containsAny(include.Analysis, "beebrain_insights") && len(data.Insights) > 0 {
			insights := make([]map[string]interface{}, 0, len(data.Insights))
			for _, insight := range data.Insights {
				insights = append(insights, map[string]interface{}{
					"rule_id":          insight.RuleID,
					"severity":         insight.Severity,
					"message":          insight.Message,
					"suggested_action": insight.SuggestedAction,
					"created_at":       insight.CreatedAt.Format(time.RFC3339),
				})
			}
			hive["beebrain_insights"] = insights
		}

		// Weight history - TODO: Requires weight tracking feature (not yet implemented)
		// When weight sensors are added, this will include historical weight readings
		// if containsAny(include.Details, "weight_history") { ... }

		// Weather correlations - TODO: Requires weather history storage (not yet implemented)
		// When weather data is persisted alongside detections/inspections, this will
		// include correlations between weather conditions and hive activity
		// if containsAny(include.Details, "weather_correlations") { ... }

		hives = append(hives, hive)
	}

	output["hives"] = hives
	output["generated_at"] = time.Now().Format(time.RFC3339)

	jsonBytes, err := json.MarshalIndent(output, "", "  ")
	if err != nil {
		return "", fmt.Errorf("failed to marshal JSON: %w", err)
	}

	return string(jsonBytes), nil
}

// Helper functions

func containsAny(slice []string, values ...string) bool {
	for _, s := range slice {
		for _, v := range values {
			if s == v {
				return true
			}
		}
	}
	return false
}

func calculateQueenAge(introduced time.Time) string {
	duration := time.Since(introduced)
	days := int(duration.Hours() / 24)

	if days < 30 {
		return fmt.Sprintf("%d days", days)
	}
	if days < 365 {
		months := days / 30
		if months == 1 {
			return "1 month"
		}
		return fmt.Sprintf("%d months", months)
	}

	years := days / 365
	if years == 1 {
		return "1 year"
	}
	return fmt.Sprintf("%d years", years)
}

func calculateQueenAgeYears(introduced time.Time) float64 {
	duration := time.Since(introduced)
	return duration.Hours() / (24 * 365)
}

func calculateTotalHarvest(harvests []storage.Harvest) float64 {
	var total float64
	// Calculate current season (April to March)
	now := time.Now()
	seasonStart := time.Date(now.Year(), time.April, 1, 0, 0, 0, 0, time.UTC)
	if now.Month() < time.April {
		seasonStart = seasonStart.AddDate(-1, 0, 0)
	}

	for _, h := range harvests {
		if h.HarvestedAt.After(seasonStart) || h.HarvestedAt.Equal(seasonStart) {
			total += h.TotalKg.InexactFloat64()
		}
	}
	return total
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}

// sanitize escapes user-provided content to prevent injection.
// For markdown/summary formats, we HTML escape special characters.
func sanitize(s string) string {
	return html.EscapeString(s)
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
