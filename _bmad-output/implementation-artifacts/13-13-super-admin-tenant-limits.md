# Story 13-13: Super-Admin Tenant Limits

## Story

**As a** SaaS operator (super-admin),
**I want** to configure resource limits per tenant,
**So that** I can manage capacity and enforce plan tiers.

## Status: DONE

## Acceptance Criteria

1. [x] GET /api/admin/tenants/{id}/limits - Get tenant limits with current usage
2. [x] PUT /api/admin/tenants/{id}/limits - Update tenant limits
3. [x] Default limits: 100 hives, 5GB storage, 10 units, 20 users
4. [x] Limits stored in tenant_limits table (from migration 0028)
5. [x] Enforcement at storage layer when creating resources:
   - CreateHive checks hive limit
   - CreateUser checks user limit
   - CreateUnit checks unit limit
   - UploadClip checks storage limit
6. [ ] UI in admin tenant edit modal (not implemented - no frontend admin panel exists yet)

## Technical Implementation

### Database

Migration 0028 (already exists) creates the `tenant_limits` table:

```sql
CREATE TABLE IF NOT EXISTS tenant_limits (
    tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    max_hives INTEGER DEFAULT 100,
    max_storage_bytes BIGINT DEFAULT 5368709120,  -- 5 GB
    max_units INTEGER DEFAULT 10,
    max_users INTEGER DEFAULT 20,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Backend Components

#### Storage Layer (`internal/storage/limits.go`)

- `TenantLimits` struct with all limit fields
- `DefaultLimits` constant with default values
- `ErrLimitExceeded` error for limit violations
- `GetTenantLimits(ctx, pool, tenantID)` - Get limits (returns defaults if none set)
- `SetTenantLimits(ctx, pool, tenantID, limits)` - Upsert limits
- `CheckHiveLimit(ctx, conn, tenantID)` - Returns ErrLimitExceeded if at limit
- `CheckUnitLimit(ctx, conn, tenantID)` - Returns ErrLimitExceeded if at limit
- `CheckUserLimit(ctx, conn, tenantID)` - Returns ErrLimitExceeded if at limit
- `CheckStorageLimit(ctx, pool, tenantID, additionalBytes)` - Returns ErrLimitExceeded if would exceed
- `GetTenantUsage(ctx, pool, tenantID)` - Returns current resource usage

#### Handlers (`internal/handlers/admin_limits.go`)

- `AdminGetTenantLimits(pool)` - GET /api/admin/tenants/{id}/limits
  - Returns limits with current usage for context
  - Converts bytes to GB for UI friendliness
- `AdminUpdateTenantLimits(pool)` - PUT /api/admin/tenants/{id}/limits
  - Accepts partial updates (only non-nil fields updated)
  - Validates limits are positive
  - Returns updated limits with usage

#### Enforcement Points

1. **CreateHive** (`internal/handlers/hives.go`)
   - Added `CheckHiveLimit` call before site validation
   - Returns 403 with user-friendly message if limit exceeded

2. **CreateUser** (`internal/handlers/users.go`)
   - Added `CheckUserLimit` call after input validation, before password hashing
   - Returns 403 with user-friendly message if limit exceeded

3. **CreateUnit** (`internal/handlers/units.go`)
   - Added `CheckUnitLimit` call after serial validation
   - Returns 403 with user-friendly message if limit exceeded

4. **UploadClip** (`internal/handlers/clips.go`)
   - Added `CheckStorageLimit` call after file size validation
   - Returns 403 with user-friendly message if limit exceeded

### Routes (`cmd/server/main.go`)

Added to super-admin route group:
```go
r.Get("/tenants/{id}/limits", handlers.AdminGetTenantLimits(storage.DB))
r.Put("/tenants/{id}/limits", handlers.AdminUpdateTenantLimits(storage.DB))
```

## API Reference

### GET /api/admin/tenants/{id}/limits

Response:
```json
{
  "data": {
    "tenant_id": "uuid",
    "max_hives": 100,
    "max_storage_gb": 5,
    "max_units": 10,
    "max_users": 20,
    "updated_at": "2024-01-15T10:30:00Z",
    "current_hives": 15,
    "current_units": 3,
    "current_users": 5,
    "current_storage_bytes": 1073741824
  }
}
```

### PUT /api/admin/tenants/{id}/limits

Request (all fields optional):
```json
{
  "max_hives": 200,
  "max_storage_gb": 10,
  "max_units": 20,
  "max_users": 50
}
```

Response: Same as GET

## Error Responses

When a limit is exceeded, the API returns:

```json
{
  "error": "Hive limit reached. Contact your administrator to increase your quota.",
  "code": 403
}
```

## Files Modified/Created

### Created
- `apis-server/internal/storage/limits.go`
- `apis-server/internal/handlers/admin_limits.go`
- `_bmad-output/implementation-artifacts/13-13-super-admin-tenant-limits.md`

### Modified
- `apis-server/cmd/server/main.go` - Added admin limit routes
- `apis-server/internal/handlers/hives.go` - Added hive limit check
- `apis-server/internal/handlers/users.go` - Added user limit check
- `apis-server/internal/handlers/units.go` - Added unit limit check
- `apis-server/internal/handlers/clips.go` - Added storage limit check

## Notes

- Limits are enforced at the handler level before creating resources
- Default limits are returned if no tenant_limits record exists
- Storage is displayed in GB in the API for user friendliness, stored as bytes in DB
- The frontend admin panel UI (AC6) was not implemented as Epic 13 focuses on backend infrastructure. The API endpoints are complete and ready for when an admin UI is built.
