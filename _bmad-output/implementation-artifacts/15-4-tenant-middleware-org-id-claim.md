# Story 15.4: Tenant Middleware org_id Claim Extraction

Status: ready-for-dev

## Story

As the APIS server running in SaaS mode,
I want the tenant middleware to correctly resolve tenant context from the `org_id` claim produced by Keycloak JWTs,
so that multi-tenant isolation, user provisioning, and super-admin functionality work correctly with Keycloak as the identity provider.

## Goal

Verify and update the tenant middleware to work with Keycloak-format claims. After Story 15.3, the auth middleware now produces a `Claims` struct where `TenantID` is populated from the Keycloak `org_id` claim (via `KeycloakClaims.OrgID`). The tenant middleware (`tenant.go`) already reads from `claims.TenantID`, so the core data flow should work. This story focuses on:

1. Removing any remaining Zitadel references in tenant middleware comments and test fixtures
2. Updating the `SuperAdminOnly` middleware comment that still says `AUTH_MODE=zitadel`
3. Updating test fixtures that reference `ZitadelUserID` to acknowledge the Keycloak context
4. Verifying auto-provisioning works with Keycloak claims (the provisioning service still references "Zitadel" in comments and log messages)
5. Updating the provisioning service comments and log messages from "Zitadel" to "Keycloak" / generic OIDC
6. Verifying super-admin email check works (uses standard `email` claim -- no change expected)

**FRs Covered:** FR-KC-05 (Tenant ID from `org_id` claim), FR-KC-06 (Super-admin via `SUPER_ADMIN_EMAILS`), FR-KC-15 (Standalone mode unchanged).

## Acceptance Criteria

1. **Tenant resolved from `org_id` claim in Keycloak JWTs:**
   - Given a Keycloak JWT with `"org_id": "tenant_xyz789"`
   - When the auth middleware processes it (Story 15.3, already done)
   - Then `Claims.TenantID` = `"tenant_xyz789"` and `Claims.OrgID` = `"tenant_xyz789"`
   - When the tenant middleware reads `claims.TenantID`
   - Then it uses `"tenant_xyz789"` as the tenant ID for RLS and user lookup
   - Note: This data flow already works because `tenant.go` reads `claims.TenantID` and the auth middleware sets `TenantID = claims.OrgID` (from the `org_id` JSON tag). This AC confirms no regression.

2. **New tenant auto-provisioned on first login (existing behavior):**
   - Given a new Keycloak user whose `org_id` is not yet in the tenants table
   - When the tenant middleware calls `provisionSaaSUser()`
   - Then the provisioning service creates the tenant and user
   - And the `ProvisioningClaims.UserID` matches the Keycloak `sub` claim
   - And the `ProvisioningClaims.OrgID` matches the Keycloak `org_id` claim
   - Note: The provisioning service uses `storage.GetUserByZitadelID()` and `storage.CreateUser()` which write to the `zitadel_user_id` column. The column rename to `external_user_id` is deferred to Story 15.9. This story only updates comments and log messages.

3. **Super-admin check via `SUPER_ADMIN_EMAILS` works with Keycloak email claim:**
   - Given `SUPER_ADMIN_EMAILS=admin@example.com`
   - And a Keycloak JWT with `"email": "admin@example.com"`
   - When the `SuperAdminOnly` middleware checks `config.IsSuperAdmin(claims.Email)`
   - Then access is granted (the `email` claim is a standard OIDC claim, identical between Zitadel and Keycloak)
   - Note: The super-admin check uses `claims.Email` from the shared `Claims` struct. Both the local and Keycloak auth middlewares populate this field from the standard `email` claim. No code change needed -- this AC confirms no regression.

4. **RLS tenant isolation enforced (existing behavior):**
   - Given the tenant middleware sets `app.tenant_id` via `set_config()`
   - When a handler queries the database
   - Then RLS policies restrict results to the current tenant
   - Note: This is existing behavior that does not depend on the claim format. This AC confirms no regression.

5. **Local mode default tenant unchanged:**
   - Given `AUTH_MODE=local`
   - When the tenant middleware processes a request
   - Then `claims.TenantID` is `"00000000-0000-0000-0000-000000000000"` (from `LocalAuthMiddleware`)
   - And the `lookupLocalUser()` path is followed (no SaaS provisioning)
   - Note: No code change needed -- this AC confirms no regression.

6. **No remaining Zitadel references in tenant middleware or super-admin middleware:**
   - Given the codebase after this story
   - When searching `apis-server/internal/middleware/tenant.go` for "zitadel" (case-insensitive)
   - Then zero results are found (comments already updated in 15.1 remediation)
   - When searching `apis-server/internal/middleware/superadmin.go` for "zitadel" (case-insensitive)
   - Then zero results are found
   - When searching `apis-server/internal/middleware/tenant_test.go` for "zitadel" (case-insensitive)
   - Then zero results are found (field names like `ZitadelUserID` in the `User` struct are a storage layer concern, addressed by Story 15.9)

7. **No remaining Zitadel references in provisioning service:**
   - Given the codebase after this story
   - When searching `apis-server/internal/services/provisioning.go` for "zitadel" (case-insensitive)
   - Then zero results are found (comments and log messages updated)
   - When searching `apis-server/internal/services/provisioning_test.go` for "zitadel" (case-insensitive)
   - Then only references to the `zitadel_user_id` SQL column name remain (column rename is Story 15.9)

8. **Tenant middleware tests pass:**
   - Given all changes are applied
   - When `go test ./internal/middleware/...` is run
   - Then all tests pass

9. **Go server builds clean:**
   - Given all changes are applied
   - When `go build ./...` and `go vet ./...` are run
   - Then both commands complete with zero errors

10. **Defense-in-depth tenant verification works with Keycloak claims:**
    - Given a Keycloak JWT where `org_id` does not match the user's `tenant_id` in the database
    - When the tenant middleware compares `user.TenantID != tenantID`
    - Then it returns 403 "access denied" (existing security fix AUTH-002-F2)
    - Note: This verification uses `user.TenantID` and `claims.TenantID`, both of which are provider-agnostic strings. No code change needed -- this AC confirms no regression.

## Tasks / Subtasks

- [ ] **Task 1: Update `SuperAdminOnly` middleware comment** (AC: #6)
  - [ ] 1.1: In `apis-server/internal/middleware/superadmin.go`, line 14, change the comment:
    ```
    // Before:
    // 1. SaaS mode (AUTH_MODE=zitadel) - returns 404 in local mode
    // After:
    // 1. SaaS mode (AUTH_MODE=keycloak) - returns 404 in local mode
    ```
  - [ ] 1.2: Verify no other Zitadel references exist in the file (there should be none in the actual code, only this comment)

- [ ] **Task 2: Update provisioning service comments and log messages** (AC: #7)
  - [ ] 2.1: In `apis-server/internal/services/provisioning.go`, update the `ProvisioningClaims` struct comments:
    ```go
    // Before:
    type ProvisioningClaims struct {
        UserID string // Zitadel sub claim
        OrgID  string // Zitadel organization ID
        Email  string // User email
        Name   string // User display name
    }
    // After:
    type ProvisioningClaims struct {
        UserID string // OIDC sub claim (Keycloak user ID in SaaS mode)
        OrgID  string // Organization ID (Keycloak org_id claim in SaaS mode)
        Email  string // User email
        Name   string // User display name
    }
    ```
  - [ ] 2.2: Update the `EnsureUserProvisioned` function doc comment:
    ```go
    // Before:
    // Uses OrgID as tenant_id because:
    // - Zitadel Organizations map 1:1 to APIS tenants
    // - org_id is stable across user sessions
    // - org_id is already validated in AuthMiddleware
    // After:
    // Uses OrgID as tenant_id because:
    // - Keycloak Organizations map 1:1 to APIS tenants
    // - org_id is stable across user sessions
    // - org_id is already validated in AuthMiddleware
    ```
  - [ ] 2.3: Update the log message in `EnsureUserProvisioned`:
    ```go
    // Before:
    log.Info().
        Str("zitadel_user_id", claims.UserID).
        Str("org_id", claims.OrgID).
        Str("email", claims.Email).
        Msg("Provisioning new user")
    // After:
    log.Info().
        Str("external_user_id", claims.UserID).
        Str("org_id", claims.OrgID).
        Str("email", claims.Email).
        Msg("Provisioning new user")
    ```
    Note: The log key changes from `zitadel_user_id` to `external_user_id` to be provider-neutral. The value is the OIDC `sub` claim regardless of provider.

- [ ] **Task 3: Update tenant middleware test fixtures** (AC: #6, #8)
  - [ ] 3.1: In `apis-server/internal/middleware/tenant_test.go`, line 28, update the test fixture comment and field:
    ```go
    // Before:
    expectedUser := &storage.User{
        ID:            "user-123",
        TenantID:      "tenant-456",
        ZitadelUserID: "zitadel-789",
        Email:         "test@example.com",
        Name:          "Test User",
        CreatedAt:     time.Now(),
    }
    // After:
    expectedUser := &storage.User{
        ID:            "user-123",
        TenantID:      "tenant-456",
        ZitadelUserID: "keycloak-sub-789",  // External OIDC user ID (Keycloak sub claim)
        Email:         "test@example.com",
        Name:          "Test User",
        CreatedAt:     time.Now(),
    }
    ```
    Note: The field name `ZitadelUserID` is part of the `storage.User` struct and database column. Renaming it to `ExternalUserID` is deferred to Story 15.9 (database schema change). For this story, only the test VALUE is changed to reflect Keycloak context, and a comment is added to clarify the intent.
  - [ ] 3.2: On line 39, update the corresponding assertion:
    ```go
    // Before:
    assert.Equal(t, expectedUser.ZitadelUserID, user.ZitadelUserID)
    // After:
    assert.Equal(t, expectedUser.ZitadelUserID, user.ZitadelUserID) // Field rename to ExternalUserID deferred to Story 15.9
    ```

- [ ] **Task 4: Verify tenant data flow end-to-end** (AC: #1, #2, #4, #10)
  - [ ] 4.1: Trace the SaaS mode data flow to confirm correctness:
    - Auth middleware (`auth.go`): Keycloak JWT -> `KeycloakClaims.OrgID` (from `org_id` JSON tag) -> `Claims.TenantID = claims.OrgID`
    - Tenant middleware (`tenant.go`): `claims.TenantID` -> `set_config('app.tenant_id', ...)` -> RLS active
    - Tenant middleware (`tenant.go`): `provisionSaaSUser()` -> `ProvisioningClaims{UserID: claims.UserID, OrgID: claims.TenantID, ...}`
    - Provisioning service: `storage.GetUserByZitadelID(claims.UserID)` -> lookup by `sub` claim in `zitadel_user_id` column
    - Defense-in-depth: `user.TenantID != tenantID` -> 403 if mismatch
  - [ ] 4.2: Confirm no code changes needed in `tenant.go` for the data flow (comments were already updated in 15.1 remediation -- verify they say "Keycloak" not "Zitadel")
  - [ ] 4.3: Confirm `tenant.go` line 35 says "keycloak" not "zitadel" in the comment:
    ```go
    // SaaS Mode (AUTH_MODE=keycloak):
    //   - Uses claims.TenantID (mirrored from Keycloak org_id)
    //   - Looks up user by Keycloak ID (claims.UserID = keycloak_user_id)
    ```
    If it still says "Zitadel", update it.

- [ ] **Task 5: Verify super-admin functionality** (AC: #3)
  - [ ] 5.1: Confirm `SuperAdminOnly` middleware uses `claims.Email` which is populated by both auth paths
  - [ ] 5.2: Confirm `config.IsSuperAdmin(email)` does case-insensitive comparison (it does -- `strings.ToLower`)
  - [ ] 5.3: Confirm the `email` claim is a standard OIDC claim present in both Zitadel and Keycloak tokens
  - [ ] 5.4: No code changes needed -- this is a verification task

- [ ] **Task 6: Build and test verification** (AC: #8, #9)
  - [ ] 6.1: Run `cd apis-server && go build ./...` -- zero errors
  - [ ] 6.2: Run `cd apis-server && go vet ./...` -- zero warnings
  - [ ] 6.3: Run `cd apis-server && go test ./internal/middleware/...` -- all tests pass
  - [ ] 6.4: Run `cd apis-server && go test ./internal/services/...` -- all tests pass (provisioning comment changes are comment-only)
  - [ ] 6.5: Run `cd apis-server && go test ./...` -- full test suite passes

## Dev Notes

### Architecture Compliance

**Go Patterns (from CLAUDE.md):**
- Error wrapping: `fmt.Errorf("tenant: ...: %w", err)` (existing pattern, no new error paths)
- Structured logging with zerolog (update log key from `zitadel_user_id` to `external_user_id`)
- snake_case JSON fields, PascalCase exports (existing patterns preserved)

### Current State (After Stories 15.1 through 15.3)

Stories 15.1-15.3 have already completed these changes:
- `config/auth.go`: `ModeKeycloak = "keycloak"`, `KeycloakIssuer()`, `KeycloakClientID()`, `IsSuperAdmin()`
- `middleware/auth.go`: `KeycloakClaims` struct with `org_id` JSON tag, `RealmAccess.Roles`, populates `Claims.TenantID = claims.OrgID`
- `middleware/tenant.go`: Comments already updated to say "keycloak" (done in 15.1 remediation pass): lines 33-37 reference `AUTH_MODE=keycloak` and Keycloak IDs
- `secrets/secrets.go`: `GetKeycloakConfig()` replaces `GetZitadelConfig()`

**What remains (this story):**
- `middleware/superadmin.go` line 14 still says `AUTH_MODE=zitadel` in a comment
- `services/provisioning.go` still has "Zitadel" in comments and `zitadel_user_id` log key
- `middleware/tenant_test.go` uses `ZitadelUserID: "zitadel-789"` as a test value (the field name is a storage struct concern for 15.9, but the test VALUE should reflect Keycloak)

### What Changes (Minimal)

This story is primarily a **comment/documentation cleanup and verification pass**. The actual data flow already works correctly after Story 15.3.

| Location | Change | Lines Affected |
|----------|--------|---------------|
| `middleware/superadmin.go` L14 | Update comment: `AUTH_MODE=zitadel` -> `AUTH_MODE=keycloak` | 1 line |
| `services/provisioning.go` L18-19 | Update `ProvisioningClaims` struct comments | 2 lines |
| `services/provisioning.go` L27-29 | Update doc comment: "Zitadel Organizations" -> "Keycloak Organizations" | 1 line |
| `services/provisioning.go` L66 | Update log key: `zitadel_user_id` -> `external_user_id` | 1 line |
| `middleware/tenant_test.go` L28 | Update test fixture value from `"zitadel-789"` to `"keycloak-sub-789"` | 1 line |

### What Does NOT Change

| Component | Why It Does Not Change |
|-----------|----------------------|
| `middleware/tenant.go` | Already reads from `Claims.TenantID` which is populated correctly from Keycloak `org_id`. Comments already updated in 15.1 remediation. |
| `middleware/auth.go` | Updated in Story 15.3 (KeycloakClaims, RealmAccess, org_id) |
| `config/auth.go` | Updated in Story 15.1 (ModeKeycloak, backward compat) |
| `storage/users.go` | Field name `ZitadelUserID` and column name `zitadel_user_id` -- renamed in Story 15.9 |
| Database schema | Column rename `zitadel_user_id` -> `external_user_id` is Story 15.9 |
| `LocalAuthMiddleware` and local mode paths | Completely isolated from SaaS/Keycloak code |

### Keycloak Tenant Resolution Data Flow

```
Keycloak JWT
    |
    v
Auth Middleware (auth.go, Story 15.3)
    |-- KeycloakClaims.OrgID = "org_id" JSON claim
    |-- Claims.TenantID = KeycloakClaims.OrgID
    |-- Claims.UserID = KeycloakClaims.Subject (sub claim)
    |-- Claims.Email = KeycloakClaims.Email (standard OIDC)
    v
Tenant Middleware (tenant.go, this story verifies)
    |-- tenantID = claims.TenantID
    |-- SET app.tenant_id = tenantID  (RLS activated)
    |-- provisionSaaSUser(claims)
    |     |-- ProvisioningClaims{UserID, OrgID, Email, Name}
    |     |-- storage.GetUserByZitadelID(claims.UserID)  [column name TBD 15.9]
    |     |-- storage.CreateUser() if not found
    |-- Defense-in-depth: user.TenantID == tenantID?
    v
Handler (has tenant-scoped DB connection + User)
```

### Super-Admin Flow (Verification)

```
Keycloak JWT with email: "admin@example.com"
    |
    v
Auth Middleware -> Claims.Email = "admin@example.com"
    |
    v
SuperAdminOnly Middleware
    |-- config.IsSaaSMode() == true
    |-- claims = GetClaims(ctx)
    |-- config.IsSuperAdmin(claims.Email)
    |     |-- SUPER_ADMIN_EMAILS = "admin@example.com"
    |     |-- lowercase comparison matches
    |-- Access granted
    v
Admin Handler
```

The `email` claim is a standard OIDC claim (`email` in both Zitadel and Keycloak JWTs). The `IsSuperAdmin` check is completely provider-agnostic.

### Security Considerations

1. **Tenant isolation via org_id:** The Keycloak `org_id` claim is produced by a custom protocol mapper. If the mapper is misconfigured, `org_id` will be empty. The auth middleware's `ValidateRequiredClaims()` catches this and rejects the request before it reaches the tenant middleware.

2. **Defense-in-depth verification:** The tenant middleware's cross-check (`user.TenantID != tenantID`) provides protection against token manipulation or org migration edge cases. This works identically with Keycloak claims.

3. **Super-admin email list:** The `SUPER_ADMIN_EMAILS` env var is case-insensitively compared against the standard OIDC `email` claim. This is provider-agnostic and works with any OIDC identity provider.

4. **RLS enforcement:** Row-Level Security uses `app.tenant_id` set in the database session. This is a string value from `claims.TenantID` and is completely independent of the claim format or source.

### Testing Strategy

**Unit tests (`internal/middleware/tenant_test.go`):**
- Update test fixture to use Keycloak-context values
- All existing tests should pass with minimal fixture changes
- No new tests needed -- the middleware logic is unchanged

**Verification tests (no new test files):**
- `go test ./internal/middleware/...` -- confirms tenant middleware tests pass
- `go test ./internal/services/...` -- confirms provisioning tests pass (comment-only changes)
- `go test ./...` -- confirms no regressions across the full server

**Integration testing (Story 15.10):**
- End-to-end tenant isolation with Keycloak tokens is covered by Story 15.10

### Files to Modify

| File | Change Type | Details |
|------|------------|---------|
| `apis-server/internal/middleware/superadmin.go` | Minor | Update comment on line 14: `AUTH_MODE=zitadel` -> `AUTH_MODE=keycloak` |
| `apis-server/internal/services/provisioning.go` | Minor | Update comments (ProvisioningClaims fields, EnsureUserProvisioned doc), update log key |
| `apis-server/internal/middleware/tenant_test.go` | Minor | Update test fixture value and add clarifying comment |

### Files NOT Modified

| File | Reason |
|------|--------|
| `apis-server/internal/middleware/tenant.go` | Already correct (comments updated in 15.1 remediation, code reads from `Claims.TenantID` which is provider-agnostic) |
| `apis-server/internal/middleware/auth.go` | Updated in Story 15.3 |
| `apis-server/internal/storage/users.go` | Column/field rename deferred to Story 15.9 |
| `apis-server/internal/config/auth.go` | Updated in Story 15.1 |
| `apis-server/internal/services/provisioning_test.go` | References `zitadel_user_id` SQL column name which is a database schema concern (Story 15.9); test cleanup queries still valid |
| Frontend code | Not in scope for this backend story |

### Scope Boundary

This story handles **tenant middleware verification and Zitadel reference cleanup in the tenant/provisioning layer** only. It does NOT:
- Rename the `zitadel_user_id` database column or `ZitadelUserID` struct field (Story 15.9)
- Modify auth middleware claim parsing (Story 15.3, already done)
- Touch any frontend code (Stories 15.5, 15.6)
- Modify Docker Compose or Keycloak realm setup (Story 15.7)
- Update CLAUDE.md or architecture docs (Stories 15.8, 15.9)

### What Can Break

1. **Nothing functionally.** The data flow is already correct after Story 15.3. All changes in this story are comments, log keys, and test fixture values.

2. **Log parsing scripts** that grep for `zitadel_user_id` in structured logs will need updating to `external_user_id`. This is a minor operational concern.

3. **Test assertions** for the `ZitadelUserID` field value -- the test now uses `"keycloak-sub-789"` instead of `"zitadel-789"`. This is a test-only change with no production impact.

## Dependencies

- **Depends on:** Story 15.3 (done) -- auth middleware produces `Claims` with `TenantID` from Keycloak `org_id` claim
- **Depends on:** Story 15.1 (done) -- config package has `ModeKeycloak`, tenant.go comments already updated
- **Blocks:** Story 15.9 (documentation and schema updates) -- 15.9 can proceed knowing tenant resolution is verified
- **Blocks:** Story 15.10 (CI verification) -- 15.10 validates the full end-to-end flow

## References

- [Source: _bmad-output/planning-artifacts/epic-15-keycloak-migration.md - Story 15.4]
- [Source: _bmad-output/planning-artifacts/prd-addendum-keycloak-migration.md - FR-KC-05, FR-KC-06, Section 3.1 Multi-Tenant Architecture, Section 3.2 JWT Claims Mapping]
- [Source: apis-server/internal/middleware/tenant.go - Current tenant middleware]
- [Source: apis-server/internal/middleware/tenant_test.go - Current tenant middleware tests]
- [Source: apis-server/internal/middleware/superadmin.go - SuperAdminOnly middleware]
- [Source: apis-server/internal/services/provisioning.go - User provisioning service]
- [Source: apis-server/internal/middleware/auth.go - Auth middleware with KeycloakClaims (Story 15.3)]
- [Source: _bmad-output/implementation-artifacts/15-3-auth-middleware-keycloak-jwt-validation.md - Story 15.3 (predecessor)]
