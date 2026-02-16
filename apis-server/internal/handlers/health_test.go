package handlers_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jermoo/apis/apis-server/internal/handlers"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// healthResponseWrapper matches the {"data": {...}} envelope from the health endpoint.
type healthResponseWrapper struct {
	Data HealthResponse `json:"data"`
}

// HealthResponse matches the health data inside the envelope.
type HealthResponse struct {
	Status  string            `json:"status"`
	Version string            `json:"version"`
	Checks  map[string]string `json:"checks"`
}

// mockPool implements handlers.Pinger for testing
type mockPool struct {
	pingErr error
}

func (m *mockPool) Ping(ctx context.Context) error {
	return m.pingErr
}

// decodeHealthResponse is a helper that decodes the {"data": {...}} envelope.
func decodeHealthResponse(t *testing.T, rec *httptest.ResponseRecorder) HealthResponse {
	t.Helper()
	var wrapper healthResponseWrapper
	err := json.NewDecoder(rec.Body).Decode(&wrapper)
	require.NoError(t, err, "response should be valid JSON")
	return wrapper.Data
}

func TestHealthHandler_AllHealthy(t *testing.T) {
	// Setup mock HTTP server for OIDC discovery
	oidcServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/.well-known/openid-configuration" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"issuer":"http://test"}`))
		} else {
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer oidcServer.Close()

	// Create handler with mock pool that returns no error (healthy)
	pool := &mockPool{pingErr: nil}
	handler := handlers.NewHealthHandler(pool, oidcServer.URL)

	// Create test request
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rec := httptest.NewRecorder()

	// Execute
	handler.ServeHTTP(rec, req)

	// Assert HTTP 200 when all healthy (AC1)
	assert.Equal(t, http.StatusOK, rec.Code, "expected 200 when all services healthy")

	resp := decodeHealthResponse(t, rec)

	assert.Equal(t, "ok", resp.Status)
	assert.Equal(t, "0.1.0", resp.Version)
	assert.Equal(t, "ok", resp.Checks["database"])
	assert.Equal(t, "ok", resp.Checks["oidc"])
}

func TestHealthHandler_DatabaseDown(t *testing.T) {
	// Setup mock HTTP server for OIDC discovery
	oidcServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/.well-known/openid-configuration" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"issuer":"http://test"}`))
		} else {
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer oidcServer.Close()

	// Create handler with mock pool that returns error
	pool := &mockPool{pingErr: fmt.Errorf("connection refused")}
	handler := handlers.NewHealthHandler(pool, oidcServer.URL)

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	// Assert HTTP 503 when database down (AC2)
	assert.Equal(t, http.StatusServiceUnavailable, rec.Code)

	resp := decodeHealthResponse(t, rec)

	assert.Equal(t, "degraded", resp.Status)
	// Security fix S3A-H2: handler returns "unhealthy" instead of error details
	assert.Equal(t, "unhealthy", resp.Checks["database"])
	assert.Equal(t, "ok", resp.Checks["oidc"])
}

func TestHealthHandler_OIDCProviderDown(t *testing.T) {
	// Setup mock OIDC server that returns 500
	oidcServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer oidcServer.Close()

	handler := handlers.NewHealthHandler(nil, oidcServer.URL)

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusServiceUnavailable, rec.Code)

	resp := decodeHealthResponse(t, rec)

	assert.Equal(t, "degraded", resp.Status)
	// Security fix S3A-H2: handler returns "unhealthy" instead of error details
	assert.Equal(t, "unhealthy", resp.Checks["oidc"])
}

func TestHealthHandler_OIDCProviderUnreachable(t *testing.T) {
	// Use an invalid URL that won't connect
	handler := handlers.NewHealthHandler(nil, "http://localhost:1")

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusServiceUnavailable, rec.Code)

	resp := decodeHealthResponse(t, rec)

	assert.Equal(t, "degraded", resp.Status)
	// Security fix S3A-H2: handler returns "unhealthy" instead of error details
	assert.Equal(t, "unhealthy", resp.Checks["oidc"])
}

func TestHealthHandler_OIDCIssuerEmpty(t *testing.T) {
	// Test handling of empty OIDC issuer configuration
	handler := handlers.NewHealthHandler(nil, "")

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusServiceUnavailable, rec.Code)

	resp := decodeHealthResponse(t, rec)

	assert.Equal(t, "degraded", resp.Status)
	// Security fix S3A-H2: handler returns "unhealthy" instead of error details
	assert.Equal(t, "unhealthy", resp.Checks["oidc"])
}

func TestHealthHandler_ResponseFormat(t *testing.T) {
	// Verify the response format matches CLAUDE.md {"data": {...}} envelope
	oidcServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/.well-known/openid-configuration" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"issuer":"http://test"}`))
		} else {
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer oidcServer.Close()

	handler := handlers.NewHealthHandler(nil, oidcServer.URL)

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	// Check Content-Type header
	assert.Equal(t, "application/json", rec.Header().Get("Content-Type"))

	// Verify JSON structure with {"data": {...}} envelope
	var resp map[string]any
	err := json.NewDecoder(rec.Body).Decode(&resp)
	require.NoError(t, err)

	// Response must have "data" envelope per CLAUDE.md format
	assert.Contains(t, resp, "data")

	data, ok := resp["data"].(map[string]any)
	require.True(t, ok, "data should be a map")

	// Required fields inside data
	assert.Contains(t, data, "status")
	assert.Contains(t, data, "version")
	assert.Contains(t, data, "checks")

	// Checks should be a map with oidc and database keys
	checks, ok := data["checks"].(map[string]any)
	assert.True(t, ok, "checks should be a map")
	assert.Contains(t, checks, "database")
	assert.Contains(t, checks, "oidc")
}

func TestHealthHandler_NoAuth(t *testing.T) {
	// Verify endpoint works without authentication header
	oidcServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/.well-known/openid-configuration" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"issuer":"http://test"}`))
		} else {
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer oidcServer.Close()

	handler := handlers.NewHealthHandler(nil, oidcServer.URL)

	// Request with NO Authorization header
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	// Should not return 401 - health endpoint must be public
	assert.NotEqual(t, http.StatusUnauthorized, rec.Code)

	resp := decodeHealthResponse(t, rec)

	// Should still return valid health response structure
	assert.NotEmpty(t, resp.Status)
	assert.NotEmpty(t, resp.Version)
	assert.NotNil(t, resp.Checks)
}

// Note: Integration tests with real database would go in a separate file
// tests/integration/health_test.go and would:
// 1. Spin up YugabyteDB via testcontainers
// 2. Create a real pgxpool.Pool
// 3. Test full health check flow
