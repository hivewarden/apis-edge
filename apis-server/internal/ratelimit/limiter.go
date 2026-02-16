// Package ratelimit provides rate limiting implementations for auth endpoints.
// It supports both in-memory and Redis backends for sliding window rate limiting.
package ratelimit

import (
	"time"
)

// Limiter is the interface for rate limiting implementations.
// Implementations must be safe for concurrent use.
type Limiter interface {
	// Check checks if a request should be allowed for the given key.
	// Returns:
	//   - allowed: true if the request is allowed, false if rate limited
	//   - remaining: number of requests remaining in the current window
	//   - resetAt: time when the rate limit window resets
	//   - err: any error that occurred during the check
	//
	// The key is typically derived from the request (e.g., email address, IP, user ID).
	Check(key string) (allowed bool, remaining int, resetAt time.Time, err error)

	// Clear removes all tracking for a key.
	// This is typically called after a successful operation (e.g., login)
	// to reset the rate limit counter.
	Clear(key string)

	// Stop gracefully shuts down the rate limiter, stopping any background
	// cleanup goroutines. After Stop is called, the limiter should not be used.
	Stop()

	// GetConfig returns the rate limiter's configuration.
	GetConfig() Config
}

// Config holds rate limiter configuration.
type Config struct {
	// MaxRequests is the maximum number of requests allowed in the window.
	MaxRequests int

	// WindowPeriod is the duration of the sliding window.
	WindowPeriod time.Duration
}

// DefaultConfig returns a sensible default configuration.
func DefaultConfig() Config {
	return Config{
		MaxRequests:  5,
		WindowPeriod: 15 * time.Minute,
	}
}

// RateLimitInfo contains rate limit information for response headers.
type RateLimitInfo struct {
	// Limit is the maximum number of requests allowed.
	Limit int

	// Remaining is the number of requests remaining in the current window.
	Remaining int

	// ResetAt is the time when the rate limit window resets.
	ResetAt time.Time

	// Allowed indicates if the request was allowed.
	Allowed bool
}

// RetryAfterSeconds returns the number of seconds until the rate limit resets.
// Returns 1 as minimum to ensure a valid Retry-After header value.
func (info RateLimitInfo) RetryAfterSeconds() int {
	seconds := int(time.Until(info.ResetAt).Seconds())
	if seconds < 1 {
		return 1
	}
	return seconds
}
