package storage_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/jermoo/apis/apis-server/internal/storage"
)

func TestCreateSeasonRecap(t *testing.T) {
	// Skip if no test database
	if storage.DB == nil {
		t.Skip("No test database connection")
	}

	ctx := context.Background()
	conn, err := storage.DB.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()

	tenantID := "test-tenant-recap"

	// Create test input
	input := &storage.CreateSeasonRecapInput{
		SeasonYear:  2026,
		Hemisphere:  "northern",
		SeasonStart: time.Date(2026, time.August, 1, 0, 0, 0, 0, time.UTC),
		SeasonEnd:   time.Date(2026, time.October, 31, 23, 59, 59, 0, time.UTC),
		RecapData: storage.SeasonRecapData{
			SeasonDates: storage.SeasonDates{
				Start:       time.Date(2026, time.August, 1, 0, 0, 0, 0, time.UTC),
				End:         time.Date(2026, time.October, 31, 23, 59, 59, 0, time.UTC),
				DisplayText: "Aug 1 - Oct 31, 2026",
			},
			TotalHarvestKg:   45.5,
			HornetsDeterred:  127,
			InspectionsCount: 24,
			TreatmentsCount:  3,
			FeedingsCount:    5,
			Milestones: []storage.Milestone{
				{
					Type:        "first_harvest",
					Description: "First harvest from Hive 3",
					Date:        time.Date(2026, time.August, 15, 0, 0, 0, 0, time.UTC),
				},
			},
			PerHiveStats: []storage.HiveSeasonStat{
				{
					HiveID:    "hive-1",
					HiveName:  "Hive 1",
					HarvestKg: 18.0,
					Status:    "healthy",
				},
			},
		},
	}

	recap, err := storage.CreateSeasonRecap(ctx, conn, tenantID, input)
	require.NoError(t, err)
	assert.NotEmpty(t, recap.ID)
	assert.Equal(t, 2026, recap.SeasonYear)
	assert.Equal(t, "northern", recap.Hemisphere)
	assert.Equal(t, 45.5, recap.RecapData.TotalHarvestKg)
	assert.Equal(t, 127, recap.RecapData.HornetsDeterred)
	assert.Len(t, recap.RecapData.Milestones, 1)
	assert.Len(t, recap.RecapData.PerHiveStats, 1)

	// Test upsert - should update existing record
	input.RecapData.TotalHarvestKg = 50.0
	updated, err := storage.CreateSeasonRecap(ctx, conn, tenantID, input)
	require.NoError(t, err)
	assert.Equal(t, recap.ID, updated.ID) // Same ID means updated
	assert.Equal(t, 50.0, updated.RecapData.TotalHarvestKg)

	// Cleanup
	storage.DeleteSeasonRecap(ctx, conn, tenantID, 2026)
}

func TestGetSeasonRecap(t *testing.T) {
	if storage.DB == nil {
		t.Skip("No test database connection")
	}

	ctx := context.Background()
	conn, err := storage.DB.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()

	tenantID := "test-tenant-recap-get"

	// Test not found
	_, err = storage.GetSeasonRecap(ctx, conn, tenantID, 2099)
	assert.Equal(t, storage.ErrNotFound, err)

	// Create and retrieve
	input := &storage.CreateSeasonRecapInput{
		SeasonYear:  2025,
		Hemisphere:  "southern",
		SeasonStart: time.Date(2025, time.February, 1, 0, 0, 0, 0, time.UTC),
		SeasonEnd:   time.Date(2025, time.April, 30, 23, 59, 59, 0, time.UTC),
		RecapData: storage.SeasonRecapData{
			TotalHarvestKg: 30.0,
		},
	}

	_, err = storage.CreateSeasonRecap(ctx, conn, tenantID, input)
	require.NoError(t, err)

	recap, err := storage.GetSeasonRecap(ctx, conn, tenantID, 2025)
	require.NoError(t, err)
	assert.Equal(t, 2025, recap.SeasonYear)
	assert.Equal(t, "southern", recap.Hemisphere)
	assert.Equal(t, 30.0, recap.RecapData.TotalHarvestKg)

	// Cleanup
	storage.DeleteSeasonRecap(ctx, conn, tenantID, 2025)
}

func TestListSeasonRecaps(t *testing.T) {
	if storage.DB == nil {
		t.Skip("No test database connection")
	}

	ctx := context.Background()
	conn, err := storage.DB.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()

	tenantID := "test-tenant-recap-list"

	// Create multiple recaps
	for year := 2024; year <= 2026; year++ {
		input := &storage.CreateSeasonRecapInput{
			SeasonYear:  year,
			Hemisphere:  "northern",
			SeasonStart: time.Date(year, time.August, 1, 0, 0, 0, 0, time.UTC),
			SeasonEnd:   time.Date(year, time.October, 31, 23, 59, 59, 0, time.UTC),
			RecapData: storage.SeasonRecapData{
				TotalHarvestKg: float64(year - 2000),
			},
		}
		_, err := storage.CreateSeasonRecap(ctx, conn, tenantID, input)
		require.NoError(t, err)
	}

	recaps, err := storage.ListSeasonRecaps(ctx, conn, tenantID)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(recaps), 3)

	// Should be ordered by year DESC
	if len(recaps) >= 2 {
		assert.Greater(t, recaps[0].SeasonYear, recaps[1].SeasonYear)
	}

	// Cleanup
	for year := 2024; year <= 2026; year++ {
		storage.DeleteSeasonRecap(ctx, conn, tenantID, year)
	}
}

func TestDeleteSeasonRecap(t *testing.T) {
	if storage.DB == nil {
		t.Skip("No test database connection")
	}

	ctx := context.Background()
	conn, err := storage.DB.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()

	tenantID := "test-tenant-recap-delete"

	// Create recap
	input := &storage.CreateSeasonRecapInput{
		SeasonYear:  2023,
		Hemisphere:  "northern",
		SeasonStart: time.Date(2023, time.August, 1, 0, 0, 0, 0, time.UTC),
		SeasonEnd:   time.Date(2023, time.October, 31, 23, 59, 59, 0, time.UTC),
		RecapData:   storage.SeasonRecapData{},
	}

	_, err = storage.CreateSeasonRecap(ctx, conn, tenantID, input)
	require.NoError(t, err)

	// Delete it
	err = storage.DeleteSeasonRecap(ctx, conn, tenantID, 2023)
	require.NoError(t, err)

	// Verify deleted
	_, err = storage.GetSeasonRecap(ctx, conn, tenantID, 2023)
	assert.Equal(t, storage.ErrNotFound, err)

	// Delete non-existent should return ErrNotFound
	err = storage.DeleteSeasonRecap(ctx, conn, tenantID, 2099)
	assert.Equal(t, storage.ErrNotFound, err)
}
