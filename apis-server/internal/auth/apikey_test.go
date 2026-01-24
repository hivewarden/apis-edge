package auth

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGenerateAPIKey(t *testing.T) {
	key, err := GenerateAPIKey()
	require.NoError(t, err)

	// Check format
	assert.True(t, strings.HasPrefix(key, APIKeyPrefix), "key should have prefix")
	assert.Len(t, key, len(APIKeyPrefix)+APIKeyLength, "key should be correct length")

	// Check uniqueness - generate multiple keys
	keys := make(map[string]bool)
	for i := 0; i < 100; i++ {
		k, err := GenerateAPIKey()
		require.NoError(t, err)
		assert.False(t, keys[k], "keys should be unique")
		keys[k] = true
	}
}

func TestHashAPIKey(t *testing.T) {
	key := "apis_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"

	hash, err := HashAPIKey(key)
	require.NoError(t, err)

	// Hash should be bcrypt format (starts with $2a$ or $2b$)
	assert.True(t, strings.HasPrefix(hash, "$2"), "hash should be bcrypt format")

	// Hash should be different from original
	assert.NotEqual(t, key, hash)

	// Same key should produce different hashes (bcrypt uses random salt)
	hash2, err := HashAPIKey(key)
	require.NoError(t, err)
	assert.NotEqual(t, hash, hash2, "hashes should be different due to salt")
}

func TestVerifyAPIKey(t *testing.T) {
	key := "apis_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"
	wrongKey := "apis_00000000000000000000000000000000"

	hash, err := HashAPIKey(key)
	require.NoError(t, err)

	// Correct key should verify
	assert.True(t, VerifyAPIKey(key, hash), "correct key should verify")

	// Wrong key should not verify
	assert.False(t, VerifyAPIKey(wrongKey, hash), "wrong key should not verify")

	// Empty key should not verify
	assert.False(t, VerifyAPIKey("", hash), "empty key should not verify")

	// Invalid hash should not verify (and not panic)
	assert.False(t, VerifyAPIKey(key, "invalid-hash"), "invalid hash should not verify")
}

func TestIsValidAPIKeyFormat(t *testing.T) {
	tests := []struct {
		name  string
		key   string
		valid bool
	}{
		{"valid key", "apis_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4", true},
		{"valid key uppercase", "apis_A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4", true},
		{"missing prefix", "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4", false},
		{"wrong prefix", "key_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4", false},
		{"too short", "apis_a1b2c3d4", false},
		{"too long", "apis_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4extra", false},
		{"invalid hex chars", "apis_g1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4", false},
		{"empty", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.valid, IsValidAPIKeyFormat(tt.key))
		})
	}
}

func TestGenerateAndVerifyRoundTrip(t *testing.T) {
	// Test the full cycle: generate -> hash -> verify
	key, err := GenerateAPIKey()
	require.NoError(t, err)

	hash, err := HashAPIKey(key)
	require.NoError(t, err)

	assert.True(t, VerifyAPIKey(key, hash), "generated key should verify against its hash")
}
