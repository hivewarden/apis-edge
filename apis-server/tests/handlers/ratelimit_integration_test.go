package handlers_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jermoo/apis/apis-server/internal/config"
	"github.com/jermoo/apis/apis-server/internal/handlers"
	"github.com/jermoo/apis/apis-server/internal/ratelimit"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMain(m *testing.M) {
	// Set up environment for local auth mode
	os.Setenv("AUTH_MODE", "local")
	os.Setenv("JWT_SECRET", "test-secret-for-testing-only-32chars!")

	// Initialize auth config
	if err := config.InitAuthConfig(); err != nil {
		panic("failed to init auth config: " + err.Error())
	}

	os.Exit(m.Run())
}

func TestLoginRateLimitHeaders(t *testing.T) {
	// Create a rate limiter with low limits for testing
	emailConfig := ratelimit.Config{MaxRequests: 3, WindowPeriod: 15 * time.Minute}
	ipConfig := ratelimit.Config{MaxRequests: 10, WindowPeriod: 15 * time.Minute}

	rateLimiters := &handlers.LoginRateLimiters{
		EmailLimiter: ratelimit.NewMemoryLimiter(emailConfig),
		IPLimiter:    ratelimit.NewMemoryLimiter(ipConfig),
	}
	defer rateLimiters.Stop()

	// Create handler (will fail auth mode check, but we're testing rate limit headers)
	handler := handlers.Login(nil, rateLimiters)

	// Make request
	body := `{"email": "test@example.com", "password": "testpassword"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "192.168.1.1:12345"

	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	// Check rate limit headers are present
	assert.NotEmpty(t, w.Header().Get("X-RateLimit-Limit"), "X-RateLimit-Limit header should be present")
	assert.NotEmpty(t, w.Header().Get("X-RateLimit-Remaining"), "X-RateLimit-Remaining header should be present")
	assert.NotEmpty(t, w.Header().Get("X-RateLimit-Reset"), "X-RateLimit-Reset header should be present")

	// Verify limit value matches email limit (stricter of the two)
	assert.Equal(t, "3", w.Header().Get("X-RateLimit-Limit"))
}

func TestLoginRateLimitExceeded(t *testing.T) {
	// Create a rate limiter with very low limits for testing
	emailConfig := ratelimit.Config{MaxRequests: 2, WindowPeriod: 15 * time.Minute}
	ipConfig := ratelimit.Config{MaxRequests: 10, WindowPeriod: 15 * time.Minute}

	rateLimiters := &handlers.LoginRateLimiters{
		EmailLimiter: ratelimit.NewMemoryLimiter(emailConfig),
		IPLimiter:    ratelimit.NewMemoryLimiter(ipConfig),
	}
	defer rateLimiters.Stop()

	handler := handlers.Login(nil, rateLimiters)

	// Make requests until rate limited
	for i := 0; i < 3; i++ {
		body := `{"email": "test@example.com", "password": "testpassword"}`
		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		req.RemoteAddr = "192.168.1.1:12345"

		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)

		if i < 2 {
			// First 2 requests should not be 429
			assert.NotEqual(t, http.StatusTooManyRequests, w.Code, "request %d should not be rate limited", i+1)
		} else {
			// 3rd request should be rate limited
			assert.Equal(t, http.StatusTooManyRequests, w.Code, "request %d should be rate limited", i+1)

			// Check 429 response format
			var resp ratelimit.RateLimitErrorResponse
			err := json.NewDecoder(w.Body).Decode(&resp)
			require.NoError(t, err)
			assert.Equal(t, 429, resp.Code)
			assert.Greater(t, resp.RetryAfter, 0)
			assert.Contains(t, resp.Error, "Too many")

			// Check Retry-After header
			assert.NotEmpty(t, w.Header().Get("Retry-After"))
		}
	}
}

func TestLoginIPRateLimitIndependent(t *testing.T) {
	// Create a rate limiter with low IP limit
	emailConfig := ratelimit.Config{MaxRequests: 10, WindowPeriod: 15 * time.Minute}
	ipConfig := ratelimit.Config{MaxRequests: 2, WindowPeriod: 15 * time.Minute}

	rateLimiters := &handlers.LoginRateLimiters{
		EmailLimiter: ratelimit.NewMemoryLimiter(emailConfig),
		IPLimiter:    ratelimit.NewMemoryLimiter(ipConfig),
	}
	defer rateLimiters.Stop()

	handler := handlers.Login(nil, rateLimiters)

	// Make requests with different emails from same IP
	emails := []string{"user1@example.com", "user2@example.com", "user3@example.com"}
	for i, email := range emails {
		body := `{"email": "` + email + `", "password": "testpassword"}`
		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		req.RemoteAddr = "192.168.1.1:12345" // Same IP

		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)

		if i < 2 {
			// First 2 requests should not be 429 (different emails, IP limit allows 2)
			assert.NotEqual(t, http.StatusTooManyRequests, w.Code, "request %d should not be rate limited", i+1)
		} else {
			// 3rd request should be rate limited by IP
			assert.Equal(t, http.StatusTooManyRequests, w.Code, "request %d should be rate limited by IP", i+1)
		}
	}
}

func TestSetupRateLimitHeaders(t *testing.T) {
	rateLimiter := handlers.NewSetupRateLimiter()
	defer rateLimiter.Stop()

	// Create handler
	handler := handlers.Setup(nil, rateLimiter)

	// Make request
	body := `{"display_name": "Admin", "email": "admin@example.com", "password": "securepassword123"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/setup", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "192.168.1.1:12345"

	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	// Check rate limit headers are present
	assert.NotEmpty(t, w.Header().Get("X-RateLimit-Limit"), "X-RateLimit-Limit header should be present")
	assert.NotEmpty(t, w.Header().Get("X-RateLimit-Remaining"), "X-RateLimit-Remaining header should be present")
	assert.NotEmpty(t, w.Header().Get("X-RateLimit-Reset"), "X-RateLimit-Reset header should be present")

	// Verify limit value is 3 (setup limit)
	assert.Equal(t, "3", w.Header().Get("X-RateLimit-Limit"))
}

func TestInviteAcceptRateLimitExceeded(t *testing.T) {
	// Use a limiter with very low limit for testing (1 request only)
	config := ratelimit.Config{MaxRequests: 1, WindowPeriod: 15 * time.Minute}
	rateLimiter := &handlers.InviteAcceptRateLimiter{
		Limiter: ratelimit.NewMemoryLimiter(config),
	}
	defer rateLimiter.Stop()

	// Create handler using chi router to properly extract URL params
	r := chi.NewRouter()
	r.Post("/api/invite/{token}/accept", handlers.AcceptInvite(nil, rateLimiter))

	// First request - will pass rate limit but fail later due to nil pool
	body := `{"email": "user@example.com", "display_name": "User", "password": "securepassword123"}`
	req := httptest.NewRequest(http.MethodPost, "/api/invite/test-token-12345678/accept", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "192.168.1.1:12345"

	// Use recover to catch panic from nil pool
	func() {
		defer func() {
			if r := recover(); r != nil {
				// Expected - nil pool causes panic
			}
		}()
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
	}()

	// Second request should be rate limited (before hitting database)
	req2 := httptest.NewRequest(http.MethodPost, "/api/invite/test-token-12345678/accept", bytes.NewBufferString(body))
	req2.Header.Set("Content-Type", "application/json")
	req2.RemoteAddr = "192.168.1.1:12345"

	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req2)

	// Should be rate limited
	assert.Equal(t, http.StatusTooManyRequests, w2.Code, "request should be rate limited")

	// Check rate limit headers are present
	assert.NotEmpty(t, w2.Header().Get("X-RateLimit-Limit"), "X-RateLimit-Limit header should be present")
	assert.NotEmpty(t, w2.Header().Get("X-RateLimit-Remaining"), "X-RateLimit-Remaining header should be present")
	assert.NotEmpty(t, w2.Header().Get("X-RateLimit-Reset"), "X-RateLimit-Reset header should be present")

	// Verify limit value is 1 (our test limit)
	assert.Equal(t, "1", w2.Header().Get("X-RateLimit-Limit"))
}

func TestChangePasswordRateLimitHeaders(t *testing.T) {
	rateLimiter := handlers.NewChangePasswordRateLimiter()
	defer rateLimiter.Stop()

	// Create handler (will fail without auth, but we're testing rate limit headers)
	handler := handlers.ChangePassword(nil, rateLimiter)

	// Make request (will fail without auth context)
	body := `{"current_password": "oldpassword", "new_password": "newpassword123"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/change-password", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	// Should fail with 401 (no auth), not 429
	// Rate limit headers are not added for unauthenticated requests since we need user_id
	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestExtractIP(t *testing.T) {
	tests := []struct {
		name        string
		setupReq    func(r *http.Request)
		expectedIP  string
	}{
		{
			name: "X-Forwarded-For header",
			setupReq: func(r *http.Request) {
				r.Header.Set("X-Forwarded-For", "203.0.113.195, 70.41.3.18, 150.172.238.178")
			},
			expectedIP: "203.0.113.195",
		},
		{
			name: "X-Real-IP header",
			setupReq: func(r *http.Request) {
				r.Header.Set("X-Real-IP", "203.0.113.195")
			},
			expectedIP: "203.0.113.195",
		},
		{
			name: "RemoteAddr fallback",
			setupReq: func(r *http.Request) {
				r.RemoteAddr = "192.168.1.1:54321"
			},
			expectedIP: "192.168.1.1",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/", nil)
			tt.setupReq(req)
			ip := ratelimit.ExtractIP(req)
			assert.Equal(t, tt.expectedIP, ip)
		})
	}
}
