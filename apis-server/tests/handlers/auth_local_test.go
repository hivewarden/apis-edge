// Package handlers_test contains unit tests for the APIS server HTTP handlers.
package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jermoo/apis/apis-server/internal/auth"
	"github.com/jermoo/apis/apis-server/internal/config"
	"github.com/jermoo/apis/apis-server/internal/handlers"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// testSetupAuthConfig sets up the auth configuration for tests.
// It resets any existing config and initializes with local mode.
func testSetupAuthConfig(t *testing.T) {
	t.Helper()
	config.ResetAuthConfig()
	os.Setenv("AUTH_MODE", "local")
	os.Setenv("JWT_SECRET", "test-secret-key-must-be-at-least-32-characters-long")
	if err := config.InitAuthConfig(); err != nil {
		t.Fatalf("failed to init auth config: %v", err)
	}
}

// TestLogin_ValidationErrors tests the login handler validation logic.
func TestLogin_ValidationErrors(t *testing.T) {
	testSetupAuthConfig(t)
	defer config.ResetAuthConfig()

	rateLimiters := handlers.NewLoginRateLimiters()
	defer rateLimiters.Stop()

	tests := []struct {
		name           string
		requestBody    string
		expectedStatus int
		expectedError  string
	}{
		{
			name:           "empty email",
			requestBody:    `{"email":"","password":"password123"}`,
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Email is required",
		},
		{
			name:           "missing email",
			requestBody:    `{"password":"password123"}`,
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Email is required",
		},
		{
			name:           "invalid email format",
			requestBody:    `{"email":"not-an-email","password":"password123"}`,
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Invalid email format",
		},
		{
			name:           "empty password",
			requestBody:    `{"email":"test@example.com","password":""}`,
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Password is required",
		},
		{
			name:           "missing password",
			requestBody:    `{"email":"test@example.com"}`,
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Password is required",
		},
		{
			name:           "invalid JSON",
			requestBody:    `{invalid json}`,
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Invalid request body",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create handler with nil pool (will fail after validation if validation passes)
			handler := handlers.Login(nil, rateLimiters)

			req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBufferString(tt.requestBody))
			req.Header.Set("Content-Type", "application/json")
			rr := httptest.NewRecorder()

			handler.ServeHTTP(rr, req)

			if rr.Code != tt.expectedStatus {
				t.Errorf("expected status %d, got %d", tt.expectedStatus, rr.Code)
			}

			var response map[string]interface{}
			if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
				t.Fatalf("failed to parse response: %v", err)
			}

			if errMsg, ok := response["error"].(string); ok {
				if errMsg != tt.expectedError {
					t.Errorf("expected error %q, got %q", tt.expectedError, errMsg)
				}
			} else {
				t.Errorf("expected error message in response")
			}
		})
	}
}

// TestLogin_NotLocalMode tests that login returns 403 when not in local mode.
func TestLogin_NotLocalMode(t *testing.T) {
	config.ResetAuthConfig()
	os.Setenv("AUTH_MODE", "keycloak")
	os.Setenv("JWT_SECRET", "test-secret-key-must-be-at-least-32-characters-long")
	os.Setenv("KEYCLOAK_ISSUER", "http://localhost:8080")
	os.Setenv("KEYCLOAK_CLIENT_ID", "test-client-id")
	if err := config.InitAuthConfig(); err != nil {
		t.Fatalf("failed to init auth config: %v", err)
	}
	defer config.ResetAuthConfig()

	rateLimiters := handlers.NewLoginRateLimiters()
	defer rateLimiters.Stop()
	handler := handlers.Login(nil, rateLimiters)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/login",
		bytes.NewBufferString(`{"email":"test@example.com","password":"password123"}`))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("expected status %d, got %d", http.StatusForbidden, rr.Code)
	}

	var response map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	expectedError := "Login is only available in local authentication mode"
	if errMsg, ok := response["error"].(string); !ok || errMsg != expectedError {
		t.Errorf("expected error %q, got %q", expectedError, response["error"])
	}
}

// TestLogout tests the logout handler.
func TestLogout(t *testing.T) {
	handler := handlers.Logout()

	req := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	// Check status
	if rr.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d", http.StatusOK, rr.Code)
	}

	// Check response body
	var response map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}
	if response["message"] != "Logged out successfully" {
		t.Errorf("expected success message, got %v", response["message"])
	}

	// Check that cookie is cleared
	cookies := rr.Result().Cookies()
	var sessionCookie *http.Cookie
	for _, c := range cookies {
		if c.Name == "apis_session" {
			sessionCookie = c
			break
		}
	}

	if sessionCookie == nil {
		t.Error("expected apis_session cookie in response")
	} else {
		if sessionCookie.MaxAge != -1 {
			t.Errorf("expected MaxAge=-1 to delete cookie, got %d", sessionCookie.MaxAge)
		}
		if sessionCookie.Value != "" {
			t.Errorf("expected empty cookie value, got %q", sessionCookie.Value)
		}
	}
}

// TestMe_WithClaims tests the /api/auth/me endpoint with valid claims.
func TestMe_WithClaims(t *testing.T) {
	handler := handlers.Me()

	req := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)

	// Add mock claims to context
	claims := &middleware.Claims{
		UserID:   "user-123",
		Email:    "test@example.com",
		Name:     "Test User",
		Role:     "admin",
		TenantID: "tenant-456",
	}
	ctx := context.WithValue(req.Context(), middleware.ClaimsKey, claims)
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	// Check status
	if rr.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d", http.StatusOK, rr.Code)
	}

	// Check response
	var response struct {
		User struct {
			ID       string `json:"id"`
			Email    string `json:"email"`
			Name     string `json:"name"`
			Role     string `json:"role"`
			TenantID string `json:"tenant_id"`
		} `json:"user"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if response.User.ID != "user-123" {
		t.Errorf("expected user ID %q, got %q", "user-123", response.User.ID)
	}
	if response.User.Email != "test@example.com" {
		t.Errorf("expected email %q, got %q", "test@example.com", response.User.Email)
	}
	if response.User.Name != "Test User" {
		t.Errorf("expected name %q, got %q", "Test User", response.User.Name)
	}
	if response.User.Role != "admin" {
		t.Errorf("expected role %q, got %q", "admin", response.User.Role)
	}
	if response.User.TenantID != "tenant-456" {
		t.Errorf("expected tenant_id %q, got %q", "tenant-456", response.User.TenantID)
	}
}

// TestMe_NoClaims tests that /api/auth/me returns 401 without claims.
func TestMe_NoClaims(t *testing.T) {
	handler := handlers.Me()

	req := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("expected status %d, got %d", http.StatusUnauthorized, rr.Code)
	}
}

// TestLogin_NilDatabase tests that login handles nil database gracefully.
func TestLogin_NilDatabase(t *testing.T) {
	testSetupAuthConfig(t)
	defer config.ResetAuthConfig()

	rateLimiters := handlers.NewLoginRateLimiters()
	defer rateLimiters.Stop()
	handler := handlers.Login(nil, rateLimiters)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/login",
		bytes.NewBufferString(`{"email":"test@example.com","password":"password123"}`))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("expected status %d, got %d", http.StatusInternalServerError, rr.Code)
	}

	var response map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	expectedError := "Database not configured"
	if errMsg, ok := response["error"].(string); !ok || errMsg != expectedError {
		t.Errorf("expected error %q, got %q", expectedError, response["error"])
	}
}

// TestPasswordVerification tests the auth.VerifyPassword function.
func TestPasswordVerification(t *testing.T) {
	password := "testpassword123"

	// Hash the password
	hash, err := auth.HashPassword(password)
	if err != nil {
		t.Fatalf("failed to hash password: %v", err)
	}

	// Verify correct password
	if err := auth.VerifyPassword(password, hash); err != nil {
		t.Errorf("verification should pass for correct password: %v", err)
	}

	// Verify incorrect password
	if err := auth.VerifyPassword("wrongpassword", hash); err == nil {
		t.Error("verification should fail for incorrect password")
	}
}

// TestLocalJWT tests the JWT creation and validation.
func TestLocalJWT(t *testing.T) {
	secret := "test-secret-key-must-be-at-least-32-characters-long"
	userID := "user-123"
	tenantID := "tenant-456"
	email := "test@example.com"
	name := "Test User"
	role := "admin"

	// Create JWT without remember me
	token, err := auth.CreateLocalJWT(userID, tenantID, email, name, role, secret, false)
	if err != nil {
		t.Fatalf("failed to create JWT: %v", err)
	}

	// Validate JWT
	claims, err := auth.ValidateLocalJWT(token, secret)
	if err != nil {
		t.Fatalf("failed to validate JWT: %v", err)
	}

	if claims.Subject != userID {
		t.Errorf("expected subject %q, got %q", userID, claims.Subject)
	}
	if claims.TenantID != tenantID {
		t.Errorf("expected tenant_id %q, got %q", tenantID, claims.TenantID)
	}
	if claims.Email != email {
		t.Errorf("expected email %q, got %q", email, claims.Email)
	}
	if claims.Name != name {
		t.Errorf("expected name %q, got %q", name, claims.Name)
	}
	if claims.Role != role {
		t.Errorf("expected role %q, got %q", role, claims.Role)
	}
}

// TestLocalJWT_InvalidSecret tests that validation fails with wrong secret.
func TestLocalJWT_InvalidSecret(t *testing.T) {
	secret := "test-secret-key-must-be-at-least-32-characters-long"
	wrongSecret := "wrong-secret-key-must-be-at-least-32-characters"

	token, err := auth.CreateLocalJWT("user-123", "tenant-456", "test@example.com", "Test User", "admin", secret, false)
	if err != nil {
		t.Fatalf("failed to create JWT: %v", err)
	}

	// Try to validate with wrong secret
	_, err = auth.ValidateLocalJWT(token, wrongSecret)
	if err == nil {
		t.Error("validation should fail with wrong secret")
	}
}

// TestRouteIntegration tests that the routes are registered correctly using chi.
func TestRouteIntegration(t *testing.T) {
	testSetupAuthConfig(t)
	defer config.ResetAuthConfig()

	r := chi.NewRouter()
	rateLimiters := handlers.NewLoginRateLimiters()
	defer rateLimiters.Stop()

	// Register routes
	r.Post("/api/auth/login", handlers.Login(nil, rateLimiters))
	r.Post("/api/auth/logout", handlers.Logout())
	r.Get("/api/auth/me", handlers.Me())

	// Test login route exists
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login",
		bytes.NewBufferString(`{"email":"test@example.com","password":"test"}`))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	// Should get 500 (nil database) not 404
	if rr.Code == http.StatusNotFound {
		t.Error("/api/auth/login route not registered")
	}

	// Test logout route exists
	req = httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	rr = httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected logout to return 200, got %d", rr.Code)
	}

	// Test me route exists
	req = httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	rr = httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	// Should get 401 (no auth) not 404
	if rr.Code == http.StatusNotFound {
		t.Error("/api/auth/me route not registered")
	}
}

// TestLogin_SuccessWithDatabase is an integration test that verifies the full login flow.
// This requires a running database - skip if DATABASE_URL not set.
func TestLogin_SuccessWithDatabase(t *testing.T) {
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL not set - skipping integration test")
	}

	// Setup auth config for local mode
	testSetupAuthConfig(t)
	defer config.ResetAuthConfig()

	// Set SECRETS_SOURCE to env to skip OpenBao
	t.Setenv("SECRETS_SOURCE", "env")

	// Initialize database
	ctx := context.Background()
	err := storage.InitDB(ctx)
	require.NoError(t, err)
	defer storage.CloseDB()

	// Run migrations to ensure schema exists
	err = storage.RunMigrations(ctx)
	require.NoError(t, err)

	// Ensure default tenant exists
	err = storage.EnsureDefaultTenantExists(ctx, storage.DB)
	require.NoError(t, err)

	// Create test user with known password
	testPassword := "testpassword123"
	passwordHash, err := auth.HashPassword(testPassword)
	require.NoError(t, err)

	testEmail := "logintest_" + time.Now().Format("20060102150405") + "@example.com"
	testName := "Login Test User"
	tenantID := config.DefaultTenantUUID()

	conn, err := storage.DB.Acquire(ctx)
	require.NoError(t, err)

	// Create user directly in database
	_, err = storage.CreateLocalUser(ctx, conn, &storage.CreateLocalUserInput{
		TenantID:     tenantID,
		Email:        testEmail,
		DisplayName:  testName,
		PasswordHash: passwordHash,
		Role:         "admin",
	})
	conn.Release()
	require.NoError(t, err)

	// Create handler
	rateLimiters := handlers.NewLoginRateLimiters()
	defer rateLimiters.Stop()
	handler := handlers.Login(storage.DB, rateLimiters)

	// Test successful login
	t.Run("successful login", func(t *testing.T) {
		reqBody := map[string]interface{}{
			"email":    testEmail,
			"password": testPassword,
		}
		body, _ := json.Marshal(reqBody)

		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.ServeHTTP(rr, req)

		// Verify status code
		assert.Equal(t, http.StatusOK, rr.Code, "Expected 200 OK for successful login")

		// Verify response body
		var response struct {
			User struct {
				ID       string `json:"id"`
				Email    string `json:"email"`
				Name     string `json:"name"`
				Role     string `json:"role"`
				TenantID string `json:"tenant_id"`
			} `json:"user"`
		}
		err := json.Unmarshal(rr.Body.Bytes(), &response)
		require.NoError(t, err, "Failed to parse login response")

		assert.Equal(t, testEmail, response.User.Email)
		assert.Equal(t, testName, response.User.Name)
		assert.Equal(t, "admin", response.User.Role)
		assert.Equal(t, tenantID, response.User.TenantID)
		assert.NotEmpty(t, response.User.ID, "User ID should be set")

		// Verify session cookie is set
		cookies := rr.Result().Cookies()
		var sessionCookie *http.Cookie
		for _, c := range cookies {
			if c.Name == "apis_session" {
				sessionCookie = c
				break
			}
		}
		require.NotNil(t, sessionCookie, "Expected apis_session cookie")
		assert.NotEmpty(t, sessionCookie.Value, "Session cookie should have a value (JWT)")
		assert.True(t, sessionCookie.HttpOnly, "Session cookie should be HttpOnly")
		assert.Equal(t, http.SameSiteStrictMode, sessionCookie.SameSite, "Session cookie should use SameSite=Strict")

		// Verify JWT is valid
		claims, err := auth.ValidateLocalJWT(sessionCookie.Value, config.JWTSecret())
		require.NoError(t, err, "JWT should be valid")
		assert.Equal(t, testEmail, claims.Email)
		assert.Equal(t, testName, claims.Name)
		assert.Equal(t, "admin", claims.Role)
	})

	// Test login with wrong password
	t.Run("wrong password", func(t *testing.T) {
		reqBody := map[string]interface{}{
			"email":    testEmail,
			"password": "wrongpassword",
		}
		body, _ := json.Marshal(reqBody)

		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.ServeHTTP(rr, req)

		assert.Equal(t, http.StatusUnauthorized, rr.Code, "Expected 401 for wrong password")

		var response map[string]interface{}
		err := json.Unmarshal(rr.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.Equal(t, "Invalid credentials", response["error"])
	})

	// Test login with non-existent user
	t.Run("non-existent user", func(t *testing.T) {
		reqBody := map[string]interface{}{
			"email":    "nonexistent@example.com",
			"password": "anypassword",
		}
		body, _ := json.Marshal(reqBody)

		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.ServeHTTP(rr, req)

		assert.Equal(t, http.StatusUnauthorized, rr.Code, "Expected 401 for non-existent user")

		var response map[string]interface{}
		err := json.Unmarshal(rr.Body.Bytes(), &response)
		require.NoError(t, err)
		// Should use generic error to prevent user enumeration
		assert.Equal(t, "Invalid credentials", response["error"])
	})
}

// TestLogin_CookieDuration tests that session cookie MaxAge is correctly set.
func TestLogin_CookieDuration(t *testing.T) {
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL not set - skipping integration test")
	}

	testSetupAuthConfig(t)
	defer config.ResetAuthConfig()
	t.Setenv("SECRETS_SOURCE", "env")

	ctx := context.Background()
	err := storage.InitDB(ctx)
	require.NoError(t, err)
	defer storage.CloseDB()

	err = storage.RunMigrations(ctx)
	require.NoError(t, err)

	err = storage.EnsureDefaultTenantExists(ctx, storage.DB)
	require.NoError(t, err)

	// Create test user
	testPassword := "testpassword123"
	passwordHash, err := auth.HashPassword(testPassword)
	require.NoError(t, err)

	testEmail := "cookietest_" + time.Now().Format("20060102150405") + "@example.com"
	tenantID := config.DefaultTenantUUID()

	conn, err := storage.DB.Acquire(ctx)
	require.NoError(t, err)

	_, err = storage.CreateLocalUser(ctx, conn, &storage.CreateLocalUserInput{
		TenantID:     tenantID,
		Email:        testEmail,
		DisplayName:  "Cookie Test User",
		PasswordHash: passwordHash,
		Role:         "admin",
	})
	conn.Release()
	require.NoError(t, err)

	rateLimiters := handlers.NewLoginRateLimiters()
	defer rateLimiters.Stop()
	handler := handlers.Login(storage.DB, rateLimiters)

	t.Run("default session duration (7 days)", func(t *testing.T) {
		reqBody := map[string]interface{}{
			"email":       testEmail,
			"password":    testPassword,
			"remember_me": false,
		}
		body, _ := json.Marshal(reqBody)

		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.ServeHTTP(rr, req)
		assert.Equal(t, http.StatusOK, rr.Code)

		cookies := rr.Result().Cookies()
		var sessionCookie *http.Cookie
		for _, c := range cookies {
			if c.Name == "apis_session" {
				sessionCookie = c
				break
			}
		}
		require.NotNil(t, sessionCookie)

		// 7 days = 604800 seconds
		expectedMaxAge := 7 * 24 * 60 * 60
		assert.Equal(t, expectedMaxAge, sessionCookie.MaxAge, "Default session should be 7 days")
	})

	t.Run("remember me session duration (30 days)", func(t *testing.T) {
		reqBody := map[string]interface{}{
			"email":       testEmail,
			"password":    testPassword,
			"remember_me": true,
		}
		body, _ := json.Marshal(reqBody)

		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.ServeHTTP(rr, req)
		assert.Equal(t, http.StatusOK, rr.Code)

		cookies := rr.Result().Cookies()
		var sessionCookie *http.Cookie
		for _, c := range cookies {
			if c.Name == "apis_session" {
				sessionCookie = c
				break
			}
		}
		require.NotNil(t, sessionCookie)

		// 30 days = 2592000 seconds
		expectedMaxAge := 30 * 24 * 60 * 60
		assert.Equal(t, expectedMaxAge, sessionCookie.MaxAge, "Remember me session should be 30 days")
	})
}

