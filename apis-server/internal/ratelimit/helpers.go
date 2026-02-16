// Package ratelimit provides rate limiting implementations for auth endpoints.
package ratelimit

import (
	"encoding/json"
	"net"
	"net/http"
	"strconv"
	"time"
)

// ExtractIP extracts the client IP address from an HTTP request.
//
// SECURITY FIX (S1-H4): Uses r.RemoteAddr directly instead of reading
// X-Forwarded-For/X-Real-IP headers. Chi's middleware.RealIP (applied
// globally in main.go) already overwrites r.RemoteAddr with the correct
// client IP from trusted proxy headers. Reading headers directly here
// would allow IP spoofing to bypass rate limits.
func ExtractIP(r *http.Request) string {
	// RemoteAddr is already set by Chi's RealIP middleware from trusted proxy headers.
	// Strip the port component if present.
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		// RemoteAddr might not have a port
		return r.RemoteAddr
	}
	return host
}

// AddRateLimitHeaders adds rate limit headers to an HTTP response.
// Headers added:
// - X-RateLimit-Limit: Maximum requests allowed in the window
// - X-RateLimit-Remaining: Requests remaining in the current window
// - X-RateLimit-Reset: Unix timestamp when the window resets
func AddRateLimitHeaders(w http.ResponseWriter, info RateLimitInfo) {
	w.Header().Set("X-RateLimit-Limit", strconv.Itoa(info.Limit))
	w.Header().Set("X-RateLimit-Remaining", strconv.Itoa(info.Remaining))
	w.Header().Set("X-RateLimit-Reset", strconv.FormatInt(info.ResetAt.Unix(), 10))
}

// RateLimitErrorResponse represents the JSON body for a 429 response.
type RateLimitErrorResponse struct {
	Error      string `json:"error"`
	Code       int    `json:"code"`
	RetryAfter int    `json:"retry_after"`
}

// RespondRateLimited sends a 429 Too Many Requests response with appropriate headers.
// It includes:
// - X-RateLimit-* headers showing the rate limit status
// - Retry-After header with seconds until reset
// - JSON body with error message and retry information
func RespondRateLimited(w http.ResponseWriter, info RateLimitInfo, message string) {
	AddRateLimitHeaders(w, info)

	retryAfter := info.RetryAfterSeconds()

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Retry-After", strconv.Itoa(retryAfter))
	w.WriteHeader(http.StatusTooManyRequests)

	json.NewEncoder(w).Encode(RateLimitErrorResponse{
		Error:      message,
		Code:       http.StatusTooManyRequests,
		RetryAfter: retryAfter,
	})
}

// CheckResult contains the result of a rate limit check.
type CheckResult struct {
	Info    RateLimitInfo
	Allowed bool
}

// CheckWithConfig performs a rate limit check and returns a CheckResult with all info needed for headers.
func CheckWithConfig(limiter Limiter, key string, config Config) CheckResult {
	allowed, remaining, resetAt, _ := limiter.Check(key)

	return CheckResult{
		Info: RateLimitInfo{
			Limit:     config.MaxRequests,
			Remaining: remaining,
			ResetAt:   resetAt,
			Allowed:   allowed,
		},
		Allowed: allowed,
	}
}

// CompoundCheck performs rate limit checks against multiple limiters.
// Returns the strictest result (i.e., if any limiter denies, the request is denied).
// The returned RateLimitInfo reflects the limiter that denied or the strictest remaining count.
//
// This is useful for login endpoints that need to check both per-email and per-IP limits.
type LimiterWithKey struct {
	Limiter Limiter
	Key     string
	Config  Config
}

// CompoundCheck checks multiple limiters and returns the combined result.
// If any limiter denies the request, the denial info is returned.
// If all allow, the info from the limiter with the lowest remaining count is returned.
func CompoundCheck(checks []LimiterWithKey) CheckResult {
	var strictestResult CheckResult
	strictestResult.Allowed = true
	strictestResult.Info.Remaining = int(^uint(0) >> 1) // Max int

	for _, check := range checks {
		result := CheckWithConfig(check.Limiter, check.Key, check.Config)

		if !result.Allowed {
			// Return immediately on any denial
			return result
		}

		// Track the strictest (lowest remaining) allowed result
		if result.Info.Remaining < strictestResult.Info.Remaining {
			strictestResult = result
		}
	}

	return strictestResult
}

// FormatResetTime formats the reset time for human-readable display.
// Returns a string like "14 minutes" or "30 seconds".
func FormatResetTime(resetAt time.Time) string {
	duration := time.Until(resetAt)
	if duration < time.Minute {
		return strconv.Itoa(int(duration.Seconds())) + " seconds"
	}
	return strconv.Itoa(int(duration.Minutes())) + " minutes"
}
