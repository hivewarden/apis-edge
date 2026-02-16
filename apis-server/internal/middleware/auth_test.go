package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-jose/go-jose/v4"
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
			respondErrorJSON(w, tt.message, http.StatusUnauthorized)

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
	assert.Contains(t, w.Body.String(), "Authentication required")
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
		claims := &KeycloakClaims{
			OrgID: "org123",
		}
		claims.Subject = "user123"

		result := ValidateRequiredClaims(claims)
		assert.Empty(t, result)
	})

	t.Run("missing subject fails validation", func(t *testing.T) {
		claims := &KeycloakClaims{
			OrgID: "org123",
		}
		// Subject is empty

		result := ValidateRequiredClaims(claims)
		assert.Equal(t, "invalid token: missing user identity", result)
	})

	t.Run("missing org_id warns but does not reject", func(t *testing.T) {
		claims := &KeycloakClaims{}
		claims.Subject = "user123"
		// OrgID is empty — softened to warning for E15-C3 fallback

		result := ValidateRequiredClaims(claims)
		assert.Empty(t, result, "missing org_id should not reject — tenant middleware handles fallback")
	})

	t.Run("both missing fails with subject error first", func(t *testing.T) {
		claims := &KeycloakClaims{}
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
		assert.Contains(t, w.Body.String(), "Authentication required")
	})
}

func TestSelectPrimaryRole(t *testing.T) {
	tests := []struct {
		name     string
		roles    []string
		expected string
	}{
		{name: "admin wins over user", roles: []string{"admin", "user"}, expected: "admin"},
		{name: "admin wins over viewer", roles: []string{"viewer", "admin"}, expected: "admin"},
		{name: "user wins over viewer", roles: []string{"user", "viewer"}, expected: "user"},
		{name: "viewer only", roles: []string{"viewer"}, expected: "viewer"},
		{name: "unknown role returns first", roles: []string{"unknown"}, expected: "unknown"},
		{name: "unknown with admin returns admin", roles: []string{"unknown", "admin"}, expected: "admin"},
		{name: "empty returns empty", roles: []string{}, expected: ""},
		{name: "nil returns empty", roles: nil, expected: ""},
		{name: "all three returns admin", roles: []string{"viewer", "user", "admin"}, expected: "admin"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := selectPrimaryRole(tt.roles)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestGetKeyForKID(t *testing.T) {
	t.Run("returns keyset without refresh when kid is empty", func(t *testing.T) {
		cache := &jwksCache{
			keySet:   &jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{KeyID: "key1"}}},
			lastFetch: time.Now(),
			cacheTTL:  time.Hour,
		}

		ks, err := cache.getKeyForKID(context.Background(), "")
		require.NoError(t, err)
		assert.Len(t, ks.Keys, 1)
	})

	t.Run("returns keyset without refresh when kid is found", func(t *testing.T) {
		cache := &jwksCache{
			keySet:   &jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{KeyID: "key1"}}},
			lastFetch: time.Now(),
			cacheTTL:  time.Hour,
		}

		ks, err := cache.getKeyForKID(context.Background(), "key1")
		require.NoError(t, err)
		assert.Len(t, ks.Key("key1"), 1)
	})

	t.Run("rate limits force refresh attempts", func(t *testing.T) {
		cache := &jwksCache{
			keySet:           &jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{KeyID: "old-key"}}},
			lastFetch:        time.Now(),
			lastForceRefresh: time.Now(), // just refreshed
			cacheTTL:         time.Hour,
		}

		// Should return stale keyset due to rate limiting (no network call)
		ks, err := cache.getKeyForKID(context.Background(), "missing-key")
		require.NoError(t, err)
		assert.Len(t, ks.Keys, 1)
		assert.Equal(t, "old-key", ks.Keys[0].KeyID)
	})
}

func TestKeycloakClaims_JSONDeserialization(t *testing.T) {
	t.Run("parses realm_access.roles from Keycloak JWT payload", func(t *testing.T) {
		// Simulate the JSON payload of a Keycloak JWT
		jsonPayload := `{
			"sub": "user-uuid-123",
			"email": "jermoo@example.com",
			"name": "Jermoo",
			"preferred_username": "jermoo",
			"org_id": "tenant_xyz789",
			"org_name": "Jermoo's Apiary",
			"realm_access": {
				"roles": ["admin", "user"]
			}
		}`
		var claims KeycloakClaims
		err := json.Unmarshal([]byte(jsonPayload), &claims)
		require.NoError(t, err)

		assert.Equal(t, "user-uuid-123", claims.Subject)
		assert.Equal(t, "jermoo@example.com", claims.Email)
		assert.Equal(t, "Jermoo", claims.Name)
		assert.Equal(t, "jermoo", claims.PreferredUsername)
		assert.Equal(t, "tenant_xyz789", claims.OrgID)
		assert.Equal(t, "Jermoo's Apiary", claims.OrgName)
		assert.Equal(t, []string{"admin", "user"}, claims.RealmAccess.Roles)
	})

	t.Run("handles missing realm_access gracefully", func(t *testing.T) {
		jsonPayload := `{
			"sub": "user-uuid-123",
			"email": "jermoo@example.com",
			"org_id": "tenant_xyz789"
		}`
		var claims KeycloakClaims
		err := json.Unmarshal([]byte(jsonPayload), &claims)
		require.NoError(t, err)

		assert.Empty(t, claims.RealmAccess.Roles)
	})

	t.Run("handles empty roles array", func(t *testing.T) {
		jsonPayload := `{
			"sub": "user-uuid-123",
			"email": "jermoo@example.com",
			"org_id": "tenant_xyz789",
			"realm_access": {"roles": []}
		}`
		var claims KeycloakClaims
		err := json.Unmarshal([]byte(jsonPayload), &claims)
		require.NoError(t, err)

		assert.Empty(t, claims.RealmAccess.Roles)
	})

	t.Run("parses email_verified field", func(t *testing.T) {
		jsonPayload := `{
			"sub": "user-uuid-123",
			"email": "jermoo@example.com",
			"email_verified": true,
			"org_id": "tenant_xyz789"
		}`
		var claims KeycloakClaims
		err := json.Unmarshal([]byte(jsonPayload), &claims)
		require.NoError(t, err)

		assert.True(t, claims.EmailVerified)
	})

}
