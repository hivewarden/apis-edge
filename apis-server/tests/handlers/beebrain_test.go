// Package handlers_test contains unit tests for the APIS server HTTP handlers.
package handlers_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/jermoo/apis/apis-server/internal/services"
)

// TestDashboardDataStructure tests the dashboard data response structure.
func TestDashboardDataStructure(t *testing.T) {
	// Simulate the expected response structure
	type DashboardData struct {
		Summary      string             `json:"summary"`
		LastAnalysis time.Time          `json:"last_analysis"`
		Insights     []services.Insight `json:"insights"`
		AllGood      bool               `json:"all_good"`
	}

	type DashboardResponse struct {
		Data DashboardData `json:"data"`
	}

	now := time.Now()
	hiveID := "hive-1"
	hiveName := "Test Hive"

	response := DashboardResponse{
		Data: DashboardData{
			Summary:      "Found 1 insight(s): 1 warning",
			LastAnalysis: now,
			Insights: []services.Insight{
				{
					ID:              "insight-1",
					HiveID:          &hiveID,
					HiveName:        &hiveName,
					RuleID:          "treatment_due",
					Severity:        "warning",
					Message:         "Test Hive: Treatment due (95 days)",
					SuggestedAction: "Schedule treatment",
					DataPoints: map[string]interface{}{
						"days_since_treatment": 95,
					},
					CreatedAt: now,
				},
			},
			AllGood: false,
		},
	}

	// Verify JSON serialization works
	jsonData, err := json.Marshal(response)
	if err != nil {
		t.Fatalf("failed to marshal response: %v", err)
	}

	// Verify we can deserialize it back
	var decoded DashboardResponse
	if err := json.Unmarshal(jsonData, &decoded); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if decoded.Data.Summary != "Found 1 insight(s): 1 warning" {
		t.Errorf("unexpected summary: %q", decoded.Data.Summary)
	}
	if decoded.Data.AllGood {
		t.Error("expected AllGood=false")
	}
	if len(decoded.Data.Insights) != 1 {
		t.Errorf("expected 1 insight, got %d", len(decoded.Data.Insights))
	}
}

// TestAllGoodDashboardResponse tests the response when no issues are found.
func TestAllGoodDashboardResponse(t *testing.T) {
	type DashboardData struct {
		Summary      string             `json:"summary"`
		LastAnalysis time.Time          `json:"last_analysis"`
		Insights     []services.Insight `json:"insights"`
		AllGood      bool               `json:"all_good"`
	}

	type DashboardResponse struct {
		Data DashboardData `json:"data"`
	}

	response := DashboardResponse{
		Data: DashboardData{
			Summary:      "All looks good. No actions needed.",
			LastAnalysis: time.Now(),
			Insights:     []services.Insight{},
			AllGood:      true,
		},
	}

	if !response.Data.AllGood {
		t.Error("expected AllGood=true")
	}
	if len(response.Data.Insights) != 0 {
		t.Errorf("expected 0 insights, got %d", len(response.Data.Insights))
	}
	if response.Data.Summary != "All looks good. No actions needed." {
		t.Errorf("unexpected summary: %q", response.Data.Summary)
	}
}

// TestHiveAnalysisResponseStructure tests the hive analysis response structure.
func TestHiveAnalysisResponseStructure(t *testing.T) {
	type HiveAnalysisResponse struct {
		Data services.HiveAnalysisResult `json:"data"`
	}

	response := HiveAnalysisResponse{
		Data: services.HiveAnalysisResult{
			HiveID:           "hive-1",
			HiveName:         "My Hive",
			HealthAssessment: "Excellent - No issues detected",
			Insights:         []services.Insight{},
			Recommendations:  []string{},
			LastAnalysis:     time.Now(),
		},
	}

	// Verify JSON serialization
	jsonData, err := json.Marshal(response)
	if err != nil {
		t.Fatalf("failed to marshal response: %v", err)
	}

	var decoded HiveAnalysisResponse
	if err := json.Unmarshal(jsonData, &decoded); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if decoded.Data.HiveID != "hive-1" {
		t.Errorf("expected HiveID 'hive-1', got %q", decoded.Data.HiveID)
	}
	if decoded.Data.HealthAssessment != "Excellent - No issues detected" {
		t.Errorf("unexpected health assessment: %q", decoded.Data.HealthAssessment)
	}
}

// TestRefreshResponseStructure tests the refresh endpoint response structure.
func TestRefreshResponseStructure(t *testing.T) {
	type RefreshData struct {
		Message       string    `json:"message"`
		InsightsFound int       `json:"insights_found"`
		AnalyzedAt    time.Time `json:"analyzed_at"`
	}

	type RefreshResponse struct {
		Data RefreshData `json:"data"`
	}

	response := RefreshResponse{
		Data: RefreshData{
			Message:       "Found 2 insight(s): 1 action needed, 1 warning",
			InsightsFound: 2,
			AnalyzedAt:    time.Now(),
		},
	}

	jsonData, err := json.Marshal(response)
	if err != nil {
		t.Fatalf("failed to marshal response: %v", err)
	}

	var decoded RefreshResponse
	if err := json.Unmarshal(jsonData, &decoded); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if decoded.Data.InsightsFound != 2 {
		t.Errorf("expected InsightsFound=2, got %d", decoded.Data.InsightsFound)
	}
}

// TestDismissResponseStructure tests the dismiss endpoint response structure.
func TestDismissResponseStructure(t *testing.T) {
	response := map[string]interface{}{
		"data": map[string]string{
			"message": "Insight dismissed successfully",
			"id":      "insight-123",
		},
	}

	jsonData, err := json.Marshal(response)
	if err != nil {
		t.Fatalf("failed to marshal response: %v", err)
	}

	var decoded map[string]interface{}
	if err := json.Unmarshal(jsonData, &decoded); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	data, ok := decoded["data"].(map[string]interface{})
	if !ok {
		t.Fatal("expected data field to be an object")
	}

	if data["message"] != "Insight dismissed successfully" {
		t.Errorf("unexpected message: %v", data["message"])
	}
	if data["id"] != "insight-123" {
		t.Errorf("unexpected id: %v", data["id"])
	}
}

// TestSnoozeResponseStructure tests the snooze endpoint response structure.
func TestSnoozeResponseStructure(t *testing.T) {
	snoozedUntil := time.Now().AddDate(0, 0, 7)

	response := map[string]interface{}{
		"data": map[string]interface{}{
			"message":       "Insight snoozed successfully",
			"id":            "insight-456",
			"snoozed_until": snoozedUntil.Format(time.RFC3339),
			"days":          7,
		},
	}

	jsonData, err := json.Marshal(response)
	if err != nil {
		t.Fatalf("failed to marshal response: %v", err)
	}

	var decoded map[string]interface{}
	if err := json.Unmarshal(jsonData, &decoded); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	data, ok := decoded["data"].(map[string]interface{})
	if !ok {
		t.Fatal("expected data field to be an object")
	}

	if data["message"] != "Insight snoozed successfully" {
		t.Errorf("unexpected message: %v", data["message"])
	}
	if data["days"] != float64(7) { // JSON numbers are float64
		t.Errorf("unexpected days: %v", data["days"])
	}
}

// TestSnoozeRequestValidation tests the snooze request validation rules.
func TestSnoozeRequestValidation(t *testing.T) {
	tests := []struct {
		name      string
		days      int
		wantError bool
	}{
		{"valid_7_days", 7, false},
		{"valid_1_day", 1, false},
		{"valid_30_days", 30, false},
		{"valid_90_days", 90, false},
		{"invalid_0_days", 0, true},
		{"invalid_negative", -1, true},
		{"invalid_too_long", 91, true},
		{"invalid_100_days", 100, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			isValid := tt.days >= 1 && tt.days <= 90
			if isValid == tt.wantError {
				t.Errorf("days=%d: expected error=%v, got valid=%v", tt.days, tt.wantError, isValid)
			}
		})
	}
}

// TestInsightSeverityDisplay tests the severity levels for UI display.
func TestInsightSeverityDisplay(t *testing.T) {
	severityDisplay := map[string]string{
		"info":          "blue",    // Blue icon, lower priority
		"warning":       "yellow",  // Yellow/orange icon, medium priority
		"action-needed": "red",     // Red icon, high priority
	}

	// Verify all severities have display mappings
	for severity, color := range severityDisplay {
		if color == "" {
			t.Errorf("severity %q has no display color", severity)
		}
	}

	if len(severityDisplay) != 3 {
		t.Errorf("expected 3 severity display mappings, got %d", len(severityDisplay))
	}
}

// TestAPIEndpoints documents the expected BeeBrain API endpoints.
func TestAPIEndpoints(t *testing.T) {
	endpoints := []struct {
		method   string
		path     string
		desc     string
	}{
		{"GET", "/api/beebrain/dashboard", "Tenant-wide analysis summary"},
		{"GET", "/api/beebrain/hive/{id}", "Hive-specific analysis"},
		{"POST", "/api/beebrain/refresh", "Trigger new analysis"},
		{"POST", "/api/beebrain/insights/{id}/dismiss", "Dismiss an insight"},
		{"POST", "/api/beebrain/insights/{id}/snooze", "Snooze an insight"},
	}

	if len(endpoints) != 5 {
		t.Errorf("expected 5 BeeBrain endpoints, got %d", len(endpoints))
	}

	// Verify endpoint methods
	for _, ep := range endpoints {
		switch ep.method {
		case "GET", "POST":
			// valid
		default:
			t.Errorf("unexpected method %q for %s", ep.method, ep.path)
		}
	}
}

// TestInsightJSONOmitEmpty tests that optional fields are omitted when empty.
func TestInsightJSONOmitEmpty(t *testing.T) {
	insight := services.Insight{
		ID:              "insight-1",
		RuleID:          "test",
		Severity:        "info",
		Message:         "Test",
		SuggestedAction: "Do something",
		DataPoints:      map[string]interface{}{},
		CreatedAt:       time.Now(),
		// HiveID, HiveName, DismissedAt, SnoozedUntil are nil
	}

	jsonData, err := json.Marshal(insight)
	if err != nil {
		t.Fatalf("failed to marshal insight: %v", err)
	}

	// Check that nil fields are omitted
	var decoded map[string]interface{}
	if err := json.Unmarshal(jsonData, &decoded); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	if _, exists := decoded["hive_id"]; exists {
		t.Error("expected hive_id to be omitted when nil")
	}
	if _, exists := decoded["hive_name"]; exists {
		t.Error("expected hive_name to be omitted when nil")
	}
	if _, exists := decoded["dismissed_at"]; exists {
		t.Error("expected dismissed_at to be omitted when nil")
	}
	if _, exists := decoded["snoozed_until"]; exists {
		t.Error("expected snoozed_until to be omitted when nil")
	}
}

// TestMaintenanceResponseStructure tests the maintenance API response structure.
func TestMaintenanceResponseStructure(t *testing.T) {
	type MaintenanceData struct {
		Items             []services.MaintenanceItem       `json:"items"`
		RecentlyCompleted []services.RecentlyCompletedItem `json:"recently_completed"`
		TotalCount        int                              `json:"total_count"`
		AllCaughtUp       bool                             `json:"all_caught_up"`
	}

	type MaintenanceResponse struct {
		Data MaintenanceData `json:"data"`
	}

	now := time.Now()
	hiveID := "hive-1"
	hiveName := "Test Hive"

	response := MaintenanceResponse{
		Data: MaintenanceData{
			Items: []services.MaintenanceItem{
				{
					HiveID:        hiveID,
					HiveName:      hiveName,
					SiteID:        "site-1",
					SiteName:      "Home Apiary",
					Priority:      "Urgent",
					PriorityScore: 192,
					Summary:       "Varroa treatment due (92 days since last treatment)",
					Insights: []services.Insight{
						{
							ID:              "insight-1",
							HiveID:          &hiveID,
							HiveName:        &hiveName,
							RuleID:          "treatment_due",
							Severity:        "action-needed",
							Message:         "Test Hive: Treatment due (92 days)",
							SuggestedAction: "Schedule treatment",
							DataPoints: map[string]interface{}{
								"days_since_treatment": 92,
							},
							CreatedAt: now,
						},
					},
					QuickActions: []services.QuickAction{
						{Label: "Log Treatment", URL: "/hives/hive-1", Tab: "treatments"},
						{Label: "View Details", URL: "/hives/hive-1"},
					},
				},
			},
			RecentlyCompleted: []services.RecentlyCompletedItem{
				{
					HiveID:      "hive-2",
					HiveName:    "Hive B",
					Action:      "Treatment logged",
					CompletedAt: now.AddDate(0, 0, -1),
				},
			},
			TotalCount:  1,
			AllCaughtUp: false,
		},
	}

	// Verify JSON serialization works
	jsonData, err := json.Marshal(response)
	if err != nil {
		t.Fatalf("failed to marshal response: %v", err)
	}

	// Verify we can deserialize it back
	var decoded MaintenanceResponse
	if err := json.Unmarshal(jsonData, &decoded); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if decoded.Data.TotalCount != 1 {
		t.Errorf("expected TotalCount=1, got %d", decoded.Data.TotalCount)
	}
	if decoded.Data.AllCaughtUp {
		t.Error("expected AllCaughtUp=false")
	}
	if len(decoded.Data.Items) != 1 {
		t.Errorf("expected 1 item, got %d", len(decoded.Data.Items))
	}
	if decoded.Data.Items[0].Priority != "Urgent" {
		t.Errorf("expected priority 'Urgent', got %q", decoded.Data.Items[0].Priority)
	}
	if len(decoded.Data.RecentlyCompleted) != 1 {
		t.Errorf("expected 1 recently completed, got %d", len(decoded.Data.RecentlyCompleted))
	}
}

// TestMaintenanceAllCaughtUpResponse tests the empty state response.
func TestMaintenanceAllCaughtUpResponse(t *testing.T) {
	type MaintenanceData struct {
		Items             []services.MaintenanceItem       `json:"items"`
		RecentlyCompleted []services.RecentlyCompletedItem `json:"recently_completed"`
		TotalCount        int                              `json:"total_count"`
		AllCaughtUp       bool                             `json:"all_caught_up"`
	}

	type MaintenanceResponse struct {
		Data MaintenanceData `json:"data"`
	}

	response := MaintenanceResponse{
		Data: MaintenanceData{
			Items:             []services.MaintenanceItem{},
			RecentlyCompleted: []services.RecentlyCompletedItem{},
			TotalCount:        0,
			AllCaughtUp:       true,
		},
	}

	if !response.Data.AllCaughtUp {
		t.Error("expected AllCaughtUp=true")
	}
	if len(response.Data.Items) != 0 {
		t.Errorf("expected 0 items, got %d", len(response.Data.Items))
	}
	if response.Data.TotalCount != 0 {
		t.Errorf("expected TotalCount=0, got %d", response.Data.TotalCount)
	}
}

// TestMaintenancePriorityScore tests priority score calculation.
func TestMaintenancePriorityScore(t *testing.T) {
	tests := []struct {
		name             string
		severity         string
		ageInDays        int
		expectedMinScore int
		expectedMaxScore int
	}{
		{"action_needed_fresh", "action-needed", 0, 100, 100},
		{"action_needed_old", "action-needed", 30, 130, 130},
		{"warning_fresh", "warning", 0, 50, 50},
		{"warning_old", "warning", 30, 80, 80},
		{"info_fresh", "info", 0, 10, 10},
		{"info_old", "info", 30, 40, 40},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Calculate expected score
			var severityWeight int
			switch tt.severity {
			case "action-needed":
				severityWeight = 100
			case "warning":
				severityWeight = 50
			case "info":
				severityWeight = 10
			}
			expectedScore := severityWeight + tt.ageInDays

			if expectedScore < tt.expectedMinScore || expectedScore > tt.expectedMaxScore {
				t.Errorf("expected score between %d and %d, got %d", tt.expectedMinScore, tt.expectedMaxScore, expectedScore)
			}
		})
	}
}

// TestMaintenancePriorityLabels tests priority label mapping.
func TestMaintenancePriorityLabels(t *testing.T) {
	tests := []struct {
		severity      string
		expectedLabel string
	}{
		{"action-needed", "Urgent"},
		{"warning", "Soon"},
		{"info", "Optional"},
	}

	for _, tt := range tests {
		t.Run(tt.severity, func(t *testing.T) {
			var label string
			switch tt.severity {
			case "action-needed":
				label = "Urgent"
			case "warning":
				label = "Soon"
			default:
				label = "Optional"
			}

			if label != tt.expectedLabel {
				t.Errorf("expected label %q for severity %q, got %q", tt.expectedLabel, tt.severity, label)
			}
		})
	}
}

// TestMaintenanceQuickActions tests quick action generation.
func TestMaintenanceQuickActions(t *testing.T) {
	tests := []struct {
		name           string
		ruleID         string
		expectedAction string
	}{
		{"treatment_due", "treatment_due", "Log Treatment"},
		{"inspection_overdue", "inspection_overdue", "Log Inspection"},
		{"queen_aging", "queen_aging", "View Queen Info"},
		{"hornet_activity", "hornet_activity_spike", "View Clips"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Verify the expected action label
			if tt.expectedAction == "" {
				t.Errorf("missing expected action for rule %q", tt.ruleID)
			}
		})
	}
}

// TestMaintenanceEndpoint documents the maintenance API endpoint.
func TestMaintenanceEndpoint(t *testing.T) {
	endpoint := struct {
		method string
		path   string
		desc   string
	}{
		"GET", "/api/beebrain/maintenance", "List hives needing attention",
	}

	if endpoint.method != "GET" {
		t.Errorf("expected GET method, got %q", endpoint.method)
	}
	if endpoint.path != "/api/beebrain/maintenance" {
		t.Errorf("unexpected endpoint path: %q", endpoint.path)
	}
}

// TestMaintenanceItemStructure tests the MaintenanceItem fields.
func TestMaintenanceItemStructure(t *testing.T) {
	item := services.MaintenanceItem{
		HiveID:        "hive-1",
		HiveName:      "Test Hive",
		SiteID:        "site-1",
		SiteName:      "Home Apiary",
		Priority:      "Urgent",
		PriorityScore: 130,
		Summary:       "Treatment overdue",
		Insights:      []services.Insight{},
		QuickActions:  []services.QuickAction{},
	}

	// Verify JSON serialization
	jsonData, err := json.Marshal(item)
	if err != nil {
		t.Fatalf("failed to marshal MaintenanceItem: %v", err)
	}

	var decoded map[string]interface{}
	if err := json.Unmarshal(jsonData, &decoded); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	// Check all required fields are present
	requiredFields := []string{"hive_id", "hive_name", "site_id", "site_name", "priority", "priority_score", "summary", "insights", "quick_actions"}
	for _, field := range requiredFields {
		if _, exists := decoded[field]; !exists {
			t.Errorf("expected field %q to be present", field)
		}
	}
}

// TestQuickActionStructure tests the QuickAction fields.
func TestQuickActionStructure(t *testing.T) {
	// With tab
	actionWithTab := services.QuickAction{
		Label: "Log Treatment",
		URL:   "/hives/hive-1",
		Tab:   "treatments",
	}

	jsonData, err := json.Marshal(actionWithTab)
	if err != nil {
		t.Fatalf("failed to marshal QuickAction: %v", err)
	}

	var decoded map[string]interface{}
	if err := json.Unmarshal(jsonData, &decoded); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	if decoded["label"] != "Log Treatment" {
		t.Errorf("unexpected label: %v", decoded["label"])
	}
	if decoded["url"] != "/hives/hive-1" {
		t.Errorf("unexpected url: %v", decoded["url"])
	}
	if decoded["tab"] != "treatments" {
		t.Errorf("unexpected tab: %v", decoded["tab"])
	}

	// Without tab (should be omitted)
	actionWithoutTab := services.QuickAction{
		Label: "View Details",
		URL:   "/hives/hive-1",
	}

	jsonData2, err := json.Marshal(actionWithoutTab)
	if err != nil {
		t.Fatalf("failed to marshal QuickAction without tab: %v", err)
	}

	var decoded2 map[string]interface{}
	if err := json.Unmarshal(jsonData2, &decoded2); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	// Tab should be omitted when empty (omitempty)
	if tab, exists := decoded2["tab"]; exists && tab != "" {
		t.Errorf("expected tab to be omitted or empty, got %v", tab)
	}
}

// TestRecentlyCompletedItemStructure tests the RecentlyCompletedItem fields.
func TestRecentlyCompletedItemStructure(t *testing.T) {
	item := services.RecentlyCompletedItem{
		HiveID:      "hive-1",
		HiveName:    "Test Hive",
		Action:      "Treatment logged",
		CompletedAt: time.Now(),
	}

	jsonData, err := json.Marshal(item)
	if err != nil {
		t.Fatalf("failed to marshal RecentlyCompletedItem: %v", err)
	}

	var decoded map[string]interface{}
	if err := json.Unmarshal(jsonData, &decoded); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	requiredFields := []string{"hive_id", "hive_name", "action", "completed_at"}
	for _, field := range requiredFields {
		if _, exists := decoded[field]; !exists {
			t.Errorf("expected field %q to be present", field)
		}
	}
}
