package middleware_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/go-jose/go-jose/v4"
	"github.com/go-jose/go-jose/v4/jwt"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/jermoo/apis/apis-server/internal/config"
	"github.com/jermoo/apis/apis-server/internal/middleware"
)

const (
	testSecret   = "this-is-a-test-secret-at-least-32-chars"
	testTenantID = "00000000-0000-0000-0000-000000000000"
	testUserID   = "user-123-uuid"
	testEmail    = "test@example.com"
	testName     = "Test User"
	testRole     = "admin"
)

// setupAuthConfig initializes auth config for testing.
// It returns a cleanup function that resets the config.
func setupAuthConfig(t *testing.T, mode string, disableAuth bool) func() {
	t.Helper()

	// Reset any existing config
	config.ResetAuthConfig()

	// Set environment variables
	os.Setenv("AUTH_MODE", mode)
	os.Setenv("JWT_SECRET", testSecret)

	if disableAuth {
		os.Setenv("DISABLE_AUTH", "true")
	} else {
		os.Setenv("DISABLE_AUTH", "false")
	}

	if mode == "keycloak" {
		os.Setenv("KEYCLOAK_ISSUER", "http://localhost:8080")
		os.Setenv("KEYCLOAK_CLIENT_ID", "test-client-id")
	}

	// Initialize config
	err := config.InitAuthConfig()
	require.NoError(t, err, "failed to initialize auth config")

	// Return cleanup function
	return func() {
		os.Unsetenv("AUTH_MODE")
		os.Unsetenv("JWT_SECRET")
		os.Unsetenv("DISABLE_AUTH")
		os.Unsetenv("KEYCLOAK_ISSUER")
		os.Unsetenv("KEYCLOAK_CLIENT_ID")
		config.ResetAuthConfig()
	}
}

// generateTestJWT creates a signed JWT for testing.
func generateTestJWT(t *testing.T, claims map[string]interface{}, secret string) string {
	t.Helper()

	signer, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.HS256, Key: []byte(secret)}, nil)
	require.NoError(t, err)

	builder := jwt.Signed(signer).Claims(claims)
	token, err := builder.Serialize()
	require.NoError(t, err)

	return token
}

// createValidClaims creates a claims map with all required fields.
func createValidClaims(exp time.Time) map[string]interface{} {
	return map[string]interface{}{
		"sub":       testUserID,
		"tenant_id": testTenantID,
		"email":     testEmail,
		"name":      testName,
		"role":      testRole,
		"iat":       time.Now().Unix(),
		"exp":       exp.Unix(),
	}
}

// testHandler is a simple handler that returns the claims from context.
func testHandler(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	if claims == nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "no claims in context"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"user_id":   claims.UserID,
		"org_id":    claims.OrgID,
		"tenant_id": claims.TenantID,
		"email":     claims.Email,
		"name":      claims.Name,
		"role":      claims.Role,
		"roles":     claims.Roles,
	})
}

func TestLocalAuthMiddleware_ValidToken_Cookie(t *testing.T) {
	cleanup := setupAuthConfig(t, "local", false)
	defer cleanup()

	// Create a valid token
	exp := time.Now().Add(time.Hour)
	claims := createValidClaims(exp)
	token := generateTestJWT(t, claims, testSecret)

	// Create request with cookie
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.AddCookie(&http.Cookie{Name: "apis_session", Value: token})

	// Apply middleware
	handler := middleware.LocalAuthMiddleware()(http.HandlerFunc(testHandler))
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	// Verify response
	require.Equal(t, http.StatusOK, rr.Code)

	var response map[string]interface{}
	err := json.NewDecoder(rr.Body).Decode(&response)
	require.NoError(t, err)

	assert.Equal(t, testUserID, response["user_id"])
	assert.Equal(t, testTenantID, response["org_id"])
	assert.Equal(t, testTenantID, response["tenant_id"])
	assert.Equal(t, testEmail, response["email"])
	assert.Equal(t, testName, response["name"])
	assert.Equal(t, testRole, response["role"])
}

func TestLocalAuthMiddleware_ValidToken_Header(t *testing.T) {
	cleanup := setupAuthConfig(t, "local", false)
	defer cleanup()

	// Create a valid token
	exp := time.Now().Add(time.Hour)
	claims := createValidClaims(exp)
	token := generateTestJWT(t, claims, testSecret)

	// Create request with Authorization header
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	// Apply middleware
	handler := middleware.LocalAuthMiddleware()(http.HandlerFunc(testHandler))
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	// Verify response
	require.Equal(t, http.StatusOK, rr.Code)

	var response map[string]interface{}
	err := json.NewDecoder(rr.Body).Decode(&response)
	require.NoError(t, err)

	assert.Equal(t, testUserID, response["user_id"])
	assert.Equal(t, testTenantID, response["tenant_id"])
}

func TestLocalAuthMiddleware_CookiePriorityOverHeader(t *testing.T) {
	cleanup := setupAuthConfig(t, "local", false)
	defer cleanup()

	// Create two different tokens
	exp := time.Now().Add(time.Hour)

	cookieClaims := createValidClaims(exp)
	cookieClaims["sub"] = "cookie-user"
	cookieToken := generateTestJWT(t, cookieClaims, testSecret)

	headerClaims := createValidClaims(exp)
	headerClaims["sub"] = "header-user"
	headerToken := generateTestJWT(t, headerClaims, testSecret)

	// Create request with both cookie and header
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.AddCookie(&http.Cookie{Name: "apis_session", Value: cookieToken})
	req.Header.Set("Authorization", "Bearer "+headerToken)

	// Apply middleware
	handler := middleware.LocalAuthMiddleware()(http.HandlerFunc(testHandler))
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	// Verify cookie takes priority
	require.Equal(t, http.StatusOK, rr.Code)

	var response map[string]interface{}
	err := json.NewDecoder(rr.Body).Decode(&response)
	require.NoError(t, err)

	assert.Equal(t, "cookie-user", response["user_id"])
}

func TestLocalAuthMiddleware_MissingToken(t *testing.T) {
	cleanup := setupAuthConfig(t, "local", false)
	defer cleanup()

	// Create request without token
	req := httptest.NewRequest(http.MethodGet, "/test", nil)

	// Apply middleware
	handler := middleware.LocalAuthMiddleware()(http.HandlerFunc(testHandler))
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	// Verify 401 response
	require.Equal(t, http.StatusUnauthorized, rr.Code)

	var response map[string]interface{}
	err := json.NewDecoder(rr.Body).Decode(&response)
	require.NoError(t, err)

	assert.Equal(t, "Authentication required", response["error"])
	assert.Equal(t, float64(401), response["code"])
}

func TestLocalAuthMiddleware_InvalidToken(t *testing.T) {
	cleanup := setupAuthConfig(t, "local", false)
	defer cleanup()

	// Create request with invalid token
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer invalid-token")

	// Apply middleware
	handler := middleware.LocalAuthMiddleware()(http.HandlerFunc(testHandler))
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	// Verify 401 response
	require.Equal(t, http.StatusUnauthorized, rr.Code)

	var response map[string]interface{}
	err := json.NewDecoder(rr.Body).Decode(&response)
	require.NoError(t, err)

	assert.Equal(t, "Invalid token", response["error"])
}

func TestLocalAuthMiddleware_ExpiredToken(t *testing.T) {
	cleanup := setupAuthConfig(t, "local", false)
	defer cleanup()

	// Create an expired token
	exp := time.Now().Add(-time.Hour)
	claims := createValidClaims(exp)
	token := generateTestJWT(t, claims, testSecret)

	// Create request with expired token
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	// Apply middleware
	handler := middleware.LocalAuthMiddleware()(http.HandlerFunc(testHandler))
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	// Verify 401 response
	require.Equal(t, http.StatusUnauthorized, rr.Code)

	var response map[string]interface{}
	err := json.NewDecoder(rr.Body).Decode(&response)
	require.NoError(t, err)

	assert.Equal(t, "Token expired", response["error"])
}

func TestLocalAuthMiddleware_WrongSecret(t *testing.T) {
	cleanup := setupAuthConfig(t, "local", false)
	defer cleanup()

	// Create token with different secret
	exp := time.Now().Add(time.Hour)
	claims := createValidClaims(exp)
	token := generateTestJWT(t, claims, "different-secret-at-least-32-chars!")

	// Create request
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	// Apply middleware
	handler := middleware.LocalAuthMiddleware()(http.HandlerFunc(testHandler))
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	// Verify 401 response
	require.Equal(t, http.StatusUnauthorized, rr.Code)

	var response map[string]interface{}
	err := json.NewDecoder(rr.Body).Decode(&response)
	require.NoError(t, err)

	assert.Equal(t, "Invalid token", response["error"])
}

func TestDevAuthMiddleware_InjectsMockClaims(t *testing.T) {
	// Create request
	req := httptest.NewRequest(http.MethodGet, "/test", nil)

	// Apply dev middleware
	handler := middleware.DevAuthMiddleware()(http.HandlerFunc(testHandler))
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	// Verify response
	require.Equal(t, http.StatusOK, rr.Code)

	var response map[string]interface{}
	err := json.NewDecoder(rr.Body).Decode(&response)
	require.NoError(t, err)

	// Dev middleware should inject mock claims
	assert.Equal(t, "dev-user-001", response["user_id"])
	assert.Equal(t, "00000000-0000-0000-0000-000000000000", response["org_id"])
	assert.Equal(t, "00000000-0000-0000-0000-000000000000", response["tenant_id"])
	assert.Equal(t, "dev@apis.local", response["email"])
	assert.Equal(t, "Dev User", response["name"])
	assert.Equal(t, "admin", response["role"])
}

func TestNewModeAwareAuthMiddleware_LocalMode(t *testing.T) {
	cleanup := setupAuthConfig(t, "local", false)
	defer cleanup()

	// Create mode-aware middleware
	mw, err := middleware.NewModeAwareAuthMiddleware("", "", "")
	require.NoError(t, err)
	require.NotNil(t, mw)

	// Create a valid token
	exp := time.Now().Add(time.Hour)
	claims := createValidClaims(exp)
	token := generateTestJWT(t, claims, testSecret)

	// Create request with token
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	// Apply middleware
	handler := mw(http.HandlerFunc(testHandler))
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	// Verify success
	require.Equal(t, http.StatusOK, rr.Code)

	var response map[string]interface{}
	err = json.NewDecoder(rr.Body).Decode(&response)
	require.NoError(t, err)

	assert.Equal(t, testUserID, response["user_id"])
}

func TestNewModeAwareAuthMiddleware_DisabledAuth(t *testing.T) {
	cleanup := setupAuthConfig(t, "local", true)
	defer cleanup()

	// Create mode-aware middleware
	mw, err := middleware.NewModeAwareAuthMiddleware("", "", "")
	require.NoError(t, err)
	require.NotNil(t, mw)

	// Create request without any token
	req := httptest.NewRequest(http.MethodGet, "/test", nil)

	// Apply middleware
	handler := mw(http.HandlerFunc(testHandler))
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	// Verify success (dev mode bypasses auth)
	require.Equal(t, http.StatusOK, rr.Code)

	var response map[string]interface{}
	err = json.NewDecoder(rr.Body).Decode(&response)
	require.NoError(t, err)

	// Should have dev mock claims
	assert.Equal(t, "dev-user-001", response["user_id"])
}

func TestGetClaims_NoClaims(t *testing.T) {
	ctx := context.Background()
	claims := middleware.GetClaims(ctx)
	assert.Nil(t, claims)
}

func TestGetClaims_WithClaims(t *testing.T) {
	expectedClaims := &middleware.Claims{
		UserID:   "test-user",
		OrgID:    "test-org",
		TenantID: "test-org",
		Email:    "test@example.com",
		Name:     "Test User",
		Role:     "admin",
		Roles:    []string{"admin"},
	}

	ctx := context.WithValue(context.Background(), middleware.ClaimsKey, expectedClaims)
	claims := middleware.GetClaims(ctx)

	require.NotNil(t, claims)
	assert.Equal(t, expectedClaims.UserID, claims.UserID)
	assert.Equal(t, expectedClaims.TenantID, claims.TenantID)
}

func TestRequireClaims_Panics(t *testing.T) {
	ctx := context.Background()

	assert.Panics(t, func() {
		middleware.RequireClaims(ctx)
	})
}

func TestRequireClaims_ReturnsClaims(t *testing.T) {
	expectedClaims := &middleware.Claims{
		UserID: "test-user",
	}

	ctx := context.WithValue(context.Background(), middleware.ClaimsKey, expectedClaims)

	assert.NotPanics(t, func() {
		claims := middleware.RequireClaims(ctx)
		assert.Equal(t, expectedClaims.UserID, claims.UserID)
	})
}

// TestClaimsBackwardCompatibility verifies that OrgID and TenantID are both populated.
func TestClaimsBackwardCompatibility(t *testing.T) {
	cleanup := setupAuthConfig(t, "local", false)
	defer cleanup()

	// Create a token
	exp := time.Now().Add(time.Hour)
	claims := createValidClaims(exp)
	token := generateTestJWT(t, claims, testSecret)

	// Create request
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	var capturedClaims *middleware.Claims
	captureHandler := func(w http.ResponseWriter, r *http.Request) {
		capturedClaims = middleware.GetClaims(r.Context())
		w.WriteHeader(http.StatusOK)
	}

	// Apply middleware
	handler := middleware.LocalAuthMiddleware()(http.HandlerFunc(captureHandler))
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)
	require.NotNil(t, capturedClaims)

	// Both OrgID and TenantID should be populated for backward compatibility
	assert.Equal(t, testTenantID, capturedClaims.OrgID, "OrgID should be populated for backward compatibility")
	assert.Equal(t, testTenantID, capturedClaims.TenantID, "TenantID should be populated")
	assert.Equal(t, capturedClaims.OrgID, capturedClaims.TenantID, "OrgID and TenantID should match")

	// Role and Roles should both be populated
	assert.Equal(t, testRole, capturedClaims.Role, "Role should be populated")
	assert.Contains(t, capturedClaims.Roles, testRole, "Roles array should contain the role")
}
