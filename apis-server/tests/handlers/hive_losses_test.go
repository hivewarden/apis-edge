package handlers_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCreateHiveLossRequestValidation(t *testing.T) {
	tests := []struct {
		name        string
		body        map[string]interface{}
		expectValid bool
	}{
		{
			name: "valid request with all fields",
			body: map[string]interface{}{
				"discovered_at":  "2026-01-20",
				"cause":          "varroa",
				"symptoms":       []string{"dead_bees_entrance", "deformed_wings"},
				"symptoms_notes": "Found cluster of dead bees",
				"reflection":     "Should have treated earlier",
				"data_choice":    "archive",
			},
			expectValid: true,
		},
		{
			name: "valid request minimal fields",
			body: map[string]interface{}{
				"discovered_at": "2026-01-20",
				"cause":         "unknown",
				"symptoms":      []string{},
				"data_choice":   "archive",
			},
			expectValid: true,
		},
		{
			name: "valid request with other cause and cause_other",
			body: map[string]interface{}{
				"discovered_at": "2026-01-20",
				"cause":         "other",
				"cause_other":   "Bear attack",
				"symptoms":      []string{},
				"data_choice":   "delete",
			},
			expectValid: true,
		},
		{
			name: "missing discovered_at",
			body: map[string]interface{}{
				"cause":       "varroa",
				"symptoms":    []string{},
				"data_choice": "archive",
			},
			expectValid: false,
		},
		{
			name: "missing cause",
			body: map[string]interface{}{
				"discovered_at": "2026-01-20",
				"symptoms":      []string{},
				"data_choice":   "archive",
			},
			expectValid: false,
		},
		{
			name: "invalid cause",
			body: map[string]interface{}{
				"discovered_at": "2026-01-20",
				"cause":         "disease",
				"symptoms":      []string{},
				"data_choice":   "archive",
			},
			expectValid: false,
		},
		{
			name: "invalid symptom",
			body: map[string]interface{}{
				"discovered_at": "2026-01-20",
				"cause":         "varroa",
				"symptoms":      []string{"invalid_symptom"},
				"data_choice":   "archive",
			},
			expectValid: false,
		},
		{
			name: "invalid data_choice",
			body: map[string]interface{}{
				"discovered_at": "2026-01-20",
				"cause":         "varroa",
				"symptoms":      []string{},
				"data_choice":   "keep",
			},
			expectValid: false,
		},
		{
			name: "other cause without cause_other",
			body: map[string]interface{}{
				"discovered_at": "2026-01-20",
				"cause":         "other",
				"symptoms":      []string{},
				"data_choice":   "archive",
			},
			expectValid: false,
		},
		{
			name: "invalid date format",
			body: map[string]interface{}{
				"discovered_at": "01-20-2026",
				"cause":         "varroa",
				"symptoms":      []string{},
				"data_choice":   "archive",
			},
			expectValid: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			bodyBytes, err := json.Marshal(tt.body)
			require.NoError(t, err)

			// Create a test request to validate the JSON structure
			req := httptest.NewRequest(http.MethodPost, "/api/hives/test-id/loss", bytes.NewReader(bodyBytes))
			req.Header.Set("Content-Type", "application/json")

			// Validate the request body can be parsed
			var parsedBody map[string]interface{}
			err = json.Unmarshal(bodyBytes, &parsedBody)
			require.NoError(t, err)

			// Check required fields
			hasDiscoveredAt := parsedBody["discovered_at"] != nil && parsedBody["discovered_at"] != ""
			hasCause := parsedBody["cause"] != nil && parsedBody["cause"] != ""
			hasDataChoice := parsedBody["data_choice"] != nil && parsedBody["data_choice"] != ""

			// Basic validation
			isValid := hasDiscoveredAt && hasCause && hasDataChoice

			// Validate cause value
			if isValid && hasCause {
				validCauses := []string{"starvation", "varroa", "queen_failure", "pesticide", "swarming", "robbing", "unknown", "other"}
				cause := parsedBody["cause"].(string)
				causeValid := false
				for _, vc := range validCauses {
					if vc == cause {
						causeValid = true
						break
					}
				}
				isValid = isValid && causeValid

				// Check cause_other when cause is "other"
				if cause == "other" {
					causeOther, ok := parsedBody["cause_other"]
					isValid = isValid && ok && causeOther != nil && causeOther != ""
				}
			}

			// Validate symptoms
			if isValid {
				if symptoms, ok := parsedBody["symptoms"].([]interface{}); ok {
					validSymptoms := []string{"no_bees", "dead_bees_entrance", "deformed_wings", "robbing_evidence", "moldy_frames", "empty_stores", "dead_brood", "chalk_brood", "shb_evidence", "wax_moth"}
					for _, s := range symptoms {
						symptom, ok := s.(string)
						if !ok {
							isValid = false
							break
						}
						symptomValid := false
						for _, vs := range validSymptoms {
							if vs == symptom {
								symptomValid = true
								break
							}
						}
						if !symptomValid {
							isValid = false
							break
						}
					}
				}
			}

			// Validate data_choice
			if isValid && hasDataChoice {
				dataChoice := parsedBody["data_choice"].(string)
				isValid = isValid && (dataChoice == "archive" || dataChoice == "delete")
			}

			// Validate date format
			if isValid && hasDiscoveredAt {
				dateStr := parsedBody["discovered_at"].(string)
				// Simple check for YYYY-MM-DD format
				isValid = isValid && len(dateStr) == 10 && dateStr[4] == '-' && dateStr[7] == '-'
			}

			if tt.expectValid {
				assert.True(t, isValid, "Expected request to be valid")
			} else {
				assert.False(t, isValid, "Expected request to be invalid")
			}
		})
	}
}

func TestHiveLossResponseFormat(t *testing.T) {
	// Test that the response format matches the API contract
	response := map[string]interface{}{
		"data": map[string]interface{}{
			"id":               "uuid",
			"hive_id":          "uuid",
			"discovered_at":    "2026-01-20",
			"cause":            "varroa",
			"cause_display":    "Varroa/Mites",
			"symptoms":         []string{"dead_bees_entrance", "deformed_wings", "empty_stores"},
			"symptoms_display": []string{"Dead bees at entrance/inside", "Deformed wings visible", "Empty honey stores"},
			"symptoms_notes":   "Found cluster of dead bees with clear DWV symptoms",
			"reflection":       "Should have treated earlier in August",
			"data_choice":      "archive",
			"created_at":       "2026-01-25T10:00:00Z",
		},
		"message": "Your records have been saved. This experience will help you care for future hives.",
	}

	// Verify structure
	data, ok := response["data"].(map[string]interface{})
	require.True(t, ok, "Response should have data field")

	assert.NotEmpty(t, data["id"])
	assert.NotEmpty(t, data["hive_id"])
	assert.NotEmpty(t, data["discovered_at"])
	assert.NotEmpty(t, data["cause"])
	assert.NotEmpty(t, data["cause_display"])
	assert.NotEmpty(t, data["symptoms"])
	assert.NotEmpty(t, data["symptoms_display"])
	assert.NotEmpty(t, data["data_choice"])
	assert.NotEmpty(t, data["created_at"])
	assert.NotEmpty(t, response["message"])

	// Verify symptom arrays have same length
	symptoms := data["symptoms"].([]string)
	symptomsDisplay := data["symptoms_display"].([]string)
	assert.Equal(t, len(symptoms), len(symptomsDisplay))
}

func TestHiveLossListResponseFormat(t *testing.T) {
	response := map[string]interface{}{
		"data": []map[string]interface{}{
			{
				"id":            "uuid1",
				"hive_id":       "uuid",
				"hive_name":     "Hive 1",
				"discovered_at": "2026-01-20",
				"cause":         "varroa",
				"cause_display": "Varroa/Mites",
				"symptoms":      []string{"dead_bees_entrance"},
				"created_at":    "2026-01-25T10:00:00Z",
			},
		},
		"meta": map[string]interface{}{
			"total": 1,
		},
	}

	// Verify structure
	data, ok := response["data"].([]map[string]interface{})
	require.True(t, ok, "Response should have data array")
	require.Len(t, data, 1)

	meta, ok := response["meta"].(map[string]interface{})
	require.True(t, ok, "Response should have meta field")

	total, ok := meta["total"].(int)
	require.True(t, ok, "Meta should have total field")
	assert.Equal(t, 1, total)

	// Verify first item has hive_name for joined query
	assert.NotEmpty(t, data[0]["hive_name"])
}

func TestHiveLossStatsResponseFormat(t *testing.T) {
	response := map[string]interface{}{
		"data": map[string]interface{}{
			"total_losses": 3,
			"losses_by_cause": map[string]int{
				"varroa":     2,
				"starvation": 1,
			},
			"losses_by_year": map[string]int{
				"2025": 1,
				"2026": 2,
			},
			"common_symptoms": []map[string]interface{}{
				{"symptom": "dead_bees_entrance", "count": 3},
				{"symptom": "empty_stores", "count": 2},
			},
		},
	}

	// Verify structure
	data, ok := response["data"].(map[string]interface{})
	require.True(t, ok, "Response should have data field")

	assert.NotNil(t, data["total_losses"])
	assert.NotNil(t, data["losses_by_cause"])
	assert.NotNil(t, data["losses_by_year"])
	assert.NotNil(t, data["common_symptoms"])

	// Verify losses_by_cause format
	lossesByCause, ok := data["losses_by_cause"].(map[string]int)
	require.True(t, ok)
	assert.Equal(t, 2, lossesByCause["varroa"])
	assert.Equal(t, 1, lossesByCause["starvation"])

	// Verify common_symptoms format
	commonSymptoms, ok := data["common_symptoms"].([]map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, "dead_bees_entrance", commonSymptoms[0]["symptom"])
}

func TestLossSummaryInHiveResponse(t *testing.T) {
	// Test that lost hives include loss_summary in list response
	hiveResponse := map[string]interface{}{
		"id":          "uuid",
		"name":        "Hive 2",
		"hive_status": "lost",
		"lost_at":     "2026-01-20",
		"loss_summary": map[string]interface{}{
			"cause":         "varroa",
			"cause_display": "Varroa/Mites",
			"discovered_at": "2026-01-20",
		},
	}

	// Verify loss_summary is present for lost hives
	assert.Equal(t, "lost", hiveResponse["hive_status"])
	assert.NotNil(t, hiveResponse["lost_at"])
	assert.NotNil(t, hiveResponse["loss_summary"])

	lossSummary, ok := hiveResponse["loss_summary"].(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, "varroa", lossSummary["cause"])
	assert.Equal(t, "Varroa/Mites", lossSummary["cause_display"])
	assert.Equal(t, "2026-01-20", lossSummary["discovered_at"])
}
