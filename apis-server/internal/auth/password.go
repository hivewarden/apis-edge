// Package auth provides authentication utilities for the APIS server.
package auth

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"sync"

	"golang.org/x/crypto/bcrypt"
)

// Password validation errors
var (
	// ErrPasswordTooShort is returned when the password is less than 8 characters.
	ErrPasswordTooShort = errors.New("auth: password must be at least 8 characters")
	// ErrPasswordTooLong is returned when the password exceeds 72 characters.
	// bcrypt has a 72-byte limit - it silently truncates longer passwords.
	// We enforce this limit explicitly to prevent user confusion where they set
	// a 100-char password but can login with just the first 72 chars.
	ErrPasswordTooLong = errors.New("auth: password must not exceed 72 characters")
	// ErrPasswordRequired is returned when the password is empty.
	ErrPasswordRequired = errors.New("auth: password is required")
	// ErrPasswordMismatch is returned when password verification fails.
	ErrPasswordMismatch = errors.New("auth: password does not match")
	// ErrCommonPassword is returned when the password is too common/weak.
	// Users should choose a unique password not found in common password lists.
	ErrCommonPassword = errors.New("auth: password is too common, please choose a stronger password")
)

// Bcrypt cost configuration
// SECURITY FIX (CRYPTO-001-1): Made bcrypt cost configurable via BCRYPT_COST environment variable.
// The cost factor determines how computationally expensive password hashing is.
// Each +1 to the cost roughly doubles the time required to compute a hash.
const (
	// DefaultBcryptCost is the default cost factor for bcrypt hashing.
	// Cost factor 12 is recommended for production because:
	// - Takes ~250ms on modern hardware, providing good protection against brute force
	// - Balances security with acceptable login latency
	// - OWASP recommends cost 10+ for general applications
	DefaultBcryptCost = 12

	// MinBcryptCost is the minimum allowed bcrypt cost for security.
	// Values below 10 are considered insecure for production use.
	// bcrypt library allows 4-31, but we enforce a minimum of 10 for security.
	MinBcryptCost = 10

	// MaxBcryptCost is the maximum allowed bcrypt cost.
	// Values above 15 may cause unacceptable login latency (>10 seconds).
	MaxBcryptCost = 15
)

var (
	// configuredBcryptCost holds the configured cost factor, initialized lazily.
	configuredBcryptCost     int
	configuredBcryptCostOnce sync.Once
)

// BcryptCost returns the configured bcrypt cost factor.
// The cost is read from BCRYPT_COST environment variable on first call.
// If not set or invalid, defaults to DefaultBcryptCost (12).
// Valid range is MinBcryptCost (10) to MaxBcryptCost (15).
func BcryptCost() int {
	configuredBcryptCostOnce.Do(func() {
		configuredBcryptCost = DefaultBcryptCost

		if costStr := os.Getenv("BCRYPT_COST"); costStr != "" {
			if cost, err := strconv.Atoi(costStr); err == nil {
				if cost < MinBcryptCost {
					// SECURITY: Enforce minimum cost for production security
					configuredBcryptCost = MinBcryptCost
				} else if cost > MaxBcryptCost {
					// SAFETY: Cap cost to prevent DoS via excessive CPU usage
					configuredBcryptCost = MaxBcryptCost
				} else {
					configuredBcryptCost = cost
				}
			}
			// If parsing fails, keep default
		}
	})
	return configuredBcryptCost
}

// dummyHash is a pre-computed bcrypt hash used for timing equalization.
// It prevents user enumeration by ensuring consistent response times
// whether or not the user exists in the database.
//
// SECURITY FIX (S1-H2): The dummy hash is initialized lazily using the same
// BcryptCost() as real password hashes. Using a different cost would produce
// measurably different comparison times, enabling user enumeration via timing.
var (
	dummyHashOnce sync.Once
	dummyHash     []byte
)

// initDummyHash generates the dummy hash with the configured bcrypt cost.
// Called once on first use via sync.Once.
func initDummyHash() {
	dummyHashOnce.Do(func() {
		var err error
		dummyHash, err = bcrypt.GenerateFromPassword([]byte("dummy-password-for-timing"), BcryptCost())
		if err != nil {
			// Fallback to default cost if generation fails (should not happen)
			dummyHash, _ = bcrypt.GenerateFromPassword([]byte("dummy-password-for-timing"), bcrypt.DefaultCost)
		}
	})
}

// DummyPasswordCheck performs a bcrypt comparison against a dummy hash.
// This is called when a user is not found to equalize response timing
// and prevent user enumeration attacks.
func DummyPasswordCheck(password string) {
	initDummyHash()
	bcrypt.CompareHashAndPassword(dummyHash, []byte(password))
}

// MinPasswordLength is the minimum required password length.
const MinPasswordLength = 8

// MaxPasswordLength is the maximum allowed password length.
// bcrypt has a fundamental 72-byte limit due to Blowfish cipher constraints.
// For ASCII passwords, 72 bytes = 72 characters.
// For Unicode (UTF-8), multi-byte characters may reduce the effective limit.
// We validate length in characters (runes) for user-friendly error messages.
const MaxPasswordLength = 72

// HashPassword hashes a password using bcrypt with the configured cost.
// Returns the hashed password as a string suitable for database storage.
//
// The cost factor is determined by the BCRYPT_COST environment variable,
// defaulting to 12 if not set. See BcryptCost() for details.
//
// Example:
//
//	hash, err := HashPassword("userpassword123")
//	if err != nil {
//	    return fmt.Errorf("failed to hash password: %w", err)
//	}
//	// Store hash in database
func HashPassword(password string) (string, error) {
	if password == "" {
		return "", ErrPasswordRequired
	}

	// SECURITY FIX (CRYPTO-001-1): Use configurable bcrypt cost
	hash, err := bcrypt.GenerateFromPassword([]byte(password), BcryptCost())
	if err != nil {
		return "", fmt.Errorf("auth: failed to hash password: %w", err)
	}

	return string(hash), nil
}

// VerifyPassword compares a plaintext password with a bcrypt hash.
// Returns nil if the password matches, ErrPasswordMismatch if it doesn't.
//
// Example:
//
//	err := VerifyPassword("userpassword123", storedHash)
//	if err != nil {
//	    // Password does not match
//	}
func VerifyPassword(password, hash string) error {
	if password == "" {
		return ErrPasswordRequired
	}
	if hash == "" {
		return ErrPasswordMismatch
	}

	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	if err != nil {
		if errors.Is(err, bcrypt.ErrMismatchedHashAndPassword) {
			return ErrPasswordMismatch
		}
		return fmt.Errorf("auth: password verification failed: %w", err)
	}

	return nil
}

// ValidatePassword checks if a password meets the basic length requirements.
// Returns nil if valid, an error describing the issue if not.
//
// Password requirements:
// - Minimum 8 characters
// - Maximum 72 characters (bcrypt limitation)
//
// Note: This performs basic validation only. Use ValidatePasswordStrength
// for comprehensive validation including common password checks.
func ValidatePassword(password string) error {
	if password == "" {
		return ErrPasswordRequired
	}

	// Count runes (characters) rather than bytes for proper Unicode support
	runeCount := 0
	for range password {
		runeCount++
	}

	if runeCount < MinPasswordLength {
		return ErrPasswordTooShort
	}

	if runeCount > MaxPasswordLength {
		return ErrPasswordTooLong
	}

	return nil
}

// ValidatePasswordStrength performs comprehensive password validation.
// This includes length checks and common password detection.
//
// Password requirements:
// - Minimum 8 characters
// - Maximum 72 characters (bcrypt limitation)
// - Not in the common passwords list (top 1000+ passwords)
//
// Returns nil if the password is strong enough, otherwise returns an error
// describing the weakness.
//
// Example:
//
//	if err := ValidatePasswordStrength("password123"); err != nil {
//	    // err is ErrCommonPassword
//	}
func ValidatePasswordStrength(password string) error {
	// Basic length validation first
	if err := ValidatePassword(password); err != nil {
		return err
	}

	// Check against common passwords list (case-insensitive)
	if IsCommonPassword(password) {
		return ErrCommonPassword
	}

	return nil
}
