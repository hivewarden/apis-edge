// Package integration contains httptest integration tests for APIS server handlers.
package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/jermoo/apis/apis-server/internal/handlers"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/storage"
)

// setupTasksRouter creates a Chi router with auth middleware and task routes.
func setupTasksRouter(claims *middleware.Claims) *chi.Mux {
	r := chi.NewRouter()
	r.Use(mockAuthMiddleware(claims))
	r.Use(mockTenantMiddleware(testAppPool()))

	// Prerequisites
	r.Post("/api/sites", handlers.CreateSite)
	r.Post("/api/sites/{site_id}/hives", handlers.CreateHive)

	// Task routes
	r.Get("/api/tasks", handlers.ListTasks)
	r.Post("/api/tasks", handlers.CreateTask)
	r.Get("/api/tasks/{id}", handlers.GetTask)
	r.Patch("/api/tasks/{id}", handlers.UpdateTask)
	r.Delete("/api/tasks/{id}", handlers.DeleteTask)
	r.Post("/api/tasks/{id}/complete", handlers.CompleteTask)

	return r
}

func TestTasksCRUD(t *testing.T) {
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

	claims := &middleware.Claims{
		UserID:   "test-task-user",
		OrgID:    "test-tenant-tasks",
		TenantID: "test-tenant-tasks",
		Email:    "task@test.com",
		Name:     "Task Tester",
		Role:     "admin",
		Roles:    []string{"admin"},
	}

	router := setupTasksRouter(claims)

	// Create prerequisite site and hive
	var hiveID string

	t.Run("setup: create site and hive for tasks", func(t *testing.T) {
		// Create site
		siteBody := map[string]interface{}{
			"name":     "Task Test Site",
			"timezone": "Europe/Brussels",
		}
		bodyBytes, _ := json.Marshal(siteBody)
		req := httptest.NewRequest("POST", "/api/sites", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		require.Equal(t, http.StatusCreated, rec.Code)

		var siteResp handlers.SiteDataResponse
		err := json.NewDecoder(rec.Body).Decode(&siteResp)
		require.NoError(t, err)
		siteID := siteResp.Data.ID

		// Create hive
		hiveBody := map[string]interface{}{
			"name": "Task Test Hive",
		}
		bodyBytes, _ = json.Marshal(hiveBody)
		req = httptest.NewRequest("POST", "/api/sites/"+siteID+"/hives", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec = httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		require.Equal(t, http.StatusCreated, rec.Code)

		var hiveResp handlers.HiveDataResponse
		err = json.NewDecoder(rec.Body).Decode(&hiveResp)
		require.NoError(t, err)
		hiveID = hiveResp.Data.ID
	})

	var createdTaskID string

	t.Run("create task with custom title returns 201", func(t *testing.T) {
		require.NotEmpty(t, hiveID)

		customTitle := "Check queen cells"
		dueDate := "2026-03-01"
		body := map[string]interface{}{
			"hive_id":      hiveID,
			"custom_title": customTitle,
			"priority":     "high",
			"due_date":     dueDate,
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/tasks", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusCreated, rec.Code)

		var resp handlers.TaskDataResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.NotEmpty(t, resp.Data.ID)
		assert.Equal(t, hiveID, resp.Data.HiveID)
		assert.Equal(t, "Check queen cells", resp.Data.Title)
		assert.Equal(t, "high", resp.Data.Priority)
		assert.Equal(t, "pending", resp.Data.Status)
		assert.Equal(t, "manual", resp.Data.Source)
		assert.NotNil(t, resp.Data.DueDate)
		assert.Equal(t, dueDate, *resp.Data.DueDate)

		createdTaskID = resp.Data.ID
	})

	t.Run("create task missing hive_id returns 400", func(t *testing.T) {
		body := map[string]interface{}{
			"custom_title": "Orphan Task",
			"priority":     "low",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/tasks", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("create task missing both template_id and custom_title returns 400", func(t *testing.T) {
		body := map[string]interface{}{
			"hive_id":  hiveID,
			"priority": "low",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/tasks", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("create task with invalid priority returns 400", func(t *testing.T) {
		body := map[string]interface{}{
			"hive_id":      hiveID,
			"custom_title": "Bad Priority Task",
			"priority":     "super_high",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/tasks", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("list tasks returns 200 with data and meta", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/tasks", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.TasksListResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.NotNil(t, resp.Data)
		assert.GreaterOrEqual(t, resp.Meta.Total, 1)
	})

	t.Run("list tasks with status filter returns 200", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/tasks?status=pending", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.TasksListResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		// All returned tasks should be pending
		for _, task := range resp.Data {
			assert.Equal(t, "pending", task.Status)
		}
	})

	t.Run("list tasks with invalid status returns 400", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/tasks?status=invalid", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("get task by ID returns 200", func(t *testing.T) {
		require.NotEmpty(t, createdTaskID)

		req := httptest.NewRequest("GET", "/api/tasks/"+createdTaskID, nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.TaskDataResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.Equal(t, createdTaskID, resp.Data.ID)
	})

	t.Run("get non-existent task returns 404", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/tasks/00000000-0000-0000-0000-000000000099", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("update task priority returns 200", func(t *testing.T) {
		require.NotEmpty(t, createdTaskID)

		body := map[string]interface{}{
			"priority": "urgent",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("PATCH", "/api/tasks/"+createdTaskID, bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.TaskDataResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.Equal(t, "urgent", resp.Data.Priority)
	})

	t.Run("update non-existent task returns 404", func(t *testing.T) {
		body := map[string]interface{}{"priority": "low"}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("PATCH", "/api/tasks/00000000-0000-0000-0000-000000000099", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("complete task returns 200", func(t *testing.T) {
		require.NotEmpty(t, createdTaskID)

		req := httptest.NewRequest("POST", "/api/tasks/"+createdTaskID+"/complete", bytes.NewBuffer([]byte("{}")))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.TaskDataResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.Equal(t, "completed", resp.Data.Status)
		assert.NotNil(t, resp.Data.CompletedAt)
	})

	t.Run("complete already completed task returns 400", func(t *testing.T) {
		require.NotEmpty(t, createdTaskID)

		req := httptest.NewRequest("POST", "/api/tasks/"+createdTaskID+"/complete", bytes.NewBuffer([]byte("{}")))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	// Create a new task to test delete
	var deleteTaskID string
	t.Run("setup: create task for deletion", func(t *testing.T) {
		body := map[string]interface{}{
			"hive_id":      hiveID,
			"custom_title": "Task to delete",
			"priority":     "low",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/tasks", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)
		require.Equal(t, http.StatusCreated, rec.Code)

		var resp handlers.TaskDataResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)
		deleteTaskID = resp.Data.ID
	})

	t.Run("delete task returns 204", func(t *testing.T) {
		require.NotEmpty(t, deleteTaskID)

		req := httptest.NewRequest("DELETE", "/api/tasks/"+deleteTaskID, nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNoContent, rec.Code)
	})

	t.Run("delete non-existent task returns 404", func(t *testing.T) {
		req := httptest.NewRequest("DELETE", "/api/tasks/00000000-0000-0000-0000-000000000099", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
}
