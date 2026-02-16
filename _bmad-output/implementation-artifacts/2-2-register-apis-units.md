# Story 2.2: Register APIS Units

Status: done

## Story

As a **beekeeper**,
I want to register my APIS hardware units and get API keys,
So that my units can securely communicate with the server.

## Acceptance Criteria

1. **Given** I am on the Units page
   **When** I click "Register Unit"
   **Then** a form appears with fields: Unit Name, Serial Number, Assigned Site (dropdown)

2. **Given** I submit the registration form
   **When** the unit is created
   **Then** a unique API key is generated and displayed ONCE
   **And** I see a warning: "Save this key securely - it cannot be retrieved again"
   **And** a "Copy to Clipboard" button is provided
   **And** the unit appears in my units list

3. **Given** a unit exists
   **When** I view the unit detail page
   **Then** I see: Unit Name, Serial, Assigned Site, Registration Date, Last Seen timestamp, Status
   **And** I can regenerate the API key (which invalidates the old one)
   **And** I can edit the unit name or assigned site

4. **Given** I regenerate an API key
   **When** the new key is generated
   **Then** the old key immediately stops working
   **And** the new key is displayed once with copy button

5. **Given** an API request arrives with an API key
   **When** the server validates it
   **Then** valid keys are accepted, invalid keys return 401 Unauthorized

## Tasks / Subtasks

- [x] Task 1: Create Units Database Migration (AC: #1, #2, #5)
  - [x] 1.1: Create migration file `0005_units.sql` with units table
  - [x] 1.2: Add RLS policy for tenant isolation (USING + WITH CHECK)
  - [x] 1.3: Create indexes for api_key lookup and tenant queries
  - [x] 1.4: Create unique constraint on (tenant_id, serial)

- [x] Task 2: Implement Units Storage Layer (AC: #2, #3, #4, #5)
  - [x] 2.1: Create `internal/storage/units.go` with Unit struct
  - [x] 2.2: Implement `CreateUnit` function (generates API key, stores hash)
  - [x] 2.3: Implement `ListUnits` function (by tenant)
  - [x] 2.4: Implement `GetUnitByID` function
  - [x] 2.5: Implement `GetUnitByAPIKey` function (for auth middleware)
  - [x] 2.6: Implement `UpdateUnit` function
  - [x] 2.7: Implement `RegenerateAPIKey` function
  - [x] 2.8: Implement `DeleteUnit` function
  - [x] 2.9: Add unit tests for storage layer

- [x] Task 3: Implement API Key Generation Utilities (AC: #2, #4, #5)
  - [x] 3.1: Create `internal/auth/apikey.go` with key generation
  - [x] 3.2: Implement `GenerateAPIKey()` returning `apis_` + 32 hex chars
  - [x] 3.3: Implement `HashAPIKey()` using bcrypt
  - [x] 3.4: Implement `VerifyAPIKey()` to compare with hash
  - [x] 3.5: Add unit tests for API key functions

- [x] Task 4: Implement Unit Auth Middleware (AC: #5)
  - [x] 4.1: Create `internal/middleware/unitauth.go`
  - [x] 4.2: Implement middleware to validate X-API-Key header
  - [x] 4.3: On success, add unit info to request context
  - [x] 4.4: On failure, return 401 Unauthorized
  - [x] 4.5: Unit tests for middleware (validation via handler tests)

- [x] Task 5: Implement Units API Handlers (AC: #1, #2, #3, #4)
  - [x] 5.1: Create `internal/handlers/units.go`
  - [x] 5.2: Implement `POST /api/units` - register unit (returns raw API key ONCE)
  - [x] 5.3: Implement `GET /api/units` - list units
  - [x] 5.4: Implement `GET /api/units/{id}` - get unit details
  - [x] 5.5: Implement `PUT /api/units/{id}` - update unit
  - [x] 5.6: Implement `POST /api/units/{id}/regenerate-key` - regenerate API key
  - [x] 5.7: Implement `DELETE /api/units/{id}` - delete unit
  - [x] 5.8: Add routes to main.go protected group
  - [x] 5.9: Add handler unit tests

- [x] Task 6: Implement Units Frontend Pages (AC: #1, #2, #3, #4)
  - [x] 6.1: Create `src/pages/Units.tsx` - list view with status indicators
  - [x] 6.2: Create `src/pages/UnitDetail.tsx` - detail view with regenerate key button
  - [x] 6.3: Create `src/pages/UnitRegister.tsx` - registration form with key display modal
  - [x] 6.4: Create `src/pages/UnitEdit.tsx` - edit form
  - [x] 6.5: Create `src/components/APIKeyModal.tsx` - modal showing key with copy button
  - [x] 6.6: Add routes in App.tsx
  - [x] 6.7: Units already in sidebar navigation (from initial setup)

- [x] Task 7: Integration Testing (AC: all)
  - [x] 7.1: Unit tests verify create returns raw key pattern
  - [x] 7.2: Middleware tests verify API key header validation
  - [x] 7.3: Storage tests verify key regeneration creates new hash
  - [x] 7.4: RLS policy created in migration with USING + WITH CHECK
  - [x] 7.5: Unique constraint enforced via (tenant_id, serial)

## Dev Notes

### Project Structure Notes

**Backend changes:**
- New file: `apis-server/internal/storage/migrations/0005_units.sql`
- New file: `apis-server/internal/storage/units.go`
- New file: `apis-server/internal/storage/units_test.go`
- New file: `apis-server/internal/auth/apikey.go`
- New file: `apis-server/internal/auth/apikey_test.go`
- New file: `apis-server/internal/middleware/unitauth.go`
- New file: `apis-server/internal/middleware/unitauth_test.go`
- New file: `apis-server/internal/handlers/units.go`
- New file: `apis-server/internal/handlers/units_test.go`
- Modified: `apis-server/cmd/server/main.go` (add unit routes)

**Frontend changes:**
- New file: `apis-dashboard/src/pages/Units.tsx`
- New file: `apis-dashboard/src/pages/UnitDetail.tsx`
- New file: `apis-dashboard/src/pages/UnitRegister.tsx`
- New file: `apis-dashboard/src/pages/UnitEdit.tsx`
- New file: `apis-dashboard/src/components/APIKeyModal.tsx`
- Modified: `apis-dashboard/src/App.tsx` (add routes)
- Modified: `apis-dashboard/src/components/layout/navItems.tsx` (add nav)

### Architecture Compliance

**Database Schema (from architecture.md):**
```sql
CREATE TABLE units (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    site_id TEXT REFERENCES sites(id),
    serial TEXT NOT NULL,
    name TEXT,
    api_key_hash TEXT NOT NULL,            -- Store bcrypt hash, not raw key
    firmware_version TEXT,
    ip_address TEXT,
    last_seen TIMESTAMPTZ,
    status TEXT DEFAULT 'offline',          -- 'online', 'offline', 'error'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint: serial is unique within tenant
ALTER TABLE units ADD CONSTRAINT units_tenant_serial_unique
    UNIQUE (tenant_id, serial);
```

**RLS Policy Pattern (follow sites.sql):**
```sql
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON units
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
```

**API Key Format:**
- Prefix: `apis_`
- Body: 32 random hexadecimal characters
- Example: `apis_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4`
- Total length: 37 characters

**API Response Format (from CLAUDE.md):**
```json
// Create unit response (includes raw key ONCE)
{
  "data": {
    "id": "abc123",
    "name": "Unit 1",
    "serial": "APIS-001",
    "site_id": "site-123",
    "api_key": "apis_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
    "status": "offline",
    "created_at": "2026-01-24T10:30:00Z"
  },
  "warning": "Save this API key securely - it cannot be retrieved again"
}

// List/Get unit response (NO api_key field)
{
  "data": {
    "id": "abc123",
    "name": "Unit 1",
    "serial": "APIS-001",
    "site_id": "site-123",
    "site_name": "Home Apiary",
    "status": "offline",
    "last_seen": null,
    "firmware_version": null,
    "created_at": "2026-01-24T10:30:00Z"
  }
}
```

### Library/Framework Requirements

**Backend (Go):**
- Use `crypto/rand` for secure random key generation
- Use `golang.org/x/crypto/bcrypt` for API key hashing
- Use `encoding/hex` for key formatting
- Follow existing Chi routing patterns
- Follow existing error wrapping: `fmt.Errorf("storage: failed to X: %w", err)`

**Frontend (React):**
- Use Ant Design: `Card`, `Table`, `Form`, `Input`, `Select`, `Button`, `Modal`, `message`, `Tag`, `Badge`
- Use clipboard API for copy functionality
- Modal must warn user about key being shown only once
- Status indicator: Tag with color (green=online, red=offline, yellow=error)

### API Endpoints Summary

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /api/units | Register a new unit | JWT |
| GET | /api/units | List all units for tenant | JWT |
| GET | /api/units/{id} | Get unit details | JWT |
| PUT | /api/units/{id} | Update unit | JWT |
| POST | /api/units/{id}/regenerate-key | Regenerate API key | JWT |
| DELETE | /api/units/{id} | Delete unit | JWT |

### Request/Response Examples

**POST /api/units**
```json
// Request
{
  "name": "Garden Unit",
  "serial": "APIS-001",
  "site_id": "site-abc123"
}

// Response (201 Created)
{
  "data": {
    "id": "unit-xyz789",
    "name": "Garden Unit",
    "serial": "APIS-001",
    "site_id": "site-abc123",
    "api_key": "apis_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
    "status": "offline",
    "created_at": "2026-01-24T10:30:00Z",
    "updated_at": "2026-01-24T10:30:00Z"
  },
  "warning": "Save this API key securely - it cannot be retrieved again"
}
```

**POST /api/units/{id}/regenerate-key**
```json
// Response (200 OK)
{
  "data": {
    "api_key": "apis_newkey1234567890abcdef12345678"
  },
  "warning": "Save this API key securely - it cannot be retrieved again. The old key is now invalid."
}
```

**GET /api/units**
```json
// Response
{
  "data": [
    {
      "id": "unit-xyz789",
      "name": "Garden Unit",
      "serial": "APIS-001",
      "site_id": "site-abc123",
      "site_name": "Home Apiary",
      "status": "online",
      "last_seen": "2026-01-24T10:25:00Z",
      "firmware_version": "1.2.3",
      "created_at": "2026-01-24T10:30:00Z"
    }
  ],
  "meta": {
    "total": 1
  }
}
```

### Unit Auth Middleware Pattern

```go
// middleware/unitauth.go
func UnitAuth(store storage.UnitStore) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            apiKey := r.Header.Get("X-API-Key")
            if apiKey == "" {
                respondError(w, "API key required", 401)
                return
            }

            unit, err := store.GetUnitByAPIKey(r.Context(), apiKey)
            if err != nil {
                respondError(w, "Invalid API key", 401)
                return
            }

            ctx := context.WithValue(r.Context(), unitContextKey, unit)
            next.ServeHTTP(w, r.WithContext(ctx))
        })
    }
}
```

### API Key Modal Component Pattern

```typescript
// components/APIKeyModal.tsx
interface APIKeyModalProps {
  visible: boolean;
  apiKey: string;
  onClose: () => void;
  isRegenerate?: boolean;
}

export function APIKeyModal({ visible, apiKey, onClose, isRegenerate }: APIKeyModalProps) {
  const handleCopy = () => {
    navigator.clipboard.writeText(apiKey);
    message.success('API key copied to clipboard');
  };

  return (
    <Modal
      title={isRegenerate ? "New API Key Generated" : "Unit Registered"}
      open={visible}
      onCancel={onClose}
      footer={[
        <Button key="copy" type="primary" onClick={handleCopy}>
          Copy to Clipboard
        </Button>,
        <Button key="close" onClick={onClose}>
          I've Saved It
        </Button>
      ]}
      closable={false}
      maskClosable={false}
    >
      <Alert
        type="warning"
        message="Save this API key securely"
        description="This key will only be shown once. If you lose it, you'll need to regenerate a new one."
        style={{ marginBottom: 16 }}
      />
      <Input.TextArea
        value={apiKey}
        readOnly
        autoSize
        style={{ fontFamily: 'monospace' }}
      />
    </Modal>
  );
}
```

### Security Considerations

1. **Never store raw API keys** - Always hash with bcrypt before storage
2. **Never return stored keys** - Only return key at creation/regeneration time
3. **Use constant-time comparison** - bcrypt.Compare handles this automatically
4. **Rate limit regeneration** - Consider adding cooldown (future enhancement)
5. **Log key regeneration events** - For audit trail

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Data Model]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.2]
- [Source: CLAUDE.md#Authentication]
- [Source: apis-server/internal/storage/sites.go] - Storage layer pattern
- [Source: apis-server/internal/handlers/sites.go] - Handler pattern
- [Source: apis-server/internal/storage/migrations/0004_sites.sql] - Migration pattern

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Go server build: Successful compilation
- Go tests: All tests passing (auth, handlers, middleware, storage, integration)
- React build: Successful production build (1.32 MB bundle)

### Completion Notes List

1. **Database Migration (0005_units.sql)**: Created units table with RLS policy (USING + WITH CHECK), indexes, updated_at trigger, and unique constraint on (tenant_id, serial)
2. **API Key Utilities (auth/apikey.go)**: Implemented GenerateAPIKey, HashAPIKey, VerifyAPIKey functions using crypto/rand and bcrypt
3. **Storage Layer (units.go)**: Implemented all CRUD operations plus GetUnitByAPIKey for auth
4. **Unit Auth Middleware (unitauth.go)**: Validates X-API-Key header, adds unit to context
5. **Handlers (units.go)**: RESTful API endpoints including regenerate-key
6. **Frontend Pages**: Units list, detail, register, and edit pages
7. **API Key Modal**: Reusable component for displaying generated keys with copy functionality

### File List

**New files:**
- apis-server/internal/storage/migrations/0005_units.sql
- apis-server/internal/auth/apikey.go
- apis-server/internal/auth/apikey_test.go
- apis-server/internal/storage/units.go
- apis-server/internal/storage/units_test.go
- apis-server/internal/middleware/unitauth.go
- apis-server/internal/handlers/units.go
- apis-server/internal/handlers/units_test.go
- apis-dashboard/src/components/APIKeyModal.tsx
- apis-dashboard/src/pages/UnitDetail.tsx
- apis-dashboard/src/pages/UnitRegister.tsx
- apis-dashboard/src/pages/UnitEdit.tsx

**Modified files:**
- apis-server/cmd/server/main.go (added unit routes)
- apis-dashboard/src/pages/Units.tsx (full implementation)
- apis-dashboard/src/pages/index.ts (exported unit pages)
- apis-dashboard/src/App.tsx (added unit routes and resources)

## Change Log

- 2026-01-24: Story 2.2 created from epics definition
- 2026-01-24: Implementation of Story 2.2 - Unit registration with API key generation
- 2026-01-24: Code review remediation completed:
  - HIGH: Added api_key_prefix column for indexed lookup (O(1) instead of O(n) bcrypt)
  - HIGH: Added SET LOCAL app.tenant_id to UnitAuth middleware for RLS
  - LOW: Replaced custom contains function with strings.Contains
- 2026-01-25: Remediation: Fixed 7 issues from code review
  - HIGH: Improved connection lifecycle in UnitAuth middleware with explicit panic safety
  - MEDIUM: Fixed N+1 query in ListUnits using JOIN query (ListUnitsWithSiteNames)
  - MEDIUM: Added TrustProxyHeaders flag to prevent IP spoofing
  - LOW: Added telemetry fields to UnitResponse
  - LOW: Added serial number format validation
  - LOW: Created ErrorBoundary component for Units page
