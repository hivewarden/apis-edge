package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/jermoo/apis/apis-server/internal/middleware"
)

// dummyHandler is a simple handler for testing middleware
var dummyHandler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
})

func TestSecurityHeaders(t *testing.T) {
	tests := []struct {
		name           string
		expectedHeader string
		expectedValue  string
	}{
		{
			name:           "X-Content-Type-Options header is set",
			expectedHeader: "X-Content-Type-Options",
			expectedValue:  "nosniff",
		},
		{
			name:           "X-Frame-Options header is set",
			expectedHeader: "X-Frame-Options",
			expectedValue:  "DENY",
		},
		{
			name:           "X-XSS-Protection header is set",
			expectedHeader: "X-XSS-Protection",
			expectedValue:  "1; mode=block",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create a request
			req := httptest.NewRequest(http.MethodGet, "/test", nil)

			// Create a response recorder
			rr := httptest.NewRecorder()

			// Wrap the dummy handler with security headers middleware
			handler := middleware.SecurityHeaders(dummyHandler)
			handler.ServeHTTP(rr, req)

			// Verify the response is successful
			require.Equal(t, http.StatusOK, rr.Code)

			// Verify the security header is set correctly
			assert.Equal(t, tt.expectedValue, rr.Header().Get(tt.expectedHeader),
				"Expected %s header to be %s", tt.expectedHeader, tt.expectedValue)
		})
	}
}

func TestSecurityHeaders_AllHeadersPresent(t *testing.T) {
	// Create a request
	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)

	// Create a response recorder
	rr := httptest.NewRecorder()

	// Wrap the dummy handler with security headers middleware
	handler := middleware.SecurityHeaders(dummyHandler)
	handler.ServeHTTP(rr, req)

	// Verify all three headers are present in a single response
	headers := rr.Header()

	assert.Equal(t, "nosniff", headers.Get("X-Content-Type-Options"),
		"X-Content-Type-Options should be nosniff")
	assert.Equal(t, "DENY", headers.Get("X-Frame-Options"),
		"X-Frame-Options should be DENY")
	assert.Equal(t, "1; mode=block", headers.Get("X-XSS-Protection"),
		"X-XSS-Protection should be 1; mode=block")
}

func TestSecurityHeaders_PreservesExistingHeaders(t *testing.T) {
	// Handler that sets a custom header
	handlerWithHeader := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Custom-Header", "custom-value")
		w.WriteHeader(http.StatusOK)
	})

	// Create a request
	req := httptest.NewRequest(http.MethodGet, "/test", nil)

	// Create a response recorder
	rr := httptest.NewRecorder()

	// Wrap the handler with security headers middleware
	handler := middleware.SecurityHeaders(handlerWithHeader)
	handler.ServeHTTP(rr, req)

	// Verify the custom header is preserved
	assert.Equal(t, "custom-value", rr.Header().Get("X-Custom-Header"),
		"Custom header should be preserved")

	// Verify security headers are also present
	assert.Equal(t, "nosniff", rr.Header().Get("X-Content-Type-Options"))
	assert.Equal(t, "DENY", rr.Header().Get("X-Frame-Options"))
	assert.Equal(t, "1; mode=block", rr.Header().Get("X-XSS-Protection"))
}

func TestSecurityHeaders_DifferentHTTPMethods(t *testing.T) {
	methods := []string{
		http.MethodGet,
		http.MethodPost,
		http.MethodPut,
		http.MethodDelete,
		http.MethodPatch,
		http.MethodOptions,
	}

	for _, method := range methods {
		t.Run(method, func(t *testing.T) {
			req := httptest.NewRequest(method, "/api/test", nil)
			rr := httptest.NewRecorder()

			handler := middleware.SecurityHeaders(dummyHandler)
			handler.ServeHTTP(rr, req)

			// All methods should have security headers
			assert.NotEmpty(t, rr.Header().Get("X-Content-Type-Options"),
				"%s request should have X-Content-Type-Options", method)
			assert.NotEmpty(t, rr.Header().Get("X-Frame-Options"),
				"%s request should have X-Frame-Options", method)
			assert.NotEmpty(t, rr.Header().Get("X-XSS-Protection"),
				"%s request should have X-XSS-Protection", method)
		})
	}
}

func TestSecurityHeaders_ErrorResponse(t *testing.T) {
	// Handler that returns an error
	errorHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("Internal Server Error"))
	})

	req := httptest.NewRequest(http.MethodGet, "/error", nil)
	rr := httptest.NewRecorder()

	handler := middleware.SecurityHeaders(errorHandler)
	handler.ServeHTTP(rr, req)

	// Even error responses should have security headers
	assert.Equal(t, http.StatusInternalServerError, rr.Code)
	assert.Equal(t, "nosniff", rr.Header().Get("X-Content-Type-Options"))
	assert.Equal(t, "DENY", rr.Header().Get("X-Frame-Options"))
	assert.Equal(t, "1; mode=block", rr.Header().Get("X-XSS-Protection"))
}
