// Package middleware provides HTTP middleware for the APIS server.
package middleware

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
}

// NewRateLimiter creates a new rate limiter with the specified limits.
func NewRateLimiter(maxRequests int, windowPeriod time.Duration) *RateLimiter {
	return &RateLimiter{
		requests:     make(map[string][]time.Time),
		maxRequests:  maxRequests,
		windowPeriod: windowPeriod,
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
		// Note: We still update the map to persist the cleaned timestamps,
		// avoiding stale entries from accumulating on subsequent allowed requests
		rl.requests[tenantID] = valid
		return false, retryAfter
	}

	// Add new request timestamp
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
