// Package services provides business logic services for the APIS server.
package services

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jermoo/apis/apis-server/internal/beebrain"
	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/rs/zerolog/log"
)

// Insight represents an analysis result from BeeBrain.
type Insight struct {
	ID              string                 `json:"id,omitempty"`
	TenantID        string                 `json:"-"` // Not exposed in API responses
	HiveID          *string                `json:"hive_id,omitempty"`
	HiveName        *string                `json:"hive_name,omitempty"`
	RuleID          string                 `json:"rule_id"`
	Severity        string                 `json:"severity"`
	Message         string                 `json:"message"`
	SuggestedAction string                 `json:"suggested_action"`
	DataPoints      map[string]interface{} `json:"data_points"`
	CreatedAt       time.Time              `json:"created_at"`
	DismissedAt     *time.Time             `json:"dismissed_at,omitempty"`
	SnoozedUntil    *time.Time             `json:"snoozed_until,omitempty"`
}

// AnalysisResult contains the result of BeeBrain analysis.
type AnalysisResult struct {
	Summary      string    `json:"summary"`
	LastAnalysis time.Time `json:"last_analysis"`
	Insights     []Insight `json:"insights"`
	AllGood      bool      `json:"all_good"`
}

// HiveAnalysisResult contains the result of BeeBrain analysis for a specific hive.
type HiveAnalysisResult struct {
	HiveID           string    `json:"hive_id"`
	HiveName         string    `json:"hive_name"`
	HealthAssessment string    `json:"health_assessment"`
	Insights         []Insight `json:"insights"`
	Recommendations  []string  `json:"recommendations"`
	LastAnalysis     time.Time `json:"last_analysis"`
}

// BeeBrainService provides rule-based analysis for hives.
type BeeBrainService struct {
	rulesLoader *beebrain.RulesLoader
}

// NewBeeBrainService creates a new BeeBrain service instance.
func NewBeeBrainService(rulesPath string) (*BeeBrainService, error) {
	loader, err := beebrain.NewRulesLoader(rulesPath)
	if err != nil {
		return nil, fmt.Errorf("beebrain: failed to create rules loader: %w", err)
	}

	return &BeeBrainService{
		rulesLoader: loader,
	}, nil
}

// AnalyzeTenant runs analysis for all hives belonging to a tenant.
// Returns insights and stores them in the database.
func (s *BeeBrainService) AnalyzeTenant(ctx context.Context, conn *pgxpool.Conn, tenantID string) (*AnalysisResult, error) {
	rules := s.rulesLoader.GetRules()
	now := time.Now()

	// Get all hives for the tenant
	hives, err := storage.ListHives(ctx, conn)
	if err != nil {
		return nil, fmt.Errorf("beebrain: failed to list hives: %w", err)
	}

	var allInsights []Insight

	// Analyze each hive
	for _, hive := range hives {
		hiveInsights, err := s.analyzeHiveWithRules(ctx, conn, tenantID, &hive, rules, now)
		if err != nil {
			log.Warn().Err(err).Str("hive_id", hive.ID).Msg("beebrain: failed to analyze hive")
			continue
		}
		allInsights = append(allInsights, hiveInsights...)
	}

	// Store insights in database
	for i := range allInsights {
		stored, err := storage.CreateInsight(ctx, conn, tenantID, &storage.CreateInsightInput{
			HiveID:          allInsights[i].HiveID,
			RuleID:          allInsights[i].RuleID,
			Severity:        allInsights[i].Severity,
			Message:         allInsights[i].Message,
			SuggestedAction: allInsights[i].SuggestedAction,
			DataPoints:      allInsights[i].DataPoints,
		})
		if err != nil {
			log.Warn().Err(err).Str("rule_id", allInsights[i].RuleID).Msg("beebrain: failed to store insight")
			continue
		}
		allInsights[i].ID = stored.ID
		allInsights[i].CreatedAt = stored.CreatedAt
	}

	// Generate summary
	result := &AnalysisResult{
		LastAnalysis: now,
		Insights:     allInsights,
		AllGood:      len(allInsights) == 0,
	}

	if result.AllGood {
		result.Summary = "All looks good. No actions needed."
	} else {
		result.Summary = s.generateSummary(len(hives), allInsights)
	}

	log.Info().
		Str("tenant_id", tenantID).
		Int("hive_count", len(hives)).
		Int("insight_count", len(allInsights)).
		Bool("all_good", result.AllGood).
		Msg("BeeBrain tenant analysis complete")

	return result, nil
}

// AnalyzeHive runs analysis for a single hive.
func (s *BeeBrainService) AnalyzeHive(ctx context.Context, conn *pgxpool.Conn, tenantID, hiveID string) (*HiveAnalysisResult, error) {
	rules := s.rulesLoader.GetRules()
	now := time.Now()

	// Get the hive
	hive, err := storage.GetHiveByID(ctx, conn, hiveID)
	if err != nil {
		return nil, fmt.Errorf("beebrain: failed to get hive: %w", err)
	}

	// Run analysis
	insights, err := s.analyzeHiveWithRules(ctx, conn, tenantID, hive, rules, now)
	if err != nil {
		return nil, fmt.Errorf("beebrain: failed to analyze hive: %w", err)
	}

	// Store insights
	for i := range insights {
		stored, err := storage.CreateInsight(ctx, conn, tenantID, &storage.CreateInsightInput{
			HiveID:          insights[i].HiveID,
			RuleID:          insights[i].RuleID,
			Severity:        insights[i].Severity,
			Message:         insights[i].Message,
			SuggestedAction: insights[i].SuggestedAction,
			DataPoints:      insights[i].DataPoints,
		})
		if err != nil {
			log.Warn().Err(err).Str("rule_id", insights[i].RuleID).Msg("beebrain: failed to store insight")
			continue
		}
		insights[i].ID = stored.ID
		insights[i].CreatedAt = stored.CreatedAt
	}

	// Generate recommendations
	recommendations := s.generateRecommendations(insights)

	// Generate health assessment
	healthAssessment := s.assessHealth(insights)

	result := &HiveAnalysisResult{
		HiveID:           hive.ID,
		HiveName:         hive.Name,
		HealthAssessment: healthAssessment,
		Insights:         insights,
		Recommendations:  recommendations,
		LastAnalysis:     now,
	}

	log.Info().
		Str("tenant_id", tenantID).
		Str("hive_id", hiveID).
		Str("hive_name", hive.Name).
		Int("insight_count", len(insights)).
		Str("health", healthAssessment).
		Msg("BeeBrain hive analysis complete")

	return result, nil
}

// GetDashboardAnalysis returns the current analysis state for a tenant's dashboard.
// This retrieves active (not dismissed, not snoozed) insights rather than running new analysis.
func (s *BeeBrainService) GetDashboardAnalysis(ctx context.Context, conn *pgxpool.Conn, tenantID string) (*AnalysisResult, error) {
	// Get active insights
	storedInsights, err := storage.ListActiveInsights(ctx, conn, tenantID)
	if err != nil {
		return nil, fmt.Errorf("beebrain: failed to list active insights: %w", err)
	}

	// Convert to service insights
	insights := make([]Insight, 0, len(storedInsights))
	for _, si := range storedInsights {
		insights = append(insights, Insight{
			ID:              si.ID,
			HiveID:          si.HiveID,
			HiveName:        si.HiveName,
			RuleID:          si.RuleID,
			Severity:        si.Severity,
			Message:         si.Message,
			SuggestedAction: si.SuggestedAction,
			DataPoints:      si.DataPoints,
			CreatedAt:       si.CreatedAt,
			DismissedAt:     si.DismissedAt,
			SnoozedUntil:    si.SnoozedUntil,
		})
	}

	// Get hive count for summary
	hives, err := storage.ListHives(ctx, conn)
	if err != nil {
		log.Warn().Err(err).Msg("beebrain: failed to get hive count for summary")
	}

	result := &AnalysisResult{
		LastAnalysis: time.Now(),
		Insights:     insights,
		AllGood:      len(insights) == 0,
	}

	if result.AllGood {
		if len(hives) == 0 {
			result.Summary = "No hives configured yet. Add your first hive to get started!"
		} else if len(hives) == 1 {
			result.Summary = "All quiet at your apiary. Your hive is doing well."
		} else {
			result.Summary = fmt.Sprintf("All quiet at your apiary. Your %d hives are doing well.", len(hives))
		}
	} else {
		result.Summary = s.generateSummary(len(hives), insights)
	}

	return result, nil
}

// analyzeHiveWithRules evaluates all rules against a single hive.
func (s *BeeBrainService) analyzeHiveWithRules(ctx context.Context, conn *pgxpool.Conn, tenantID string, hive *storage.Hive, rules []beebrain.Rule, now time.Time) ([]Insight, error) {
	var insights []Insight

	for _, rule := range rules {
		insight, matched, err := s.evaluateRule(ctx, conn, hive, &rule, now)
		if err != nil {
			log.Warn().Err(err).
				Str("rule_id", rule.ID).
				Str("hive_id", hive.ID).
				Msg("beebrain: rule evaluation failed")
			continue
		}
		if matched && insight != nil {
			insights = append(insights, *insight)
		}
	}

	return insights, nil
}

// evaluateRule evaluates a single rule against a hive.
func (s *BeeBrainService) evaluateRule(ctx context.Context, conn *pgxpool.Conn, hive *storage.Hive, rule *beebrain.Rule, now time.Time) (*Insight, bool, error) {
	switch rule.Condition.Type {
	case "queen_age_productivity":
		return s.evaluateQueenAging(ctx, conn, hive, rule, now)
	case "days_since_treatment":
		return s.evaluateTreatmentDue(ctx, conn, hive, rule, now)
	case "days_since_inspection":
		return s.evaluateInspectionOverdue(ctx, conn, hive, rule, now)
	case "detection_spike":
		return s.evaluateHornetCorrelation(ctx, conn, hive, rule, now)
	default:
		return nil, false, fmt.Errorf("unknown rule condition type: %s", rule.Condition.Type)
	}
}

// evaluateQueenAging checks if the queen is old and productivity has dropped.
func (s *BeeBrainService) evaluateQueenAging(ctx context.Context, conn *pgxpool.Conn, hive *storage.Hive, rule *beebrain.Rule, now time.Time) (*Insight, bool, error) {
	// Skip if no queen introduction date
	if hive.QueenIntroducedAt == nil {
		return nil, false, nil
	}

	minAgeYears, ok := rule.Condition.GetParamFloat("min_queen_age_years")
	if !ok {
		minAgeYears = 2.0
	}

	// Note: productivity_drop_percent param is defined but not used in MVP
	// Future enhancement: compare year-over-year harvest data
	// productivityDropPercent, ok := rule.Condition.GetParamFloat("productivity_drop_percent")

	// Calculate queen age in years
	queenAge := now.Sub(*hive.QueenIntroducedAt)
	queenAgeYears := queenAge.Hours() / (24 * 365)

	if queenAgeYears < minAgeYears {
		return nil, false, nil
	}

	// Check productivity (compare this year's harvest to last year)
	// For MVP, we'll simplify: if queen is old enough, generate a warning
	// Full productivity comparison would require harvest data analysis
	// which we can add in a future iteration

	// For now, trigger if queen is over the age threshold
	// In production, this should also check productivity drop
	queenAgeDisplay := formatQueenAge(queenAge)
	message := strings.ReplaceAll(rule.MessageTemplate, "{{hive_name}}", hive.Name)
	message = strings.ReplaceAll(message, "{{queen_age}}", queenAgeDisplay)
	message = strings.ReplaceAll(message, "{{drop_percent}}", "N/A") // Productivity check not implemented yet

	hiveID := hive.ID
	insight := &Insight{
		HiveID:          &hiveID,
		HiveName:        &hive.Name,
		RuleID:          rule.ID,
		Severity:        rule.Severity,
		Message:         message,
		SuggestedAction: rule.SuggestedAction,
		DataPoints: map[string]interface{}{
			"queen_age_years":           queenAgeYears,
			"queen_introduced_at":       hive.QueenIntroducedAt.Format("2006-01-02"),
			"threshold_age_years":       minAgeYears,
			"productivity_drop_percent": "not_measured", // MVP limitation
		},
		CreatedAt: now,
	}

	return insight, true, nil
}

// evaluateTreatmentDue checks if a treatment is overdue.
func (s *BeeBrainService) evaluateTreatmentDue(ctx context.Context, conn *pgxpool.Conn, hive *storage.Hive, rule *beebrain.Rule, now time.Time) (*Insight, bool, error) {
	maxDays, ok := rule.Condition.GetParamInt("max_days")
	if !ok {
		maxDays = 90
	}

	// Get last treatment for this hive
	lastTreatment, err := storage.GetLastTreatmentForHive(ctx, conn, hive.ID)
	if err != nil {
		if err == storage.ErrNotFound {
			// No treatments ever - definitely overdue if hive exists
			// But we should be careful not to alert for brand new hives
			// Check if hive was created more than maxDays ago
			daysSinceCreation := int(now.Sub(hive.CreatedAt).Hours() / 24)
			if daysSinceCreation < maxDays {
				return nil, false, nil
			}

			hiveID := hive.ID
			message := strings.ReplaceAll(rule.MessageTemplate, "{{hive_name}}", hive.Name)
			message = strings.ReplaceAll(message, "{{days}}", "never")

			insight := &Insight{
				HiveID:          &hiveID,
				HiveName:        &hive.Name,
				RuleID:          rule.ID,
				Severity:        rule.Severity,
				Message:         message,
				SuggestedAction: rule.SuggestedAction,
				DataPoints: map[string]interface{}{
					"days_since_treatment": "never",
					"last_treatment_date":  nil,
					"threshold_days":       maxDays,
				},
				CreatedAt: now,
			}
			return insight, true, nil
		}
		return nil, false, fmt.Errorf("failed to get last treatment: %w", err)
	}

	daysSinceTreatment := int(now.Sub(lastTreatment.TreatedAt).Hours() / 24)
	if daysSinceTreatment <= maxDays {
		return nil, false, nil
	}

	hiveID := hive.ID
	message := strings.ReplaceAll(rule.MessageTemplate, "{{hive_name}}", hive.Name)
	message = strings.ReplaceAll(message, "{{days}}", fmt.Sprintf("%d", daysSinceTreatment))

	insight := &Insight{
		HiveID:          &hiveID,
		HiveName:        &hive.Name,
		RuleID:          rule.ID,
		Severity:        rule.Severity,
		Message:         message,
		SuggestedAction: rule.SuggestedAction,
		DataPoints: map[string]interface{}{
			"days_since_treatment": daysSinceTreatment,
			"last_treatment_date":  lastTreatment.TreatedAt.Format("2006-01-02"),
			"last_treatment_type":  lastTreatment.TreatmentType,
			"threshold_days":       maxDays,
		},
		CreatedAt: now,
	}

	return insight, true, nil
}

// evaluateInspectionOverdue checks if an inspection is overdue.
func (s *BeeBrainService) evaluateInspectionOverdue(ctx context.Context, conn *pgxpool.Conn, hive *storage.Hive, rule *beebrain.Rule, now time.Time) (*Insight, bool, error) {
	maxDays, ok := rule.Condition.GetParamInt("max_days")
	if !ok {
		maxDays = 14
	}

	// Get last inspection for this hive
	lastInspection, err := storage.GetLastInspectionForHive(ctx, conn, hive.ID)
	if err != nil {
		if err == storage.ErrNotFound {
			// No inspections ever - check if hive is old enough to warrant concern
			daysSinceCreation := int(now.Sub(hive.CreatedAt).Hours() / 24)
			if daysSinceCreation < maxDays {
				return nil, false, nil
			}

			hiveID := hive.ID
			message := strings.ReplaceAll(rule.MessageTemplate, "{{hive_name}}", hive.Name)
			message = strings.ReplaceAll(message, "{{days}}", "never")

			insight := &Insight{
				HiveID:          &hiveID,
				HiveName:        &hive.Name,
				RuleID:          rule.ID,
				Severity:        rule.Severity,
				Message:         message,
				SuggestedAction: rule.SuggestedAction,
				DataPoints: map[string]interface{}{
					"days_since_inspection": "never",
					"last_inspection_date":  nil,
					"threshold_days":        maxDays,
				},
				CreatedAt: now,
			}
			return insight, true, nil
		}
		return nil, false, fmt.Errorf("failed to get last inspection: %w", err)
	}

	daysSinceInspection := int(now.Sub(lastInspection.InspectedAt).Hours() / 24)
	if daysSinceInspection <= maxDays {
		return nil, false, nil
	}

	hiveID := hive.ID
	message := strings.ReplaceAll(rule.MessageTemplate, "{{hive_name}}", hive.Name)
	message = strings.ReplaceAll(message, "{{days}}", fmt.Sprintf("%d", daysSinceInspection))

	insight := &Insight{
		HiveID:          &hiveID,
		HiveName:        &hive.Name,
		RuleID:          rule.ID,
		Severity:        rule.Severity,
		Message:         message,
		SuggestedAction: rule.SuggestedAction,
		DataPoints: map[string]interface{}{
			"days_since_inspection": daysSinceInspection,
			"last_inspection_date":  lastInspection.InspectedAt.Format("2006-01-02"),
			"threshold_days":        maxDays,
		},
		CreatedAt: now,
	}

	return insight, true, nil
}

// evaluateHornetCorrelation checks for unusual hornet activity spikes.
func (s *BeeBrainService) evaluateHornetCorrelation(ctx context.Context, conn *pgxpool.Conn, hive *storage.Hive, rule *beebrain.Rule, now time.Time) (*Insight, bool, error) {
	windowHours, ok := rule.Condition.GetParamInt("window_hours")
	if !ok {
		windowHours = 24
	}

	thresholdMultiplier, ok := rule.Condition.GetParamFloat("threshold_multiplier")
	if !ok {
		thresholdMultiplier = 2.0
	}

	// Get detection stats for the hive's site
	stats, err := storage.GetDetectionSpikeData(ctx, conn, hive.SiteID, windowHours)
	if err != nil {
		return nil, false, fmt.Errorf("failed to get detection spike data: %w", err)
	}

	// Check if there's a spike
	if stats.RecentCount == 0 || stats.AverageDaily == 0 {
		return nil, false, nil
	}

	// Calculate the multiplier
	expectedCount := stats.AverageDaily * (float64(windowHours) / 24.0)
	if expectedCount == 0 {
		return nil, false, nil
	}

	actualMultiplier := float64(stats.RecentCount) / expectedCount
	if actualMultiplier < thresholdMultiplier {
		return nil, false, nil
	}

	// Spike detected!
	hiveID := hive.ID
	message := strings.ReplaceAll(rule.MessageTemplate, "{{hive_name}}", hive.Name)
	message = strings.ReplaceAll(message, "{{count}}", fmt.Sprintf("%d", stats.RecentCount))
	message = strings.ReplaceAll(message, "{{multiplier}}", fmt.Sprintf("%.1f", actualMultiplier))

	insight := &Insight{
		HiveID:          &hiveID,
		HiveName:        &hive.Name,
		RuleID:          rule.ID,
		Severity:        rule.Severity,
		Message:         message,
		SuggestedAction: rule.SuggestedAction,
		DataPoints: map[string]interface{}{
			"recent_count":         stats.RecentCount,
			"window_hours":         windowHours,
			"average_daily":        stats.AverageDaily,
			"multiplier":           actualMultiplier,
			"threshold_multiplier": thresholdMultiplier,
		},
		CreatedAt: now,
	}

	return insight, true, nil
}

// generateSummary creates a human-readable summary of the analysis.
func (s *BeeBrainService) generateSummary(hiveCount int, insights []Insight) string {
	if len(insights) == 0 {
		if hiveCount == 1 {
			return "All quiet at your apiary. Your hive is doing well."
		}
		return fmt.Sprintf("All quiet at your apiary. Your %d hives are doing well.", hiveCount)
	}

	// Count by severity
	actionNeeded := 0
	warnings := 0
	info := 0
	for _, i := range insights {
		switch i.Severity {
		case "action-needed":
			actionNeeded++
		case "warning":
			warnings++
		case "info":
			info++
		}
	}

	var parts []string
	if actionNeeded > 0 {
		parts = append(parts, fmt.Sprintf("%d action needed", actionNeeded))
	}
	if warnings > 0 {
		parts = append(parts, fmt.Sprintf("%d warning", warnings))
		if warnings > 1 {
			parts[len(parts)-1] += "s"
		}
	}
	if info > 0 {
		parts = append(parts, fmt.Sprintf("%d info", info))
	}

	return fmt.Sprintf("Found %d insight(s): %s", len(insights), strings.Join(parts, ", "))
}

// generateRecommendations creates actionable recommendations from insights.
func (s *BeeBrainService) generateRecommendations(insights []Insight) []string {
	recommendations := make([]string, 0, len(insights))

	// Sort by severity (action-needed first)
	for _, i := range insights {
		if i.Severity == "action-needed" && i.SuggestedAction != "" {
			recommendations = append(recommendations, i.SuggestedAction)
		}
	}
	for _, i := range insights {
		if i.Severity == "warning" && i.SuggestedAction != "" {
			recommendations = append(recommendations, i.SuggestedAction)
		}
	}
	for _, i := range insights {
		if i.Severity == "info" && i.SuggestedAction != "" {
			recommendations = append(recommendations, i.SuggestedAction)
		}
	}

	return recommendations
}

// assessHealth generates a health assessment string based on insights.
func (s *BeeBrainService) assessHealth(insights []Insight) string {
	if len(insights) == 0 {
		return "Excellent - No issues detected"
	}

	hasActionNeeded := false
	hasWarning := false
	for _, i := range insights {
		if i.Severity == "action-needed" {
			hasActionNeeded = true
		}
		if i.Severity == "warning" {
			hasWarning = true
		}
	}

	if hasActionNeeded {
		return "Needs Attention - Action required"
	}
	if hasWarning {
		return "Fair - Some concerns to address"
	}
	return "Good - Minor items to note"
}

// MaintenanceItem represents a hive needing attention in the maintenance view.
type MaintenanceItem struct {
	HiveID        string        `json:"hive_id"`
	HiveName      string        `json:"hive_name"`
	SiteID        string        `json:"site_id"`
	SiteName      string        `json:"site_name"`
	Priority      string        `json:"priority"`       // "Urgent", "Soon", "Optional"
	PriorityScore int           `json:"priority_score"`
	Summary       string        `json:"summary"`
	Insights      []Insight     `json:"insights"`
	QuickActions  []QuickAction `json:"quick_actions"`
}

// QuickAction represents a quick action button for maintenance items.
type QuickAction struct {
	Label string `json:"label"`
	URL   string `json:"url"`
	Tab   string `json:"tab,omitempty"`
}

// RecentlyCompletedItem represents a recently completed maintenance action.
type RecentlyCompletedItem struct {
	HiveID      string    `json:"hive_id"`
	HiveName    string    `json:"hive_name"`
	Action      string    `json:"action"`
	CompletedAt time.Time `json:"completed_at"`
}

// Severity weight constants for priority score calculation
const (
	SeverityWeightActionNeeded = 100
	SeverityWeightWarning      = 50
	SeverityWeightInfo         = 10
)

// GetMaintenanceItems returns all hives needing attention, aggregated by hive and sorted by priority.
func (s *BeeBrainService) GetMaintenanceItems(ctx context.Context, conn *pgxpool.Conn, tenantID, siteID string) ([]MaintenanceItem, error) {
	// Get all active insights with hive/site info
	maintenanceInsights, err := storage.ListMaintenanceInsights(ctx, conn, tenantID, siteID)
	if err != nil {
		return nil, fmt.Errorf("beebrain: failed to get maintenance insights: %w", err)
	}

	// Aggregate insights by hive
	hiveMap := make(map[string]*MaintenanceItem)
	now := time.Now()

	for _, mi := range maintenanceInsights {
		item, exists := hiveMap[mi.HiveID]
		if !exists {
			item = &MaintenanceItem{
				HiveID:   mi.HiveID,
				HiveName: mi.HiveName,
				SiteID:   mi.SiteID,
				SiteName: mi.SiteName,
				Insights: make([]Insight, 0),
			}
			hiveMap[mi.HiveID] = item
		}

		// Add insight to the hive's list
		insight := Insight{
			ID:              mi.ID,
			HiveID:          &mi.HiveID,
			HiveName:        &mi.HiveName,
			RuleID:          mi.RuleID,
			Severity:        mi.Severity,
			Message:         mi.Message,
			SuggestedAction: mi.SuggestedAction,
			DataPoints:      mi.DataPoints,
			CreatedAt:       mi.CreatedAt,
		}
		item.Insights = append(item.Insights, insight)
	}

	// Calculate priority score, priority label, summary, and quick actions for each hive
	var items []MaintenanceItem
	for _, item := range hiveMap {
		// Find the highest severity insight for this hive
		var maxSeverityWeight int
		var oldestCreatedAt time.Time
		var primaryInsight *Insight

		for i := range item.Insights {
			ins := &item.Insights[i]
			weight := getSeverityWeight(ins.Severity)

			// Update max severity and oldest insight
			if weight > maxSeverityWeight {
				maxSeverityWeight = weight
				primaryInsight = ins
			}

			// Track oldest insight for age calculation
			if oldestCreatedAt.IsZero() || ins.CreatedAt.Before(oldestCreatedAt) {
				oldestCreatedAt = ins.CreatedAt
			}
		}

		// Calculate priority score: severity_weight + age_in_days
		ageInDays := int(now.Sub(oldestCreatedAt).Hours() / 24)
		item.PriorityScore = maxSeverityWeight + ageInDays

		// Set priority label based on max severity
		item.Priority = getPriorityLabel(maxSeverityWeight)

		// Set summary from primary (highest severity) insight
		if primaryInsight != nil {
			item.Summary = primaryInsight.Message
		}

		// Generate quick actions based on rule IDs present
		item.QuickActions = generateQuickActions(item.HiveID, item.Insights)

		items = append(items, *item)
	}

	// Sort by priority score descending (highest priority first)
	sortMaintenanceItems(items)

	return items, nil
}

// GetRecentlyCompletedInsights returns insights that were recently dismissed.
func (s *BeeBrainService) GetRecentlyCompletedInsights(ctx context.Context, conn *pgxpool.Conn, tenantID, siteID string) ([]RecentlyCompletedItem, error) {
	completed, err := storage.ListRecentlyCompletedInsights(ctx, conn, tenantID, siteID, 10)
	if err != nil {
		return nil, fmt.Errorf("beebrain: failed to get recently completed insights: %w", err)
	}

	result := make([]RecentlyCompletedItem, 0, len(completed))
	for _, c := range completed {
		result = append(result, RecentlyCompletedItem{
			HiveID:      c.HiveID,
			HiveName:    c.HiveName,
			Action:      c.Action,
			CompletedAt: c.CompletedAt,
		})
	}

	return result, nil
}

// getSeverityWeight returns the weight for a severity level.
func getSeverityWeight(severity string) int {
	switch severity {
	case "action-needed":
		return SeverityWeightActionNeeded
	case "warning":
		return SeverityWeightWarning
	case "info":
		return SeverityWeightInfo
	default:
		return 0
	}
}

// getPriorityLabel returns the priority label based on severity weight.
func getPriorityLabel(severityWeight int) string {
	switch severityWeight {
	case SeverityWeightActionNeeded:
		return "Urgent"
	case SeverityWeightWarning:
		return "Soon"
	default:
		return "Optional"
	}
}

// generateQuickActions generates quick action buttons based on the rule IDs present in insights.
func generateQuickActions(hiveID string, insights []Insight) []QuickAction {
	// Track which actions we've already added to avoid duplicates
	addedActions := make(map[string]bool)
	var actions []QuickAction

	// Map rule IDs to quick actions
	for _, ins := range insights {
		switch ins.RuleID {
		case "treatment_due":
			if !addedActions["treatment"] {
				actions = append(actions, QuickAction{
					Label: "Log Treatment",
					URL:   "/hives/" + hiveID,
					Tab:   "treatments",
				})
				addedActions["treatment"] = true
			}
		case "inspection_overdue":
			if !addedActions["inspection"] {
				actions = append(actions, QuickAction{
					Label: "Log Inspection",
					URL:   "/hives/" + hiveID + "/inspections/new",
				})
				addedActions["inspection"] = true
			}
		case "queen_aging":
			if !addedActions["queen"] {
				actions = append(actions, QuickAction{
					Label: "View Queen Info",
					URL:   "/hives/" + hiveID,
				})
				addedActions["queen"] = true
			}
		case "hornet_activity_spike":
			if !addedActions["clips"] {
				actions = append(actions, QuickAction{
					Label: "View Clips",
					URL:   "/clips",
				})
				addedActions["clips"] = true
			}
		}
	}

	// Always add a "View Details" action
	actions = append(actions, QuickAction{
		Label: "View Details",
		URL:   "/hives/" + hiveID,
	})

	return actions
}

// sortMaintenanceItems sorts maintenance items by priority score descending.
func sortMaintenanceItems(items []MaintenanceItem) {
	sort.Slice(items, func(i, j int) bool {
		return items[i].PriorityScore > items[j].PriorityScore
	})
}

// formatQueenAge formats a duration as a human-readable queen age.
func formatQueenAge(d time.Duration) string {
	days := int(d.Hours() / 24)
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
	remainingDays := days % 365
	months := remainingDays / 30

	if months == 0 {
		if years == 1 {
			return "1 year"
		}
		return fmt.Sprintf("%d years", years)
	}

	return fmt.Sprintf("%d years %d months", years, months)
}
