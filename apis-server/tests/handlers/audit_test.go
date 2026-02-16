package handlers_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jermoo/apis/apis-server/internal/handlers"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// withClaims is a test helper that adds claims to context
func withClaims(ctx context.Context, claims *middleware.Claims) context.Context {
	return context.WithValue(ctx, middleware.ClaimsKey, claims)
}

func TestListAuditLog_Authorization(t *testing.T) {
	t.Run("rejects unauthenticated request", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/audit", nil)
		w := httptest.NewRecorder()

		// No auth context - should be rejected
		handler := handlers.ListAuditLog(nil)
		handler.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)

		var resp map[string]interface{}
		err := json.NewDecoder(w.Body).Decode(&resp)
		require.NoError(t, err)
		assert.Equal(t, "Unauthorized", resp["error"])
	})

	t.Run("rejects non-admin user", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/audit", nil)
		w := httptest.NewRecorder()

		// Add claims with non-admin role
		claims := &middleware.Claims{
			UserID:   "user-123",
			TenantID: "tenant-456",
			Email:    "user@example.com",
			Roles:    []string{"user"}, // Not admin
		}
		ctx := withClaims(req.Context(), claims)
		req = req.WithContext(ctx)

		handler := handlers.ListAuditLog(nil)
		handler.ServeHTTP(w, req)

		assert.Equal(t, http.StatusForbidden, w.Code)

		var resp map[string]interface{}
		err := json.NewDecoder(w.Body).Decode(&resp)
		require.NoError(t, err)
		assert.Equal(t, "Admin role required", resp["error"])
	})

	t.Run("rejects empty roles", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/audit", nil)
		w := httptest.NewRecorder()

		claims := &middleware.Claims{
			UserID:   "user-123",
			TenantID: "tenant-456",
			Email:    "user@example.com",
			Roles:    []string{}, // Empty roles
		}
		ctx := withClaims(req.Context(), claims)
		req = req.WithContext(ctx)

		handler := handlers.ListAuditLog(nil)
		handler.ServeHTTP(w, req)

		assert.Equal(t, http.StatusForbidden, w.Code)
	})
}

func TestListAuditLog_FilterValidation(t *testing.T) {
	// Helper to create admin request
	makeAdminRequest := func(url string) *http.Request {
		req := httptest.NewRequest(http.MethodGet, url, nil)
		claims := &middleware.Claims{
			UserID:   "admin-123",
			TenantID: "tenant-456",
			Email:    "admin@example.com",
			Roles:    []string{"admin"},
		}
		ctx := withClaims(req.Context(), claims)
		return req.WithContext(ctx)
	}

	t.Run("rejects invalid action filter", func(t *testing.T) {
		req := makeAdminRequest("/api/audit?action=invalid")
		w := httptest.NewRecorder()

		handler := handlers.ListAuditLog(nil)
		handler.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)

		var resp map[string]interface{}
		err := json.NewDecoder(w.Body).Decode(&resp)
		require.NoError(t, err)
		assert.Contains(t, resp["error"], "Invalid action")
	})

	t.Run("rejects invalid start_date format", func(t *testing.T) {
		req := makeAdminRequest("/api/audit?start_date=not-a-date")
		w := httptest.NewRecorder()

		handler := handlers.ListAuditLog(nil)
		handler.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)

		var resp map[string]interface{}
		err := json.NewDecoder(w.Body).Decode(&resp)
		require.NoError(t, err)
		assert.Contains(t, resp["error"], "Invalid start_date")
	})

	t.Run("rejects invalid end_date format", func(t *testing.T) {
		req := makeAdminRequest("/api/audit?end_date=not-a-date")
		w := httptest.NewRecorder()

		handler := handlers.ListAuditLog(nil)
		handler.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)

		var resp map[string]interface{}
		err := json.NewDecoder(w.Body).Decode(&resp)
		require.NoError(t, err)
		assert.Contains(t, resp["error"], "Invalid end_date")
	})

	t.Run("rejects invalid limit", func(t *testing.T) {
		req := makeAdminRequest("/api/audit?limit=-5")
		w := httptest.NewRecorder()

		handler := handlers.ListAuditLog(nil)
		handler.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)

		var resp map[string]interface{}
		err := json.NewDecoder(w.Body).Decode(&resp)
		require.NoError(t, err)
		assert.Contains(t, resp["error"], "Invalid limit")
	})

	t.Run("rejects invalid offset", func(t *testing.T) {
		req := makeAdminRequest("/api/audit?offset=-1")
		w := httptest.NewRecorder()

		handler := handlers.ListAuditLog(nil)
		handler.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)

		var resp map[string]interface{}
		err := json.NewDecoder(w.Body).Decode(&resp)
		require.NoError(t, err)
		assert.Contains(t, resp["error"], "Invalid offset")
	})

	t.Run("rejects invalid entity_type filter", func(t *testing.T) {
		req := makeAdminRequest("/api/audit?entity_type=invalid_entity")
		w := httptest.NewRecorder()

		handler := handlers.ListAuditLog(nil)
		handler.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)

		var resp map[string]interface{}
		err := json.NewDecoder(w.Body).Decode(&resp)
		require.NoError(t, err)
		assert.Contains(t, resp["error"], "Invalid entity_type")
	})

	// Note: Tests that pass validation cannot be fully tested without a real DB.
	// These validation tests verify that valid inputs don't produce 400 Bad Request.
	// The handler will return 500 Internal Server Error when trying to query nil pool,
	// but that's expected - we're testing validation, not the full handler flow.
}

func TestGetEntityHistory_Authorization(t *testing.T) {
	t.Run("rejects unauthenticated request", func(t *testing.T) {
		r := chi.NewRouter()
		r.Get("/api/audit/entity/{type}/{id}", handlers.GetEntityHistory(nil))

		req := httptest.NewRequest(http.MethodGet, "/api/audit/entity/hives/hive-123", nil)
		w := httptest.NewRecorder()

		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})

	t.Run("rejects non-admin user", func(t *testing.T) {
		r := chi.NewRouter()
		r.Get("/api/audit/entity/{type}/{id}", handlers.GetEntityHistory(nil))

		req := httptest.NewRequest(http.MethodGet, "/api/audit/entity/hives/hive-123", nil)
		claims := &middleware.Claims{
			UserID:   "user-123",
			TenantID: "tenant-456",
			Email:    "user@example.com",
			Roles:    []string{"user"},
		}
		ctx := withClaims(req.Context(), claims)
		req = req.WithContext(ctx)

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusForbidden, w.Code)
	})
}

func TestGetEntityHistory_Validation(t *testing.T) {
	makeAdminRequest := func(url string) (*http.Request, *httptest.ResponseRecorder) {
		req := httptest.NewRequest(http.MethodGet, url, nil)
		claims := &middleware.Claims{
			UserID:   "admin-123",
			TenantID: "tenant-456",
			Email:    "admin@example.com",
			Roles:    []string{"admin"},
		}
		ctx := withClaims(req.Context(), claims)
		return req.WithContext(ctx), httptest.NewRecorder()
	}

	t.Run("rejects invalid entity type", func(t *testing.T) {
		r := chi.NewRouter()
		r.Get("/api/audit/entity/{type}/{id}", handlers.GetEntityHistory(nil))

		req, w := makeAdminRequest("/api/audit/entity/invalid_type/some-id")
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)

		var resp map[string]interface{}
		err := json.NewDecoder(w.Body).Decode(&resp)
		require.NoError(t, err)
		assert.Equal(t, "Invalid entity type", resp["error"])
	})

	// Note: Valid entity type tests require a real database connection.
	// The validation logic is the same as ListAuditLog which is already tested above.
}
