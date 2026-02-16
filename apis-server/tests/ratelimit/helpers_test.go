package ratelimit_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jermoo/apis/apis-server/internal/ratelimit"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestExtractIP(t *testing.T) {
	tests := []struct {
		name       string
		setup      func() *http.Request
		expectedIP string
	}{
		{
			name: "X-Forwarded-For single IP",
			setup: func() *http.Request {
				req := httptest.NewRequest(http.MethodGet, "/", nil)
				req.Header.Set("X-Forwarded-For", "192.168.1.1")
				return req
			},
			expectedIP: "192.168.1.1",
		},
		{
			name: "X-Forwarded-For multiple IPs",
			setup: func() *http.Request {
				req := httptest.NewRequest(http.MethodGet, "/", nil)
				req.Header.Set("X-Forwarded-For", "192.168.1.1, 10.0.0.1, 172.16.0.1")
				return req
			},
			expectedIP: "192.168.1.1",
		},
		{
			name: "X-Forwarded-For with spaces",
			setup: func() *http.Request {
				req := httptest.NewRequest(http.MethodGet, "/", nil)
				req.Header.Set("X-Forwarded-For", "  192.168.1.1  , 10.0.0.1")
				return req
			},
			expectedIP: "192.168.1.1",
		},
		{
			name: "X-Real-IP",
			setup: func() *http.Request {
				req := httptest.NewRequest(http.MethodGet, "/", nil)
				req.Header.Set("X-Real-IP", "10.0.0.1")
				return req
			},
			expectedIP: "10.0.0.1",
		},
		{
			name: "X-Real-IP with spaces",
			setup: func() *http.Request {
				req := httptest.NewRequest(http.MethodGet, "/", nil)
				req.Header.Set("X-Real-IP", "  10.0.0.1  ")
				return req
			},
			expectedIP: "10.0.0.1",
		},
		{
			name: "X-Forwarded-For takes precedence over X-Real-IP",
			setup: func() *http.Request {
				req := httptest.NewRequest(http.MethodGet, "/", nil)
				req.Header.Set("X-Forwarded-For", "192.168.1.1")
				req.Header.Set("X-Real-IP", "10.0.0.1")
				return req
			},
			expectedIP: "192.168.1.1",
		},
		{
			name: "RemoteAddr fallback with port",
			setup: func() *http.Request {
				req := httptest.NewRequest(http.MethodGet, "/", nil)
				req.RemoteAddr = "172.16.0.1:12345"
				return req
			},
			expectedIP: "172.16.0.1",
		},
		{
			name: "RemoteAddr fallback without port",
			setup: func() *http.Request {
				req := httptest.NewRequest(http.MethodGet, "/", nil)
				req.RemoteAddr = "172.16.0.1"
				return req
			},
			expectedIP: "172.16.0.1",
		},
		{
			name: "IPv6 in X-Forwarded-For",
			setup: func() *http.Request {
				req := httptest.NewRequest(http.MethodGet, "/", nil)
				req.Header.Set("X-Forwarded-For", "2001:db8::1")
				return req
			},
			expectedIP: "2001:db8::1",
		},
		{
			name: "IPv6 in RemoteAddr with port",
			setup: func() *http.Request {
				req := httptest.NewRequest(http.MethodGet, "/", nil)
				req.RemoteAddr = "[2001:db8::1]:12345"
				return req
			},
			expectedIP: "2001:db8::1",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := tt.setup()
			ip := ratelimit.ExtractIP(req)
			assert.Equal(t, tt.expectedIP, ip)
		})
	}
}

func TestAddRateLimitHeaders(t *testing.T) {
	w := httptest.NewRecorder()
	resetAt := time.Unix(1706464800, 0)

	info := ratelimit.RateLimitInfo{
		Limit:     5,
		Remaining: 3,
		ResetAt:   resetAt,
	}

	ratelimit.AddRateLimitHeaders(w, info)

	assert.Equal(t, "5", w.Header().Get("X-RateLimit-Limit"))
	assert.Equal(t, "3", w.Header().Get("X-RateLimit-Remaining"))
	assert.Equal(t, "1706464800", w.Header().Get("X-RateLimit-Reset"))
}

func TestRespondRateLimited(t *testing.T) {
	w := httptest.NewRecorder()
	resetAt := time.Now().Add(60 * time.Second)

	info := ratelimit.RateLimitInfo{
		Limit:     5,
		Remaining: 0,
		ResetAt:   resetAt,
		Allowed:   false,
	}

	ratelimit.RespondRateLimited(w, info, "Too many requests")

	// Check status code
	assert.Equal(t, http.StatusTooManyRequests, w.Code)

	// Check headers
	assert.Equal(t, "5", w.Header().Get("X-RateLimit-Limit"))
	assert.Equal(t, "0", w.Header().Get("X-RateLimit-Remaining"))
	assert.NotEmpty(t, w.Header().Get("X-RateLimit-Reset"))
	assert.NotEmpty(t, w.Header().Get("Retry-After"))
	assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

	// Check body
	var resp ratelimit.RateLimitErrorResponse
	err := json.NewDecoder(w.Body).Decode(&resp)
	require.NoError(t, err)
	assert.Equal(t, "Too many requests", resp.Error)
	assert.Equal(t, 429, resp.Code)
	assert.Greater(t, resp.RetryAfter, 0)
}

func TestCompoundCheck_AllAllow(t *testing.T) {
	emailConfig := ratelimit.Config{MaxRequests: 5, WindowPeriod: 15 * time.Minute}
	ipConfig := ratelimit.Config{MaxRequests: 20, WindowPeriod: 15 * time.Minute}

	emailLimiter := ratelimit.NewMemoryLimiter(emailConfig)
	ipLimiter := ratelimit.NewMemoryLimiter(ipConfig)
	defer emailLimiter.Stop()
	defer ipLimiter.Stop()

	checks := []ratelimit.LimiterWithKey{
		{Limiter: emailLimiter, Key: "test@example.com", Config: emailConfig},
		{Limiter: ipLimiter, Key: "192.168.1.1", Config: ipConfig},
	}

	result := ratelimit.CompoundCheck(checks)
	assert.True(t, result.Allowed)
	// Should return the stricter result (email has fewer remaining)
	assert.Equal(t, 4, result.Info.Remaining)
	assert.Equal(t, 5, result.Info.Limit)
}

func TestCompoundCheck_EmailDenies(t *testing.T) {
	emailConfig := ratelimit.Config{MaxRequests: 2, WindowPeriod: 15 * time.Minute}
	ipConfig := ratelimit.Config{MaxRequests: 20, WindowPeriod: 15 * time.Minute}

	emailLimiter := ratelimit.NewMemoryLimiter(emailConfig)
	ipLimiter := ratelimit.NewMemoryLimiter(ipConfig)
	defer emailLimiter.Stop()
	defer ipLimiter.Stop()

	// Use up email limit
	emailLimiter.Check("test@example.com")
	emailLimiter.Check("test@example.com")

	checks := []ratelimit.LimiterWithKey{
		{Limiter: emailLimiter, Key: "test@example.com", Config: emailConfig},
		{Limiter: ipLimiter, Key: "192.168.1.1", Config: ipConfig},
	}

	result := ratelimit.CompoundCheck(checks)
	assert.False(t, result.Allowed)
	assert.Equal(t, 0, result.Info.Remaining)
}

func TestCompoundCheck_IPDenies(t *testing.T) {
	emailConfig := ratelimit.Config{MaxRequests: 5, WindowPeriod: 15 * time.Minute}
	ipConfig := ratelimit.Config{MaxRequests: 2, WindowPeriod: 15 * time.Minute}

	emailLimiter := ratelimit.NewMemoryLimiter(emailConfig)
	ipLimiter := ratelimit.NewMemoryLimiter(ipConfig)
	defer emailLimiter.Stop()
	defer ipLimiter.Stop()

	// Use up IP limit
	ipLimiter.Check("192.168.1.1")
	ipLimiter.Check("192.168.1.1")

	checks := []ratelimit.LimiterWithKey{
		{Limiter: emailLimiter, Key: "test@example.com", Config: emailConfig},
		{Limiter: ipLimiter, Key: "192.168.1.1", Config: ipConfig},
	}

	result := ratelimit.CompoundCheck(checks)
	assert.False(t, result.Allowed)
}

func TestFormatResetTime(t *testing.T) {
	tests := []struct {
		name     string
		resetAt  time.Time
		contains string
	}{
		{
			name:     "seconds",
			resetAt:  time.Now().Add(30 * time.Second),
			contains: "seconds",
		},
		{
			name:     "minutes",
			resetAt:  time.Now().Add(5 * time.Minute),
			contains: "minutes",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ratelimit.FormatResetTime(tt.resetAt)
			assert.Contains(t, result, tt.contains)
		})
	}
}
