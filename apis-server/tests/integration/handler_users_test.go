// Package integration contains httptest integration tests for APIS server handlers.
package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/jermoo/apis/apis-server/internal/handlers"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/storage"
)

// setupUsersRouter creates a Chi router with auth middleware and user routes.
// Users endpoints require AdminOnly middleware.
func setupUsersRouter(claims *middleware.Claims) *chi.Mux {
	r := chi.NewRouter()
	r.Use(mockAuthMiddleware(claims))
	r.Use(mockTenantMiddleware(testAppPool()))

	r.Route("/api/users", func(r chi.Router) {
		r.Use(handlers.AdminOnly)
		r.Get("/", handlers.ListUsers)
		r.Post("/", handlers.CreateUser)
		r.Get("/{id}", handlers.GetUser)
		r.Put("/{id}", handlers.UpdateUser)
		r.Delete("/{id}", handlers.DeleteUser)
		r.Post("/{id}/reset-password", handlers.ResetPassword)
	})

	// Add /api/me so tests can discover the admin's internal user ID
	r.Get("/api/me", handlers.GetMe)

	return r
}

func TestUsersCRUD(t *testing.T) {
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL not set - skipping integration test")
	}
	t.Setenv("SECRETS_SOURCE", "env")

	ctx := context.Background()
	err := storage.InitDB(ctx)
	require.NoError(t, err)
	defer storage.CloseDB()

	err = storage.RunMigrations(ctx)
	require.NoError(t, err)

	adminClaims := &middleware.Claims{
		UserID:   "test-users-admin",
		OrgID:    "test-tenant-users",
		TenantID: "test-tenant-users",
		Email:    "useradmin@test.com",
		Name:     "Users Admin",
		Role:     "admin",
		Roles:    []string{"admin"},
	}

	router := setupUsersRouter(adminClaims)

	// Use unique email suffix to avoid conflicts with previous test runs
	uniqueSuffix := fmt.Sprintf("%d", time.Now().UnixNano()%100000)
	memberEmail := fmt.Sprintf("newmember-%s@test.com", uniqueSuffix)

	var createdUserID string
	var adminInternalID string

	// Discover admin's internal user ID and ensure admin role in DB
	t.Run("setup: get admin internal ID", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/me", nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		require.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.MeResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)
		adminInternalID = resp.ID
		require.NotEmpty(t, adminInternalID)

		// EnsureUserProvisioned creates users with default role (member).
		// Set the DB role to admin so self-demotion/self-delete checks work.
		conn, err := storage.DB.Acquire(ctx)
		require.NoError(t, err)
		_, err = conn.Exec(ctx, "UPDATE users SET role = 'admin' WHERE id = $1", adminInternalID)
		conn.Release()
		require.NoError(t, err)
	})

	t.Run("create user with valid data returns 201", func(t *testing.T) {
		body := map[string]interface{}{
			"email":        memberEmail,
			"display_name": "New Member",
			"role":         "member",
			"password":     "SecurePass123!",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/users", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusCreated, rec.Code)

		var resp handlers.UserDataResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.NotEmpty(t, resp.Data.ID)
		assert.Equal(t, memberEmail, resp.Data.Email)
		assert.Equal(t, "New Member", resp.Data.DisplayName)
		assert.Equal(t, "member", resp.Data.Role)
		assert.True(t, resp.Data.IsActive)
		assert.True(t, resp.Data.MustChangePassword)

		createdUserID = resp.Data.ID
	})

	t.Run("create user missing email returns 400", func(t *testing.T) {
		body := map[string]interface{}{
			"display_name": "No Email",
			"password":     "SecurePass123!",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/users", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("create user with invalid email format returns 400", func(t *testing.T) {
		body := map[string]interface{}{
			"email":        "not-an-email",
			"display_name": "Bad Email",
			"password":     "SecurePass123!",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/users", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("create user with invalid role returns 400", func(t *testing.T) {
		body := map[string]interface{}{
			"email":        "badrole@test.com",
			"display_name": "Bad Role",
			"role":         "superadmin",
			"password":     "SecurePass123!",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/users", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("create user with duplicate email returns 409", func(t *testing.T) {
		body := map[string]interface{}{
			"email":        memberEmail,
			"display_name": "Duplicate",
			"password":     "SecurePass123!",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/users", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusConflict, rec.Code)
	})

	t.Run("list users returns 200 with data and meta", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/users", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.UsersListResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.NotNil(t, resp.Data)
		assert.GreaterOrEqual(t, resp.Meta.Total, 1)
	})

	t.Run("get user by ID returns 200", func(t *testing.T) {
		require.NotEmpty(t, createdUserID)

		req := httptest.NewRequest("GET", "/api/users/"+createdUserID, nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.UserDataResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.Equal(t, createdUserID, resp.Data.ID)
		assert.Equal(t, memberEmail, resp.Data.Email)
	})

	t.Run("get non-existent user returns 404", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/users/00000000-0000-0000-0000-000000000099", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("update user display name returns 200", func(t *testing.T) {
		require.NotEmpty(t, createdUserID)

		newName := "Updated Member"
		body := map[string]interface{}{
			"display_name": newName,
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("PUT", "/api/users/"+createdUserID, bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.UserDataResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.Equal(t, newName, resp.Data.DisplayName)
	})

	t.Run("update user with invalid role returns 400", func(t *testing.T) {
		require.NotEmpty(t, createdUserID)

		body := map[string]interface{}{
			"role": "superadmin",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("PUT", "/api/users/"+createdUserID, bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("reset password returns 200", func(t *testing.T) {
		require.NotEmpty(t, createdUserID)

		body := map[string]interface{}{
			"password": "NewSecurePass456!",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/users/"+createdUserID+"/reset-password", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp map[string]interface{}
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)
		assert.Contains(t, resp["message"], "Password reset")
	})

	t.Run("reset password for non-existent user returns 404", func(t *testing.T) {
		body := map[string]interface{}{
			"password": "NewSecurePass456!",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/users/00000000-0000-0000-0000-000000000099/reset-password", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("admin cannot self-demote returns 400", func(t *testing.T) {
		require.NotEmpty(t, adminInternalID)

		body := map[string]interface{}{
			"role": "member",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("PUT", "/api/users/"+adminInternalID, bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		// Handler should return 400 (cannot demote yourself)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("admin cannot self-delete returns 400", func(t *testing.T) {
		require.NotEmpty(t, adminInternalID)

		req := httptest.NewRequest("DELETE", "/api/users/"+adminInternalID, nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("delete user returns 204", func(t *testing.T) {
		require.NotEmpty(t, createdUserID)

		req := httptest.NewRequest("DELETE", "/api/users/"+createdUserID, nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNoContent, rec.Code)
	})

	// Test non-admin access is blocked
	t.Run("non-admin cannot list users returns 403", func(t *testing.T) {
		memberClaims := &middleware.Claims{
			UserID:   "test-users-member",
			OrgID:    "test-tenant-users",
			TenantID: "test-tenant-users",
			Email:    "member@test.com",
			Name:     "Regular Member",
			Role:     "member",
			Roles:    []string{"member"},
		}

		memberRouter := setupUsersRouter(memberClaims)

		req := httptest.NewRequest("GET", "/api/users", nil)
		rec := httptest.NewRecorder()

		memberRouter.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusForbidden, rec.Code)
	})
}
