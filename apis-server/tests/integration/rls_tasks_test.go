// Package integration contains integration tests for the APIS server.
// rls_tasks_test.go — P0-008: RLS isolation tests for the tasks (hive_tasks) table.
package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/jermoo/apis/apis-server/internal/handlers"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/storage"
)

// TestRLSTasksIsolation tests that RLS enforces tenant isolation on tasks.
// Tenant A's tasks must be invisible and inaccessible to Tenant B.
func TestRLSTasksIsolation(t *testing.T) {
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

	claimsA := &middleware.Claims{
		UserID:   "task-rls-user-a",
		OrgID:    "task-rls-org-a",
		TenantID: "task-rls-org-a",
		Email:    "task-a@example.com",
		Name:     "Task User A",
		Roles:    []string{"admin"},
	}
	claimsB := &middleware.Claims{
		UserID:   "task-rls-user-b",
		OrgID:    "task-rls-org-b",
		TenantID: "task-rls-org-b",
		Email:    "task-b@example.com",
		Name:     "Task User B",
		Roles:    []string{"admin"},
	}

	conn, err := storage.DB.Acquire(ctx)
	require.NoError(t, err)
	provisionUser(t, ctx, conn, claimsA)
	provisionUser(t, ctx, conn, claimsB)
	conn.Release()

	// Setup: create site and hive for Tenant A
	var hiveAID string
	t.Run("setup: create site and hive for Tenant A", func(t *testing.T) {
		r := setupRouter(claimsA)
		r.Post("/api/sites", handlers.CreateSite)
		r.Post("/api/sites/{site_id}/hives", handlers.CreateHive)

		// Create site
		req := httptest.NewRequest("POST", "/api/sites", bytes.NewBufferString(`{"name":"Task RLS Site","timezone":"UTC"}`))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
		var siteResp handlers.SiteDataResponse
		require.NoError(t, json.NewDecoder(rec.Body).Decode(&siteResp))
		siteID := siteResp.Data.ID

		// Create hive
		req = httptest.NewRequest("POST", "/api/sites/"+siteID+"/hives", bytes.NewBufferString(`{"name":"Task RLS Hive"}`))
		req.Header.Set("Content-Type", "application/json")
		rec = httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
		var hiveResp handlers.HiveDataResponse
		require.NoError(t, json.NewDecoder(rec.Body).Decode(&hiveResp))
		hiveAID = hiveResp.Data.ID
	})

	// Create a task as Tenant A
	var taskAID string
	t.Run("Tenant A creates a task", func(t *testing.T) {
		customTitle := "Check varroa mite count"
		body, _ := json.Marshal(map[string]interface{}{
			"hive_id":      hiveAID,
			"custom_title": customTitle,
			"priority":     "high",
			"due_date":     "2025-10-01",
		})
		r := setupRouter(claimsA)
		r.Post("/api/tasks", handlers.CreateTask)

		req := httptest.NewRequest("POST", "/api/tasks", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
		var resp handlers.TaskDataResponse
		require.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))
		taskAID = resp.Data.ID
		assert.NotEmpty(t, taskAID)
		assert.Equal(t, customTitle, resp.Data.Title)
	})

	// Tenant A can list its tasks
	t.Run("Tenant A can list its own tasks", func(t *testing.T) {
		r := setupRouter(claimsA)
		r.Get("/api/tasks", handlers.ListTasks)

		req := httptest.NewRequest("GET", "/api/tasks", nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)
		var resp handlers.TasksListResponse
		require.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))

		found := false
		for _, task := range resp.Data {
			if task.ID == taskAID {
				found = true
			}
		}
		assert.True(t, found, "Tenant A should see its own task in the list")
	})

	// Tenant B's task list should not include Tenant A's tasks
	t.Run("Tenant B cannot see Tenant A tasks in list", func(t *testing.T) {
		r := setupRouter(claimsB)
		r.Get("/api/tasks", handlers.ListTasks)

		req := httptest.NewRequest("GET", "/api/tasks", nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)
		var resp handlers.TasksListResponse
		require.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))

		for _, task := range resp.Data {
			assert.NotEqual(t, taskAID, task.ID, "Tenant B must not see Tenant A's task")
		}
	})

	// Tenant B cannot GET Tenant A's task by ID
	t.Run("Tenant B cannot get Tenant A task by ID", func(t *testing.T) {
		r := setupRouter(claimsB)
		r.Get("/api/tasks/{id}", handlers.GetTask)

		req := httptest.NewRequest("GET", "/api/tasks/"+taskAID, nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	// Tenant B cannot DELETE Tenant A's task
	t.Run("Tenant B cannot delete Tenant A task", func(t *testing.T) {
		r := setupRouter(claimsB)
		r.Delete("/api/tasks/{id}", handlers.DeleteTask)

		req := httptest.NewRequest("DELETE", "/api/tasks/"+taskAID, nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	// Tenant B cannot complete Tenant A's task
	t.Run("Tenant B cannot complete Tenant A task", func(t *testing.T) {
		r := setupRouter(claimsB)
		r.Post("/api/tasks/{id}/complete", handlers.CompleteTask)

		req := httptest.NewRequest("POST", "/api/tasks/"+taskAID+"/complete", bytes.NewBufferString(`{}`))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	// Tenant B cannot list Tenant A's hive tasks (hive invisible via RLS)
	t.Run("Tenant B cannot list Tenant A hive tasks", func(t *testing.T) {
		r := setupRouter(claimsB)
		r.Get("/api/hives/{id}/tasks", handlers.ListTasksByHive)

		req := httptest.NewRequest("GET", "/api/hives/"+hiveAID+"/tasks", nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		// Hive not found for Tenant B via RLS.
		// The handler returns the list with hive tasks filtered by RLS,
		// or 404 if it checks hive existence first.
		statusOK := rec.Code == http.StatusOK || rec.Code == http.StatusNotFound
		assert.True(t, statusOK, "Expected 200 (empty list) or 404, got %d", rec.Code)

		if rec.Code == http.StatusOK {
			var resp handlers.TasksListResponse
			require.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))
			for _, task := range resp.Data {
				assert.NotEqual(t, taskAID, task.ID, "Tenant B must not see Tenant A's task even with hive filter")
			}
		}
	})

	// Verify Tenant A's task is still intact
	t.Run("Tenant A task is still intact", func(t *testing.T) {
		r := setupRouter(claimsA)
		r.Get("/api/tasks/{id}", handlers.GetTask)

		req := httptest.NewRequest("GET", "/api/tasks/"+taskAID, nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)
		var resp handlers.TaskDataResponse
		require.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))
		assert.Equal(t, taskAID, resp.Data.ID)
		assert.Equal(t, "high", resp.Data.Priority)
	})
}
