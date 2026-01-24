// Package auth provides authentication utilities for the APIS server.
package auth

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"

	"golang.org/x/crypto/bcrypt"
)

const (
	// APIKeyPrefix is the prefix for all APIS unit API keys.
	APIKeyPrefix = "apis_"
	// APIKeyLength is the number of random hex characters in an API key (32 chars = 16 bytes).
	APIKeyLength = 32
	// bcryptCost is the cost factor for bcrypt hashing.
	bcryptCost = 12
)

// GenerateAPIKey generates a new API key in the format: apis_<32 hex chars>
// Returns the raw key (to be shown to user once) and any error.
func GenerateAPIKey() (string, error) {
	bytes := make([]byte, APIKeyLength/2) // 16 bytes = 32 hex chars
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("auth: failed to generate random bytes: %w", err)
	}
	return APIKeyPrefix + hex.EncodeToString(bytes), nil
}

// HashAPIKey creates a bcrypt hash of an API key for secure storage.
// The hash can be stored in the database; the raw key should never be stored.
func HashAPIKey(apiKey string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(apiKey), bcryptCost)
	if err != nil {
		return "", fmt.Errorf("auth: failed to hash API key: %w", err)
	}
	return string(hash), nil
}

// VerifyAPIKey compares a raw API key against a bcrypt hash.
// Returns true if the key matches the hash, false otherwise.
// Uses constant-time comparison to prevent timing attacks.
func VerifyAPIKey(apiKey, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(apiKey))
	return err == nil
}

// IsValidAPIKeyFormat checks if a string looks like a valid API key format.
// This is a quick check before attempting database lookup.
func IsValidAPIKeyFormat(key string) bool {
	if len(key) != len(APIKeyPrefix)+APIKeyLength {
		return false
	}
	if key[:len(APIKeyPrefix)] != APIKeyPrefix {
		return false
	}
	// Check that the rest is valid hex
	_, err := hex.DecodeString(key[len(APIKeyPrefix):])
	return err == nil
}

// APIKeyPrefixLength is the length of the prefix stored for indexed lookup.
// Format: "apis_" (5) + 11 hex chars = 16 chars total
const APIKeyPrefixLength = 16

// ExtractAPIKeyPrefix returns the first 16 characters of an API key for indexed lookup.
// This allows quick database filtering before expensive bcrypt comparison.
func ExtractAPIKeyPrefix(key string) string {
	if len(key) < APIKeyPrefixLength {
		return key
	}
	return key[:APIKeyPrefixLength]
}
