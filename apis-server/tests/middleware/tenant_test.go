package middleware_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/jermoo/apis/apis-server/internal/config"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/storage"
)

// setupTestDB creates a test database connection pool.
// Requires DATABASE_URL environment variable.
func setupTestDB(t *testing.T) *pgxpool.Pool {
	t.Helper()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5432/apis_test?sslmode=disable"
	}

	pool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		t.Skipf("Skipping test: database unavailable: %v", err)
	}

	// Verify connection
	if err := pool.Ping(context.Background()); err != nil {
		pool.Close()
		t.Skipf("Skipping test: database ping failed: %v", err)
	}

	return pool
}

// setupTestConfig initializes auth config for testing.
func setupTestConfig(t *testing.T, mode string) {
	t.Helper()

	// Reset any existing config
	config.ResetAuthConfig()

	// Set environment variables
	os.Setenv("AUTH_MODE", mode)
	os.Setenv("JWT_SECRET", "test-secret-that-is-at-least-32-characters")

	if mode == "keycloak" {
		os.Setenv("KEYCLOAK_ISSUER", "http://localhost:8080")
		os.Setenv("KEYCLOAK_CLIENT_ID", "test-client-id")
	}

	err := config.InitAuthConfig()
	require.NoError(t, err)

	t.Cleanup(func() {
		config.ResetAuthConfig()
		os.Unsetenv("AUTH_MODE")
		os.Unsetenv("JWT_SECRET")
		os.Unsetenv("KEYCLOAK_ISSUER")
		os.Unsetenv("KEYCLOAK_CLIENT_ID")
	})
}

// mockClaimsContext creates a context with mock claims for testing.
func mockClaimsContext(claims *middleware.Claims) context.Context {
	return context.WithValue(context.Background(), middleware.ClaimsKey, claims)
}

// TestTenantMiddleware_LocalMode_ValidClaims tests that in local mode,
// the tenant middleware correctly sets tenant context from JWT claims.
func TestTenantMiddleware_LocalMode_ValidClaims(t *testing.T) {
	setupTestConfig(t, "local")
	pool := setupTestDB(t)
	defer pool.Close()

	// Ensure default tenant exists
	ctx := context.Background()
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	_, err = storage.GetOrCreateTenant(ctx, conn, config.DefaultTenantID, "Default Tenant")
	conn.Release()
	require.NoError(t, err)

	// Create test user in the database
	conn, err = pool.Acquire(ctx)
	require.NoError(t, err)
	testUser, err := storage.CreateUser(ctx, conn, &storage.User{
		TenantID:      config.DefaultTenantID,
		ExternalUserID: "test-user-id-local", // In local mode, this field stores the internal user ID
		Email:         "test@example.com",
		Name:          "Test User",
	})
	conn.Release()
	require.NoError(t, err)

	// Create middleware
	tenantMiddleware := middleware.TenantMiddleware(pool)

	// Create test handler that verifies tenant context
	var capturedTenantID string
	var capturedUser *storage.User
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedTenantID = middleware.GetTenantID(r.Context())
		capturedUser = middleware.GetUser(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	// Create request with claims in context
	claims := &middleware.Claims{
		UserID:   testUser.ID, // In local mode, UserID is the internal database ID
		OrgID:    config.DefaultTenantID,
		TenantID: config.DefaultTenantID,
		Email:    "test@example.com",
		Name:     "Test User",
		Role:     "admin",
	}

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req = req.WithContext(mockClaimsContext(claims))

	rr := httptest.NewRecorder()
	tenantMiddleware(handler).ServeHTTP(rr, req)

	// Verify response
	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, config.DefaultTenantID, capturedTenantID)
	assert.NotNil(t, capturedUser)
	assert.Equal(t, testUser.ID, capturedUser.ID)
	assert.Equal(t, "test@example.com", capturedUser.Email)
}

// TestTenantMiddleware_LocalMode_SkipsProvisioning tests that local mode
// does not attempt to auto-provision users (users must already exist).
func TestTenantMiddleware_LocalMode_SkipsProvisioning(t *testing.T) {
	setupTestConfig(t, "local")
	pool := setupTestDB(t)
	defer pool.Close()

	// Ensure default tenant exists
	ctx := context.Background()
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	_, err = storage.GetOrCreateTenant(ctx, conn, config.DefaultTenantID, "Default Tenant")
	conn.Release()
	require.NoError(t, err)

	// Create middleware
	tenantMiddleware := middleware.TenantMiddleware(pool)

	// Create test handler
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	// Create request with claims for non-existent user
	claims := &middleware.Claims{
		UserID:   "non-existent-user-id",
		OrgID:    config.DefaultTenantID,
		TenantID: config.DefaultTenantID,
		Email:    "new@example.com",
		Name:     "New User",
		Role:     "user",
	}

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req = req.WithContext(mockClaimsContext(claims))

	rr := httptest.NewRecorder()
	tenantMiddleware(handler).ServeHTTP(rr, req)

	// In local mode, non-existent user should fail (not auto-provision)
	assert.Equal(t, http.StatusForbidden, rr.Code)

	// Verify error message
	var response map[string]any
	err = json.Unmarshal(rr.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Contains(t, response["error"], "user not found")
}

// TestTenantMiddleware_SaaSMode_ValidClaims tests that in SaaS mode,
// the tenant middleware correctly processes Keycloak claims.
func TestTenantMiddleware_SaaSMode_ValidClaims(t *testing.T) {
	setupTestConfig(t, "keycloak")
	pool := setupTestDB(t)
	defer pool.Close()

	// Create middleware
	tenantMiddleware := middleware.TenantMiddleware(pool)

	// Create test handler that verifies tenant context
	var capturedTenantID string
	var capturedUser *storage.User
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedTenantID = middleware.GetTenantID(r.Context())
		capturedUser = middleware.GetUser(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	// Create request with Keycloak-style claims
	tenantID := "keycloak-org-123"
	claims := &middleware.Claims{
		UserID:   "keycloak-user-456",
		OrgID:    tenantID,
		TenantID: tenantID,
		Email:    "saas@example.com",
		Name:     "SaaS User",
		Role:     "owner",
	}

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req = req.WithContext(mockClaimsContext(claims))

	rr := httptest.NewRecorder()
	tenantMiddleware(handler).ServeHTTP(rr, req)

	// Verify response
	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, tenantID, capturedTenantID)
	assert.NotNil(t, capturedUser)
	assert.Equal(t, "saas@example.com", capturedUser.Email)
}

// TestTenantMiddleware_SaaSMode_AutoProvisions tests that SaaS mode
// auto-provisions users and tenants on first login.
func TestTenantMiddleware_SaaSMode_AutoProvisions(t *testing.T) {
	setupTestConfig(t, "keycloak")
	pool := setupTestDB(t)
	defer pool.Close()

	// Create middleware
	tenantMiddleware := middleware.TenantMiddleware(pool)

	// Create test handler
	var capturedUser *storage.User
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedUser = middleware.GetUser(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	// Create request with claims for new user (should auto-provision)
	newOrgID := "new-org-" + t.Name()
	claims := &middleware.Claims{
		UserID:   "new-keycloak-user-" + t.Name(),
		OrgID:    newOrgID,
		TenantID: newOrgID,
		Email:    "newuser@example.com",
		Name:     "Brand New User",
		Role:     "owner",
	}

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req = req.WithContext(mockClaimsContext(claims))

	rr := httptest.NewRecorder()
	tenantMiddleware(handler).ServeHTTP(rr, req)

	// In SaaS mode, new users should be auto-provisioned
	assert.Equal(t, http.StatusOK, rr.Code)
	assert.NotNil(t, capturedUser)
	assert.Equal(t, "newuser@example.com", capturedUser.Email)
	assert.Equal(t, newOrgID, capturedUser.TenantID)
}

// TestTenantMiddleware_SaaSMode_DisabledTenant tests that SaaS mode
// returns 403 when accessing a suspended or deleted tenant.
func TestTenantMiddleware_SaaSMode_DisabledTenant(t *testing.T) {
	setupTestConfig(t, "keycloak")
	pool := setupTestDB(t)
	defer pool.Close()

	// Create a suspended tenant
	ctx := context.Background()
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)

	suspendedTenantID := "suspended-tenant-" + t.Name()
	_, err = conn.Exec(ctx, `
		INSERT INTO tenants (id, name, status)
		VALUES ($1, 'Suspended Org', 'suspended')
		ON CONFLICT (id) DO UPDATE SET status = 'suspended'
	`, suspendedTenantID)
	conn.Release()
	require.NoError(t, err)

	// Create middleware
	tenantMiddleware := middleware.TenantMiddleware(pool)

	// Create test handler
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	// Create request for suspended tenant
	claims := &middleware.Claims{
		UserID:   "user-in-suspended-tenant",
		OrgID:    suspendedTenantID,
		TenantID: suspendedTenantID,
		Email:    "suspended@example.com",
		Name:     "Suspended User",
		Role:     "user",
	}

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req = req.WithContext(mockClaimsContext(claims))

	rr := httptest.NewRecorder()
	tenantMiddleware(handler).ServeHTTP(rr, req)

	// Should return 403 for suspended tenant
	assert.Equal(t, http.StatusForbidden, rr.Code)

	// Verify error message
	var response map[string]any
	err = json.Unmarshal(rr.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Contains(t, response["error"], "tenant access denied")
}

// TestTenantMiddleware_NoClaims tests that middleware returns 401
// when no claims are in context.
func TestTenantMiddleware_NoClaims(t *testing.T) {
	setupTestConfig(t, "local")
	pool := setupTestDB(t)
	defer pool.Close()

	// Create middleware
	tenantMiddleware := middleware.TenantMiddleware(pool)

	// Create test handler
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	// Create request WITHOUT claims
	req := httptest.NewRequest(http.MethodGet, "/test", nil)

	rr := httptest.NewRecorder()
	tenantMiddleware(handler).ServeHTTP(rr, req)

	// Should return 401
	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

// TestTenantMiddleware_InvalidTenantIDFormat tests that invalid tenant IDs
// are rejected to prevent SQL injection.
func TestTenantMiddleware_InvalidTenantIDFormat(t *testing.T) {
	setupTestConfig(t, "local")
	pool := setupTestDB(t)
	defer pool.Close()

	// Create middleware
	tenantMiddleware := middleware.TenantMiddleware(pool)

	// Create test handler
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	// Create request with malicious tenant ID
	claims := &middleware.Claims{
		UserID:   "user-123",
		OrgID:    "'; DROP TABLE tenants; --",
		TenantID: "'; DROP TABLE tenants; --",
		Email:    "attacker@example.com",
		Name:     "Attacker",
		Role:     "admin",
	}

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req = req.WithContext(mockClaimsContext(claims))

	rr := httptest.NewRecorder()
	tenantMiddleware(handler).ServeHTTP(rr, req)

	// Should return 400 for invalid format
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

// TestGetTenantID_BothModes tests that GetTenantID helper works
// consistently in both local and SaaS modes.
func TestGetTenantID_BothModes(t *testing.T) {
	tests := []struct {
		name     string
		claims   *middleware.Claims
		expected string
	}{
		{
			name: "local mode claims",
			claims: &middleware.Claims{
				UserID:   "local-user",
				OrgID:    config.DefaultTenantID,
				TenantID: config.DefaultTenantID,
			},
			expected: config.DefaultTenantID,
		},
		{
			name: "saas mode claims",
			claims: &middleware.Claims{
				UserID:   "keycloak-user",
				OrgID:    "keycloak-org-123",
				TenantID: "keycloak-org-123",
			},
			expected: "keycloak-org-123",
		},
		{
			name:     "nil claims",
			claims:   nil,
			expected: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var ctx context.Context
			if tt.claims != nil {
				ctx = mockClaimsContext(tt.claims)
			} else {
				ctx = context.Background()
			}

			result := middleware.GetTenantID(ctx)
			assert.Equal(t, tt.expected, result)
		})
	}
}

// TestGetUser_ReturnsCorrectUser tests that GetUser returns the user
// stored in context by the middleware.
func TestGetUser_ReturnsCorrectUser(t *testing.T) {
	testUser := &storage.User{
		ID:       "user-123",
		TenantID: "tenant-456",
		Email:    "user@example.com",
		Name:     "Test User",
	}

	ctx := middleware.WithUser(context.Background(), testUser)
	result := middleware.GetUser(ctx)

	assert.NotNil(t, result)
	assert.Equal(t, testUser.ID, result.ID)
	assert.Equal(t, testUser.TenantID, result.TenantID)
	assert.Equal(t, testUser.Email, result.Email)
}

// TestGetUser_NilWhenNotSet tests that GetUser returns nil
// when no user is in context.
func TestGetUser_NilWhenNotSet(t *testing.T) {
	ctx := context.Background()
	result := middleware.GetUser(ctx)
	assert.Nil(t, result)
}
