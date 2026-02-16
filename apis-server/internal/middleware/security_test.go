package middleware

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestSecurityHeaders verifies that SecurityHeaders middleware sets correct headers
func TestSecurityHeaders(t *testing.T) {
	handler := SecurityHeaders(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	assert.Equal(t, "nosniff", w.Header().Get("X-Content-Type-Options"))
	assert.Equal(t, "DENY", w.Header().Get("X-Frame-Options"))
	assert.Equal(t, "1; mode=block", w.Header().Get("X-XSS-Protection"))
}

// TestMaxBodySizeConstants verifies the size constants are set correctly
func TestMaxBodySizeConstants(t *testing.T) {
	assert.Equal(t, int64(1*1024*1024), int64(DefaultMaxBodySize), "Default should be 1MB")
	assert.Equal(t, int64(16*1024*1024), int64(LargeMaxBodySize), "Large should be 16MB")
}

// TestMaxBodySizeAllowsSmallRequest verifies small requests pass through
func TestMaxBodySizeAllowsSmallRequest(t *testing.T) {
	var receivedBody []byte
	handler := MaxBodySize(1024)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedBody, _ = io.ReadAll(r.Body)
		w.WriteHeader(http.StatusOK)
	}))

	// Small request (100 bytes) should pass
	smallBody := strings.Repeat("a", 100)
	req := httptest.NewRequest("POST", "/test", bytes.NewReader([]byte(smallBody)))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, smallBody, string(receivedBody))
}

// TestMaxBodySizeBlocksLargeRequest verifies large requests are blocked
func TestMaxBodySizeBlocksLargeRequest(t *testing.T) {
	var readErr error
	handler := MaxBodySize(100)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, readErr = io.ReadAll(r.Body)
		if readErr != nil {
			w.WriteHeader(http.StatusRequestEntityTooLarge)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))

	// Large request (200 bytes) should be blocked with 100 byte limit
	largeBody := strings.Repeat("a", 200)
	req := httptest.NewRequest("POST", "/test", bytes.NewReader([]byte(largeBody)))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	// The handler should receive an error when reading the body
	assert.True(t, IsMaxBytesError(readErr), "Should be a MaxBytesError")
	assert.Equal(t, http.StatusRequestEntityTooLarge, w.Code)
}

// TestIsMaxBytesError tests the error detection function
func TestIsMaxBytesError(t *testing.T) {
	assert.False(t, IsMaxBytesError(nil), "nil should not be MaxBytesError")

	// Create a request with a body limit and try to read more
	handler := MaxBodySize(10)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, err := io.ReadAll(r.Body)
		if err != nil {
			assert.True(t, IsMaxBytesError(err), "Should detect MaxBytesError")
		}
	}))

	largeBody := strings.Repeat("a", 100)
	req := httptest.NewRequest("POST", "/test", bytes.NewReader([]byte(largeBody)))
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
}

func TestMaxBodySizeWithOverrides(t *testing.T) {
	var readErr error
	handler := MaxBodySizeWithOverrides(100, []BodySizeOverride{
		{Method: http.MethodPost, Path: "/api/upload", MaxBytes: 300},
	})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, readErr = io.ReadAll(r.Body)
		if readErr != nil {
			w.WriteHeader(http.StatusRequestEntityTooLarge)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))

	// Matching route override should allow 200-byte body.
	allowedBody := strings.Repeat("a", 200)
	req := httptest.NewRequest(http.MethodPost, "/api/upload", bytes.NewReader([]byte(allowedBody)))
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)
	assert.NoError(t, readErr)

	// Non-matching route should keep default 100-byte limit.
	blockedBody := strings.Repeat("a", 200)
	req = httptest.NewRequest(http.MethodPost, "/api/other", bytes.NewReader([]byte(blockedBody)))
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	assert.Equal(t, http.StatusRequestEntityTooLarge, w.Code)
	assert.True(t, IsMaxBytesError(readErr))

	// Matching path but wrong method should keep default limit.
	req = httptest.NewRequest(http.MethodPut, "/api/upload", bytes.NewReader([]byte(blockedBody)))
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	assert.Equal(t, http.StatusRequestEntityTooLarge, w.Code)
	assert.True(t, IsMaxBytesError(readErr))
}

// TestRespondBodyTooLarge tests the error response helper
func TestRespondBodyTooLarge(t *testing.T) {
	w := httptest.NewRecorder()
	respondBodyTooLarge(w)

	assert.Equal(t, http.StatusRequestEntityTooLarge, w.Code)
	assert.Equal(t, "application/json", w.Header().Get("Content-Type"))
	assert.Contains(t, w.Body.String(), "Request body too large")
	assert.Contains(t, w.Body.String(), "413")
}
