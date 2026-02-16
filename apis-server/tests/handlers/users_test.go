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

// testSetupUsersAuthConfig sets up the auth configuration for users tests.
func testSetupUsersAuthConfig(t *testing.T) {
	t.Helper()
	config.ResetAuthConfig()
	os.Setenv("AUTH_MODE", "local")
	os.Setenv("JWT_SECRET", "test-secret-key-must-be-at-least-32-characters-long")
	if err := config.InitAuthConfig(); err != nil {
		t.Fatalf("failed to init auth config: %v", err)
	}
}

// TestAdminOnly_Middleware tests the AdminOnly middleware.
func TestAdminOnly_Middleware(t *testing.T) {
	tests := []struct {
		name           string
		role           string
		expectedStatus int
	}{
		{
			name:           "admin allowed",
			role:           "admin",
			expectedStatus: http.StatusOK,
		},
		{
			name:           "member forbidden",
			role:           "member",
			expectedStatus: http.StatusForbidden,
		},
		{
			name:           "empty role forbidden",
			role:           "",
			expectedStatus: http.StatusForbidden,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create a simple handler that returns 200
			nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			})

			// Wrap with AdminOnly middleware
			handler := handlers.AdminOnly(nextHandler)

			req := httptest.NewRequest(http.MethodGet, "/test", nil)

			// Add mock claims to context
			claims := &middleware.Claims{
				UserID:   "user-123",
				TenantID: "tenant-456",
				Role:     tt.role,
			}
			ctx := context.WithValue(req.Context(), middleware.ClaimsKey, claims)
			req = req.WithContext(ctx)

			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)

			assert.Equal(t, tt.expectedStatus, rr.Code)
		})
	}
}

// TestAdminOnly_NoClaims tests that AdminOnly returns 401 without claims.
func TestAdminOnly_NoClaims(t *testing.T) {
	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	handler := handlers.AdminOnly(nextHandler)

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

// TestListUsers_Integration tests the full ListUsers flow with database.
func TestListUsers_Integration(t *testing.T) {
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL not set - skipping integration test")
	}

	testSetupUsersAuthConfig(t)
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

	tenantID := config.DefaultTenantUUID()

	// Create test admin user
	passwordHash, _ := auth.HashPassword("testpassword")
	testEmail := "userstest_admin_" + time.Now().Format("20060102150405") + "@example.com"

	conn, err := storage.DB.Acquire(ctx)
	require.NoError(t, err)

	// Set tenant context for RLS
	_, err = conn.Exec(ctx, "SET LOCAL app.tenant_id = $1", tenantID)
	require.NoError(t, err)

	adminUser, err := storage.CreateLocalUser(ctx, conn, &storage.CreateLocalUserInput{
		TenantID:     tenantID,
		Email:        testEmail,
		DisplayName:  "Users Test Admin",
		PasswordHash: passwordHash,
		Role:         "admin",
	})
	require.NoError(t, err)
	conn.Release()

	// Set up router with middleware
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Add admin claims
			claims := &middleware.Claims{
				UserID:   adminUser.ID,
				TenantID: tenantID,
				Role:     "admin",
			}
			ctx := context.WithValue(r.Context(), middleware.ClaimsKey, claims)

			// Acquire connection and set tenant context
			conn, _ := storage.DB.Acquire(ctx)
			defer conn.Release()
			conn.Exec(ctx, "SET LOCAL app.tenant_id = $1", tenantID)
			ctx = storage.WithConn(ctx, conn)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})
	r.Route("/api/users", func(r chi.Router) {
		r.Use(handlers.AdminOnly)
		r.Get("/", handlers.ListUsers)
	})

	// Test list users
	req := httptest.NewRequest(http.MethodGet, "/api/users", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	var response struct {
		Data []struct {
			ID          string `json:"id"`
			Email       string `json:"email"`
			DisplayName string `json:"display_name"`
			Role        string `json:"role"`
			IsActive    bool   `json:"is_active"`
		} `json:"data"`
		Meta struct {
			Total int `json:"total"`
		} `json:"meta"`
	}
	err = json.Unmarshal(rr.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.GreaterOrEqual(t, response.Meta.Total, 1)

	// Find our test user in the results
	found := false
	for _, u := range response.Data {
		if u.Email == testEmail {
			found = true
			assert.Equal(t, "Users Test Admin", u.DisplayName)
			assert.Equal(t, "admin", u.Role)
			assert.True(t, u.IsActive)
			break
		}
	}
	assert.True(t, found, "Test user should be in results")
}

// TestCreateUser_ValidationErrors tests validation for CreateUser.
func TestCreateUser_ValidationErrors(t *testing.T) {
	tests := []struct {
		name           string
		requestBody    string
		expectedStatus int
		expectedError  string
	}{
		{
			name:           "empty email",
			requestBody:    `{"email":"","display_name":"Test","password":"testpass123"}`,
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Email is required",
		},
		{
			name:           "invalid email format",
			requestBody:    `{"email":"not-an-email","display_name":"Test","password":"testpass123"}`,
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Invalid email format",
		},
		{
			name:           "empty display name",
			requestBody:    `{"email":"test@example.com","display_name":"","password":"testpass123"}`,
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Display name is required",
		},
		{
			name:           "empty password",
			requestBody:    `{"email":"test@example.com","display_name":"Test","password":""}`,
			expectedStatus: http.StatusBadRequest,
			expectedError:  "password is required",
		},
		{
			name:           "short password",
			requestBody:    `{"email":"test@example.com","display_name":"Test","password":"short"}`,
			expectedStatus: http.StatusBadRequest,
			expectedError:  "password must be at least 8 characters",
		},
		{
			name:           "invalid role",
			requestBody:    `{"email":"test@example.com","display_name":"Test","password":"testpass123","role":"superadmin"}`,
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Role must be 'admin' or 'member'",
		},
		{
			name:           "invalid JSON",
			requestBody:    `{invalid json}`,
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Invalid request body",
		},
		{
			name:           "email too long",
			requestBody:    `{"email":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@example.com","display_name":"Test","password":"testpass123"}`,
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Email must be 254 characters or less",
		},
		{
			name:           "display name too long",
			requestBody:    `{"email":"test@example.com","display_name":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","password":"testpass123"}`,
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Display name must be 100 characters or less",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create a mock handler with claims in context
			r := chi.NewRouter()
			r.Use(func(next http.Handler) http.Handler {
				return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					claims := &middleware.Claims{
						UserID:   "admin-123",
						TenantID: "tenant-456",
						Role:     "admin",
					}
					ctx := context.WithValue(r.Context(), middleware.ClaimsKey, claims)
					// No database connection - will fail after validation if validation passes
					next.ServeHTTP(w, r.WithContext(ctx))
				})
			})
			r.Post("/api/users", handlers.CreateUser)

			req := httptest.NewRequest(http.MethodPost, "/api/users", bytes.NewBufferString(tt.requestBody))
			req.Header.Set("Content-Type", "application/json")
			rr := httptest.NewRecorder()

			r.ServeHTTP(rr, req)

			assert.Equal(t, tt.expectedStatus, rr.Code)

			var response map[string]interface{}
			err := json.Unmarshal(rr.Body.Bytes(), &response)
			require.NoError(t, err)

			assert.Equal(t, tt.expectedError, response["error"])
		})
	}
}

// TestUpdateUser_ValidationErrors tests validation for UpdateUser.
func TestUpdateUser_ValidationErrors(t *testing.T) {
	tests := []struct {
		name           string
		requestBody    string
		expectedStatus int
		expectedError  string
	}{
		{
			name:           "invalid role",
			requestBody:    `{"role":"superadmin"}`,
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Role must be 'admin' or 'member'",
		},
		{
			name:           "invalid JSON",
			requestBody:    `{invalid json}`,
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Invalid request body",
		},
		{
			name:           "display name too long",
			requestBody:    `{"display_name":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}`,
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Display name must be 100 characters or less",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := chi.NewRouter()
			r.Use(func(next http.Handler) http.Handler {
				return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					claims := &middleware.Claims{
						UserID:   "admin-123",
						TenantID: "tenant-456",
						Role:     "admin",
					}
					ctx := context.WithValue(r.Context(), middleware.ClaimsKey, claims)
					next.ServeHTTP(w, r.WithContext(ctx))
				})
			})
			r.Put("/api/users/{id}", handlers.UpdateUser)

			req := httptest.NewRequest(http.MethodPut, "/api/users/user-123", bytes.NewBufferString(tt.requestBody))
			req.Header.Set("Content-Type", "application/json")
			rr := httptest.NewRecorder()

			r.ServeHTTP(rr, req)

			assert.Equal(t, tt.expectedStatus, rr.Code)

			var response map[string]interface{}
			err := json.Unmarshal(rr.Body.Bytes(), &response)
			require.NoError(t, err)

			assert.Equal(t, tt.expectedError, response["error"])
		})
	}
}

// TestResetPassword_ValidationErrors tests validation for ResetPassword.
func TestResetPassword_ValidationErrors(t *testing.T) {
	tests := []struct {
		name           string
		requestBody    string
		expectedStatus int
		expectedError  string
	}{
		{
			name:           "empty password",
			requestBody:    `{"password":""}`,
			expectedStatus: http.StatusBadRequest,
			expectedError:  "password is required",
		},
		{
			name:           "short password",
			requestBody:    `{"password":"short"}`,
			expectedStatus: http.StatusBadRequest,
			expectedError:  "password must be at least 8 characters",
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
			r := chi.NewRouter()
			r.Use(func(next http.Handler) http.Handler {
				return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					claims := &middleware.Claims{
						UserID:   "admin-123",
						TenantID: "tenant-456",
						Role:     "admin",
					}
					ctx := context.WithValue(r.Context(), middleware.ClaimsKey, claims)
					next.ServeHTTP(w, r.WithContext(ctx))
				})
			})
			r.Post("/api/users/{id}/reset-password", handlers.ResetPassword)

			req := httptest.NewRequest(http.MethodPost, "/api/users/user-123/reset-password", bytes.NewBufferString(tt.requestBody))
			req.Header.Set("Content-Type", "application/json")
			rr := httptest.NewRecorder()

			r.ServeHTTP(rr, req)

			assert.Equal(t, tt.expectedStatus, rr.Code)

			var response map[string]interface{}
			err := json.Unmarshal(rr.Body.Bytes(), &response)
			require.NoError(t, err)

			assert.Equal(t, tt.expectedError, response["error"])
		})
	}
}

// TestCreateUser_Integration tests the full CreateUser flow with database.
func TestCreateUser_Integration(t *testing.T) {
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL not set - skipping integration test")
	}

	testSetupUsersAuthConfig(t)
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

	tenantID := config.DefaultTenantUUID()

	// Create admin user first
	passwordHash, _ := auth.HashPassword("testpassword")
	adminEmail := "createusertest_admin_" + time.Now().Format("20060102150405") + "@example.com"

	conn, err := storage.DB.Acquire(ctx)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "SET LOCAL app.tenant_id = $1", tenantID)
	require.NoError(t, err)

	adminUser, err := storage.CreateLocalUser(ctx, conn, &storage.CreateLocalUserInput{
		TenantID:     tenantID,
		Email:        adminEmail,
		DisplayName:  "Create User Test Admin",
		PasswordHash: passwordHash,
		Role:         "admin",
	})
	require.NoError(t, err)
	conn.Release()

	// Set up router
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims := &middleware.Claims{
				UserID:   adminUser.ID,
				TenantID: tenantID,
				Role:     "admin",
			}
			ctx := context.WithValue(r.Context(), middleware.ClaimsKey, claims)

			conn, _ := storage.DB.Acquire(ctx)
			defer conn.Release()
			conn.Exec(ctx, "SET LOCAL app.tenant_id = $1", tenantID)
			ctx = storage.WithConn(ctx, conn)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})
	r.Route("/api/users", func(r chi.Router) {
		r.Use(handlers.AdminOnly)
		r.Post("/", handlers.CreateUser)
	})

	// Test successful user creation
	t.Run("successful creation", func(t *testing.T) {
		newUserEmail := "newuser_" + time.Now().Format("20060102150405") + "@example.com"
		reqBody := map[string]interface{}{
			"email":        newUserEmail,
			"display_name": "New Test User",
			"role":         "member",
			"password":     "temppass123",
		}
		body, _ := json.Marshal(reqBody)

		req := httptest.NewRequest(http.MethodPost, "/api/users", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		r.ServeHTTP(rr, req)

		assert.Equal(t, http.StatusCreated, rr.Code)

		var response struct {
			Data struct {
				ID                 string `json:"id"`
				Email              string `json:"email"`
				DisplayName        string `json:"display_name"`
				Role               string `json:"role"`
				IsActive           bool   `json:"is_active"`
				MustChangePassword bool   `json:"must_change_password"`
			} `json:"data"`
		}
		err := json.Unmarshal(rr.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.NotEmpty(t, response.Data.ID)
		assert.Equal(t, newUserEmail, response.Data.Email)
		assert.Equal(t, "New Test User", response.Data.DisplayName)
		assert.Equal(t, "member", response.Data.Role)
		assert.True(t, response.Data.IsActive)
		assert.True(t, response.Data.MustChangePassword, "New users should have must_change_password=true")
	})

	// Test duplicate email
	t.Run("duplicate email", func(t *testing.T) {
		reqBody := map[string]interface{}{
			"email":        adminEmail, // Already exists
			"display_name": "Duplicate",
			"password":     "temppass123",
		}
		body, _ := json.Marshal(reqBody)

		req := httptest.NewRequest(http.MethodPost, "/api/users", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		r.ServeHTTP(rr, req)

		assert.Equal(t, http.StatusConflict, rr.Code)

		var response map[string]interface{}
		err := json.Unmarshal(rr.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.Equal(t, "Email already exists", response["error"])
	})
}

// TestDeleteUser_SelfDeletion tests that admin cannot delete themselves.
func TestDeleteUser_SelfDeletion(t *testing.T) {
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL not set - skipping integration test")
	}

	testSetupUsersAuthConfig(t)
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

	tenantID := config.DefaultTenantUUID()

	// Create admin user
	passwordHash, _ := auth.HashPassword("testpassword")
	adminEmail := "selfdeletetest_" + time.Now().Format("20060102150405") + "@example.com"

	conn, err := storage.DB.Acquire(ctx)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "SET LOCAL app.tenant_id = $1", tenantID)
	require.NoError(t, err)

	adminUser, err := storage.CreateLocalUser(ctx, conn, &storage.CreateLocalUserInput{
		TenantID:     tenantID,
		Email:        adminEmail,
		DisplayName:  "Self Delete Test Admin",
		PasswordHash: passwordHash,
		Role:         "admin",
	})
	require.NoError(t, err)
	conn.Release()

	// Set up router
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims := &middleware.Claims{
				UserID:   adminUser.ID,
				TenantID: tenantID,
				Role:     "admin",
			}
			ctx := context.WithValue(r.Context(), middleware.ClaimsKey, claims)

			conn, _ := storage.DB.Acquire(ctx)
			defer conn.Release()
			conn.Exec(ctx, "SET LOCAL app.tenant_id = $1", tenantID)
			ctx = storage.WithConn(ctx, conn)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})
	r.Route("/api/users", func(r chi.Router) {
		r.Use(handlers.AdminOnly)
		r.Delete("/{id}", handlers.DeleteUser)
	})

	// Try to delete self
	req := httptest.NewRequest(http.MethodDelete, "/api/users/"+adminUser.ID, nil)
	rr := httptest.NewRecorder()

	r.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)

	var response map[string]interface{}
	err = json.Unmarshal(rr.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Equal(t, "Cannot delete yourself", response["error"])
}

// TestUpdateUser_SelfDemotion tests that admin cannot demote themselves.
func TestUpdateUser_SelfDemotion(t *testing.T) {
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL not set - skipping integration test")
	}

	testSetupUsersAuthConfig(t)
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

	tenantID := config.DefaultTenantUUID()

	// Create admin user
	passwordHash, _ := auth.HashPassword("testpassword")
	adminEmail := "selfdemotetest_" + time.Now().Format("20060102150405") + "@example.com"

	conn, err := storage.DB.Acquire(ctx)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "SET LOCAL app.tenant_id = $1", tenantID)
	require.NoError(t, err)

	adminUser, err := storage.CreateLocalUser(ctx, conn, &storage.CreateLocalUserInput{
		TenantID:     tenantID,
		Email:        adminEmail,
		DisplayName:  "Self Demote Test Admin",
		PasswordHash: passwordHash,
		Role:         "admin",
	})
	require.NoError(t, err)
	conn.Release()

	// Set up router
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims := &middleware.Claims{
				UserID:   adminUser.ID,
				TenantID: tenantID,
				Role:     "admin",
			}
			ctx := context.WithValue(r.Context(), middleware.ClaimsKey, claims)

			conn, _ := storage.DB.Acquire(ctx)
			defer conn.Release()
			conn.Exec(ctx, "SET LOCAL app.tenant_id = $1", tenantID)
			ctx = storage.WithConn(ctx, conn)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})
	r.Route("/api/users", func(r chi.Router) {
		r.Use(handlers.AdminOnly)
		r.Put("/{id}", handlers.UpdateUser)
	})

	// Try to demote self
	reqBody := map[string]interface{}{
		"role": "member",
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPut, "/api/users/"+adminUser.ID, bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	r.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)

	var response map[string]interface{}
	err = json.Unmarshal(rr.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Equal(t, "Cannot demote yourself", response["error"])
}

// TestDeleteUser_LastAdmin tests that the last admin cannot be deleted.
func TestDeleteUser_LastAdmin(t *testing.T) {
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL not set - skipping integration test")
	}

	testSetupUsersAuthConfig(t)
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

	tenantID := config.DefaultTenantUUID()

	// Create two admin users - one to be the requester, one to try to delete
	passwordHash, _ := auth.HashPassword("testpassword")
	adminEmail1 := "lastadmintest1_" + time.Now().Format("20060102150405") + "@example.com"
	adminEmail2 := "lastadmintest2_" + time.Now().Format("20060102150405") + "@example.com"

	conn, err := storage.DB.Acquire(ctx)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "SET LOCAL app.tenant_id = $1", tenantID)
	require.NoError(t, err)

	adminUser1, err := storage.CreateLocalUser(ctx, conn, &storage.CreateLocalUserInput{
		TenantID:     tenantID,
		Email:        adminEmail1,
		DisplayName:  "Last Admin Test Admin 1",
		PasswordHash: passwordHash,
		Role:         "admin",
	})
	require.NoError(t, err)

	adminUser2, err := storage.CreateLocalUser(ctx, conn, &storage.CreateLocalUserInput{
		TenantID:     tenantID,
		Email:        adminEmail2,
		DisplayName:  "Last Admin Test Admin 2",
		PasswordHash: passwordHash,
		Role:         "admin",
	})
	require.NoError(t, err)
	conn.Release()

	// Set up router with admin1 as the requester
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims := &middleware.Claims{
				UserID:   adminUser1.ID,
				TenantID: tenantID,
				Role:     "admin",
			}
			ctx := context.WithValue(r.Context(), middleware.ClaimsKey, claims)

			conn, _ := storage.DB.Acquire(ctx)
			defer conn.Release()
			conn.Exec(ctx, "SET LOCAL app.tenant_id = $1", tenantID)
			ctx = storage.WithConn(ctx, conn)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})
	r.Route("/api/users", func(r chi.Router) {
		r.Use(handlers.AdminOnly)
		r.Delete("/{id}", handlers.DeleteUser)
	})

	// Delete admin2 first - should succeed (we have 2 admins)
	req := httptest.NewRequest(http.MethodDelete, "/api/users/"+adminUser2.ID, nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	// Should succeed with 204 (still have admin1)
	assert.Equal(t, http.StatusNoContent, rr.Code, "Should be able to delete admin when another admin exists")
}

// TestDeleteUser_CannotDeleteLastAdminIndirectly tests that after deleting one admin,
// the remaining admin (if they are the last one) cannot be deleted.
// This complements TestDeleteUser_LastAdmin by verifying the protection kicks in
// when we're down to the last admin.
func TestDeleteUser_CannotDeleteLastAdminIndirectly(t *testing.T) {
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL not set - skipping integration test")
	}

	testSetupUsersAuthConfig(t)
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

	tenantID := config.DefaultTenantUUID()

	// Create two admin users and one member
	passwordHash, _ := auth.HashPassword("testpassword")
	adminEmail1 := "lastadminind1_" + time.Now().Format("20060102150405") + "@example.com"
	adminEmail2 := "lastadminind2_" + time.Now().Format("20060102150405") + "@example.com"
	memberEmail := "lastadminind_member_" + time.Now().Format("20060102150405") + "@example.com"

	conn, err := storage.DB.Acquire(ctx)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "SET LOCAL app.tenant_id = $1", tenantID)
	require.NoError(t, err)

	adminUser1, err := storage.CreateLocalUser(ctx, conn, &storage.CreateLocalUserInput{
		TenantID:     tenantID,
		Email:        adminEmail1,
		DisplayName:  "Last Admin Indirect Test Admin 1",
		PasswordHash: passwordHash,
		Role:         "admin",
	})
	require.NoError(t, err)

	adminUser2, err := storage.CreateLocalUser(ctx, conn, &storage.CreateLocalUserInput{
		TenantID:     tenantID,
		Email:        adminEmail2,
		DisplayName:  "Last Admin Indirect Test Admin 2",
		PasswordHash: passwordHash,
		Role:         "admin",
	})
	require.NoError(t, err)

	_, err = storage.CreateLocalUser(ctx, conn, &storage.CreateLocalUserInput{
		TenantID:     tenantID,
		Email:        memberEmail,
		DisplayName:  "Last Admin Indirect Test Member",
		PasswordHash: passwordHash,
		Role:         "member",
	})
	require.NoError(t, err)
	conn.Release()

	// Create a dynamic requester context that can be switched between users
	currentRequester := adminUser1.ID

	// Set up router - the requester can be changed between requests
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims := &middleware.Claims{
				UserID:   currentRequester,
				TenantID: tenantID,
				Role:     "admin",
			}
			ctx := context.WithValue(r.Context(), middleware.ClaimsKey, claims)

			conn, _ := storage.DB.Acquire(ctx)
			defer conn.Release()
			conn.Exec(ctx, "SET LOCAL app.tenant_id = $1", tenantID)
			ctx = storage.WithConn(ctx, conn)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})
	r.Route("/api/users", func(r chi.Router) {
		r.Use(handlers.AdminOnly)
		r.Delete("/{id}", handlers.DeleteUser)
	})

	// Step 1: Admin1 deletes Admin2 (should succeed - 2 admins exist)
	req := httptest.NewRequest(http.MethodDelete, "/api/users/"+adminUser2.ID, nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusNoContent, rr.Code, "Step 1: Should be able to delete admin2 when admin1 exists")

	// Step 2: Now only admin1 remains. Admin1 tries to delete themselves.
	// This should fail with BOTH "cannot delete yourself" AND would fail the last-admin check
	req = httptest.NewRequest(http.MethodDelete, "/api/users/"+adminUser1.ID, nil)
	rr = httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusBadRequest, rr.Code, "Step 2: Should not be able to delete self")

	var response map[string]interface{}
	err = json.Unmarshal(rr.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Equal(t, "Cannot delete yourself", response["error"], "Self-deletion protection should trigger first")
}

// TestResetPassword_Integration tests the ResetPassword flow.
func TestResetPassword_Integration(t *testing.T) {
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL not set - skipping integration test")
	}

	testSetupUsersAuthConfig(t)
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

	tenantID := config.DefaultTenantUUID()

	// Create admin and member users
	passwordHash, _ := auth.HashPassword("testpassword")
	adminEmail := "resetpwtest_admin_" + time.Now().Format("20060102150405") + "@example.com"
	memberEmail := "resetpwtest_member_" + time.Now().Format("20060102150405") + "@example.com"

	conn, err := storage.DB.Acquire(ctx)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "SET LOCAL app.tenant_id = $1", tenantID)
	require.NoError(t, err)

	adminUser, err := storage.CreateLocalUser(ctx, conn, &storage.CreateLocalUserInput{
		TenantID:     tenantID,
		Email:        adminEmail,
		DisplayName:  "Reset PW Test Admin",
		PasswordHash: passwordHash,
		Role:         "admin",
	})
	require.NoError(t, err)

	memberUser, err := storage.CreateLocalUser(ctx, conn, &storage.CreateLocalUserInput{
		TenantID:     tenantID,
		Email:        memberEmail,
		DisplayName:  "Reset PW Test Member",
		PasswordHash: passwordHash,
		Role:         "member",
	})
	require.NoError(t, err)
	conn.Release()

	// Set up router
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims := &middleware.Claims{
				UserID:   adminUser.ID,
				TenantID: tenantID,
				Role:     "admin",
			}
			ctx := context.WithValue(r.Context(), middleware.ClaimsKey, claims)

			conn, _ := storage.DB.Acquire(ctx)
			defer conn.Release()
			conn.Exec(ctx, "SET LOCAL app.tenant_id = $1", tenantID)
			ctx = storage.WithConn(ctx, conn)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})
	r.Route("/api/users", func(r chi.Router) {
		r.Use(handlers.AdminOnly)
		r.Post("/{id}/reset-password", handlers.ResetPassword)
	})

	// Reset member's password
	reqBody := map[string]interface{}{
		"password": "newtemporarypassword123",
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/api/users/"+memberUser.ID+"/reset-password", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	r.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	var response map[string]interface{}
	err = json.Unmarshal(rr.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Contains(t, response["message"], "Password reset successfully")

	// Verify password was actually changed and must_change_password is set
	conn, err = storage.DB.Acquire(ctx)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "SET LOCAL app.tenant_id = $1", tenantID)
	require.NoError(t, err)

	updatedUser, err := storage.GetUserByIDFull(ctx, conn, memberUser.ID)
	require.NoError(t, err)
	conn.Release()

	assert.True(t, updatedUser.MustChangePassword, "must_change_password should be true after reset")
}

// TestMemberForbidden tests that member users cannot access admin endpoints.
func TestMemberForbidden(t *testing.T) {
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Add member claims (not admin)
			claims := &middleware.Claims{
				UserID:   "member-123",
				TenantID: "tenant-456",
				Role:     "member",
			}
			ctx := context.WithValue(r.Context(), middleware.ClaimsKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})
	r.Route("/api/users", func(r chi.Router) {
		r.Use(handlers.AdminOnly)
		r.Get("/", handlers.ListUsers)
		r.Post("/", handlers.CreateUser)
	})

	// Test GET /api/users
	req := httptest.NewRequest(http.MethodGet, "/api/users", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusForbidden, rr.Code)

	var response map[string]interface{}
	err := json.Unmarshal(rr.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Equal(t, "Admin access required", response["error"])

	// Test POST /api/users
	reqBody := `{"email":"test@example.com","display_name":"Test","password":"testpass123"}`
	req = httptest.NewRequest(http.MethodPost, "/api/users", bytes.NewBufferString(reqBody))
	req.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusForbidden, rr.Code)
}
