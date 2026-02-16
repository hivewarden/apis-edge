// Package middleware provides HTTP middleware for the APIS server.
package middleware

// NOTE: Rate limiting is in-memory and not shared across instances.
// In multi-instance deployments, each server maintains independent counters.
// For distributed rate limiting, consider Redis or a shared store.

import (
	"encoding/json"
	"net/http"
	"strconv"
	"sync"
	"time"
)

// RateLimiter provides per-tenant request rate limiting.
type RateLimiter struct {
	mu           sync.RWMutex
	requests     map[string][]time.Time // tenant_id -> request timestamps
	maxRequests  int
	windowPeriod time.Duration
	stopCh       chan struct{} // SECURITY FIX (S1-M4): channel to signal cleanup goroutine to stop
	cleanupDone  chan struct{} // signals cleanup goroutine has exited
}

// NewRateLimiter creates a new rate limiter with the specified limits.
// SECURITY FIX (S1-M4): Added background cleanup goroutine with Stop() method
// to prevent unbounded memory growth from stale tenant entries and to match
// the lifecycle pattern used by MemoryLimiter and LoginRateLimiter.
func NewRateLimiter(maxRequests int, windowPeriod time.Duration) *RateLimiter {
	rl := &RateLimiter{
		requests:     make(map[string][]time.Time),
		maxRequests:  maxRequests,
		windowPeriod: windowPeriod,
		stopCh:       make(chan struct{}),
		cleanupDone:  make(chan struct{}),
	}

	go func() {
		defer close(rl.cleanupDone)
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				rl.cleanupStale()
			case <-rl.stopCh:
				return
			}
		}
	}()

	return rl
}

// Stop signals the background cleanup goroutine to exit and waits for it.
func (rl *RateLimiter) Stop() {
	close(rl.stopCh)
	<-rl.cleanupDone
}

// cleanupStale removes entries with no recent requests from the rate limiter.
func (rl *RateLimiter) cleanupStale() {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	windowStart := now.Add(-rl.windowPeriod)

	for tenantID, timestamps := range rl.requests {
		var valid []time.Time
		for _, ts := range timestamps {
			if ts.After(windowStart) {
				valid = append(valid, ts)
			}
		}
		if len(valid) == 0 {
			delete(rl.requests, tenantID)
		} else {
			rl.requests[tenantID] = valid
		}
	}
}

// Allow checks if a request is allowed for the given tenant.
// Returns true if allowed, false if rate limit exceeded.
// Also returns the number of seconds until the oldest request expires.
func (rl *RateLimiter) Allow(tenantID string) (bool, int) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	windowStart := now.Add(-rl.windowPeriod)

	// Get existing requests for this tenant
	timestamps := rl.requests[tenantID]

	// Filter out expired timestamps
	var valid []time.Time
	for _, ts := range timestamps {
		if ts.After(windowStart) {
			valid = append(valid, ts)
		}
	}

	// Check if limit exceeded
	if len(valid) >= rl.maxRequests {
		// Calculate retry-after (seconds until oldest request expires)
		oldestInWindow := valid[0]
		retryAfter := int(oldestInWindow.Add(rl.windowPeriod).Sub(now).Seconds())
		if retryAfter < 1 {
			retryAfter = 1
		}
		// Persist cleaned timestamps to prevent stale entries from accumulating.
		// Both allowed and denied requests update the map - allowed requests add
		// a new timestamp below, denied requests just persist the cleaned list.
		rl.requests[tenantID] = valid
		return false, retryAfter
	}

	// Add new request timestamp and persist to map.
	// This write happens on all allowed requests, similar to denied requests above.
	valid = append(valid, now)
	rl.requests[tenantID] = valid

	return true, 0
}

// RateLimitMiddleware returns middleware that applies rate limiting per tenant.
// It requires the TenantMiddleware to have run first to set the tenant ID.
func RateLimitMiddleware(limiter *RateLimiter) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tenantID := GetTenantID(r.Context())
			if tenantID == "" {
				// No tenant ID - this shouldn't happen if middleware is ordered correctly
				respondTooManyRequests(w, 60, "Rate limit exceeded")
				return
			}

			allowed, retryAfter := limiter.Allow(tenantID)
			if !allowed {
				respondTooManyRequests(w, retryAfter, "Export rate limit exceeded. Try again later.")
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// respondTooManyRequests sends a 429 response with Retry-After header.
func respondTooManyRequests(w http.ResponseWriter, retryAfter int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Retry-After", strconv.Itoa(retryAfter))
	w.WriteHeader(http.StatusTooManyRequests)
	json.NewEncoder(w).Encode(map[string]any{
		"error":       message,
		"code":        http.StatusTooManyRequests,
		"retry_after": retryAfter,
	})
}
