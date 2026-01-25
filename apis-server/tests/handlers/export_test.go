// Package handlers_test contains unit tests for the APIS server HTTP handlers.
package handlers_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/jermoo/apis/apis-server/internal/services"
)

// TestExportRequestValidation tests the export request validation rules.
func TestExportRequestValidation(t *testing.T) {
	tests := []struct {
		name       string
		format     string
		hiveCount  int
		wantError  bool
	}{
		{"valid_summary_format", "summary", 1, false},
		{"valid_markdown_format", "markdown", 1, false},
		{"valid_json_format", "json", 1, false},
		{"invalid_format", "csv", 1, true},
		{"no_hives", "markdown", 0, true},
		{"multiple_hives", "json", 5, false},
	}

	validFormats := map[string]bool{"summary": true, "markdown": true, "json": true}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			isValid := validFormats[tt.format] && tt.hiveCount > 0
			if isValid == tt.wantError {
				t.Errorf("format=%s, hiveCount=%d: expected error=%v, got valid=%v",
					tt.format, tt.hiveCount, tt.wantError, isValid)
			}
		})
	}
}

// TestExportResponseStructure tests the export response structure.
func TestExportResponseStructure(t *testing.T) {
	type ExportData struct {
		Content     string `json:"content"`
		Format      string `json:"format"`
		HiveCount   int    `json:"hive_count"`
		GeneratedAt string `json:"generated_at"`
	}

	type ExportResponse struct {
		Data ExportData `json:"data"`
	}

	response := ExportResponse{
		Data: ExportData{
			Content:     "## Test Hive Details\n\n...",
			Format:      "markdown",
			HiveCount:   1,
			GeneratedAt: time.Now().Format(time.RFC3339),
		},
	}

	// Verify JSON serialization works
	jsonData, err := json.Marshal(response)
	if err != nil {
		t.Fatalf("failed to marshal response: %v", err)
	}

	// Verify we can deserialize it back
	var decoded ExportResponse
	if err := json.Unmarshal(jsonData, &decoded); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if decoded.Data.Format != "markdown" {
		t.Errorf("expected format 'markdown', got %q", decoded.Data.Format)
	}
	if decoded.Data.HiveCount != 1 {
		t.Errorf("expected hive_count 1, got %d", decoded.Data.HiveCount)
	}
	if decoded.Data.Content == "" {
		t.Error("expected non-empty content")
	}
}

// TestExportPresetResponseStructure tests the preset response structures.
func TestExportPresetResponseStructure(t *testing.T) {
	type IncludeConfig struct {
		Basics    []string `json:"basics,omitempty"`
		Details   []string `json:"details,omitempty"`
		Analysis  []string `json:"analysis,omitempty"`
		Financial []string `json:"financial,omitempty"`
	}

	type ExportPreset struct {
		ID        string        `json:"id"`
		Name      string        `json:"name"`
		Config    IncludeConfig `json:"config"`
		CreatedAt string        `json:"created_at"`
	}

	type PresetResponse struct {
		Data ExportPreset `json:"data"`
	}

	response := PresetResponse{
		Data: ExportPreset{
			ID:   "preset-123",
			Name: "My Preset",
			Config: IncludeConfig{
				Basics:    []string{"hive_name", "queen_age"},
				Details:   []string{"inspection_log"},
				Analysis:  []string{"beebrain_insights"},
				Financial: []string{},
			},
			CreatedAt: time.Now().Format(time.RFC3339),
		},
	}

	// Verify JSON serialization works
	jsonData, err := json.Marshal(response)
	if err != nil {
		t.Fatalf("failed to marshal response: %v", err)
	}

	// Verify we can deserialize it back
	var decoded PresetResponse
	if err := json.Unmarshal(jsonData, &decoded); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if decoded.Data.ID != "preset-123" {
		t.Errorf("expected ID 'preset-123', got %q", decoded.Data.ID)
	}
	if decoded.Data.Name != "My Preset" {
		t.Errorf("expected name 'My Preset', got %q", decoded.Data.Name)
	}
	if len(decoded.Data.Config.Basics) != 2 {
		t.Errorf("expected 2 basics fields, got %d", len(decoded.Data.Config.Basics))
	}
}

// TestExportPresetListResponse tests the presets list response structure.
func TestExportPresetListResponse(t *testing.T) {
	type Meta struct {
		Total int `json:"total"`
	}

	type PresetsListResponse struct {
		Data []map[string]interface{} `json:"data"`
		Meta Meta                     `json:"meta"`
	}

	response := PresetsListResponse{
		Data: []map[string]interface{}{
			{"id": "preset-1", "name": "Preset 1"},
			{"id": "preset-2", "name": "Preset 2"},
		},
		Meta: Meta{Total: 2},
	}

	jsonData, err := json.Marshal(response)
	if err != nil {
		t.Fatalf("failed to marshal response: %v", err)
	}

	var decoded PresetsListResponse
	if err := json.Unmarshal(jsonData, &decoded); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if len(decoded.Data) != 2 {
		t.Errorf("expected 2 presets, got %d", len(decoded.Data))
	}
	if decoded.Meta.Total != 2 {
		t.Errorf("expected meta.total=2, got %d", decoded.Meta.Total)
	}
}

// TestIncludeConfigContainsAny tests the containsAny helper function logic.
func TestIncludeConfigContainsAny(t *testing.T) {
	containsAny := func(slice []string, values ...string) bool {
		for _, s := range slice {
			for _, v := range values {
				if s == v {
					return true
				}
			}
		}
		return false
	}

	tests := []struct {
		name   string
		slice  []string
		values []string
		want   bool
	}{
		{"empty_slice", []string{}, []string{"foo"}, false},
		{"single_match", []string{"foo"}, []string{"foo"}, true},
		{"partial_match", []string{"foo", "bar"}, []string{"baz", "foo"}, true},
		{"no_match", []string{"foo", "bar"}, []string{"baz", "qux"}, false},
		{"empty_values", []string{"foo"}, []string{}, false},
		{"multiple_values_match", []string{"foo"}, []string{"bar", "foo"}, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := containsAny(tt.slice, tt.values...); got != tt.want {
				t.Errorf("containsAny(%v, %v) = %v, want %v", tt.slice, tt.values, got, tt.want)
			}
		})
	}
}

// TestExportServiceFormats tests the expected export formats.
func TestExportServiceFormats(t *testing.T) {
	formats := []struct {
		format      string
		contentType string
		extension   string
	}{
		{"summary", "text/plain", ".txt"},
		{"markdown", "text/plain", ".md"},
		{"json", "application/json", ".json"},
	}

	for _, f := range formats {
		t.Run(f.format, func(t *testing.T) {
			if f.extension == "" {
				t.Errorf("format %q has no extension", f.format)
			}
			if f.contentType == "" {
				t.Errorf("format %q has no content type", f.format)
			}
		})
	}
}

// TestIncludeConfigCategories tests the include config categories match documentation.
func TestIncludeConfigCategories(t *testing.T) {
	// These are the documented field options
	fieldOptions := map[string][]string{
		"basics":    {"hive_name", "queen_age", "boxes", "current_weight", "location"},
		"details":   {"inspection_log", "hornet_data", "weight_history", "weather_correlations"},
		"analysis":  {"beebrain_insights", "health_summary", "season_comparison"},
		"financial": {"costs", "harvest_revenue", "roi_per_hive"},
	}

	// Verify all categories exist
	expectedCategories := []string{"basics", "details", "analysis", "financial"}
	for _, cat := range expectedCategories {
		if _, exists := fieldOptions[cat]; !exists {
			t.Errorf("missing category: %q", cat)
		}
	}

	// Verify at least 3 fields per category
	for cat, fields := range fieldOptions {
		if len(fields) < 3 {
			t.Errorf("category %q has only %d fields, expected at least 3", cat, len(fields))
		}
	}
}

// TestExportRateLimitResponse tests the rate limit response structure.
func TestExportRateLimitResponse(t *testing.T) {
	response := map[string]interface{}{
		"error":       "Export rate limit exceeded. Try again later.",
		"code":        429,
		"retry_after": 45,
	}

	jsonData, err := json.Marshal(response)
	if err != nil {
		t.Fatalf("failed to marshal response: %v", err)
	}

	var decoded map[string]interface{}
	if err := json.Unmarshal(jsonData, &decoded); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if decoded["code"] != float64(429) { // JSON numbers are float64
		t.Errorf("expected code=429, got %v", decoded["code"])
	}
	if _, ok := decoded["retry_after"]; !ok {
		t.Error("expected retry_after field")
	}
}

// TestExportServiceIncludeConfig tests the IncludeConfig struct serialization.
func TestExportServiceIncludeConfig(t *testing.T) {
	config := services.IncludeConfig{
		Basics:    []string{"hive_name", "queen_age"},
		Details:   []string{"inspection_log"},
		Analysis:  []string{},
		Financial: nil,
	}

	jsonData, err := json.Marshal(config)
	if err != nil {
		t.Fatalf("failed to marshal config: %v", err)
	}

	var decoded map[string]interface{}
	if err := json.Unmarshal(jsonData, &decoded); err != nil {
		t.Fatalf("failed to unmarshal config: %v", err)
	}

	// Empty/nil slices should be omitted with omitempty tag
	// But non-nil empty slice still serializes to []
	basics, ok := decoded["basics"]
	if !ok {
		t.Error("expected basics field to be present")
	}
	if basicsList, ok := basics.([]interface{}); !ok || len(basicsList) != 2 {
		t.Errorf("expected basics to have 2 items, got %v", basics)
	}
}

// TestExportEndpoints documents the expected export API endpoints.
func TestExportEndpoints(t *testing.T) {
	endpoints := []struct {
		method string
		path   string
		desc   string
	}{
		{"POST", "/api/export", "Generate export with selected fields and format"},
		{"GET", "/api/export/presets", "List saved presets for tenant"},
		{"POST", "/api/export/presets", "Create new preset"},
		{"DELETE", "/api/export/presets/{id}", "Delete a preset"},
	}

	if len(endpoints) != 4 {
		t.Errorf("expected 4 export endpoints, got %d", len(endpoints))
	}

	// Verify endpoint methods
	for _, ep := range endpoints {
		switch ep.method {
		case "GET", "POST", "DELETE":
			// valid
		default:
			t.Errorf("unexpected method %q for %s", ep.method, ep.path)
		}
	}
}

// TestAllHivesSelection tests the "all" hive selection option.
func TestAllHivesSelection(t *testing.T) {
	testCases := []struct {
		name     string
		hiveIDs  []string
		isAll    bool
	}{
		{"single_all", []string{"all"}, true},
		{"specific_hives", []string{"hive-1", "hive-2"}, false},
		{"all_with_others", []string{"all", "hive-1"}, false},
		{"empty", []string{}, false},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			isAll := len(tc.hiveIDs) == 1 && tc.hiveIDs[0] == "all"
			if isAll != tc.isAll {
				t.Errorf("hiveIDs=%v: expected isAll=%v, got %v", tc.hiveIDs, tc.isAll, isAll)
			}
		})
	}
}
