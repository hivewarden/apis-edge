package services_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"github.com/jermoo/apis/apis-server/internal/services"
)

func TestGetSeasonDates_Northern(t *testing.T) {
	start, end := services.GetSeasonDates(2026, "northern")

	assert.Equal(t, 2026, start.Year())
	assert.Equal(t, time.August, start.Month())
	assert.Equal(t, 1, start.Day())

	assert.Equal(t, 2026, end.Year())
	assert.Equal(t, time.October, end.Month())
	assert.Equal(t, 31, end.Day())
}

func TestGetSeasonDates_Southern(t *testing.T) {
	start, end := services.GetSeasonDates(2026, "southern")

	assert.Equal(t, 2026, start.Year())
	assert.Equal(t, time.February, start.Month())
	assert.Equal(t, 1, start.Day())

	assert.Equal(t, 2026, end.Year())
	assert.Equal(t, time.April, end.Month())
	assert.Equal(t, 30, end.Day())
}

func TestGetCurrentSeason_Northern(t *testing.T) {
	// Test the logic by understanding the rules:
	// - Northern: Season is Aug-Oct, recap time is Nov+
	// - If it's November or later, current season is this year
	// - If it's before August, current season is previous year
	// - If it's August-October, current season is this year

	now := time.Now()
	season := services.GetCurrentSeason("northern")

	if now.Month() >= time.November {
		assert.Equal(t, now.Year(), season)
	} else if now.Month() < time.August {
		assert.Equal(t, now.Year()-1, season)
	} else {
		assert.Equal(t, now.Year(), season)
	}
}

func TestGetCurrentSeason_Southern(t *testing.T) {
	// Test the logic:
	// - Southern: Season is Feb-Apr, recap time is May+
	// - If it's May or later, current season is this year
	// - If it's before May (Jan-Apr), current season is previous year

	now := time.Now()
	season := services.GetCurrentSeason("southern")

	if now.Month() >= time.May {
		assert.Equal(t, now.Year(), season)
	} else {
		assert.Equal(t, now.Year()-1, season)
	}
}

func TestIsRecapTime_Northern(t *testing.T) {
	// Northern recap time is November+
	isTime := services.IsRecapTime("northern")
	now := time.Now()

	if now.Month() >= time.November {
		assert.True(t, isTime)
	} else {
		assert.False(t, isTime)
	}
}

func TestIsRecapTime_Southern(t *testing.T) {
	// Southern recap time is May+
	isTime := services.IsRecapTime("southern")
	now := time.Now()

	if now.Month() >= time.May {
		assert.True(t, isTime)
	} else {
		assert.False(t, isTime)
	}
}

func TestFormatSeasonDates(t *testing.T) {
	start := time.Date(2026, time.August, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, time.October, 31, 0, 0, 0, 0, time.UTC)

	formatted := services.FormatSeasonDates(start, end)

	assert.Contains(t, formatted, "Aug")
	assert.Contains(t, formatted, "Oct")
	assert.Contains(t, formatted, "2026")
}

func TestSeasonDateEdgeCases(t *testing.T) {
	// Test different years
	years := []int{2024, 2025, 2026, 2027}

	for _, year := range years {
		t.Run("Northern_"+string(rune(year)), func(t *testing.T) {
			start, end := services.GetSeasonDates(year, "northern")
			assert.True(t, start.Before(end))
			assert.Equal(t, year, start.Year())
			assert.Equal(t, year, end.Year())
		})

		t.Run("Southern_"+string(rune(year)), func(t *testing.T) {
			start, end := services.GetSeasonDates(year, "southern")
			assert.True(t, start.Before(end))
			assert.Equal(t, year, start.Year())
			assert.Equal(t, year, end.Year())
		})
	}
}

func TestDefaultHemisphere(t *testing.T) {
	// When passing an invalid hemisphere, should default to northern
	start1, end1 := services.GetSeasonDates(2026, "")
	start2, end2 := services.GetSeasonDates(2026, "invalid")
	start3, end3 := services.GetSeasonDates(2026, "northern")

	assert.Equal(t, start1, start3)
	assert.Equal(t, end1, end3)
	assert.Equal(t, start2, start3)
	assert.Equal(t, end2, end3)
}
