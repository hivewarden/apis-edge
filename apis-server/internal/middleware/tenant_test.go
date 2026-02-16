package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/jermoo/apis/apis-server/internal/storage"
)

func TestGetUser(t *testing.T) {
	t.Run("returns nil for context without user", func(t *testing.T) {
		ctx := context.Background()
		user := GetUser(ctx)
		assert.Nil(t, user)
	})

	t.Run("returns user from context", func(t *testing.T) {
		expectedUser := &storage.User{
			ID:            "user-123",
			TenantID:      "tenant-456",
			ExternalUserID: "keycloak-sub-789", // External OIDC user ID (Keycloak sub claim)
			Email:         "test@example.com",
			Name:          "Test User",
			CreatedAt:     time.Now(),
		}

		ctx := context.WithValue(context.Background(), UserKey, expectedUser)
		user := GetUser(ctx)

		require.NotNil(t, user)
		assert.Equal(t, expectedUser.ID, user.ID)
		assert.Equal(t, expectedUser.TenantID, user.TenantID)
		assert.Equal(t, expectedUser.ExternalUserID, user.ExternalUserID)
		assert.Equal(t, expectedUser.Email, user.Email)
		assert.Equal(t, expectedUser.Name, user.Name)
	})

	t.Run("returns nil for wrong type in context", func(t *testing.T) {
		ctx := context.WithValue(context.Background(), UserKey, "not a user")
		user := GetUser(ctx)
		assert.Nil(t, user)
	})
}

func TestWithUser(t *testing.T) {
	t.Run("stores user in context", func(t *testing.T) {
		expectedUser := &storage.User{
			ID:       "user-123",
			TenantID: "tenant-456",
			Email:    "test@example.com",
		}

		ctx := WithUser(context.Background(), expectedUser)

		// Retrieve the user from context
		storedValue := ctx.Value(UserKey)
		require.NotNil(t, storedValue)

		storedUser, ok := storedValue.(*storage.User)
		require.True(t, ok)
		assert.Equal(t, expectedUser.ID, storedUser.ID)
		assert.Equal(t, expectedUser.TenantID, storedUser.TenantID)
		assert.Equal(t, expectedUser.Email, storedUser.Email)
	})

	t.Run("stores nil user", func(t *testing.T) {
		ctx := WithUser(context.Background(), nil)

		storedValue := ctx.Value(UserKey)
		// Value should be set but nil
		assert.Nil(t, storedValue)
	})
}

func TestRespondTenantError(t *testing.T) {
	tests := []struct {
		name           string
		message        string
		code           int
		expectedBody   string
		expectedStatus int
	}{
		{
			name:           "unauthorized error",
			message:        "authentication required",
			code:           http.StatusUnauthorized,
			expectedBody:   `{"code":401,"error":"authentication required"}`,
			expectedStatus: http.StatusUnauthorized,
		},
		{
			name:           "service unavailable error",
			message:        "database unavailable",
			code:           http.StatusServiceUnavailable,
			expectedBody:   `{"code":503,"error":"database unavailable"}`,
			expectedStatus: http.StatusServiceUnavailable,
		},
		{
			name:           "internal server error",
			message:        "failed to set tenant context",
			code:           http.StatusInternalServerError,
			expectedBody:   `{"code":500,"error":"failed to set tenant context"}`,
			expectedStatus: http.StatusInternalServerError,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			respondErrorJSON(w, tt.message, tt.code)

			assert.Equal(t, tt.expectedStatus, w.Code)
			assert.Equal(t, "application/json", w.Header().Get("Content-Type"))
			assert.JSONEq(t, tt.expectedBody, w.Body.String())
		})
	}
}

func TestTenantMiddleware_NoClaims(t *testing.T) {
	// TenantMiddleware should return 401 if no claims are in context
	// This tests the case where AuthMiddleware wasn't applied first

	// We can't easily create a real pgxpool.Pool in unit tests,
	// but we can verify the middleware checks for claims first
	// before trying to access the database.

	t.Run("returns 401 when no claims in context", func(t *testing.T) {
		// Create middleware with nil pool - it should fail before using pool
		middleware := TenantMiddleware(nil)

		handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))

		req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
		w := httptest.NewRecorder()

		handler.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
		assert.Contains(t, w.Body.String(), "authentication required")
		assert.Equal(t, "application/json", w.Header().Get("Content-Type"))
	})
}

func TestUserKey_Uniqueness(t *testing.T) {
	// Verify that UserKey is a unique type that won't collide with other context keys
	t.Run("UserKey is distinct from string keys", func(t *testing.T) {
		user := &storage.User{ID: "test-user"}

		// Set user with our typed key
		ctx := context.WithValue(context.Background(), UserKey, user)

		// Try to retrieve with a string key - should return nil
		stringValue := ctx.Value("user")
		assert.Nil(t, stringValue)

		// Our typed key should still work
		typedValue := ctx.Value(UserKey)
		assert.NotNil(t, typedValue)
	})
}
