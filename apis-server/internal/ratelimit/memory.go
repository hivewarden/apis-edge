// Package ratelimit provides rate limiting implementations for auth endpoints.
package ratelimit

import (
	"sync"
	"time"
)

// MemoryLimiter implements the Limiter interface using an in-memory sliding window.
// It is suitable for single-instance deployments and development environments.
//
// For multi-instance deployments (e.g., SaaS mode), use RedisLimiter instead
// to ensure rate limits are shared across all instances.
type MemoryLimiter struct {
	mu           sync.RWMutex
	attempts     map[string][]time.Time // key -> attempt timestamps
	config       Config
	prefix       string // Key prefix for namespacing (optional)
	stopCh       chan struct{}
	cleanupDone  chan struct{}
}

// NewMemoryLimiter creates a new in-memory rate limiter without a key prefix.
//
// The limiter automatically cleans up stale entries every 5 minutes
// to prevent unbounded memory growth from attackers enumerating keys.
func NewMemoryLimiter(config Config) *MemoryLimiter {
	return NewMemoryLimiterWithPrefix(config, "")
}

// NewMemoryLimiterWithPrefix creates a new in-memory rate limiter with a key prefix.
// The prefix is used for namespacing keys (prepended to all keys with a ":" separator).
//
// The limiter automatically cleans up stale entries every 5 minutes
// to prevent unbounded memory growth from attackers enumerating keys.
func NewMemoryLimiterWithPrefix(config Config, prefix string) *MemoryLimiter {
	ml := &MemoryLimiter{
		attempts:    make(map[string][]time.Time),
		config:      config,
		prefix:      prefix,
		stopCh:      make(chan struct{}),
		cleanupDone: make(chan struct{}),
	}

	// Start background cleanup goroutine
	go ml.cleanupLoop()

	return ml
}

// Check implements Limiter.Check using a sliding window algorithm.
// It atomically checks and records the attempt in a single operation.
func (ml *MemoryLimiter) Check(key string) (allowed bool, remaining int, resetAt time.Time, err error) {
	ml.mu.Lock()
	defer ml.mu.Unlock()

	now := time.Now()
	windowStart := now.Add(-ml.config.WindowPeriod)

	// Apply prefix to key if configured
	fullKey := ml.fullKey(key)

	// Get existing attempts for this key and filter expired ones
	timestamps := ml.attempts[fullKey]
	var valid []time.Time
	for _, ts := range timestamps {
		if ts.After(windowStart) {
			valid = append(valid, ts)
		}
	}

	// Calculate reset time (when oldest attempt in window expires)
	// If no attempts in window, reset is now + window period
	if len(valid) > 0 {
		resetAt = valid[0].Add(ml.config.WindowPeriod)
	} else {
		resetAt = now.Add(ml.config.WindowPeriod)
	}

	// Check if limit exceeded BEFORE adding new attempt
	if len(valid) >= ml.config.MaxRequests {
		// Store cleaned timestamps (don't add new one since we're denying)
		ml.attempts[fullKey] = valid
		return false, 0, resetAt, nil
	}

	// Add new attempt timestamp
	valid = append(valid, now)
	ml.attempts[fullKey] = valid

	remaining = ml.config.MaxRequests - len(valid)
	return true, remaining, resetAt, nil
}

// Clear implements Limiter.Clear by removing all tracking for a key.
func (ml *MemoryLimiter) Clear(key string) {
	ml.mu.Lock()
	defer ml.mu.Unlock()

	delete(ml.attempts, ml.fullKey(key))
}

// Stop implements Limiter.Stop by stopping the background cleanup goroutine.
func (ml *MemoryLimiter) Stop() {
	close(ml.stopCh)
	<-ml.cleanupDone
}

// cleanupLoop runs periodically to remove expired entries.
// This prevents unbounded memory growth from attackers enumerating many keys.
func (ml *MemoryLimiter) cleanupLoop() {
	defer close(ml.cleanupDone)

	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			ml.cleanup()
		case <-ml.stopCh:
			return
		}
	}
}

// cleanup removes expired entries from the rate limiter.
func (ml *MemoryLimiter) cleanup() {
	ml.mu.Lock()
	defer ml.mu.Unlock()

	now := time.Now()
	windowStart := now.Add(-ml.config.WindowPeriod)

	for key, timestamps := range ml.attempts {
		var valid []time.Time
		for _, ts := range timestamps {
			if ts.After(windowStart) {
				valid = append(valid, ts)
			}
		}

		if len(valid) == 0 {
			delete(ml.attempts, key)
		} else {
			ml.attempts[key] = valid
		}
	}
}

// GetAttemptCount returns the current number of attempts for a key within the window.
// This is primarily useful for testing and monitoring.
func (ml *MemoryLimiter) GetAttemptCount(key string) int {
	ml.mu.RLock()
	defer ml.mu.RUnlock()

	now := time.Now()
	windowStart := now.Add(-ml.config.WindowPeriod)

	timestamps := ml.attempts[ml.fullKey(key)]
	count := 0
	for _, ts := range timestamps {
		if ts.After(windowStart) {
			count++
		}
	}
	return count
}

// GetEntryCount returns the number of unique keys being tracked.
// This is primarily useful for testing the cleanup mechanism.
func (ml *MemoryLimiter) GetEntryCount() int {
	ml.mu.RLock()
	defer ml.mu.RUnlock()
	return len(ml.attempts)
}

// GetConfig returns the limiter's configuration.
func (ml *MemoryLimiter) GetConfig() Config {
	return ml.config
}

// GetPrefix returns the limiter's key prefix.
func (ml *MemoryLimiter) GetPrefix() string {
	return ml.prefix
}

// fullKey returns the full key with prefix applied.
// If no prefix is configured, returns the key unchanged.
func (ml *MemoryLimiter) fullKey(key string) string {
	if ml.prefix == "" {
		return key
	}
	return ml.prefix + ":" + key
}
