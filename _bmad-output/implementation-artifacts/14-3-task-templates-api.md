# Story 14.3: Task Templates API + Copy-on-First-Use

Status: review

## Story

As a **user**,
I want **to access predefined task templates and create custom ones**,
so that **I can quickly assign common tasks to hives**.

## Acceptance Criteria

### AC1: GET /api/task-templates - List All Templates
- Returns system templates (tenant_id = NULL, is_system = TRUE) - always visible to all tenants
- Returns tenant custom templates (tenant_id = current tenant)
- Each template includes `auto_effects` JSONB schema for UI rendering
- System templates marked with `is_system: true`
- Sorted by: system templates first, then custom templates by created_at DESC
- Response format: `{"data": [...]}`
- No pagination (template count is small per tenant)

### AC2: POST /api/task-templates - Create Custom Template
- Validates: `name` is required (1-100 chars)
- Sets `type = 'custom'` automatically
- Sets `tenant_id` to current tenant
- Sets `is_system = false`
- Sets `created_by` to current user
- Sets `auto_effects = NULL` (v1 - custom templates don't have auto-effects)
- Description is optional (max 500 chars)
- Returns created template with 201 status
- Response format: `{"data": {...}}`

### AC3: DELETE /api/task-templates/{id} - Delete Custom Template
- Only allows deleting tenant-owned templates (is_system = false AND tenant_id = current tenant)
- Returns 403 Forbidden if attempting to delete system template with message "Cannot delete system template"
- Returns 404 Not Found if template not found or belongs to different tenant
- Existing tasks referencing template are NOT deleted (foreign key remains, template_id preserved)
- Returns 204 No Content on success

### AC4: Copy-on-First-Use Logic
- System templates are used directly when creating tasks (no copy needed)
- If tenant wants to customize a system template, they create a new custom template instead
- Per PRD: "system templates are used directly without copying. Custom templates are separate tenant-owned records"
- No automatic copying occurs - this AC documents the design decision

### AC5: Authentication and Tenant Isolation
- All endpoints require JWT authentication
- Tenant isolation via RLS (app.tenant_id session variable)
- System templates visible to all authenticated users
- Custom templates only visible to owning tenant

## Tasks / Subtasks

- [x] **Task 1: Create storage layer for task templates** (AC: 1-3, 5)
  - [x] 1.1 Add to `apis-server/internal/storage/task_templates.go`:
    - Create new file (separate from tasks.go for clarity)
  - [x] 1.2 Implement `ListTaskTemplates(ctx, conn)` returning `[]TaskTemplate`
    - Query both system templates (tenant_id IS NULL) and tenant templates
    - Sort: is_system DESC (system first), then created_at DESC
  - [x] 1.3 Implement `GetTaskTemplateByID(ctx, conn, id)` returning `*TaskTemplate`
    - Used for validation before delete
    - Returns ErrNotFound if not found
  - [x] 1.4 Implement `CreateTaskTemplate(ctx, conn, tenantID, userID, input)` returning `*TaskTemplate`
    - Sets type='custom', is_system=false automatically
    - Sets auto_effects=NULL
  - [x] 1.5 Implement `DeleteTaskTemplate(ctx, conn, id)` returning error
    - Hard delete (FK constraint allows orphaned tasks)
    - Returns ErrNotFound if not found
  - [x] 1.6 Add `CreateTaskTemplateInput` struct with Name, Description fields
  - [x] 1.7 Add `ErrCannotDeleteSystemTemplate` error

- [x] **Task 2: Create HTTP handlers for task templates** (AC: 1-5)
  - [x] 2.1 Create `apis-server/internal/handlers/task_templates.go`
  - [x] 2.2 Implement `ListTaskTemplates` handler
    - GET /api/task-templates
    - Returns all system + tenant templates
    - Response: `{"data": [...]}`
  - [x] 2.3 Implement `CreateTaskTemplate` handler
    - POST /api/task-templates
    - Validates name required (1-100 chars)
    - Validates description optional (max 500 chars)
    - Returns 201 with `{"data": {...}}`
  - [x] 2.4 Implement `DeleteTaskTemplate` handler
    - DELETE /api/task-templates/{id}
    - Check is_system - return 403 if true
    - Check tenant_id matches - return 404 if not
    - Returns 204 on success
  - [x] 2.5 Add `CreateTaskTemplateRequest` struct
  - [x] 2.6 Add `TaskTemplateResponse` struct
  - [x] 2.7 Add `taskTemplateToResponse` conversion helper

- [x] **Task 3: Register routes in main.go** (AC: 1-3)
  - [x] 3.1 Add task template routes under authenticated router group:
    - `GET /api/task-templates` -> ListTaskTemplates
    - `POST /api/task-templates` -> CreateTaskTemplate
    - `DELETE /api/task-templates/{id}` -> DeleteTaskTemplate

- [x] **Task 4: Write unit tests** (AC: 1-5)
  - [x] 4.1 Create `apis-server/tests/handlers/task_templates_test.go`
  - [x] 4.2 Test ListTaskTemplates returns system + tenant templates
  - [x] 4.3 Test ListTaskTemplates sorts correctly (system first)
  - [x] 4.4 Test CreateTaskTemplate with valid data
  - [x] 4.5 Test CreateTaskTemplate validates name required
  - [x] 4.6 Test CreateTaskTemplate validates name length
  - [x] 4.7 Test CreateTaskTemplate validates description length
  - [x] 4.8 Test CreateTaskTemplate sets correct defaults (type=custom, is_system=false)
  - [x] 4.9 Test DeleteTaskTemplate succeeds for custom template
  - [x] 4.10 Test DeleteTaskTemplate returns 403 for system template
  - [x] 4.11 Test DeleteTaskTemplate returns 404 for non-existent template
  - [x] 4.12 Test DeleteTaskTemplate returns 404 for other tenant's template
  - [x] 4.13 Test tasks with deleted template still work (FK preserved)
  - [x] 4.14 Test all endpoints require authentication

## Dev Notes

### Architecture Compliance

**Database:** YugabyteDB (PostgreSQL-compatible). Table created in story 14.1:
- `task_templates` with RLS policy allowing both system (tenant_id IS NULL) and tenant templates

**Go Patterns (from CLAUDE.md):**
```go
// Error wrapping
if err != nil {
    return fmt.Errorf("storage: failed to list templates: %w", err)
}

// Structured logging (zerolog)
log.Info().
    Str("template_id", template.ID).
    Str("tenant_id", tenantID).
    Msg("Task template created")

// Handler error response
func respondError(w http.ResponseWriter, msg string, code int)
```

**API Response Format (from CLAUDE.md):**
```json
// Success single
{"data": {...}}

// Success list
{"data": [...]}

// Error
{"error": "Cannot delete system template", "code": 403}
```

**Naming Conventions:**
- Go files: snake_case (`task_templates.go`)
- Go functions: PascalCase (`ListTaskTemplates`)
- JSON fields: snake_case (`is_system`, `auto_effects`)
- API endpoints: plural, kebab-case (`/api/task-templates`)

### TaskTemplate Struct (already defined in storage/tasks.go)

```go
type TaskTemplate struct {
    ID          string          `json:"id"`
    TenantID    *string         `json:"tenant_id,omitempty"`
    Type        string          `json:"type"`
    Name        string          `json:"name"`
    Description *string         `json:"description,omitempty"`
    AutoEffects json.RawMessage `json:"auto_effects,omitempty"`
    IsSystem    bool            `json:"is_system"`
    CreatedAt   time.Time       `json:"created_at"`
    CreatedBy   *string         `json:"created_by,omitempty"`
}
```

### Storage Layer Pattern

Follow existing pattern from `storage/tasks.go`:

```go
// New file: task_templates.go
package storage

type CreateTaskTemplateInput struct {
    Name        string  `json:"name"`
    Description *string `json:"description,omitempty"`
}

var ErrCannotDeleteSystemTemplate = errors.New("cannot delete system template")

func ListTaskTemplates(ctx context.Context, conn *pgxpool.Conn) ([]TaskTemplate, error) {
    // Query with ORDER BY is_system DESC, created_at DESC
}

func GetTaskTemplateByID(ctx context.Context, conn *pgxpool.Conn, id string) (*TaskTemplate, error) {
    // Simple SELECT, returns ErrNotFound if missing
}

func CreateTaskTemplate(ctx context.Context, conn *pgxpool.Conn, tenantID, userID string, input *CreateTaskTemplateInput) (*TaskTemplate, error) {
    // INSERT with type='custom', is_system=false, auto_effects=NULL
}

func DeleteTaskTemplate(ctx context.Context, conn *pgxpool.Conn, id string) error {
    // Check is_system first, return ErrCannotDeleteSystemTemplate if true
    // Then DELETE
}
```

### Handler Layer Pattern

Follow existing pattern from `handlers/tasks.go`:

```go
// New file: task_templates.go
package handlers

type TaskTemplateResponse struct {
    ID          string           `json:"id"`
    TenantID    *string          `json:"tenant_id,omitempty"`
    Type        string           `json:"type"`
    Name        string           `json:"name"`
    Description *string          `json:"description,omitempty"`
    AutoEffects json.RawMessage  `json:"auto_effects,omitempty"`
    IsSystem    bool             `json:"is_system"`
    CreatedAt   time.Time        `json:"created_at"`
    CreatedBy   *string          `json:"created_by,omitempty"`
}

type CreateTaskTemplateRequest struct {
    Name        string  `json:"name"`
    Description *string `json:"description,omitempty"`
}

type TaskTemplatesListResponse struct {
    Data []TaskTemplateResponse `json:"data"`
}

type TaskTemplateDataResponse struct {
    Data TaskTemplateResponse `json:"data"`
}
```

### RLS Policy (from 14.1 migration)

The task_templates table has this RLS policy:
```sql
CREATE POLICY task_templates_access ON task_templates
    USING (
        tenant_id IS NULL  -- System templates visible to all
        OR tenant_id = current_setting('app.tenant_id')::uuid  -- Tenant templates
    );
```

This means:
- System templates (tenant_id = NULL) visible to ALL tenants
- Tenant templates only visible to owning tenant
- No additional filtering needed in storage layer - RLS handles isolation

### System Templates (seeded in 14.1)

The following system templates exist with is_system=true, tenant_id=NULL:
1. Requeen - updates queen_introduced_at and queen_source
2. Add frame - no auto-effects (tracked via inspections)
3. Remove frame - no auto-effects
4. Harvest frames - creates harvest record
5. Add feed - creates feeding record
6. Treatment - creates treatment record
7. Add brood box - increments hive.brood_boxes
8. Add honey super - increments hive.honey_supers
9. Remove box - decrements brood_boxes or honey_supers

### Route Registration Pattern

Follow existing pattern in main.go:
```go
// Task templates routes
r.Get("/api/task-templates", handlers.ListTaskTemplates)
r.Post("/api/task-templates", handlers.CreateTaskTemplate)
r.Delete("/api/task-templates/{id}", handlers.DeleteTaskTemplate)
```

### Validation Rules

**Name validation:**
- Required (non-empty after trimming)
- Min length: 1 character
- Max length: 100 characters
- Error: "Name is required" or "Name must be between 1 and 100 characters"

**Description validation:**
- Optional
- Max length: 500 characters
- Error: "Description must not exceed 500 characters"

### Error Responses

| Scenario | Status | Body |
|----------|--------|------|
| Delete system template | 403 | `{"error": "Cannot delete system template", "code": 403}` |
| Delete not found | 404 | `{"error": "Template not found", "code": 404}` |
| Delete other tenant's | 404 | `{"error": "Template not found", "code": 404}` |
| Name empty | 400 | `{"error": "Name is required", "code": 400}` |
| Name too long | 400 | `{"error": "Name must be between 1 and 100 characters", "code": 400}` |
| Description too long | 400 | `{"error": "Description must not exceed 500 characters", "code": 400}` |
| Invalid JSON | 400 | `{"error": "Invalid request body", "code": 400}` |

### Project Structure Notes

**Files to Create:**
- `/Users/jermodelaruelle/Projects/apis/apis-server/internal/storage/task_templates.go`
- `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/task_templates.go`
- `/Users/jermodelaruelle/Projects/apis/apis-server/tests/handlers/task_templates_test.go`

**Files to Modify:**
- `/Users/jermodelaruelle/Projects/apis/apis-server/cmd/server/main.go` - Add routes

**Dependencies (from story 14.1 - DONE):**
- `task_templates` table exists with all required columns
- RLS policy active allowing system + tenant templates
- System templates seeded with auto_effects JSON
- TaskTemplate struct exists in storage/tasks.go (reuse it)

### Testing Requirements

Tests should verify:
1. List returns both system and custom templates
2. List sorts correctly (system first, then by created_at DESC)
3. Create sets type='custom', is_system=false, auto_effects=NULL
4. Create validates name length
5. Create validates description length
6. Delete fails with 403 for system templates
7. Delete fails with 404 for other tenant's templates
8. Delete succeeds for own custom templates
9. Tasks with deleted template still work
10. All endpoints require authentication

### References

- [Source: _bmad-output/planning-artifacts/epic-14-hive-task-management.md#Story-14.3]
- [Source: CLAUDE.md#Go-Patterns]
- [Source: CLAUDE.md#API-Response-Format]
- [Source: apis-server/internal/storage/tasks.go - TaskTemplate struct]
- [Source: apis-server/internal/handlers/tasks.go - Handler patterns]
- [Source: _bmad-output/implementation-artifacts/14-1-database-migrations.md - Table schema, RLS policies]
- [Source: _bmad-output/implementation-artifacts/14-2-task-crud-api-endpoints.md - Handler patterns, route registration]

## Test Criteria

- [x] GET /api/task-templates returns system + tenant templates
- [x] GET /api/task-templates sorts system templates first
- [x] POST /api/task-templates creates custom template with correct defaults
- [x] POST /api/task-templates validates name is required
- [x] POST /api/task-templates validates name length (1-100)
- [x] POST /api/task-templates validates description length (max 500)
- [x] DELETE /api/task-templates/{id} returns 403 for system template
- [x] DELETE /api/task-templates/{id} returns 404 for non-existent template
- [x] DELETE /api/task-templates/{id} returns 404 for other tenant's template
- [x] DELETE /api/task-templates/{id} returns 204 for own custom template
- [x] Tasks with deleted template retain template_id (no cascade delete)
- [x] All endpoints require JWT authentication
- [x] RLS ensures tenant isolation for custom templates

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

None - implementation completed without issues.

### Completion Notes List

- Created storage layer for task templates in `apis-server/internal/storage/task_templates.go` with:
  - `ListTaskTemplates` - lists all visible templates (system + tenant), sorted by is_system DESC then created_at DESC
  - `GetTaskTemplateByID` - retrieves a template by ID, returns ErrNotFound if not visible
  - `CreateTaskTemplate` - creates custom template with type='custom', is_system=false, auto_effects=NULL
  - `DeleteTaskTemplate` - deletes custom template, returns ErrCannotDeleteSystemTemplate for system templates
  - `CreateTaskTemplateInput` struct for create input
  - `ErrCannotDeleteSystemTemplate` error for 403 responses

- Created HTTP handlers in `apis-server/internal/handlers/task_templates.go` with:
  - `ListTaskTemplates` handler (GET /api/task-templates) - returns {"data": [...]}
  - `CreateTaskTemplate` handler (POST /api/task-templates) - validates name (1-100 chars), description (max 500), returns 201
  - `DeleteTaskTemplate` handler (DELETE /api/task-templates/{id}) - returns 403 for system, 404 for not found, 204 on success
  - `TaskTemplateResponse`, `TaskTemplatesListResponse`, `TaskTemplateDataResponse`, `CreateTaskTemplateRequest` structs
  - `taskTemplateToResponse` conversion helper
  - Audit logging for create/delete operations

- Registered routes in `apis-server/cmd/server/main.go` under authenticated router group

- Created comprehensive unit tests in `apis-server/tests/handlers/task_templates_test.go`:
  - 16 test functions covering all acceptance criteria
  - Tests for list, create, delete operations
  - Validation tests for name/description length
  - Error response format tests
  - Sort order verification
  - Tenant isolation documentation tests
  - Authentication requirement tests

- All new code compiles successfully
- All task template tests pass (16 tests)
- Pre-existing test failures in other files are unrelated to this implementation

### File List

**Files Created:**
- apis-server/internal/storage/task_templates.go
- apis-server/internal/handlers/task_templates.go
- apis-server/tests/handlers/task_templates_test.go

**Files Modified:**
- apis-server/cmd/server/main.go (added 3 routes for task templates)

### Change Log

- 2026-01-30: Implemented Task Templates API (Story 14.3) - storage layer, handlers, routes, and tests

