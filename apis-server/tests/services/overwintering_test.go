package services_test

import (
	"testing"
	"time"

	"github.com/jermoo/apis/apis-server/internal/services"
	"github.com/stretchr/testify/assert"
)

func TestGetCurrentWinterSeasonForDate_NorthernHemisphere(t *testing.T) {
	tests := []struct {
		name     string
		date     time.Time
		expected int
	}{
		{
			name:     "January belongs to previous year's winter",
			date:     time.Date(2026, time.January, 15, 0, 0, 0, 0, time.UTC),
			expected: 2025, // Winter 2025-2026
		},
		{
			name:     "February belongs to previous year's winter",
			date:     time.Date(2026, time.February, 28, 0, 0, 0, 0, time.UTC),
			expected: 2025, // Winter 2025-2026
		},
		{
			name:     "March belongs to previous year's winter",
			date:     time.Date(2026, time.March, 15, 0, 0, 0, 0, time.UTC),
			expected: 2025, // Winter 2025-2026
		},
		{
			name:     "April - winter ended, return previous winter",
			date:     time.Date(2026, time.April, 15, 0, 0, 0, 0, time.UTC),
			expected: 2025, // Last completed winter
		},
		{
			name:     "October - winter not started, return previous winter",
			date:     time.Date(2026, time.October, 15, 0, 0, 0, 0, time.UTC),
			expected: 2025, // Last completed winter
		},
		{
			name:     "November - new winter starting",
			date:     time.Date(2026, time.November, 1, 0, 0, 0, 0, time.UTC),
			expected: 2026, // Winter 2026-2027 starting
		},
		{
			name:     "December - current winter",
			date:     time.Date(2026, time.December, 25, 0, 0, 0, 0, time.UTC),
			expected: 2026, // Winter 2026-2027
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := services.GetCurrentWinterSeasonForDate(tt.date, "northern")
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestGetCurrentWinterSeasonForDate_SouthernHemisphere(t *testing.T) {
	tests := []struct {
		name     string
		date     time.Time
		expected int
	}{
		{
			name:     "January - previous winter ended",
			date:     time.Date(2026, time.January, 15, 0, 0, 0, 0, time.UTC),
			expected: 2025, // Winter 2025 ended
		},
		{
			name:     "April - between winters",
			date:     time.Date(2026, time.April, 15, 0, 0, 0, 0, time.UTC),
			expected: 2025, // Previous winter
		},
		{
			name:     "May - winter starting",
			date:     time.Date(2026, time.May, 1, 0, 0, 0, 0, time.UTC),
			expected: 2026, // Winter 2026
		},
		{
			name:     "July - mid winter",
			date:     time.Date(2026, time.July, 15, 0, 0, 0, 0, time.UTC),
			expected: 2026, // Winter 2026
		},
		{
			name:     "September - winter ending",
			date:     time.Date(2026, time.September, 30, 0, 0, 0, 0, time.UTC),
			expected: 2026, // Winter 2026
		},
		{
			name:     "October - winter ended",
			date:     time.Date(2026, time.October, 15, 0, 0, 0, 0, time.UTC),
			expected: 2026, // Winter 2026 just ended
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := services.GetCurrentWinterSeasonForDate(tt.date, "southern")
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestIsSpringPromptTimeForDate_NorthernHemisphere(t *testing.T) {
	tests := []struct {
		name     string
		date     time.Time
		expected bool
	}{
		{
			name:     "January - not spring prompt time",
			date:     time.Date(2026, time.January, 15, 0, 0, 0, 0, time.UTC),
			expected: false,
		},
		{
			name:     "February - not spring prompt time",
			date:     time.Date(2026, time.February, 15, 0, 0, 0, 0, time.UTC),
			expected: false,
		},
		{
			name:     "March 1 - spring prompt time",
			date:     time.Date(2026, time.March, 1, 0, 0, 0, 0, time.UTC),
			expected: true,
		},
		{
			name:     "March 15 - spring prompt time",
			date:     time.Date(2026, time.March, 15, 0, 0, 0, 0, time.UTC),
			expected: true,
		},
		{
			name:     "March 31 - spring prompt time",
			date:     time.Date(2026, time.March, 31, 0, 0, 0, 0, time.UTC),
			expected: true,
		},
		{
			name:     "April - not spring prompt time",
			date:     time.Date(2026, time.April, 1, 0, 0, 0, 0, time.UTC),
			expected: false,
		},
		{
			name:     "September - not spring prompt time for NH",
			date:     time.Date(2026, time.September, 15, 0, 0, 0, 0, time.UTC),
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := services.IsSpringPromptTimeForDate(tt.date, "northern")
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestIsSpringPromptTimeForDate_SouthernHemisphere(t *testing.T) {
	tests := []struct {
		name     string
		date     time.Time
		expected bool
	}{
		{
			name:     "March - not spring prompt time for SH",
			date:     time.Date(2026, time.March, 15, 0, 0, 0, 0, time.UTC),
			expected: false,
		},
		{
			name:     "August - not spring prompt time",
			date:     time.Date(2026, time.August, 31, 0, 0, 0, 0, time.UTC),
			expected: false,
		},
		{
			name:     "September 1 - spring prompt time",
			date:     time.Date(2026, time.September, 1, 0, 0, 0, 0, time.UTC),
			expected: true,
		},
		{
			name:     "September 15 - spring prompt time",
			date:     time.Date(2026, time.September, 15, 0, 0, 0, 0, time.UTC),
			expected: true,
		},
		{
			name:     "September 30 - spring prompt time",
			date:     time.Date(2026, time.September, 30, 0, 0, 0, 0, time.UTC),
			expected: true,
		},
		{
			name:     "October - not spring prompt time",
			date:     time.Date(2026, time.October, 1, 0, 0, 0, 0, time.UTC),
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := services.IsSpringPromptTimeForDate(tt.date, "southern")
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestGetWinterSeasonLabel(t *testing.T) {
	tests := []struct {
		season   int
		expected string
	}{
		{season: 2025, expected: "2025-2026"},
		{season: 2024, expected: "2024-2025"},
		{season: 2000, expected: "2000-2001"},
		{season: 2100, expected: "2100-2101"},
	}

	for _, tt := range tests {
		t.Run(tt.expected, func(t *testing.T) {
			result := services.GetWinterSeasonLabel(tt.season)
			assert.Equal(t, tt.expected, result)
		})
	}
}
