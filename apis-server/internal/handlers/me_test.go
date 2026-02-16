package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/stretchr/testify/assert"
)

func TestGetMe_Authenticated(t *testing.T) {
	// Create request with claims and user in context
	claims := &middleware.Claims{
		UserID: "keycloak-user-123",
		OrgID:  "org456",
		Email:  "test@example.com",
		Name:   "Test User",
		Roles:  []string{"owner"},
	}

	user := &storage.User{
		ID:            "internal-id-789",
		TenantID:      "org456",
		ExternalUserID: "keycloak-user-123",
		Email:         "test@example.com",
		Name:          "Test User",
	}

	req := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	ctx := context.WithValue(req.Context(), middleware.ClaimsKey, claims)
	ctx = middleware.WithUser(ctx, user)
	req = req.WithContext(ctx)

	w := httptest.NewRecorder()
	GetMe(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "application/json", w.Header().Get("Content-Type"))
	assert.Contains(t, w.Body.String(), `"id":"internal-id-789"`)
	assert.Contains(t, w.Body.String(), `"user_id":"keycloak-user-123"`)
	assert.Contains(t, w.Body.String(), `"tenant_id":"org456"`)
	assert.Contains(t, w.Body.String(), `"email":"test@example.com"`)
	assert.Contains(t, w.Body.String(), `"name":"Test User"`)
}

func TestGetMe_NotAuthenticated(t *testing.T) {
	// Create request without claims
	req := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	w := httptest.NewRecorder()

	GetMe(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.Contains(t, w.Body.String(), "not authenticated")
}

func TestGetMe_NoUserInContext(t *testing.T) {
	// Create request with claims but no user (simulates middleware failure)
	claims := &middleware.Claims{
		UserID: "keycloak-user-123",
		OrgID:  "org456",
		Email:  "test@example.com",
		Name:   "Test User",
		Roles:  []string{"owner"},
	}

	req := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	ctx := context.WithValue(req.Context(), middleware.ClaimsKey, claims)
	req = req.WithContext(ctx)

	w := httptest.NewRecorder()
	GetMe(w, req)

	assert.Equal(t, http.StatusInternalServerError, w.Code)
	assert.Contains(t, w.Body.String(), "user not found")
}
