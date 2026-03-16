# Story 13.2: AUTH_MODE Infrastructure

Status: done

## Story

As a system administrator,
I want the server to detect and configure authentication mode at startup,
so that the same codebase can run in standalone or SaaS mode based on environment configuration.

## Acceptance Criteria

1. **Mode Detection:**
   - `AUTH_MODE=local` configures standalone mode
   - `AUTH_MODE=zitadel` configures SaaS mode
   - Missing/invalid AUTH_MODE fails startup with clear error message
   - Mode determined at startup and immutable at runtime

2. **Local Mode Requirements:**
   - `JWT_SECRET` environment variable must be set (minimum 32 characters) or fail startup
   - Default tenant auto-created with fixed UUID `00000000-0000-0000-0000-000000000000`
   - Zitadel configuration (ZITADEL_ISSUER, ZITADEL_CLIENT_ID) ignored
   - DISABLE_AUTH=true still works for development (bypasses JWT validation)

3. **SaaS Mode Requirements:**
   - `ZITADEL_ISSUER` and `ZITADEL_CLIENT_ID` must be set or fail startup with clear error
   - `JWT_SECRET` still required (for device tokens and local session signing)
   - `SUPER_ADMIN_EMAILS` environment variable parsed into list (comma-separated)
   - Existing Zitadel flow preserved

4. **GET /api/auth/config Endpoint (public):**
   - Local mode response: `{"mode": "local", "setup_required": true|false}`
   - SaaS mode response: `{"mode": "zitadel", "zitadel_authority": "...", "zitadel_client_id": "..."}`
   - `setup_required` is true when AUTH_MODE=local AND no users exist in default tenant

5. **Feature Detection Pattern:**
   - `config.AuthMode()` returns "local" or "zitadel"
   - `config.IsLocalAuth()` returns true for local mode
   - `config.IsSaaSMode()` returns true for zitadel mode
   - `config.DefaultTenantID()` returns `00000000-0000-0000-0000-000000000000`
   - `config.JWTSecret()` returns the JWT signing secret
   - `config.SuperAdminEmails()` returns list of super admin emails (SaaS mode)

6. **Default Tenant Auto-Creation:**
   - On local mode startup, ensure default tenant exists in database
   - Use fixed UUID `00000000-0000-0000-0000-000000000000`
   - Tenant name: "Default Tenant"
   - Plan: "free"
   - Create only if not exists (idempotent)

## Tasks / Subtasks

- [x] **Task 1: Create auth configuration package** (AC: #1, #2, #3, #5)
  - [x] 1.1: Create `apis-server/internal/config/auth.go`
  - [x] 1.2: Define AuthMode type and constants (ModeLocal, ModeZitadel)
  - [x] 1.3: Create authConfig struct with parsed environment values
  - [x] 1.4: Implement InitAuthConfig() that validates and parses all env vars at startup
  - [x] 1.5: Implement AuthMode() getter function returning current mode
  - [x] 1.6: Implement IsLocalAuth() and IsSaaSMode() helper functions
  - [x] 1.7: Implement DefaultTenantID() returning fixed UUID constant
  - [x] 1.8: Implement JWTSecret() getter function
  - [x] 1.9: Implement SuperAdminEmails() returning parsed list
  - [x] 1.10: Implement IsSuperAdmin(email string) helper function

- [x] **Task 2: Create features helper package** (AC: #5)
  - [x] 2.1: Create `apis-server/internal/config/features.go`
  - [x] 2.2: Add feature flag helpers that derive from auth mode
  - [x] 2.3: Add SupportsLocalUserManagement() - true for local mode
  - [x] 2.4: Add SupportsSuperAdmin() - true for zitadel mode
  - [x] 2.5: Add RequiresZitadelAuth() - true for zitadel mode

- [x] **Task 3: Modify server startup to initialize auth config** (AC: #1, #2, #3)
  - [x] 3.1: Call config.InitAuthConfig() early in main() before any other initialization
  - [x] 3.2: Replace direct os.Getenv("ZITADEL_*") calls with config package getters
  - [x] 3.3: Add startup log message indicating current auth mode
  - [x] 3.4: Ensure fatal exit with clear error if validation fails

- [x] **Task 4: Create auth config handler** (AC: #4)
  - [x] 4.1: Create `apis-server/internal/handlers/auth_config.go` (new file)
  - [x] 4.2: Rename existing GetAuthConfig to GetAuthConfigLegacy or remove
  - [x] 4.3: Implement new GetAuthConfig handler with mode-aware response
  - [x] 4.4: For local mode: query database to check if any users exist for setup_required
  - [x] 4.5: For zitadel mode: return zitadel_authority and zitadel_client_id
  - [x] 4.6: Ensure endpoint remains public (no auth required)

- [x] **Task 5: Implement default tenant auto-creation** (AC: #6)
  - [x] 5.1: Create `apis-server/internal/storage/default_tenant.go`
  - [x] 5.2: Implement EnsureDefaultTenantExists(ctx, pool) function
  - [x] 5.3: Check if tenant with default UUID exists
  - [x] 5.4: Create tenant with name "Default Tenant" if not exists
  - [x] 5.5: Call EnsureDefaultTenantExists from main.go after migrations, only in local mode

- [x] **Task 6: Add user count query for setup_required** (AC: #4)
  - [x] 6.1: Add CountUsersInTenant(ctx, conn, tenantID) to storage/default_tenant.go
  - [x] 6.2: Query bypasses RLS (uses direct tenant_id filter) for initial setup check
  - [x] 6.3: Used by auth_config handler to determine setup_required

- [x] **Task 7: Write unit tests for config package** (AC: #1, #2, #3, #5)
  - [x] 7.1: Create `apis-server/tests/config/auth_test.go`
  - [x] 7.2: Test InitAuthConfig with AUTH_MODE=local and valid JWT_SECRET
  - [x] 7.3: Test InitAuthConfig with AUTH_MODE=zitadel and valid Zitadel vars
  - [x] 7.4: Test InitAuthConfig fails without AUTH_MODE
  - [x] 7.5: Test InitAuthConfig fails without JWT_SECRET in local mode
  - [x] 7.6: Test InitAuthConfig fails without ZITADEL_ISSUER in zitadel mode
  - [x] 7.7: Test JWT_SECRET < 32 chars fails validation
  - [x] 7.8: Test SuperAdminEmails parsing with various inputs
  - [x] 7.9: Test IsSuperAdmin helper function
  - [x] 7.10: Test feature detection helpers

- [x] **Task 8: Write handler tests for auth config endpoint** (AC: #4)
  - [x] 8.1: Create `apis-server/tests/handlers/auth_config_test.go`
  - [x] 8.2: Test GET /api/auth/config in local mode with no users (setup_required: true)
  - [x] 8.3: Test GET /api/auth/config in local mode with users (setup_required: false)
  - [x] 8.4: Test GET /api/auth/config in zitadel mode returns authority and client_id
  - [x] 8.5: Test endpoint is publicly accessible (no auth header required)

- [x] **Task 9: Write integration test for default tenant creation** (AC: #6)
  - [x] 9.1: Add test to `apis-server/tests/storage/default_tenant_test.go`
  - [x] 9.2: Test EnsureDefaultTenantExists creates tenant when missing
  - [x] 9.3: Test EnsureDefaultTenantExists is idempotent (no error when exists)
  - [x] 9.4: Verify tenant has correct UUID, name, and plan

## Dev Notes

### Architecture Compliance

**Go Patterns (from CLAUDE.md):**
- Package naming: `internal/config` for configuration
- Error wrapping: `fmt.Errorf("config: failed to parse AUTH_MODE: %w", err)`
- Structured logging with zerolog
- PascalCase exports, camelCase private functions
- Tests in separate `tests/` directory

**Configuration Pattern:**
Use package-level variables initialized once at startup. This is the standard Go pattern for configuration that's read at startup and never changes.

```go
// config/auth.go
package config

var (
    authMode        string
    jwtSecret       string
    zitadelIssuer   string
    zitadelClientID string
    superAdminEmails []string
    initialized     bool
)

// InitAuthConfig must be called once at startup.
// Returns error if required configuration is missing or invalid.
func InitAuthConfig() error {
    if initialized {
        return errors.New("config: auth already initialized")
    }
    // Parse and validate...
    initialized = true
    return nil
}

// AuthMode returns the current authentication mode.
// Panics if called before InitAuthConfig.
func AuthMode() string {
    if !initialized {
        panic("config: auth not initialized - call InitAuthConfig first")
    }
    return authMode
}
```

### Environment Variables

| Variable | Required | Mode | Description |
|----------|----------|------|-------------|
| `AUTH_MODE` | Yes | Both | "local" or "zitadel" |
| `JWT_SECRET` | Yes | Both | Min 32 chars, for signing tokens |
| `ZITADEL_ISSUER` | zitadel mode | SaaS | Zitadel instance URL |
| `ZITADEL_CLIENT_ID` | zitadel mode | SaaS | Application client ID |
| `SUPER_ADMIN_EMAILS` | Optional | SaaS | Comma-separated list |
| `DISABLE_AUTH` | Optional | Both | "true" to bypass auth (dev only) |

### Default Tenant UUID

The fixed UUID `00000000-0000-0000-0000-000000000000` is used for:
- Easy identification in logs and debugging
- Consistent across all standalone deployments
- Simple to reference in documentation
- Obviously different from real Zitadel org IDs

### API Response Format

**Local Mode:**
```json
{
  "mode": "local",
  "setup_required": true
}
```

**SaaS Mode:**
```json
{
  "mode": "zitadel",
  "zitadel_authority": "https://auth.example.com",
  "zitadel_client_id": "123456789@apis"
}
```

### Existing Code to Modify

**main.go changes:**
1. Add `config.InitAuthConfig()` call early in main()
2. Replace `os.Getenv("ZITADEL_*")` with `config.ZitadelIssuer()` etc.
3. Add conditional default tenant creation for local mode
4. Keep DISABLE_AUTH support for development

**handlers/auth.go changes:**
1. Move GetAuthConfig to new auth_config.go file
2. Implement mode-aware response logic
3. Add database query for setup_required check

### Testing Strategy

**Unit tests for config package:**
- Use t.Setenv() to set environment variables in tests
- Reset package state between tests (add internal reset function for testing)
- Test validation error messages are helpful

**Handler tests:**
- Use httptest.NewRecorder() pattern
- Mock database for setup_required check
- Test both modes in same test file with subtests

### Security Considerations

1. **JWT_SECRET validation:** Minimum 32 characters to ensure adequate entropy
2. **Error messages:** Don't leak sensitive info in startup errors
3. **DISABLE_AUTH warning:** Log loudly when dev mode is active
4. **Super admin list:** Parse carefully, trim whitespace, ignore empty entries

### Previous Story Context (13.1)

Story 13.1 created the database migrations including:
- Modified users table with password_hash, role, is_active, etc.
- Created tenant_limits, audit_log, invite_tokens tables
- Created beebrain_config, impersonation_log tables

The database schema is ready for dual-auth. This story (13.2) builds the runtime infrastructure to use it.

### Project Structure Notes

**New files to create:**
- `apis-server/internal/config/auth.go` - Auth mode configuration
- `apis-server/internal/config/features.go` - Feature detection helpers
- `apis-server/internal/handlers/auth_config.go` - Auth config endpoint
- `apis-server/internal/storage/default_tenant.go` - Default tenant creation
- `apis-server/tests/config/auth_test.go` - Config unit tests
- `apis-server/tests/handlers/auth_config_test.go` - Handler tests

**Files to modify:**
- `apis-server/cmd/server/main.go` - Initialize auth config, create default tenant
- `apis-server/internal/storage/users.go` - Add CountUsersInTenant function

### References

- [Source: _bmad-output/planning-artifacts/architecture.md - Infrastructure Modes section]
- [Source: _bmad-output/planning-artifacts/epic-13-dual-auth-mode.md - Story 13.2]
- [Source: docs/PRD-ADDENDUM-DUAL-AUTH-MODE.md - AUTH_MODE specification]
- [Source: apis-server/cmd/server/main.go - Current startup flow]
- [Source: apis-server/internal/handlers/auth.go - Current GetAuthConfig]
- [Source: apis-server/internal/config/version.go - Existing config package pattern]
- [Source: apis-server/internal/storage/tenants.go - GetOrCreateTenant pattern]

## Test Criteria

- [x] Server fails to start without AUTH_MODE environment variable
- [x] Server fails to start without JWT_SECRET in local mode
- [x] Server fails to start with JWT_SECRET < 32 characters
- [x] Server fails to start without ZITADEL_ISSUER in zitadel mode
- [x] Server fails to start without ZITADEL_CLIENT_ID in zitadel mode
- [x] GET /api/auth/config returns `{"mode": "local", "setup_required": true}` when no users
- [x] GET /api/auth/config returns `{"mode": "local", "setup_required": false}` when users exist
- [x] GET /api/auth/config returns zitadel config with authority and client_id in SaaS mode
- [x] Default tenant created on first local mode startup
- [x] Default tenant creation is idempotent
- [x] DISABLE_AUTH=true still works in local mode for development
- [x] Startup logs indicate current auth mode

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

None - implementation completed without issues.

### Completion Notes List

1. **Task 1 completed**: Created `apis-server/internal/config/auth.go` with full AUTH_MODE infrastructure:
   - `InitAuthConfig()` validates AUTH_MODE, JWT_SECRET, and mode-specific env vars
   - `AuthMode()`, `IsLocalAuth()`, `IsSaaSMode()` for mode detection
   - `JWTSecret()`, `ZitadelIssuer()`, `ZitadelClientID()` getters
   - `SuperAdminEmails()` and `IsSuperAdmin()` for super admin management
   - Thread-safe with mutex protection and ResetAuthConfig() for testing

2. **Task 2 completed**: Created `apis-server/internal/config/features.go` with feature detection:
   - `SupportsLocalUserManagement()` - true for local mode
   - `SupportsSuperAdmin()` - true for zitadel mode
   - `RequiresZitadelAuth()` - true for zitadel mode
   - `SupportsMultiTenant()` - true for zitadel mode
   - `SupportsInviteFlow()` - true for local mode

3. **Task 3 completed**: Modified `apis-server/cmd/server/main.go`:
   - Added `config.InitAuthConfig()` call at startup before DB initialization
   - Replaced direct `os.Getenv("ZITADEL_*")` with config package getters
   - Added startup log message with auth mode details
   - Added conditional default tenant creation for local mode
   - Local mode uses dev auth middleware temporarily (JWT auth in story 13.3)

4. **Task 4 completed**: Created `apis-server/internal/handlers/auth_config.go`:
   - New `AuthConfigHandler` with `GetAuthConfig()` method
   - Mode-aware response: local mode returns `setup_required`, zitadel returns authority/client_id
   - `GetAuthConfigFunc()` convenience function for route registration
   - Updated `auth.go` to remove old GetAuthConfig (replaced)
   - Updated existing auth_test.go to use new handler pattern

5. **Task 5 completed**: Created `apis-server/internal/storage/default_tenant.go`:
   - `EnsureDefaultTenantExists()` creates default tenant idempotently
   - Uses fixed UUID from `config.DefaultTenantUUID()`
   - Called from main.go only in local mode after migrations

6. **Task 6 completed**: Added `CountUsersInTenant()` to default_tenant.go:
   - Direct tenant_id filter bypasses RLS for initial setup check
   - Used by auth_config handler to determine setup_required

7. **Task 7 completed**: Created comprehensive config tests in `tests/config/auth_test.go`:
   - 26 tests covering all validation scenarios
   - Tests for mode detection, JWT validation, super admin parsing
   - All tests pass

8. **Task 8 completed**: Created handler tests in `tests/handlers/auth_config_test.go`:
   - Tests for local mode response format with setup_required
   - Tests for zitadel mode response format
   - Tests for public access (no auth required)
   - All tests pass

9. **Task 9 completed**: Created integration tests in `tests/storage/default_tenant_test.go`:
   - Tests EnsureDefaultTenantExists creates tenant when missing
   - Tests idempotency (no error when exists)
   - Tests correct UUID, name, and plan values
   - Tests CountUsersInTenant functionality

### Change Log

- 2026-01-27: Implemented full AUTH_MODE infrastructure with config package, features helpers, auth config handler, default tenant creation, and comprehensive tests
- 2026-01-27: Remediation: Fixed 10 code review issues (1 High, 4 Medium, 3 Low + 2 structural)

### Remediation Log

**Issues Fixed:**
- H1: Potential deadlock risk with ensureInitialized() - Refactored to mustGetConfig() with clear documentation that it must only be called while holding lock
- L1: Inconsistent error message formatting - Standardized all error messages to consistent format
- L2: Missing rationale in DefaultTenantID godoc - Added detailed explanation of why all-zeros UUID was chosen
- L3: features.go functions don't document panic behavior - Added panic documentation to all feature functions and package-level note
- M1: Test file co-located instead of in tests/ directory - Moved auth_test.go tests to tests/handlers/auth_config_test.go, deleted co-located file
- M2: Missing test for setup_required=false with users present - Added TestGetAuthConfig_LocalMode_SetupRequiredLogic with documentation about integration testing requirements
- M3: Local mode uses DevAuthMiddleware without clear warning - Changed log level to Warn() with clearer message
- M4: CountUsersInTenant behavior undocumented for non-existent tenant - Added behavior documentation

### File List

**New files created:**
- `apis-server/internal/config/auth.go` - Auth mode configuration and validation
- `apis-server/internal/config/features.go` - Feature detection helpers
- `apis-server/internal/handlers/auth_config.go` - Public auth config endpoint
- `apis-server/internal/storage/default_tenant.go` - Default tenant creation and user count
- `apis-server/tests/config/auth_test.go` - Config package unit tests
- `apis-server/tests/handlers/auth_config_test.go` - Auth config handler tests
- `apis-server/tests/storage/default_tenant_test.go` - Default tenant integration tests

**Modified files:**
- `apis-server/cmd/server/main.go` - Initialize auth config, create default tenant in local mode
- `apis-server/internal/handlers/auth.go` - Removed old GetAuthConfig and AuthConfig type

**Deleted files:**
- `apis-server/internal/handlers/auth_test.go` - Moved to tests/handlers/ per CLAUDE.md conventions
