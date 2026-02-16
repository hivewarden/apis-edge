package storage_test

import (
	"testing"

	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/stretchr/testify/assert"
)

// TestDefaultLimits verifies the default limit values.
func TestDefaultLimits(t *testing.T) {
	assert.Equal(t, 100, storage.DefaultLimits.MaxHives)
	assert.Equal(t, int64(5*1024*1024*1024), storage.DefaultLimits.MaxStorageBytes)
	assert.Equal(t, 10, storage.DefaultLimits.MaxUnits)
	assert.Equal(t, 20, storage.DefaultLimits.MaxUsers)
}

// TestTenantLimitsStruct verifies the TenantLimits struct fields.
func TestTenantLimitsStruct(t *testing.T) {
	limits := &storage.TenantLimits{
		TenantID:        "test-tenant-id",
		MaxHives:        150,
		MaxStorageBytes: 10 * 1024 * 1024 * 1024,
		MaxUnits:        20,
		MaxUsers:        50,
	}

	assert.Equal(t, "test-tenant-id", limits.TenantID)
	assert.Equal(t, 150, limits.MaxHives)
	assert.Equal(t, int64(10*1024*1024*1024), limits.MaxStorageBytes)
	assert.Equal(t, 20, limits.MaxUnits)
	assert.Equal(t, 50, limits.MaxUsers)
}

// TestTenantUsageStruct verifies the TenantUsage struct fields.
func TestTenantUsageStruct(t *testing.T) {
	usage := &storage.TenantUsage{
		HiveCount:    15,
		UnitCount:    3,
		UserCount:    5,
		StorageBytes: 1073741824,
	}

	assert.Equal(t, 15, usage.HiveCount)
	assert.Equal(t, 3, usage.UnitCount)
	assert.Equal(t, 5, usage.UserCount)
	assert.Equal(t, int64(1073741824), usage.StorageBytes)
}

// TestErrLimitExceeded verifies the error constant exists.
func TestErrLimitExceeded(t *testing.T) {
	assert.NotNil(t, storage.ErrLimitExceeded)
	assert.Equal(t, "resource limit exceeded", storage.ErrLimitExceeded.Error())
}

// Integration tests would require a database connection.
// These are kept as unit tests for struct validation and constants.
// Full integration tests for GetTenantLimits, SetTenantLimits, and Check*Limit
// functions should be added when a test database fixture is available.
