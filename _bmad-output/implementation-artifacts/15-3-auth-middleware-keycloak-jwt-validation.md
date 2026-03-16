# Story 15.3: Auth Middleware Keycloak JWT Validation

Status: ready-for-dev

## Story

As the APIS server running in SaaS mode,
I want to validate Keycloak-issued JWTs and extract claims from Keycloak's token format (nested `realm_access.roles`, `org_id`, `org_name`),
so that authenticated requests carry correct role and tenant information from the Keycloak identity provider.

## Goal

Replace the `ZitadelClaims` struct and its Zitadel-specific JSON tags with a `KeycloakClaims` struct that matches Keycloak's JWT claim format. Update the claim extraction logic to handle Keycloak's nested `realm_access.roles` structure. Update `ValidateRequiredClaims()` to accept the new struct. Update all auth middleware tests to use the new claim names and Keycloak-format test JWTs. Verify that `LocalAuthMiddleware` remains completely unchanged.

**FRs Covered:** FR-KC-02 (SaaS mode via Keycloak OIDC), FR-KC-03 (JWT validation with JWKS, issuer with `/realms/{name}`, audience, expiry), FR-KC-04 (Roles from `realm_access.roles`), NFR-KC-01 (JWKS cached with 1h TTL), FR-KC-15 (Standalone mode unchanged).

## Acceptance Criteria

1. **`ZitadelClaims` struct renamed to `KeycloakClaims` with correct JSON tags:**
   - Given the `KeycloakClaims` struct definition
   - Then it has the following fields and JSON tags:
     ```go
     type KeycloakClaims struct {
         jwt.Claims
         Email             string       `json:"email,omitempty"`
         EmailVerified     bool         `json:"email_verified,omitempty"`
         Name              string       `json:"name,omitempty"`
         PreferredUsername  string       `json:"preferred_username,omitempty"`
         OrgID             string       `json:"org_id,omitempty"`
         OrgName           string       `json:"org_name,omitempty"`
         RealmAccess       RealmAccess  `json:"realm_access,omitempty"`
     }

     type RealmAccess struct {
         Roles []string `json:"roles"`
     }
     ```
   - And the old `urn:zitadel:iam:org:id`, `urn:zitadel:iam:org:name`, and `urn:zitadel:iam:user:roles` JSON tags are completely removed
   - And no flat `Roles []string` field exists on the top-level struct (roles are nested under `RealmAccess`)

2. **Roles extracted from `realm_access.roles` nested structure:**
   - Given a Keycloak JWT with payload `{"realm_access": {"roles": ["admin", "user"]}}`
   - When the auth middleware validates the token
   - Then the resulting `Claims` struct has `Roles: ["admin", "user"]` and `Role: "admin"` (first role)
   - Given a Keycloak JWT with no `realm_access` field (or empty roles array)
   - When the auth middleware validates the token
   - Then `Claims.Roles` is empty and `Claims.Role` is empty string

3. **Issuer with `/realms/{name}` path accepted:**
   - Given `KEYCLOAK_ISSUER=https://keycloak.example.com/realms/honeybee`
   - When a JWT with `"iss": "https://keycloak.example.com/realms/honeybee"` is validated
   - Then the issuer claim passes validation (the `/realms/honeybee` path is part of the issuer)
   - Note: This is already handled by the existing `jwt.Expected{Issuer: issuer}` validation in `createAuthMiddleware()`. The issuer string is compared exactly, including any path component. This AC confirms no regression.

4. **`Claims` struct populated correctly from Keycloak JWTs:**
   - Given a Keycloak JWT with standard OIDC claims
   - When the auth middleware processes the token
   - Then the resulting `Claims` struct has:
     - `UserID` = `sub` claim
     - `OrgID` = `org_id` claim (custom Keycloak mapper)
     - `TenantID` = `org_id` claim (mirrored for consistency with local mode)
     - `Email` = `email` claim
     - `Name` = `name` claim (falls back to `preferred_username` if `name` is empty)
     - `Role` = first element of `realm_access.roles`
     - `Roles` = `realm_access.roles` array

5. **JWKS cached with 1-hour TTL (existing behavior, verify no regression):**
   - Given the JWKS cache is populated
   - When a new request arrives within 1 hour
   - Then the cached JWKS is used (no HTTP request to discovery/JWKS endpoints)
   - When a new request arrives after 1 hour
   - Then the JWKS is refreshed from the discovery endpoint
   - Note: This is existing behavior from the `jwksCache` implementation. This AC confirms no regression from renaming.

6. **`ValidateRequiredClaims()` updated to accept `*KeycloakClaims`:**
   - Given a `KeycloakClaims` struct with `Subject` and `OrgID` populated
   - When `ValidateRequiredClaims(&claims)` is called
   - Then it returns empty string (valid)
   - Given a `KeycloakClaims` struct with empty `Subject`
   - When `ValidateRequiredClaims(&claims)` is called
   - Then it returns `"invalid token: missing user identity"`
   - Given a `KeycloakClaims` struct with empty `OrgID`
   - When `ValidateRequiredClaims(&claims)` is called
   - Then it returns `"invalid token: missing organization"`

7. **`LocalAuthMiddleware` completely unchanged:**
   - Given the `LocalAuthMiddleware()` function
   - Then its source code is not modified by this story
   - And all existing local auth tests pass without changes

8. **All auth middleware tests pass:**
   - Given all changes are applied
   - When `go test ./internal/middleware/...` and `go test ./tests/middleware/...` are run
   - Then all tests pass, including updated tests for `KeycloakClaims` and new tests for nested role extraction

9. **Go server builds clean:**
   - Given all changes are applied
   - When `go build ./...` and `go vet ./...` are run
   - Then both commands complete with zero errors

10. **No remaining references to `ZitadelClaims` in the middleware package:**
    - Given the codebase after this story
    - When searching `apis-server/internal/middleware/` for `ZitadelClaims`
    - Then zero results are found
    - When searching `apis-server/tests/middleware/` for `ZitadelClaims`
    - Then zero results are found

## Tasks / Subtasks

- [ ] **Task 1: Create `RealmAccess` struct and rename `ZitadelClaims` to `KeycloakClaims`** (AC: #1, #10)
  - [ ] 1.1: In `apis-server/internal/middleware/auth.go`, add a new `RealmAccess` struct above `KeycloakClaims`:
    ```go
    // RealmAccess represents the nested role structure in Keycloak JWTs.
    // Keycloak places realm-level roles under the "realm_access" claim
    // as a nested object with a "roles" array.
    type RealmAccess struct {
        Roles []string `json:"roles"`
    }
    ```
  - [ ] 1.2: Rename `ZitadelClaims` to `KeycloakClaims` and update all JSON tags:
    ```go
    // KeycloakClaims represents the JWT claims structure from Keycloak.
    // AI/LLM Context: This struct is used only in SaaS mode (AUTH_MODE=keycloak).
    // The custom claims (org_id, org_name) are added via Keycloak protocol mappers
    // configured in the honeybee realm.
    type KeycloakClaims struct {
        jwt.Claims
        Email             string      `json:"email,omitempty"`
        EmailVerified     bool        `json:"email_verified,omitempty"`
        Name              string      `json:"name,omitempty"`
        PreferredUsername  string      `json:"preferred_username,omitempty"`
        OrgID             string      `json:"org_id,omitempty"`
        OrgName           string      `json:"org_name,omitempty"`
        RealmAccess       RealmAccess `json:"realm_access,omitempty"`
    }
    ```
  - [ ] 1.3: Remove the old `Roles []string` field with JSON tag `urn:zitadel:iam:user:roles,omitempty` -- roles now come from `RealmAccess.Roles`
  - [ ] 1.4: Remove the old `OrgID string` JSON tag `urn:zitadel:iam:org:id,omitempty` -- replaced with `org_id,omitempty`
  - [ ] 1.5: Remove the old `OrgName string` JSON tag `urn:zitadel:iam:org:name,omitempty` -- replaced with `org_name,omitempty`

- [ ] **Task 2: Update claim extraction logic in `createAuthMiddleware()`** (AC: #2, #4)
  - [ ] 2.1: In `createAuthMiddleware()`, update the `var claims ZitadelClaims` declaration to `var claims KeycloakClaims`
  - [ ] 2.2: Update the role extraction block to read from the nested `RealmAccess.Roles`:
    ```go
    // Derive primary role from realm_access.roles
    // Keycloak places realm-level roles in a nested "realm_access" object.
    primaryRole := ""
    roles := claims.RealmAccess.Roles
    if len(roles) > 0 {
        primaryRole = roles[0]
    }
    ```
  - [ ] 2.3: Update the `userClaims` construction to use `roles` variable instead of `claims.Roles`:
    ```go
    userClaims := &Claims{
        UserID:   claims.Subject,
        OrgID:    claims.OrgID,
        TenantID: claims.OrgID,
        Email:    claims.Email,
        Name:     claims.Name,
        Role:     primaryRole,
        Roles:    roles,
    }
    ```
  - [ ] 2.4: Verify the `preferred_username` fallback for `Name` still works (it accesses `claims.PreferredUsername` which has the same field name, just confirm the JSON tag parses correctly)

- [ ] **Task 3: Update `ValidateRequiredClaims()` function signature** (AC: #6, #10)
  - [ ] 3.1: Change the parameter type from `*ZitadelClaims` to `*KeycloakClaims`:
    ```go
    func ValidateRequiredClaims(claims *KeycloakClaims) string {
    ```
  - [ ] 3.2: The function body is unchanged -- it accesses `claims.Subject` (from embedded `jwt.Claims`) and `claims.OrgID` (field name unchanged, only JSON tag changed)

- [ ] **Task 4: Update unit tests in `apis-server/internal/middleware/auth_test.go`** (AC: #8, #10)
  - [ ] 4.1: In `TestValidateRequiredClaims`, change all `&ZitadelClaims{...}` to `&KeycloakClaims{...}`:
    ```go
    // Before:
    claims := &ZitadelClaims{OrgID: "org123"}
    // After:
    claims := &KeycloakClaims{OrgID: "org123"}
    ```
  - [ ] 4.2: Verify the `OrgID` field assignment still works (it does -- the field name `OrgID` is unchanged, only the JSON tag changed from `urn:zitadel:iam:org:id` to `org_id`)
  - [ ] 4.3: Add a test for `KeycloakClaims` JSON deserialization to verify the nested `realm_access.roles` structure parses correctly:
    ```go
    func TestKeycloakClaims_JSONDeserialization(t *testing.T) {
        t.Run("parses realm_access.roles from Keycloak JWT payload", func(t *testing.T) {
            // Simulate the JSON payload of a Keycloak JWT
            jsonPayload := `{
                "sub": "user-uuid-123",
                "email": "jermoo@example.com",
                "name": "Jermoo",
                "preferred_username": "jermoo",
                "org_id": "tenant_xyz789",
                "org_name": "Jermoo's Apiary",
                "realm_access": {
                    "roles": ["admin", "user"]
                }
            }`
            var claims KeycloakClaims
            err := json.Unmarshal([]byte(jsonPayload), &claims)
            require.NoError(t, err)

            assert.Equal(t, "user-uuid-123", claims.Subject)
            assert.Equal(t, "jermoo@example.com", claims.Email)
            assert.Equal(t, "Jermoo", claims.Name)
            assert.Equal(t, "jermoo", claims.PreferredUsername)
            assert.Equal(t, "tenant_xyz789", claims.OrgID)
            assert.Equal(t, "Jermoo's Apiary", claims.OrgName)
            assert.Equal(t, []string{"admin", "user"}, claims.RealmAccess.Roles)
        })

        t.Run("handles missing realm_access gracefully", func(t *testing.T) {
            jsonPayload := `{
                "sub": "user-uuid-123",
                "email": "jermoo@example.com",
                "org_id": "tenant_xyz789"
            }`
            var claims KeycloakClaims
            err := json.Unmarshal([]byte(jsonPayload), &claims)
            require.NoError(t, err)

            assert.Empty(t, claims.RealmAccess.Roles)
        })

        t.Run("handles empty roles array", func(t *testing.T) {
            jsonPayload := `{
                "sub": "user-uuid-123",
                "email": "jermoo@example.com",
                "org_id": "tenant_xyz789",
                "realm_access": {"roles": []}
            }`
            var claims KeycloakClaims
            err := json.Unmarshal([]byte(jsonPayload), &claims)
            require.NoError(t, err)

            assert.Empty(t, claims.RealmAccess.Roles)
        })
    }
    ```
  - [ ] 4.4: Add `"encoding/json"` import to the test file if not already present

- [ ] **Task 5: Update integration tests in `apis-server/tests/middleware/auth_test.go`** (AC: #7, #8)
  - [ ] 5.1: Verify `TestLocalAuthMiddleware_*` tests all pass without modification (they test `LocalAuthMiddleware` which is not touched by this story)
  - [ ] 5.2: Verify `TestNewModeAwareAuthMiddleware_LocalMode` passes without modification (it uses local auth path)
  - [ ] 5.3: Verify `TestNewModeAwareAuthMiddleware_DisabledAuth` passes without modification (it uses dev auth path)
  - [ ] 5.4: Note: The `setupAuthConfig` helper already supports `keycloak` mode (via backward-compat `zitadel` alias). No changes needed to the helper for this story.
  - [ ] 5.5: Verify `TestDevAuthMiddleware_InjectsMockClaims` passes. Note: The test expects `"org_id": "dev-org-001"` but the current `DevAuthMiddleware` uses `OrgID: "00000000-0000-0000-0000-000000000000"`. Check if the test fixture needs updating. If there is a mismatch, update the test expectation to match the actual DevAuthMiddleware mock claims.

- [ ] **Task 6: Verify JWKS cache and issuer validation are unaffected** (AC: #3, #5)
  - [ ] 6.1: Confirm `newJWKSCache()` is unchanged (it uses `discoveryBaseURL` which is provider-agnostic)
  - [ ] 6.2: Confirm `getKeySet()` is unchanged (standard OIDC JWKS fetching)
  - [ ] 6.3: Confirm `NewAuthMiddlewareWithDiscovery()` is unchanged (already uses keycloak parameter names from Story 15.1)
  - [ ] 6.4: Confirm issuer validation in `createAuthMiddleware()` uses exact string match (`jwt.Expected{Issuer: issuer}`) which works for any issuer URL including those with `/realms/{name}` path
  - [ ] 6.5: No code changes needed for these items -- this task is a verification checklist

- [ ] **Task 7: Build verification** (AC: #8, #9)
  - [ ] 7.1: Run `cd apis-server && go build ./...` -- zero errors
  - [ ] 7.2: Run `cd apis-server && go vet ./...` -- zero warnings
  - [ ] 7.3: Run `cd apis-server && go test ./internal/middleware/...` -- all tests pass
  - [ ] 7.4: Run `cd apis-server && go test ./tests/middleware/...` -- all tests pass
  - [ ] 7.5: Run `cd apis-server && go test ./...` -- full test suite passes (verify no other packages reference `ZitadelClaims`)

## Dev Notes

### Architecture Compliance

**Go Patterns (from CLAUDE.md):**
- Error wrapping: `fmt.Errorf("middleware: ...: %w", err)` (existing pattern, no new error paths in this story)
- Structured logging with zerolog (existing pattern, no new log lines -- just renaming)
- PascalCase exports (`KeycloakClaims`, `RealmAccess`), camelCase private functions
- snake_case JSON tags (`realm_access`, `org_id`, `org_name`)

### Current State (After Stories 15.1 and 15.2)

Stories 15.1 and 15.2 have already completed these changes:
- `config/auth.go`: `ModeKeycloak = "keycloak"`, `KeycloakIssuer()`, `KeycloakClientID()` getters
- `cmd/server/main.go`: Uses `keycloakIssuer`, `keycloakDiscoveryURL`, `keycloakClientID` variable names
- `middleware/auth.go`: `NewModeAwareAuthMiddleware()` already uses `keycloak*` parameter names, log messages already reference "keycloak", error variables already say `KEYCLOAK_ISSUER`/`KEYCLOAK_CLIENT_ID`
- `secrets/secrets.go`: `GetKeycloakConfig()` replaces `GetZitadelConfig()`
- `handlers/auth_config.go`: Response struct uses `keycloak_authority` and `client_id` fields

**What remains (this story):**
- The `ZitadelClaims` struct is still named `ZitadelClaims` with Zitadel-specific JSON tags
- The claim extraction logic still reads from flat `claims.Roles` (Zitadel format) instead of nested `claims.RealmAccess.Roles` (Keycloak format)
- `ValidateRequiredClaims()` still accepts `*ZitadelClaims`
- Tests still reference `ZitadelClaims`

### What Changes (Minimal)

This story is focused and surgical. The only file being modified is `apis-server/internal/middleware/auth.go` and the two test files. Here is the complete list of changes:

| Location | Change | Lines Affected |
|----------|--------|---------------|
| `auth.go` L54-64 | Rename `ZitadelClaims` to `KeycloakClaims`, add `RealmAccess` struct, update JSON tags | ~15 lines |
| `auth.go` L308 | Change `var claims ZitadelClaims` to `var claims KeycloakClaims` | 1 line |
| `auth.go` L353-357 | Update role extraction to read from `claims.RealmAccess.Roles` | 3 lines |
| `auth.go` L360-368 | Update `Roles` field in `userClaims` construction | 1 line |
| `auth.go` L393 | Change `ValidateRequiredClaims` parameter type | 1 line |
| `auth_test.go` L186-224 | Update `ZitadelClaims` references to `KeycloakClaims` in tests | ~8 lines |
| `auth_test.go` (new) | Add `TestKeycloakClaims_JSONDeserialization` test | ~50 lines |

### What Does NOT Change

| Component | Why It Does Not Change |
|-----------|----------------------|
| `LocalAuthMiddleware()` | Uses separate code path with HS256 JWTs; does not reference `ZitadelClaims` or `KeycloakClaims` |
| `DevAuthMiddleware()` | Creates mock `Claims` struct directly; does not parse JWTs |
| `NewModeAwareAuthMiddleware()` | Already uses `keycloak*` parameters (updated in 15.1); only delegates to other functions |
| `NewAuthMiddleware()` / `NewAuthMiddlewareWithDiscovery()` | Already use `keycloak` naming (updated in 15.1) |
| `jwksCache` struct and methods | Standard OIDC JWKS caching; provider-agnostic |
| `Claims` struct | The output struct is shared between local and SaaS modes; unchanged |
| `GetClaims()` / `RequireClaims()` | Context extraction helpers; unchanged |
| `respondErrorJSON()` | Error response helper; unchanged |
| Tenant middleware (`tenant.go`) | Reads from `Claims.TenantID` which is populated by this middleware; unchanged (Story 15.4 handles its own updates) |

### Keycloak JWT Claim Mapping Reference

| Zitadel JSON Tag | Keycloak JSON Tag | Go Field Name | Notes |
|-----------------|-------------------|---------------|-------|
| `urn:zitadel:iam:org:id` | `org_id` | `OrgID` | Custom Keycloak protocol mapper |
| `urn:zitadel:iam:org:name` | `org_name` | `OrgName` | Custom Keycloak protocol mapper |
| `urn:zitadel:iam:user:roles` (flat array) | `realm_access` (nested object with `roles` array) | `RealmAccess.Roles` | Standard Keycloak realm roles structure |
| `email` | `email` | `Email` | Standard OIDC claim (unchanged) |
| `name` | `name` | `Name` | Standard OIDC claim (unchanged) |
| `preferred_username` | `preferred_username` | `PreferredUsername` | Standard OIDC claim (unchanged) |
| `sub` | `sub` | `Claims.Subject` | Standard OIDC claim (unchanged, from embedded `jwt.Claims`) |

### Keycloak JWT Example

```json
{
  "iss": "https://keycloak.example.com/realms/honeybee",
  "sub": "user-uuid-12345",
  "aud": "apis-dashboard",
  "exp": 1707400000,
  "iat": 1707396400,
  "email": "jermoo@example.com",
  "email_verified": true,
  "name": "Jermoo",
  "preferred_username": "jermoo",
  "realm_access": {
    "roles": ["admin", "user"]
  },
  "org_id": "tenant_xyz789",
  "org_name": "Jermoo's Apiary"
}
```

### JWKS Caching (NFR-KC-01 -- No Change Needed)

The existing `jwksCache` implementation already meets NFR-KC-01:
- Cache TTL is `time.Hour` (1 hour), set in `NewAuthMiddlewareWithDiscovery()`
- Cache is refreshed on expiry via `getKeySet()`
- Double-check locking prevents thundering herd
- If a `kid` (key ID) mismatch occurs, the current implementation iterates all cached keys. A future enhancement could force-refresh on `kid` mismatch, but this is not required for this story.

### Issuer Validation (FR-KC-03 -- No Change Needed)

Keycloak uses issuer URLs with a `/realms/{name}` path, e.g., `https://keycloak.example.com/realms/honeybee`. The existing validation in `createAuthMiddleware()` uses:

```go
expectedClaims := jwt.Expected{
    Issuer:      issuer,
    AnyAudience: jwt.Audience{clientID},
    Time:        time.Now(),
}
```

This performs an exact string match on the issuer, which works correctly for any URL including those with path components. The `KEYCLOAK_ISSUER` env var (set by the operator) must match the `iss` claim exactly.

### Security Considerations

1. **Nested roles are safer than flat roles:** Keycloak's `realm_access.roles` structure is less likely to collide with custom claims than Zitadel's flat `urn:zitadel:iam:user:roles` array. No additional security concern.

2. **`org_id` is a custom claim:** Unlike `sub` or `email`, the `org_id` claim is added by a custom Keycloak protocol mapper. If the mapper is misconfigured, `org_id` will be absent from JWTs. The existing `ValidateRequiredClaims()` function catches this and returns `"invalid token: missing organization"`. This is the same protection level as before.

3. **Audience validation unchanged:** The `jwt.Expected{AnyAudience: jwt.Audience{clientID}}` validation ensures only tokens intended for this application are accepted.

### Testing Strategy

**Unit tests (`internal/middleware/auth_test.go`):**
- Update `TestValidateRequiredClaims` to use `KeycloakClaims` instead of `ZitadelClaims`
- Add `TestKeycloakClaims_JSONDeserialization` with subtests for:
  - Full Keycloak JWT payload (all claims present)
  - Missing `realm_access` (graceful handling)
  - Empty `roles` array

**Integration tests (`tests/middleware/auth_test.go`):**
- No changes needed -- these tests exercise `LocalAuthMiddleware` and `NewModeAwareAuthMiddleware` in local/dev modes, which do not touch `KeycloakClaims`
- Verify all existing tests still pass

**Full JWKS integration test is NOT in scope:** Testing real JWKS validation with RS256 would require a test JWKS server and RSA key pair generation. The existing tests (which verify error handling, missing headers, and invalid tokens) provide sufficient coverage. Full end-to-end JWKS validation is covered by Story 15.10 (CI verification).

### Files to Modify

| File | Change Type | Details |
|------|------------|---------|
| `apis-server/internal/middleware/auth.go` | Major | Rename `ZitadelClaims` to `KeycloakClaims`, add `RealmAccess` struct, update JSON tags, update claim extraction logic, update `ValidateRequiredClaims` signature |
| `apis-server/internal/middleware/auth_test.go` | Major | Update `ZitadelClaims` references to `KeycloakClaims`, add `TestKeycloakClaims_JSONDeserialization` |

### Files NOT Modified

| File | Reason |
|------|--------|
| `apis-server/tests/middleware/auth_test.go` | Tests local and dev auth modes which do not use `KeycloakClaims` |
| `apis-server/internal/middleware/tenant.go` | Reads from `Claims` struct (output), not `KeycloakClaims` (input parsing) |
| `apis-server/internal/middleware/response.go` | Error response helper; unrelated |
| `apis-server/cmd/server/main.go` | Already uses keycloak naming from 15.1 |
| `apis-server/internal/config/auth.go` | Already updated in 15.1 |

### Scope Boundary

This story changes **JWT claim parsing and extraction in the OIDC middleware** only. It does NOT:
- Modify tenant middleware org_id extraction (Story 15.4)
- Touch any frontend code (Stories 15.5, 15.6)
- Modify Docker Compose or Keycloak realm setup (Story 15.7)
- Update documentation or CLAUDE.md (Stories 15.8, 15.9)
- Change local auth middleware or any standalone mode code

### What Can Break

1. **Any code directly constructing `ZitadelClaims`** will fail to compile after the rename. A grep for `ZitadelClaims` across the codebase shows references only in:
   - `internal/middleware/auth.go` (this file, updated by this story)
   - `internal/middleware/auth_test.go` (updated by this story)
   - No other packages reference `ZitadelClaims`

2. **OIDC tokens from a real Keycloak instance** will now parse correctly (nested `realm_access.roles`). Tokens from Zitadel would fail to parse roles (but Zitadel is being replaced, so this is expected and desired).

3. **The `OrgID` field** now parses from `org_id` instead of `urn:zitadel:iam:org:id`. Any Zitadel tokens would have an empty `org_id`, failing `ValidateRequiredClaims()`. This is expected.

## Dependencies

- **Depends on:** Story 15.1 (done) -- config package has Keycloak naming, `NewModeAwareAuthMiddleware` uses keycloak params
- **Blocks:** Story 15.4 (tenant middleware org_id claim extraction) -- 15.4 depends on the `Claims` struct being populated correctly from Keycloak JWTs
- **Related:** Story 15.2 (done) -- secrets package updated, but middleware does not call secrets directly

## References

- [Source: _bmad-output/planning-artifacts/epic-15-keycloak-migration.md - Story 15.3]
- [Source: _bmad-output/planning-artifacts/prd-addendum-keycloak-migration.md - FR-KC-02, FR-KC-03, FR-KC-04, NFR-KC-01, Section 3.2 JWT Claims Mapping]
- [Source: apis-server/internal/middleware/auth.go - Current auth middleware with ZitadelClaims]
- [Source: apis-server/internal/middleware/auth_test.go - Current middleware unit tests]
- [Source: apis-server/tests/middleware/auth_test.go - Current middleware integration tests]
- [Source: _bmad-output/implementation-artifacts/15-1-auth-mode-config-env-vars.md - Story 15.1 (predecessor)]
- [Source: _bmad-output/implementation-artifacts/15-2-secrets-auth-config-endpoint.md - Story 15.2 (predecessor)]
