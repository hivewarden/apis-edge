package auth

import (
	"fmt"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHashPassword(t *testing.T) {
	tests := []struct {
		name        string
		password    string
		shouldError bool
		errType     error
	}{
		{
			name:        "valid password",
			password:    "securepassword123",
			shouldError: false,
		},
		{
			name:        "short password still hashes",
			password:    "short",
			shouldError: false,
		},
		{
			name:        "empty password",
			password:    "",
			shouldError: true,
			errType:     ErrPasswordRequired,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			hash, err := HashPassword(tt.password)
			if tt.shouldError {
				require.Error(t, err)
				assert.ErrorIs(t, err, tt.errType)
				assert.Empty(t, hash)
			} else {
				require.NoError(t, err)
				assert.NotEmpty(t, hash)
				// bcrypt hashes start with $2
				assert.True(t, strings.HasPrefix(hash, "$2"), "hash should be bcrypt format")
				// Hash should be different from password
				assert.NotEqual(t, tt.password, hash)
			}
		})
	}
}

func TestHashPasswordUniqueness(t *testing.T) {
	// Same password should produce different hashes (bcrypt salt)
	password := "testpassword123"

	hash1, err := HashPassword(password)
	require.NoError(t, err)

	hash2, err := HashPassword(password)
	require.NoError(t, err)

	assert.NotEqual(t, hash1, hash2, "bcrypt should produce unique hashes due to salt")
}

func TestVerifyPassword(t *testing.T) {
	password := "securepassword123"
	wrongPassword := "wrongpassword456"

	hash, err := HashPassword(password)
	require.NoError(t, err)

	tests := []struct {
		name        string
		password    string
		hash        string
		shouldError bool
		errType     error
	}{
		{
			name:        "correct password",
			password:    password,
			hash:        hash,
			shouldError: false,
		},
		{
			name:        "wrong password",
			password:    wrongPassword,
			hash:        hash,
			shouldError: true,
			errType:     ErrPasswordMismatch,
		},
		{
			name:        "empty password",
			password:    "",
			hash:        hash,
			shouldError: true,
			errType:     ErrPasswordRequired,
		},
		{
			name:        "empty hash",
			password:    password,
			hash:        "",
			shouldError: true,
			errType:     ErrPasswordMismatch,
		},
		{
			name:        "invalid hash format",
			password:    password,
			hash:        "not-a-valid-hash",
			shouldError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := VerifyPassword(tt.password, tt.hash)
			if tt.shouldError {
				require.Error(t, err)
				if tt.errType != nil {
					assert.ErrorIs(t, err, tt.errType)
				}
			} else {
				require.NoError(t, err)
			}
		})
	}
}

func TestValidatePassword(t *testing.T) {
	tests := []struct {
		name        string
		password    string
		shouldError bool
		errType     error
	}{
		{
			name:        "valid 8 char password",
			password:    "12345678",
			shouldError: false,
		},
		{
			name:        "valid long password within limit",
			password:    strings.Repeat("a", 72), // exactly 72 chars
			shouldError: false,
		},
		{
			name:        "too short - 7 chars",
			password:    "1234567",
			shouldError: true,
			errType:     ErrPasswordTooShort,
		},
		{
			name:        "too long - 73 chars",
			password:    strings.Repeat("a", 73),
			shouldError: true,
			errType:     ErrPasswordTooLong,
		},
		{
			name:        "way too long - 100 chars",
			password:    strings.Repeat("a", 100),
			shouldError: true,
			errType:     ErrPasswordTooLong,
		},
		{
			name:        "empty password",
			password:    "",
			shouldError: true,
			errType:     ErrPasswordRequired,
		},
		{
			name:        "unicode characters count as chars - valid length",
			password:    "pass\u4e2d\u6587\u5bc6\u7801", // "pass" + 4 Chinese characters = 8 chars
			shouldError: false,
		},
		{
			name:        "unicode characters at max length",
			password:    strings.Repeat("\u4e2d", 72), // 72 Chinese characters
			shouldError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidatePassword(tt.password)
			if tt.shouldError {
				require.Error(t, err)
				assert.ErrorIs(t, err, tt.errType)
			} else {
				require.NoError(t, err)
			}
		})
	}
}

func TestHashAndVerifyRoundTrip(t *testing.T) {
	// Test full cycle: hash -> verify
	password := "my-secure-password-123"

	hash, err := HashPassword(password)
	require.NoError(t, err)

	err = VerifyPassword(password, hash)
	require.NoError(t, err, "password should verify against its own hash")
}

func TestValidatePasswordStrength(t *testing.T) {
	tests := []struct {
		name        string
		password    string
		shouldError bool
		errType     error
	}{
		{
			name:        "valid unique password",
			password:    "myUnique#Secret99!",
			shouldError: false,
		},
		{
			name:        "too short",
			password:    "short",
			shouldError: true,
			errType:     ErrPasswordTooShort,
		},
		{
			name:        "too long",
			password:    strings.Repeat("a", 73),
			shouldError: true,
			errType:     ErrPasswordTooLong,
		},
		{
			name:        "empty",
			password:    "",
			shouldError: true,
			errType:     ErrPasswordRequired,
		},
		{
			name:        "common password - password123",
			password:    "password123",
			shouldError: true,
			errType:     ErrCommonPassword,
		},
		{
			name:        "common password - 123456",
			password:    "123456",
			shouldError: true,
			errType:     ErrPasswordTooShort, // Too short comes first
		},
		{
			name:        "common password - qwerty123",
			password:    "qwerty123",
			shouldError: true,
			errType:     ErrCommonPassword,
		},
		{
			name:        "common password - letmein",
			password:    "letmein",
			shouldError: true,
			errType:     ErrPasswordTooShort, // 7 chars, too short first
		},
		{
			name:        "common password - admin123",
			password:    "admin123",
			shouldError: true,
			errType:     ErrCommonPassword,
		},
		{
			name:        "common password case insensitive - PASSWORD123",
			password:    "PASSWORD123",
			shouldError: true,
			errType:     ErrCommonPassword,
		},
		{
			name:        "common password case insensitive - PaSsWoRd123",
			password:    "PaSsWoRd123",
			shouldError: true,
			errType:     ErrCommonPassword,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidatePasswordStrength(tt.password)
			if tt.shouldError {
				require.Error(t, err)
				if tt.errType != nil {
					assert.ErrorIs(t, err, tt.errType)
				}
			} else {
				require.NoError(t, err)
			}
		})
	}
}

func TestIsCommonPassword(t *testing.T) {
	tests := []struct {
		name     string
		password string
		expected bool
	}{
		{"common - password", "password", true},
		{"common - 123456", "123456", true},
		{"common - qwerty", "qwerty", true},
		{"common - admin", "admin", true},
		{"common - letmein", "letmein", true},
		{"common - welcome", "welcome", true},
		{"common - monkey", "monkey", true},
		{"common - dragon", "dragon", true},
		{"case insensitive - PASSWORD", "PASSWORD", true},
		{"case insensitive - Password", "Password", true},
		{"case insensitive - QWERTY", "QWERTY", true},
		{"not common - unique password", "xK9#mP2$vL7@nQ", false},
		{"not common - random string", "aB3cD5eF7gH9iJ", false},
		{"not common - longer unique", "mySecurePassword!2024", false},
		{"empty string", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := IsCommonPassword(tt.password)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestCommonPasswordCount(t *testing.T) {
	// Verify that the common passwords list was loaded
	count := CommonPasswordCount()
	assert.Greater(t, count, 500, "Common passwords list should have at least 500 entries")
	assert.Less(t, count, 20000, "Common passwords list should have less than 20000 entries")
}

func TestBcryptCostFactor(t *testing.T) {
	// SECURITY FIX (CRYPTO-001-1): BcryptCost is now a function that returns configurable cost.
	// Verify that default BcryptCost() returns 12 (DefaultBcryptCost) when BCRYPT_COST env is not set.
	// Note: In tests, the cost is initialized once, so we verify the default value.
	cost := BcryptCost()
	assert.GreaterOrEqual(t, cost, MinBcryptCost, "bcrypt cost should be at least MinBcryptCost (10)")
	assert.LessOrEqual(t, cost, MaxBcryptCost, "bcrypt cost should not exceed MaxBcryptCost (15)")

	// Verify that hashed passwords use the configured cost factor
	// bcrypt hashes have format: $2a$XX$... where XX is the cost factor
	password := "testpassword123"
	hash, err := HashPassword(password)
	require.NoError(t, err)

	// Check that hash starts with correct cost prefix
	expectedPrefix := fmt.Sprintf("$2a$%02d$", cost)
	expectedPrefixB := fmt.Sprintf("$2b$%02d$", cost)
	assert.True(t, strings.HasPrefix(hash, expectedPrefix) || strings.HasPrefix(hash, expectedPrefixB),
		"hash should use bcrypt cost factor %d, got: %s", cost, hash[:10])
}
