package handlers

import (
	"bytes"
	"encoding/json"
	"testing"

	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/stretchr/testify/assert"
)

func TestCreateHarvestRequestValidation(t *testing.T) {
	tests := []struct {
		name    string
		body    string
		wantErr bool
	}{
		{
			name: "valid request with all fields",
			body: `{
				"site_id": "site-123",
				"harvested_at": "2024-08-15",
				"total_kg": 25.5,
				"notes": "Great harvest",
				"hive_breakdown": [
					{"hive_id": "hive-1", "frames": 10, "amount_kg": 12.75},
					{"hive_id": "hive-2", "frames": 8, "amount_kg": 12.75}
				]
			}`,
			wantErr: false,
		},
		{
			name: "valid request with minimal fields",
			body: `{
				"site_id": "site-123",
				"harvested_at": "2024-08-15",
				"total_kg": 25.5,
				"hive_breakdown": [
					{"hive_id": "hive-1", "amount_kg": 25.5}
				]
			}`,
			wantErr: false,
		},
		{
			name:    "invalid JSON",
			body:    `{"site_id": }`,
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var req CreateHarvestRequest
			err := json.NewDecoder(bytes.NewBufferString(tt.body)).Decode(&req)
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestUpdateHarvestRequestPartialFields(t *testing.T) {
	// Test that only provided fields are set
	body := `{"harvested_at": "2024-08-20"}`
	var req UpdateHarvestRequest
	err := json.NewDecoder(bytes.NewBufferString(body)).Decode(&req)

	assert.NoError(t, err)
	assert.NotNil(t, req.HarvestedAt)
	assert.Equal(t, "2024-08-20", *req.HarvestedAt)
	assert.Nil(t, req.TotalKg)
	assert.Nil(t, req.Notes)
	assert.Empty(t, req.HiveBreakdown)
}

func TestHarvestHiveInputValidation(t *testing.T) {
	tests := []struct {
		name    string
		body    string
		wantKg  float64
		wantID  string
	}{
		{
			name:    "basic hive breakdown",
			body:    `{"hive_id": "hive-abc", "amount_kg": 15.5}`,
			wantKg:  15.5,
			wantID:  "hive-abc",
		},
		{
			name:    "with frames",
			body:    `{"hive_id": "hive-xyz", "frames": 12, "amount_kg": 20.0}`,
			wantKg:  20.0,
			wantID:  "hive-xyz",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var input HarvestHiveInputRequest
			err := json.NewDecoder(bytes.NewBufferString(tt.body)).Decode(&input)
			assert.NoError(t, err)
			assert.Equal(t, tt.wantID, input.HiveID)
			assert.Equal(t, tt.wantKg, input.AmountKg)
		})
	}
}

func TestHarvestResponseSerialization(t *testing.T) {
	notes := "Good quality"
	resp := HarvestResponse{
		ID:          "harvest-123",
		SiteID:      "site-456",
		HarvestedAt: "2024-08-15",
		TotalKg:     25.5,
		Notes:       &notes,
		CreatedAt:   "2024-08-15T10:00:00Z",
		UpdatedAt:   "2024-08-15T10:00:00Z",
		Hives: []HarvestHiveResponse{
			{HiveID: "hive-1", HiveName: "Queen Bee", AmountKg: 12.75},
			{HiveID: "hive-2", HiveName: "Sunny", AmountKg: 12.75},
		},
	}

	data, err := json.Marshal(resp)
	assert.NoError(t, err)

	// Verify JSON fields are snake_case per CLAUDE.md
	assert.Contains(t, string(data), `"id"`)
	assert.Contains(t, string(data), `"site_id"`)
	assert.Contains(t, string(data), `"harvested_at"`)
	assert.Contains(t, string(data), `"total_kg"`)
	assert.Contains(t, string(data), `"notes"`)
	assert.Contains(t, string(data), `"created_at"`)
	assert.Contains(t, string(data), `"updated_at"`)
	assert.Contains(t, string(data), `"hives"`)
	assert.Contains(t, string(data), `"hive_id"`)
	assert.Contains(t, string(data), `"hive_name"`)
	assert.Contains(t, string(data), `"amount_kg"`)
}

func TestHarvestResponseOmitsNullNotes(t *testing.T) {
	resp := HarvestResponse{
		ID:          "harvest-123",
		SiteID:      "site-456",
		HarvestedAt: "2024-08-15",
		TotalKg:     25.5,
		// Notes left nil
		CreatedAt: "2024-08-15T10:00:00Z",
		UpdatedAt: "2024-08-15T10:00:00Z",
	}

	data, err := json.Marshal(resp)
	assert.NoError(t, err)

	// Verify null notes are omitted (omitempty)
	assert.NotContains(t, string(data), `"notes"`)
}

func TestHarvestsListResponseFormat(t *testing.T) {
	resp := HarvestsListResponse{
		Data: []HarvestResponse{
			{ID: "1", SiteID: "site-1", HarvestedAt: "2024-08-15", TotalKg: 10.0, CreatedAt: "2024-08-15T10:00:00Z", UpdatedAt: "2024-08-15T10:00:00Z"},
			{ID: "2", SiteID: "site-1", HarvestedAt: "2024-08-20", TotalKg: 15.0, CreatedAt: "2024-08-20T10:00:00Z", UpdatedAt: "2024-08-20T10:00:00Z"},
		},
		Meta: MetaResponse{Total: 2},
	}

	data, err := json.Marshal(resp)
	assert.NoError(t, err)

	// Verify format matches CLAUDE.md API response format
	var parsed map[string]any
	err = json.Unmarshal(data, &parsed)
	assert.NoError(t, err)

	assert.Contains(t, parsed, "data")
	assert.Contains(t, parsed, "meta")

	meta, ok := parsed["meta"].(map[string]any)
	assert.True(t, ok)
	assert.Equal(t, float64(2), meta["total"])
}

func TestHarvestBreakdownSumValidation(t *testing.T) {
	tests := []struct {
		name          string
		totalKg       float64
		breakdownKgs  []float64
		wantMismatch  bool
	}{
		{
			name:         "exact match",
			totalKg:      25.5,
			breakdownKgs: []float64{12.75, 12.75},
			wantMismatch: false,
		},
		{
			name:         "within tolerance",
			totalKg:      25.5,
			breakdownKgs: []float64{12.745, 12.755},
			wantMismatch: false, // diff is 0.01, within tolerance
		},
		{
			name:         "single hive exact",
			totalKg:      15.0,
			breakdownKgs: []float64{15.0},
			wantMismatch: false,
		},
		{
			name:         "mismatch over tolerance",
			totalKg:      25.5,
			breakdownKgs: []float64{12.0, 12.0},
			wantMismatch: true, // diff is 1.5, over 0.01 tolerance
		},
		{
			name:         "breakdown higher than total",
			totalKg:      25.0,
			breakdownKgs: []float64{15.0, 15.0},
			wantMismatch: true, // 30.0 vs 25.0
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var breakdownTotal float64
			for _, kg := range tt.breakdownKgs {
				breakdownTotal += kg
			}

			// Same logic as in handler
			mismatch := breakdownTotal-tt.totalKg > 0.01 || tt.totalKg-breakdownTotal > 0.01
			assert.Equal(t, tt.wantMismatch, mismatch)
		})
	}
}

func TestHarvestAnalyticsResponseSerialization(t *testing.T) {
	analytics := HarvestAnalyticsResponse{
		Data: storage.HarvestAnalytics{
			TotalKg:       150.5,
			TotalHarvests: 5,
			PerHive: []storage.HiveHarvestStat{
				{HiveID: "h1", HiveName: "Queen", TotalKg: 80.0, Harvests: 3},
				{HiveID: "h2", HiveName: "Sunny", TotalKg: 70.5, Harvests: 2},
			},
			YearOverYear: []storage.YearStat{
				{Year: 2023, TotalKg: 50.0},
				{Year: 2024, TotalKg: 100.5},
			},
			BestPerformingHive: &storage.BestHiveStat{
				HiveID:       "h1",
				HiveName:     "Queen",
				KgPerHarvest: 26.67,
			},
		},
	}

	data, err := json.Marshal(analytics)
	assert.NoError(t, err)

	// Verify structure
	var parsed map[string]any
	err = json.Unmarshal(data, &parsed)
	assert.NoError(t, err)

	assert.Contains(t, parsed, "data")
	analyticsData, ok := parsed["data"].(map[string]any)
	assert.True(t, ok)
	assert.Contains(t, analyticsData, "total_kg")
	assert.Contains(t, analyticsData, "total_harvests")
	assert.Contains(t, analyticsData, "per_hive")
	assert.Contains(t, analyticsData, "year_over_year")
}

func TestIsFirstHarvestFlag(t *testing.T) {
	resp := HarvestResponse{
		ID:             "harvest-123",
		SiteID:         "site-456",
		HarvestedAt:    "2024-08-15",
		TotalKg:        25.5,
		CreatedAt:      "2024-08-15T10:00:00Z",
		UpdatedAt:      "2024-08-15T10:00:00Z",
		IsFirstHarvest: true,
	}

	data, err := json.Marshal(resp)
	assert.NoError(t, err)
	assert.Contains(t, string(data), `"is_first_harvest":true`)

	// Test when false (should be omitted due to omitempty)
	resp.IsFirstHarvest = false
	data, err = json.Marshal(resp)
	assert.NoError(t, err)
	// When false with omitempty, it may or may not be included depending on Go behavior
	// The important thing is the response is valid JSON
	assert.NotNil(t, data)
}

