# Story 13.16: Audit Log Infrastructure

Status: done

## Story

As a tenant admin,
I want all data modifications logged,
so that I can track changes and investigate issues.

## Acceptance Criteria

1. **AC1: Audit service captures all CUD operations**
   - Create/Update/Delete operations are captured with before/after state
   - Entities to audit: hives, inspections, treatments, feedings, harvests, sites, units, users, clips (delete only)
   - Service is called from handlers after successful DB operations

2. **AC2: Sensitive data is masked**
   - Passwords NEVER appear in audit logs (mask or omit password_hash field)
   - API keys are masked (show only last 4 characters)
   - Email addresses are logged (not considered sensitive for audit purposes)

3. **AC3: GET /api/audit endpoint**
   - Admin only (require admin role)
   - Query filters: entity_type, user_id, action, date range (start_date, end_date)
   - Pagination with limit/offset
   - Results scoped to tenant via RLS
   - Response includes user name/email for human readability

4. **AC4: GET /api/audit/entity/{type}/{id} endpoint**
   - Admin only
   - Returns complete audit history for a specific entity
   - Sorted by created_at DESC (most recent first)
   - Results scoped to tenant

5. **AC5: Audit log entries are immutable**
   - No UPDATE or DELETE operations on audit_log table
   - Entries include: id, tenant_id, user_id, action, entity_type, entity_id, old_values, new_values, ip_address, created_at

## Technical Context

### Database Schema (Already Exists)

Migration `0024_audit_log.sql` already created the audit_log table:

```sql
CREATE TABLE audit_log (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,           -- 'create', 'update', 'delete'
    entity_type TEXT NOT NULL,      -- 'inspection', 'hive', etc.
    entity_id TEXT NOT NULL,
    old_values JSONB,               -- NULL for create
    new_values JSONB,               -- NULL for delete
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Indexes exist for:
- (tenant_id, created_at DESC) - primary query pattern
- (tenant_id, entity_type, entity_id) - entity history queries
- (tenant_id, user_id) - user activity queries

RLS enabled with tenant isolation policies.

### Entities to Audit

| Entity | Create | Update | Delete |
|--------|--------|--------|--------|
| hives | Yes | Yes | Yes |
| inspections | Yes | Yes | Yes |
| treatments | Yes | Yes | Yes |
| feedings | Yes | Yes | Yes |
| harvests | Yes | Yes | Yes |
| sites | Yes | Yes | Yes |
| units | Yes | Yes | Yes |
| users | Yes (no password) | Yes (no password) | Yes |
| clips | No | No | Yes |

### Sensitive Field Masking

```go
var sensitiveFields = map[string]bool{
    "password_hash": true,
    "api_key":       true,
    "api_key_encrypted": true,
}

func maskSensitiveFields(data map[string]interface{}) map[string]interface{} {
    masked := make(map[string]interface{})
    for k, v := range data {
        if sensitiveFields[k] {
            if k == "password_hash" {
                continue // Omit entirely
            }
            // Mask API keys showing only last 4 chars
            if str, ok := v.(string); ok && len(str) > 4 {
                masked[k] = "****" + str[len(str)-4:]
            } else {
                masked[k] = "****"
            }
        } else {
            masked[k] = v
        }
    }
    return masked
}
```

### API Specification

#### GET /api/audit

Query Parameters:
- `entity_type` (optional): Filter by entity type
- `user_id` (optional): Filter by user who made changes
- `action` (optional): Filter by action (create, update, delete)
- `start_date` (optional): ISO 8601 date, filter entries >= date
- `end_date` (optional): ISO 8601 date, filter entries <= date
- `limit` (optional): Max results, default 50, max 100
- `offset` (optional): Pagination offset, default 0

Response (200):
```json
{
  "data": [
    {
      "id": "uuid",
      "user_id": "user-uuid",
      "user_name": "John Doe",
      "user_email": "john@example.com",
      "action": "update",
      "entity_type": "hive",
      "entity_id": "hive-uuid",
      "old_values": {"name": "Hive 1"},
      "new_values": {"name": "Hive A"},
      "ip_address": "192.168.1.1",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ],
  "meta": {
    "total": 150,
    "limit": 50,
    "offset": 0
  }
}
```

#### GET /api/audit/entity/{type}/{id}

Response (200):
```json
{
  "data": [
    {
      "id": "uuid",
      "user_id": "user-uuid",
      "user_name": "John Doe",
      "user_email": "john@example.com",
      "action": "create",
      "entity_type": "hive",
      "entity_id": "hive-uuid",
      "old_values": null,
      "new_values": {"name": "Hive 1", "brood_boxes": 2},
      "ip_address": "192.168.1.1",
      "created_at": "2024-01-10T09:00:00Z"
    }
  ],
  "meta": {
    "total": 5
  }
}
```

### Existing Patterns

From handlers (e.g., `hives.go`):
- Use `middleware.GetTenantID(r.Context())` for tenant context
- Use `middleware.GetClaims(r.Context())` for user info
- Storage functions return the created/updated entity
- RLS enforced automatically via `app.tenant_id`

## Tasks

### Backend

#### Task 1: Create Audit Service (audit_service.go)
- [x] Create `internal/services/audit.go`
- [x] Implement `LogCreate(ctx, pool, entityType, entityID, newValues) error`
- [x] Implement `LogUpdate(ctx, pool, entityType, entityID, oldValues, newValues) error`
- [x] Implement `LogDelete(ctx, pool, entityType, entityID, oldValues) error`
- [x] Extract user_id, tenant_id, ip_address from context
- [x] Implement `maskSensitiveFields()` helper
- [x] Use struct-to-map conversion for JSONB serialization

#### Task 2: Create Audit Storage (audit_log.go)
- [x] Create `internal/storage/audit_log.go`
- [x] Implement `InsertAuditEntry(ctx, pool, entry) error`
- [x] Implement `ListAuditLog(ctx, pool, filters) ([]AuditEntry, int, error)` with pagination
- [x] Implement `GetEntityAuditHistory(ctx, pool, entityType, entityID) ([]AuditEntry, error)`
- [x] AuditEntry struct with all fields including user name/email joins
- [x] AuditFilters struct for query parameters

#### Task 3: Create Audit Handlers (audit.go)
- [x] Create `internal/handlers/audit.go`
- [x] `ListAuditLog(pool) http.HandlerFunc` - GET /api/audit
- [x] `GetEntityHistory(pool) http.HandlerFunc` - GET /api/audit/entity/{type}/{id}
- [x] Request validation for filters
- [x] Admin role check (require "admin" role)
- [x] Response type definitions

#### Task 4: Register Routes
- [x] Add routes to main.go under /api group
- [x] Apply RequireRole("admin") middleware to both endpoints

#### Task 5: Integrate Audit Calls into Handlers
- [x] Modify `hives.go`: CreateHive, UpdateHive, DeleteHive
- [x] Modify `inspections.go`: CreateInspection, UpdateInspection, DeleteInspection
- [x] Modify `treatments.go`: CreateTreatment, UpdateTreatment, DeleteTreatment
- [x] Modify `feedings.go`: CreateFeeding, UpdateFeeding, DeleteFeeding
- [x] Modify `harvests.go`: CreateHarvest, UpdateHarvest, DeleteHarvest
- [x] Modify `sites.go`: CreateSite, UpdateSite, DeleteSite
- [x] Modify `units.go`: CreateUnit, UpdateUnit, DeleteUnit
- [x] Modify `users.go`: CreateUser, UpdateUser, DeleteUser (mask passwords)
- [x] Modify `clips.go`: DeleteClip only

### Testing

#### Task 6: Write Tests
- [x] Test audit service masking logic
- [x] Test storage queries with filters
- [x] Test handler authorization (non-admin rejected)
- [x] Test entity history query

## Dev Notes

### Implementation Strategy

1. **Service-based approach** - Create a dedicated audit service that handlers call after successful operations, rather than middleware that wraps everything. This is cleaner and allows selective auditing.

2. **Async consideration** - Audit logging should NOT block the main operation. Consider using a goroutine with error logging, or a channel-based queue. For MVP, synchronous is acceptable but document the trade-off.

3. **Old values capture** - For updates, handlers need to fetch the entity BEFORE updating to capture old values. This adds one extra DB read per update. Alternative: Use PostgreSQL's `RETURNING` with a CTE to get both old and new in one query.

4. **IP address extraction** - Use `r.RemoteAddr` or check `X-Forwarded-For` header for proxied requests. Store via context.

### Context Extension

Add IP address to context in a new middleware or extend existing auth middleware:

```go
// In middleware/audit_context.go
func WithAuditContext(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        ctx := r.Context()
        ip := extractIPAddress(r)
        ctx = context.WithValue(ctx, ipAddressKey, ip)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}

func extractIPAddress(r *http.Request) string {
    // Check X-Forwarded-For first (for proxied requests)
    xff := r.Header.Get("X-Forwarded-For")
    if xff != "" {
        parts := strings.Split(xff, ",")
        return strings.TrimSpace(parts[0])
    }
    // Fall back to RemoteAddr
    host, _, _ := net.SplitHostPort(r.RemoteAddr)
    return host
}
```

### Project Structure Notes

- New files follow existing patterns in `internal/services/`, `internal/storage/`, `internal/handlers/`
- Tests go in `tests/services/`, `tests/storage/`, `tests/handlers/` directories
- Entity type strings should match table names (e.g., "hives", "inspections")

### References

- [Source: _bmad-output/planning-artifacts/epic-13-dual-auth-mode.md#story-1316] - Story requirements
- [Source: _bmad-output/planning-artifacts/architecture.md#audit-log] - Table schema
- [Source: apis-server/internal/storage/migrations/0024_audit_log.sql] - Existing migration
- [Source: apis-server/internal/handlers/hives.go] - Handler patterns
- [Source: apis-server/internal/middleware/auth.go] - Context extraction patterns

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Completion Notes

All tasks completed:
- Created `internal/services/audit.go` with AuditService, context helpers, and sensitive field masking
- Created `internal/storage/audit_log.go` with ListAuditLog and GetEntityAuditHistory queries
- Created `internal/handlers/audit.go` with admin-only endpoints for querying audit logs
- Created `internal/handlers/audit_helpers.go` with global audit service setter and wrapper functions
- Created `internal/middleware/audit.go` with AuditContextMiddleware to extract tenant/user/IP from context
- Registered routes in main.go with RequireRole("admin") middleware
- Integrated audit calls into all CUD handlers: hives, inspections, treatments, feedings, harvests, sites, units, users, clips (delete only)
- Tests pass for audit service (ExtractIPAddress, WithAuditContext, GetAuditTenantID/UserID/IPAddress)

Implementation notes:
- Used async audit insertion via goroutine to not block main operations
- Resolved import cycle by using dedicated context keys instead of importing middleware in services
- For update/delete operations, handlers fetch entity BEFORE operation to capture old values

### Change Log

- [2026-01-27] Story created by create-story workflow
- [2026-01-27] All tasks completed, status set to review
- [2026-01-27] Code review fixes: Added handler tests, storage tests, entity_type validation, masking tests. Status set to done.
