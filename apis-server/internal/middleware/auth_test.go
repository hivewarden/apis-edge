package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRespondUnauthorized(t *testing.T) {
	tests := []struct {
		name           string
		message        string
		expectedBody   string
		expectedStatus int
	}{
		{
			name:           "missing authorization header",
			message:        "missing authorization header",
			expectedBody:   `{"code":401,"error":"missing authorization header"}`,
			expectedStatus: http.StatusUnauthorized,
		},
		{
			name:           "invalid token",
			message:        "invalid token",
			expectedBody:   `{"code":401,"error":"invalid token"}`,
			expectedStatus: http.StatusUnauthorized,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			respondUnauthorized(w, tt.message)

			assert.Equal(t, tt.expectedStatus, w.Code)
			assert.Equal(t, "application/json", w.Header().Get("Content-Type"))
			assert.JSONEq(t, tt.expectedBody, w.Body.String())
		})
	}
}

func TestGetClaims(t *testing.T) {
	t.Run("returns nil for context without claims", func(t *testing.T) {
		ctx := context.Background()
		claims := GetClaims(ctx)
		assert.Nil(t, claims)
	})

	t.Run("returns claims from context", func(t *testing.T) {
		expectedClaims := &Claims{
			UserID: "user123",
			OrgID:  "org456",
			Email:  "test@example.com",
			Name:   "Test User",
			Roles:  []string{"admin"},
		}

		ctx := context.WithValue(context.Background(), ClaimsKey, expectedClaims)
		claims := GetClaims(ctx)

		require.NotNil(t, claims)
		assert.Equal(t, expectedClaims.UserID, claims.UserID)
		assert.Equal(t, expectedClaims.OrgID, claims.OrgID)
		assert.Equal(t, expectedClaims.Email, claims.Email)
		assert.Equal(t, expectedClaims.Name, claims.Name)
		assert.Equal(t, expectedClaims.Roles, claims.Roles)
	})
}

func TestRequireClaims(t *testing.T) {
	t.Run("returns claims when present", func(t *testing.T) {
		expectedClaims := &Claims{
			UserID: "user123",
		}

		ctx := context.WithValue(context.Background(), ClaimsKey, expectedClaims)
		claims := RequireClaims(ctx)

		require.NotNil(t, claims)
		assert.Equal(t, expectedClaims.UserID, claims.UserID)
	})

	t.Run("panics when claims not present", func(t *testing.T) {
		ctx := context.Background()

		assert.Panics(t, func() {
			RequireClaims(ctx)
		})
	})
}

func TestAuthMiddleware_MissingHeader(t *testing.T) {
	// Create a dummy issuer and client ID - we won't actually validate tokens
	middleware := AuthMiddleware("http://localhost:8080", "test-client-id")

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.Contains(t, w.Body.String(), "missing authorization header")
}

func TestAuthMiddleware_InvalidHeaderFormat(t *testing.T) {
	middleware := AuthMiddleware("http://localhost:8080", "test-client-id")

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	tests := []struct {
		name   string
		header string
	}{
		{
			name:   "missing bearer prefix",
			header: "token123",
		},
		{
			name:   "wrong prefix",
			header: "Basic token123",
		},
		{
			name:   "only bearer word",
			header: "Bearer",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
			req.Header.Set("Authorization", tt.header)
			w := httptest.NewRecorder()

			handler.ServeHTTP(w, req)

			assert.Equal(t, http.StatusUnauthorized, w.Code)
			assert.Contains(t, w.Body.String(), "invalid")
		})
	}
}

func TestAuthMiddleware_InvalidToken(t *testing.T) {
	middleware := AuthMiddleware("http://localhost:8080", "test-client-id")

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req.Header.Set("Authorization", "Bearer invalid.jwt.token")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	// Should return unauthorized for malformed token
	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestClaims_JSONTags(t *testing.T) {
	claims := &Claims{
		UserID: "user123",
		OrgID:  "org456",
		Email:  "test@example.com",
		Name:   "Test User",
		Roles:  []string{"admin", "viewer"},
	}

	// Verify struct fields are properly initialized
	assert.Equal(t, "user123", claims.UserID)
	assert.Equal(t, "org456", claims.OrgID)
	assert.Equal(t, "test@example.com", claims.Email)
	assert.Equal(t, "Test User", claims.Name)
	assert.Equal(t, []string{"admin", "viewer"}, claims.Roles)
}

func TestValidateRequiredClaims(t *testing.T) {
	t.Run("valid claims pass validation", func(t *testing.T) {
		claims := &ZitadelClaims{
			OrgID: "org123",
		}
		claims.Subject = "user123"

		result := ValidateRequiredClaims(claims)
		assert.Empty(t, result)
	})

	t.Run("missing subject fails validation", func(t *testing.T) {
		claims := &ZitadelClaims{
			OrgID: "org123",
		}
		// Subject is empty

		result := ValidateRequiredClaims(claims)
		assert.Equal(t, "invalid token: missing user identity", result)
	})

	t.Run("missing org_id fails validation", func(t *testing.T) {
		claims := &ZitadelClaims{}
		claims.Subject = "user123"
		// OrgID is empty

		result := ValidateRequiredClaims(claims)
		assert.Equal(t, "invalid token: missing organization", result)
	})

	t.Run("both missing fails with subject error first", func(t *testing.T) {
		claims := &ZitadelClaims{}
		// Both Subject and OrgID are empty

		result := ValidateRequiredClaims(claims)
		// Subject is checked first
		assert.Equal(t, "invalid token: missing user identity", result)
	})
}

func TestNewAuthMiddleware(t *testing.T) {
	t.Run("returns error when issuer is empty", func(t *testing.T) {
		middleware, err := NewAuthMiddleware("", "test-client-id")

		assert.Nil(t, middleware)
		assert.ErrorIs(t, err, ErrMissingIssuer)
	})

	t.Run("returns error when clientID is empty", func(t *testing.T) {
		middleware, err := NewAuthMiddleware("http://localhost:8080", "")

		assert.Nil(t, middleware)
		assert.ErrorIs(t, err, ErrMissingClientID)
	})

	t.Run("returns middleware when both params provided", func(t *testing.T) {
		middleware, err := NewAuthMiddleware("http://localhost:8080", "test-client-id")

		require.NoError(t, err)
		assert.NotNil(t, middleware)
	})

	t.Run("returned middleware handles missing auth header", func(t *testing.T) {
		middleware, err := NewAuthMiddleware("http://localhost:8080", "test-client-id")
		require.NoError(t, err)

		handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))

		req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
		w := httptest.NewRecorder()

		handler.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
		assert.Contains(t, w.Body.String(), "missing authorization header")
	})
}
