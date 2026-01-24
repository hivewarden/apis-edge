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

// HealthResponse matches the expected JSON structure from the health endpoint.
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

func TestHealthHandler_AllHealthy(t *testing.T) {
	// Setup mock HTTP server for Zitadel OIDC discovery
	zitadelServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/.well-known/openid-configuration" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"issuer":"http://test"}`))
		} else {
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer zitadelServer.Close()

	// Create handler with mock pool that returns no error (healthy)
	pool := &mockPool{pingErr: nil}
	handler := handlers.NewHealthHandler(pool, zitadelServer.URL)

	// Create test request
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rec := httptest.NewRecorder()

	// Execute
	handler.ServeHTTP(rec, req)

	// Assert HTTP 200 when all healthy (AC1)
	assert.Equal(t, http.StatusOK, rec.Code, "expected 200 when all services healthy")

	var resp HealthResponse
	err := json.NewDecoder(rec.Body).Decode(&resp)
	require.NoError(t, err, "response should be valid JSON")

	assert.Equal(t, "ok", resp.Status)
	assert.Equal(t, "0.1.0", resp.Version)
	assert.Equal(t, "ok", resp.Checks["database"])
	assert.Equal(t, "ok", resp.Checks["zitadel"])
}

func TestHealthHandler_DatabaseDown(t *testing.T) {
	// Setup mock HTTP server for Zitadel OIDC discovery
	zitadelServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/.well-known/openid-configuration" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"issuer":"http://test"}`))
		} else {
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer zitadelServer.Close()

	// Create handler with mock pool that returns error
	pool := &mockPool{pingErr: fmt.Errorf("connection refused")}
	handler := handlers.NewHealthHandler(pool, zitadelServer.URL)

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	// Assert HTTP 503 when database down (AC2)
	assert.Equal(t, http.StatusServiceUnavailable, rec.Code)

	var resp HealthResponse
	err := json.NewDecoder(rec.Body).Decode(&resp)
	require.NoError(t, err)

	assert.Equal(t, "degraded", resp.Status)
	assert.Contains(t, resp.Checks["database"], "error")
	assert.Equal(t, "ok", resp.Checks["zitadel"])
}

func TestHealthHandler_ZitadelDown(t *testing.T) {
	// Setup mock HTTP server that returns 500
	zitadelServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer zitadelServer.Close()

	handler := handlers.NewHealthHandler(nil, zitadelServer.URL)

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusServiceUnavailable, rec.Code)

	var resp HealthResponse
	err := json.NewDecoder(rec.Body).Decode(&resp)
	require.NoError(t, err)

	assert.Equal(t, "degraded", resp.Status)
	assert.Contains(t, resp.Checks["zitadel"], "error")
}

func TestHealthHandler_ZitadelUnreachable(t *testing.T) {
	// Use an invalid URL that won't connect
	handler := handlers.NewHealthHandler(nil, "http://localhost:1")

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusServiceUnavailable, rec.Code)

	var resp HealthResponse
	err := json.NewDecoder(rec.Body).Decode(&resp)
	require.NoError(t, err)

	assert.Equal(t, "degraded", resp.Status)
	assert.Contains(t, resp.Checks["zitadel"], "error")
}

func TestHealthHandler_ZitadelIssuerEmpty(t *testing.T) {
	// Test handling of empty zitadel issuer configuration
	handler := handlers.NewHealthHandler(nil, "")

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusServiceUnavailable, rec.Code)

	var resp HealthResponse
	err := json.NewDecoder(rec.Body).Decode(&resp)
	require.NoError(t, err)

	assert.Equal(t, "degraded", resp.Status)
	assert.Contains(t, resp.Checks["zitadel"], "error")
	assert.Contains(t, resp.Checks["zitadel"], "not configured")
}

func TestHealthHandler_ResponseFormat(t *testing.T) {
	// Verify the response format matches AC1 requirements
	zitadelServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/.well-known/openid-configuration" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"issuer":"http://test"}`))
		} else {
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer zitadelServer.Close()

	handler := handlers.NewHealthHandler(nil, zitadelServer.URL)

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	// Check Content-Type header
	assert.Equal(t, "application/json", rec.Header().Get("Content-Type"))

	// Verify JSON structure
	var resp map[string]any
	err := json.NewDecoder(rec.Body).Decode(&resp)
	require.NoError(t, err)

	// Required fields
	assert.Contains(t, resp, "status")
	assert.Contains(t, resp, "version")
	assert.Contains(t, resp, "checks")

	// Checks should be a map
	checks, ok := resp["checks"].(map[string]any)
	assert.True(t, ok, "checks should be a map")
	assert.Contains(t, checks, "database")
	assert.Contains(t, checks, "zitadel")
}

func TestHealthHandler_NoAuth(t *testing.T) {
	// Verify endpoint works without authentication header
	zitadelServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/.well-known/openid-configuration" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"issuer":"http://test"}`))
		} else {
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer zitadelServer.Close()

	handler := handlers.NewHealthHandler(nil, zitadelServer.URL)

	// Request with NO Authorization header
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	// Should not return 401 - health endpoint must be public
	assert.NotEqual(t, http.StatusUnauthorized, rec.Code)

	var resp HealthResponse
	err := json.NewDecoder(rec.Body).Decode(&resp)
	require.NoError(t, err)

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
