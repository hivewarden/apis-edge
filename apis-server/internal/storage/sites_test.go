package storage

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// Note: Full integration tests require database connection.
// These unit tests verify struct and error definitions.

func TestSiteStructFields(t *testing.T) {
	// Verify Site struct has all required fields
	site := Site{
		ID:       "test-id",
		TenantID: "tenant-1",
		Name:     "Test Site",
		Timezone: "UTC",
	}

	assert.Equal(t, "test-id", site.ID)
	assert.Equal(t, "tenant-1", site.TenantID)
	assert.Equal(t, "Test Site", site.Name)
	assert.Equal(t, "UTC", site.Timezone)
	assert.Nil(t, site.Latitude)
	assert.Nil(t, site.Longitude)
}

func TestSiteWithCoordinates(t *testing.T) {
	lat := 50.8503
	lng := 4.3517

	site := Site{
		ID:        "test-id",
		TenantID:  "tenant-1",
		Name:      "Brussels Apiary",
		Latitude:  &lat,
		Longitude: &lng,
		Timezone:  "Europe/Brussels",
	}

	assert.NotNil(t, site.Latitude)
	assert.NotNil(t, site.Longitude)
	assert.Equal(t, 50.8503, *site.Latitude)
	assert.Equal(t, 4.3517, *site.Longitude)
	assert.Equal(t, "Europe/Brussels", site.Timezone)
}

func TestCreateSiteInputDefaults(t *testing.T) {
	input := CreateSiteInput{
		Name: "New Site",
	}

	assert.Equal(t, "New Site", input.Name)
	assert.Nil(t, input.Latitude)
	assert.Nil(t, input.Longitude)
	assert.Empty(t, input.Timezone) // Empty will be defaulted to UTC in CreateSite
}

func TestUpdateSiteInputPartialUpdate(t *testing.T) {
	// Test that UpdateSiteInput allows partial updates (nil fields = no change)
	newName := "Updated Name"
	input := UpdateSiteInput{
		Name: &newName,
		// Latitude, Longitude, Timezone left nil = don't update
	}

	assert.NotNil(t, input.Name)
	assert.Equal(t, "Updated Name", *input.Name)
	assert.Nil(t, input.Latitude)
	assert.Nil(t, input.Longitude)
	assert.Nil(t, input.Timezone)
}

func TestErrSiteHasUnits(t *testing.T) {
	// Verify the error constant exists
	assert.NotNil(t, ErrSiteHasUnits)
	assert.Equal(t, "site has assigned units", ErrSiteHasUnits.Error())
}

func TestErrNotFoundUsedForSites(t *testing.T) {
	// Verify ErrNotFound is appropriate for site operations
	assert.NotNil(t, ErrNotFound)
	assert.Equal(t, "not found", ErrNotFound.Error())
}
