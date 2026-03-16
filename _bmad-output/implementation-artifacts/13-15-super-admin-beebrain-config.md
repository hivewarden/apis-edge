# Story 13.15: Super-Admin BeeBrain Config

Status: done

## Story

As a SaaS operator (super-admin),
I want to configure system-wide BeeBrain backend and per-tenant access,
So that I can manage AI costs and service levels across all tenants.

## Acceptance Criteria

1. **AC1: GET /api/admin/beebrain** - Return system config + per-tenant access list
   - System backend configuration (rules/local/external)
   - Provider name if local/external
   - Model name if configured
   - API key status (configured/not configured, never return actual key)
   - List of tenants with BeeBrain access status (enabled/disabled)

2. **AC2: PUT /api/admin/beebrain** - Update system backend config
   - Change backend type (rules, local, external)
   - Set provider for local/external (openai, anthropic, ollama, etc.)
   - Set endpoint URL for local providers
   - Set encrypted API key for external providers
   - Set model name

3. **AC3: PUT /api/admin/tenants/{id}/beebrain** - Enable/disable BeeBrain for specific tenant
   - Toggle tenant's access to BeeBrain feature
   - When disabled, tenant cannot use BeeBrain at all
   - When enabled, tenant uses system default or can use BYOK (Story 13.18)

4. **AC4: API keys encrypted at rest** - Never returned in responses
   - Use AES-256-GCM encryption with key from env var
   - Store encrypted blob in api_key_encrypted column
   - Only show "configured" or "not_configured" status

5. **AC5: Validation and error handling**
   - Invalid backend type → 400
   - Missing required fields for backend type → 400
   - Only super-admin can access (403 for others, 404 in local mode)

## Technical Context

### Database Schema (Migration 0026)

The beebrain_config table already exists:

```sql
CREATE TABLE IF NOT EXISTS beebrain_config (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = system default
    backend TEXT NOT NULL,                   -- 'rules', 'local', 'external'
    provider TEXT,                           -- 'openai', 'anthropic', 'ollama', etc.
    endpoint TEXT,                           -- Local model endpoint URL
    api_key_encrypted TEXT,                  -- Encrypted API key for external providers
    model TEXT,                              -- Model name (e.g., 'gpt-4', 'claude-3-opus')
    is_tenant_override BOOLEAN DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Configuration Hierarchy

1. **System Default**: `tenant_id IS NULL` - One row for system-wide config
2. **Tenant Access**: Controlled via a new `tenant_beebrain_access` table or by checking if tenant has explicit access
3. **Tenant Override (BYOK)**: `tenant_id IS NOT NULL AND is_tenant_override = true` (Story 13.18)

### Encryption Approach

```go
// Use AES-256-GCM with BEEBRAIN_ENCRYPTION_KEY env var
// Key must be 32 bytes (256 bits)
// Store as base64-encoded ciphertext in database
```

### Backend Options

| Backend | Provider Required | Endpoint Required | API Key Required |
|---------|-------------------|-------------------|------------------|
| rules | No | No | No |
| local | Yes (e.g., ollama) | Yes | No |
| external | Yes (openai, anthropic) | No | Yes |

### Existing Patterns

From `admin_limits.go`:
- SuperAdminOnly middleware protects routes
- Returns 404 in local mode
- Uses `storage.AdminGetTenantByID` for tenant verification

From `beebrain.go` service:
- Currently only uses rule-based analysis
- Will need to check config before analysis

## Tasks

### Backend

#### Task 1: Create Encryption Service (encryption.go)
- [x] Create `internal/services/encryption.go`
- [x] Implement `EncryptAPIKey(plaintext string) (string, error)`
- [x] Implement `DecryptAPIKey(ciphertext string) (string, error)`
- [x] Read key from `BEEBRAIN_ENCRYPTION_KEY` env var
- [x] Use AES-256-GCM for authenticated encryption
- [x] Return base64-encoded ciphertext
- [x] Fail startup if key < 32 bytes and external backend configured

#### Task 2: Create BeeBrain Config Storage (beebrain_config.go)
- [x] Create `internal/storage/beebrain_config.go`
- [x] Implement `GetSystemBeeBrainConfig(ctx, pool) (*BeeBrainConfig, error)`
- [x] Implement `SetSystemBeeBrainConfig(ctx, pool, config) error`
- [x] Implement `GetTenantBeeBrainAccess(ctx, pool, tenantID) (bool, error)`
- [x] Implement `SetTenantBeeBrainAccess(ctx, pool, tenantID, enabled) error`
- [x] Implement `ListTenantBeeBrainAccess(ctx, pool) ([]TenantAccess, error)`
- [x] BeeBrainConfig struct with backend, provider, endpoint, api_key_encrypted, model

#### Task 3: Create Admin BeeBrain Handlers (admin_beebrain.go)
- [x] Create `internal/handlers/admin_beebrain.go`
- [x] `AdminGetBeeBrainConfig(pool) http.HandlerFunc` - GET /api/admin/beebrain
- [x] `AdminUpdateBeeBrainConfig(pool) http.HandlerFunc` - PUT /api/admin/beebrain
- [x] `AdminSetTenantBeeBrainAccess(pool) http.HandlerFunc` - PUT /api/admin/tenants/{id}/beebrain
- [x] Request/response types
- [x] Validation for backend type and required fields

#### Task 4: Register Routes
- [x] Add routes to main.go under /api/admin group
- [x] Apply SuperAdminOnly middleware

### Frontend

#### Task 5: Create BeeBrain Admin Page (BeeBrainConfig.tsx)
- [x] Create `apis-dashboard/src/pages/admin/BeeBrainConfig.tsx`
- [x] System config form: backend selector, provider input, endpoint input, API key input
- [x] Per-tenant access table with enable/disable toggles
- [x] API key input: password field, "Change Key" button
- [x] Clear visual for API key status (configured/not configured)

#### Task 6: Add Navigation
- [x] Add BeeBrain Config to admin navigation (admin only, SaaS mode only)
- [x] Route: `/admin/beebrain`

## API Specification

### GET /api/admin/beebrain

Returns system BeeBrain configuration and per-tenant access list.

**Response (200):**
```json
{
  "data": {
    "system_config": {
      "backend": "external",
      "provider": "openai",
      "endpoint": null,
      "model": "gpt-4",
      "api_key_status": "configured",
      "updated_at": "2024-01-15T10:30:00Z"
    },
    "tenant_access": [
      {
        "tenant_id": "uuid-1",
        "tenant_name": "Tenant One",
        "enabled": true,
        "has_byok": false
      },
      {
        "tenant_id": "uuid-2",
        "tenant_name": "Tenant Two",
        "enabled": false,
        "has_byok": false
      }
    ]
  }
}
```

### PUT /api/admin/beebrain

Updates system BeeBrain configuration.

**Request:**
```json
{
  "backend": "external",
  "provider": "openai",
  "endpoint": null,
  "api_key": "sk-...",
  "model": "gpt-4"
}
```

**Response (200):**
```json
{
  "data": {
    "backend": "external",
    "provider": "openai",
    "endpoint": null,
    "model": "gpt-4",
    "api_key_status": "configured",
    "updated_at": "2024-01-15T10:35:00Z"
  }
}
```

**Errors:**
- 400: Invalid backend type
- 400: Missing required field (e.g., api_key for external)
- 403: Not a super-admin
- 404: Feature not available (local mode)

### PUT /api/admin/tenants/{id}/beebrain

Enable/disable BeeBrain for a specific tenant.

**Request:**
```json
{
  "enabled": true
}
```

**Response (200):**
```json
{
  "data": {
    "tenant_id": "uuid-1",
    "enabled": true,
    "message": "BeeBrain access enabled for tenant"
  }
}
```

**Errors:**
- 400: Invalid request body
- 403: Not a super-admin
- 404: Tenant not found

## Security Considerations

1. **API Key Encryption**: Use AES-256-GCM, key from env var, never log keys
2. **Never return API keys**: Only return status (configured/not_configured)
3. **Super-admin only**: All endpoints protected by SuperAdminOnly middleware
4. **SaaS mode only**: Returns 404 in local mode (hide feature existence)
5. **Audit logging**: Log config changes with super-admin ID

## Dev Notes

- SuperAdminOnly middleware already exists in `middleware/superadmin.go`
- Follow patterns from `admin_limits.go` for handler structure
- Encryption key must be provided via `BEEBRAIN_ENCRYPTION_KEY` env var
- If encryption key not set, only 'rules' backend is allowed (no API key storage)

### References

- [Source: apis-server/internal/middleware/superadmin.go] - SuperAdminOnly middleware
- [Source: apis-server/internal/handlers/admin_limits.go] - Admin handler patterns
- [Source: apis-server/internal/storage/migrations/0026_beebrain_config.sql] - Table schema
- [Source: _bmad-output/planning-artifacts/epic-13-dual-auth-mode.md#story-1315] - Story requirements

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes

- All backend and frontend tasks completed
- Encryption service uses AES-256-GCM with BEEBRAIN_ENCRYPTION_KEY env var
- Storage layer created with migration for tenant_beebrain_access table
- Handlers created with proper validation and error handling
- Frontend page with system config form and tenant access table
- Navigation added to Settings page under Super Admin section (SaaS mode only)
- Backend compiles successfully, tests pass
- Frontend has pre-existing TypeScript errors in other files but new code is clean

### Change Log

- [2026-01-27] Story created for dev-story workflow
- [2026-01-27] Implemented encryption service (internal/services/encryption.go)
- [2026-01-27] Implemented storage layer (internal/storage/beebrain_config.go)
- [2026-01-27] Created migration (0029_tenant_beebrain_access.sql)
- [2026-01-27] Implemented handlers (internal/handlers/admin_beebrain.go)
- [2026-01-27] Registered routes in main.go
- [2026-01-27] Created admin BeeBrain config page (pages/admin/BeeBrainConfig.tsx)
- [2026-01-27] Created hook (hooks/useAdminBeeBrain.ts)
- [2026-01-27] Added navigation link in Settings page
- [2026-01-27] Code review PASS - all ACs verified, production-ready
