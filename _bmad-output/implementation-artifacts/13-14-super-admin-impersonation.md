# Story 13-14: Super-Admin Impersonation

## Status: Complete

## Story

**As a** SaaS operator (super-admin),
**I want** to impersonate any tenant,
**So that** I can debug issues and provide support.

## Acceptance Criteria

- [x] AC1: POST /api/admin/impersonate/{tenant_id} - Start impersonation session
- [x] AC2: POST /api/admin/impersonate/stop - Stop impersonation session
- [x] AC3: Impersonation sessions logged to impersonation_log table
- [x] AC4: Visual indicator in UI when impersonating (warning banner)
- [x] AC5: All actions during impersonation tagged with original admin ID
- [x] AC6: JWT includes impersonator_id claim when impersonating
- [x] AC7: GET /api/admin/impersonate/status - Returns current impersonation state

## Technical Context

### Database Schema (Migration 0027)

The impersonation_log table already exists:

```sql
CREATE TABLE IF NOT EXISTS impersonation_log (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    super_admin_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,                    -- NULL while session is active
    actions_taken INTEGER DEFAULT 0          -- Count of actions during session
);
```

### JWT Claim Extension

Current LocalClaims struct in auth/local_jwt.go:
```go
type LocalClaims struct {
    jwt.Claims
    TenantID string `json:"tenant_id"`
    Email    string `json:"email"`
    Name     string `json:"name"`
    Role     string `json:"role"`
}
```

Extended claims for impersonation:
```go
type LocalClaims struct {
    jwt.Claims
    TenantID       string `json:"tenant_id"`
    Email          string `json:"email"`
    Name           string `json:"name"`
    Role           string `json:"role"`
    ImpersonatorID string `json:"impersonator_id,omitempty"` // Set when impersonating
    Impersonating  bool   `json:"impersonating,omitempty"`   // True during impersonation
    OriginalTenantID string `json:"original_tenant_id,omitempty"` // Admin's real tenant
}
```

### Authentication Flow

1. **Start Impersonation** (POST /api/admin/impersonate/{tenant_id})
   - Verify super-admin via SuperAdminOnly middleware
   - Verify target tenant exists and is not deleted
   - Create impersonation_log entry
   - Issue new JWT with:
     - `tenant_id` = target tenant
     - `impersonator_id` = original admin's user_id
     - `impersonating` = true
     - `original_tenant_id` = admin's original tenant_id
   - Set new session cookie

2. **Stop Impersonation** (POST /api/admin/impersonate/stop)
   - Verify currently impersonating (check impersonator_id claim)
   - Update impersonation_log.ended_at
   - Issue JWT with original admin's tenant
   - Set new session cookie

3. **Impersonation Status** (GET /api/admin/impersonate/status)
   - Returns current impersonation state from JWT claims

## Tasks

### Backend

#### Task 1: Storage Layer (impersonation.go)
- [ ] Create ImpersonationSession struct
- [ ] CreateImpersonationLog function
- [ ] EndImpersonationLog function
- [ ] GetActiveImpersonation function
- [ ] ListImpersonationLogs function (for audit)

#### Task 2: Extend JWT Claims
- [ ] Add ImpersonatorID to auth/local_jwt.go LocalClaims
- [ ] Add Impersonating bool to LocalClaims
- [ ] Add OriginalTenantID to LocalClaims
- [ ] Update middleware/auth.go Claims struct with same fields
- [ ] Update CreateLocalJWT to accept impersonation params

#### Task 3: Impersonation Handlers (admin_impersonate.go)
- [ ] StartImpersonation handler
- [ ] StopImpersonation handler
- [ ] ImpersonationStatus handler
- [ ] Request/Response types

#### Task 4: Register Routes
- [ ] Add routes to main.go under /api/admin group

### Frontend

#### Task 5: ImpersonationBanner Component
- [ ] Create component with warning styling (orange/amber)
- [ ] Show tenant name being impersonated
- [ ] "Stop Impersonation" button
- [ ] Add useImpersonation hook to check status

#### Task 6: AppLayout Integration
- [ ] Check for impersonating claim in auth context
- [ ] Render ImpersonationBanner when impersonating
- [ ] Position banner prominently (top of page)

## API Specification

### POST /api/admin/impersonate/{tenant_id}

Start impersonation of a tenant.

**Request:**
```json
{
  "reason": "Customer support ticket #1234"  // Optional
}
```

**Response (200):**
```json
{
  "data": {
    "impersonating": true,
    "tenant_id": "target-tenant-uuid",
    "tenant_name": "Target Tenant Name",
    "original_tenant_id": "admin-tenant-uuid",
    "started_at": "2024-01-15T10:30:00Z"
  }
}
```

**Errors:**
- 400: Invalid tenant_id format
- 403: Not a super-admin
- 404: Tenant not found or deleted

### POST /api/admin/impersonate/stop

Stop current impersonation session.

**Response (200):**
```json
{
  "data": {
    "impersonating": false,
    "tenant_id": "admin-original-tenant-uuid",
    "session_duration": "00:15:32"
  }
}
```

**Errors:**
- 400: Not currently impersonating
- 403: Not a super-admin

### GET /api/admin/impersonate/status

Get current impersonation status.

**Response (200):**
```json
{
  "data": {
    "impersonating": true,
    "tenant_id": "target-tenant-uuid",
    "tenant_name": "Target Tenant Name",
    "original_tenant_id": "admin-tenant-uuid",
    "started_at": "2024-01-15T10:30:00Z"
  }
}
```

Or when not impersonating:
```json
{
  "data": {
    "impersonating": false
  }
}
```

## Security Considerations

1. **Super-admin only**: All impersonation endpoints protected by SuperAdminOnly middleware
2. **Audit trail**: Every impersonation session logged with start/end times
3. **JWT transparency**: impersonator_id claim allows tracking who performed actions
4. **No nested impersonation**: Cannot impersonate while already impersonating
5. **Automatic expiry**: JWT expiry limits impersonation duration

## Dev Notes

- Super-admin identification: Uses SUPER_ADMIN_EMAILS env var (comma-separated)
- SaaS mode only: Impersonation endpoints return 404 in local mode
- Session cookie: Same apis_session cookie used for impersonation tokens
- Actions tracking: Middleware could increment actions_taken counter (future enhancement)
