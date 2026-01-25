package services

import (
	"time"

	"github.com/jermoo/apis/apis-server/internal/storage"
)

// SpringPromptData contains data for the spring prompt check.
type SpringPromptData struct {
	ShouldShow   bool   `json:"should_show"`
	WinterSeason int    `json:"winter_season"`
	SeasonLabel  string `json:"season_label"`
	Message      string `json:"message"`
}

// GetCurrentWinterSeason returns the winter season year based on current date and hemisphere.
// For NH: Nov-Mar belongs to winter starting previous November
// For SH: May-Sep belongs to winter starting current May
func GetCurrentWinterSeason(hemisphere string) int {
	return GetCurrentWinterSeasonForDate(time.Now(), hemisphere)
}

// GetCurrentWinterSeasonForDate returns the winter season for a specific date (useful for testing).
func GetCurrentWinterSeasonForDate(now time.Time, hemisphere string) int {
	year := now.Year()
	month := now.Month()

	if hemisphere == "southern" {
		// SH: May-Sep is winter of current year
		// Oct-Apr: if Oct-Dec = current year (next winter starts), if Jan-Apr = previous year's winter ended
		if month >= time.May && month <= time.September {
			return year
		}
		if month >= time.October {
			return year // Next winter starting
		}
		return year - 1 // Jan-Apr belongs to previous year's winter
	}

	// NH: Nov-Mar is winter
	// Nov-Dec = current year winter starting, Jan-Mar = previous year's winter
	if month >= time.November {
		return year
	}
	if month <= time.March {
		return year - 1
	}
	// Apr-Oct: return previous winter (the one that just ended)
	return year - 1
}

// IsSpringPromptTime checks if it's time to show the spring prompt.
// NH: March 1-31, SH: September 1-30
func IsSpringPromptTime(hemisphere string) bool {
	return IsSpringPromptTimeForDate(time.Now(), hemisphere)
}

// IsSpringPromptTimeForDate checks spring prompt timing for a specific date (useful for testing).
func IsSpringPromptTimeForDate(now time.Time, hemisphere string) bool {
	month := now.Month()
	if hemisphere == "southern" {
		return month == time.September
	}
	return month == time.March
}

// GetWinterSeasonLabel returns display label like "2025-2026".
func GetWinterSeasonLabel(winterSeason int) string {
	return storage.GetWinterSeasonLabel(winterSeason)
}
