// Package ratelimit provides rate limiting implementations for auth endpoints.
package ratelimit

import (
	"sync"
	"time"
)

// AccountLockout provides account lockout functionality after failed login attempts.
// It tracks failed attempts per identifier (typically email) and locks accounts
// temporarily after exceeding the failure threshold.
//
// This is separate from rate limiting - rate limiting controls request frequency,
// while account lockout specifically addresses brute force password attacks.
type AccountLockout struct {
	mu               sync.RWMutex
	failures         map[string]*lockoutEntry
	maxFailures      int           // Number of failures before lockout
	lockoutDuration  time.Duration // How long the account stays locked
	failureWindow    time.Duration // Window for counting failures
	prefix           string        // Key prefix for namespacing
	stopCh           chan struct{}
	cleanupDone      chan struct{}
}

// lockoutEntry tracks failures and lockout state for a single identifier.
type lockoutEntry struct {
	failures    []time.Time // Timestamps of failed attempts
	lockedUntil time.Time   // Time until which the account is locked
}

// LockoutConfig holds account lockout configuration.
type LockoutConfig struct {
	// MaxFailures is the number of failed attempts before lockout (default: 5)
	MaxFailures int

	// LockoutDuration is how long the account stays locked (default: 15 minutes)
	LockoutDuration time.Duration

	// FailureWindow is the window for counting failures (default: 15 minutes)
	// Failures older than this are not counted toward the threshold.
	FailureWindow time.Duration
}

// DefaultLockoutConfig returns sensible defaults for account lockout.
func DefaultLockoutConfig() LockoutConfig {
	return LockoutConfig{
		MaxFailures:     5,
		LockoutDuration: 15 * time.Minute,
		FailureWindow:   15 * time.Minute,
	}
}

// LockoutResult contains the result of a lockout check.
type LockoutResult struct {
	// Locked indicates if the account is currently locked
	Locked bool

	// FailureCount is the current number of failures within the window
	FailureCount int

	// MaxFailures is the threshold before lockout
	MaxFailures int

	// LockedUntil is when the lockout expires (only set if Locked is true)
	LockedUntil time.Time

	// RemainingAttempts is how many more failures before lockout
	RemainingAttempts int
}

// SecondsUntilUnlock returns the number of seconds until the account unlocks.
// Returns 0 if not locked.
func (r LockoutResult) SecondsUntilUnlock() int {
	if !r.Locked {
		return 0
	}
	seconds := int(time.Until(r.LockedUntil).Seconds())
	if seconds < 1 {
		return 1
	}
	return seconds
}

// NewAccountLockout creates a new account lockout tracker with the given config.
func NewAccountLockout(config LockoutConfig, prefix string) *AccountLockout {
	al := &AccountLockout{
		failures:        make(map[string]*lockoutEntry),
		maxFailures:     config.MaxFailures,
		lockoutDuration: config.LockoutDuration,
		failureWindow:   config.FailureWindow,
		prefix:          prefix,
		stopCh:          make(chan struct{}),
		cleanupDone:     make(chan struct{}),
	}

	// Start background cleanup goroutine
	go al.cleanupLoop()

	return al
}

// Check checks if an account is locked and returns the current status.
// This should be called BEFORE attempting authentication.
func (al *AccountLockout) Check(identifier string) LockoutResult {
	al.mu.RLock()
	defer al.mu.RUnlock()

	fullKey := al.fullKey(identifier)
	entry := al.failures[fullKey]

	if entry == nil {
		return LockoutResult{
			Locked:            false,
			FailureCount:      0,
			MaxFailures:       al.maxFailures,
			RemainingAttempts: al.maxFailures,
		}
	}

	now := time.Now()

	// Check if currently locked
	if now.Before(entry.lockedUntil) {
		return LockoutResult{
			Locked:            true,
			FailureCount:      len(entry.failures),
			MaxFailures:       al.maxFailures,
			LockedUntil:       entry.lockedUntil,
			RemainingAttempts: 0,
		}
	}

	// Count failures within window
	windowStart := now.Add(-al.failureWindow)
	failureCount := 0
	for _, ts := range entry.failures {
		if ts.After(windowStart) {
			failureCount++
		}
	}

	remaining := al.maxFailures - failureCount
	if remaining < 0 {
		remaining = 0
	}

	return LockoutResult{
		Locked:            false,
		FailureCount:      failureCount,
		MaxFailures:       al.maxFailures,
		RemainingAttempts: remaining,
	}
}

// RecordFailure records a failed login attempt and returns the updated status.
// If the failure count reaches the threshold, the account is locked.
func (al *AccountLockout) RecordFailure(identifier string) LockoutResult {
	al.mu.Lock()
	defer al.mu.Unlock()

	fullKey := al.fullKey(identifier)
	now := time.Now()
	windowStart := now.Add(-al.failureWindow)

	entry := al.failures[fullKey]
	if entry == nil {
		entry = &lockoutEntry{
			failures: make([]time.Time, 0, al.maxFailures),
		}
		al.failures[fullKey] = entry
	}

	// Check if still locked (don't add more failures)
	if now.Before(entry.lockedUntil) {
		return LockoutResult{
			Locked:            true,
			FailureCount:      len(entry.failures),
			MaxFailures:       al.maxFailures,
			LockedUntil:       entry.lockedUntil,
			RemainingAttempts: 0,
		}
	}

	// Filter old failures and add new one
	var valid []time.Time
	for _, ts := range entry.failures {
		if ts.After(windowStart) {
			valid = append(valid, ts)
		}
	}
	valid = append(valid, now)
	entry.failures = valid

	failureCount := len(valid)
	remaining := al.maxFailures - failureCount
	if remaining < 0 {
		remaining = 0
	}

	// Check if we should lock the account
	if failureCount >= al.maxFailures {
		entry.lockedUntil = now.Add(al.lockoutDuration)
		return LockoutResult{
			Locked:            true,
			FailureCount:      failureCount,
			MaxFailures:       al.maxFailures,
			LockedUntil:       entry.lockedUntil,
			RemainingAttempts: 0,
		}
	}

	return LockoutResult{
		Locked:            false,
		FailureCount:      failureCount,
		MaxFailures:       al.maxFailures,
		RemainingAttempts: remaining,
	}
}

// RecordSuccess clears lockout state for an identifier after a successful login.
func (al *AccountLockout) RecordSuccess(identifier string) {
	al.mu.Lock()
	defer al.mu.Unlock()

	delete(al.failures, al.fullKey(identifier))
}

// Stop stops the background cleanup goroutine.
func (al *AccountLockout) Stop() {
	close(al.stopCh)
	<-al.cleanupDone
}

// cleanupLoop runs periodically to remove expired entries.
func (al *AccountLockout) cleanupLoop() {
	defer close(al.cleanupDone)

	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			al.cleanup()
		case <-al.stopCh:
			return
		}
	}
}

// cleanup removes expired entries from the lockout tracker.
func (al *AccountLockout) cleanup() {
	al.mu.Lock()
	defer al.mu.Unlock()

	now := time.Now()
	windowStart := now.Add(-al.failureWindow)

	for key, entry := range al.failures {
		// Keep entry if still locked
		if now.Before(entry.lockedUntil) {
			continue
		}

		// Filter old failures
		var valid []time.Time
		for _, ts := range entry.failures {
			if ts.After(windowStart) {
				valid = append(valid, ts)
			}
		}

		if len(valid) == 0 {
			delete(al.failures, key)
		} else {
			entry.failures = valid
		}
	}
}

// fullKey returns the full key with prefix applied.
func (al *AccountLockout) fullKey(identifier string) string {
	if al.prefix == "" {
		return identifier
	}
	return al.prefix + ":" + identifier
}

// GetConfig returns the lockout configuration.
func (al *AccountLockout) GetConfig() LockoutConfig {
	return LockoutConfig{
		MaxFailures:     al.maxFailures,
		LockoutDuration: al.lockoutDuration,
		FailureWindow:   al.failureWindow,
	}
}
