package handlers_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jermoo/apis/apis-server/internal/handlers"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestListActivity_Authorization(t *testing.T) {
	t.Run("rejects unauthenticated request", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/activity", nil)
		w := httptest.NewRecorder()

		// No auth context - should be rejected
		handler := handlers.ListActivity(nil)
		handler.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)

		var resp map[string]interface{}
		err := json.NewDecoder(w.Body).Decode(&resp)
		require.NoError(t, err)
		assert.Equal(t, "Unauthorized", resp["error"])
	})

	t.Run("does not require admin role (unlike audit log)", func(t *testing.T) {
		// This test verifies design - ListActivity is available to all authenticated users.
		// Unlike ListAuditLog which has AdminOnly middleware, ListActivity does not.
		// The handler code only checks claims != nil, not specific roles.
		//
		// We verify this by examining that with valid claims (non-admin),
		// the handler proceeds past auth checks to validation.
		// If we pass an invalid filter, we should get 400 (not 403).
		req := httptest.NewRequest(http.MethodGet, "/api/activity?entity_type=invalid_type", nil)
		w := httptest.NewRecorder()

		claims := &middleware.Claims{
			UserID:   "user-123",
			TenantID: "tenant-456",
			Email:    "user@example.com",
			Roles:    []string{"user"}, // Regular user, not admin
		}
		ctx := context.WithValue(req.Context(), middleware.ClaimsKey, claims)
		req = req.WithContext(ctx)

		handler := handlers.ListActivity(nil)
		handler.ServeHTTP(w, req)

		// Should get 400 for invalid filter, NOT 403 Forbidden
		// This proves the handler accepts non-admin users
		assert.Equal(t, http.StatusBadRequest, w.Code)
	})
}

func TestListActivity_FilterValidation(t *testing.T) {
	// Helper to create authenticated request
	makeAuthRequest := func(url string) *http.Request {
		req := httptest.NewRequest(http.MethodGet, url, nil)
		claims := &middleware.Claims{
			UserID:   "user-123",
			TenantID: "tenant-456",
			Email:    "user@example.com",
			Roles:    []string{"user"},
		}
		ctx := context.WithValue(req.Context(), middleware.ClaimsKey, claims)
		return req.WithContext(ctx)
	}

	t.Run("rejects invalid entity type", func(t *testing.T) {
		req := makeAuthRequest("/api/activity?entity_type=invalid_entity")
		w := httptest.NewRecorder()

		handler := handlers.ListActivity(nil)
		handler.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)

		var resp map[string]interface{}
		err := json.NewDecoder(w.Body).Decode(&resp)
		require.NoError(t, err)
		assert.Contains(t, resp["error"], "Invalid entity_type")
	})

	t.Run("rejects invalid limit (negative)", func(t *testing.T) {
		req := makeAuthRequest("/api/activity?limit=-5")
		w := httptest.NewRecorder()

		handler := handlers.ListActivity(nil)
		handler.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)

		var resp map[string]interface{}
		err := json.NewDecoder(w.Body).Decode(&resp)
		require.NoError(t, err)
		assert.Contains(t, resp["error"], "Invalid limit")
	})

	t.Run("rejects non-numeric limit", func(t *testing.T) {
		req := makeAuthRequest("/api/activity?limit=abc")
		w := httptest.NewRecorder()

		handler := handlers.ListActivity(nil)
		handler.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)

		var resp map[string]interface{}
		err := json.NewDecoder(w.Body).Decode(&resp)
		require.NoError(t, err)
		assert.Contains(t, resp["error"], "Invalid limit")
	})

	t.Run("rejects invalid entity type in comma-separated list", func(t *testing.T) {
		req := makeAuthRequest("/api/activity?entity_type=inspections,invalid_type,hives")
		w := httptest.NewRecorder()

		handler := handlers.ListActivity(nil)
		handler.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)

		var resp map[string]interface{}
		err := json.NewDecoder(w.Body).Decode(&resp)
		require.NoError(t, err)
		assert.Contains(t, resp["error"], "Invalid entity_type")
	})

	// Tests that pass validation cannot be fully tested without a real DB.
	// Valid inputs proceed to the database query which panics with nil pool.
	// Integration tests with a real database are needed for full coverage.
}

// TestValidEntityTypes documents the valid entity types accepted by the API
func TestListActivity_ValidEntityTypes(t *testing.T) {
	validTypes := []string{
		"hives",
		"inspections",
		"treatments",
		"feedings",
		"harvests",
		"sites",
		"units",
		"users",
		"clips",
	}

	t.Run("documents valid entity types", func(t *testing.T) {
		for _, et := range validTypes {
			t.Logf("Valid entity_type: %s", et)
		}
		assert.Equal(t, 9, len(validTypes), "Expected 9 valid entity types")
	})
}
