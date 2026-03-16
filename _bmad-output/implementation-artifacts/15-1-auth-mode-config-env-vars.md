# Story 15.1: Auth Mode Config & Environment Variables

Status: ready-for-dev

## Story

As a system administrator,
I want the server to recognize `AUTH_MODE=keycloak` as the SaaS authentication mode,
so that the codebase is aligned with the new Keycloak-based shared infrastructure while maintaining backward compatibility with `AUTH_MODE=zitadel`.

## Goal

Update the auth mode infrastructure to recognize `keycloak` instead of `zitadel`. This is the foundational story for Epic 15 (Keycloak Migration). All subsequent stories depend on the config package and main.go changes made here.

**FRs Covered:** FR-KC-01 (Replace `AUTH_MODE=zitadel` with `AUTH_MODE=keycloak`), FR-KC-14 (Env var naming `ZITADEL_*` to `KEYCLOAK_*`), FR-KC-15 (Standalone mode unchanged).

## Acceptance Criteria

1. **`AUTH_MODE=keycloak` recognized and sets SaaS mode:**
   - Given `AUTH_MODE=keycloak` is set
   - When the server starts
   - Then `config.AuthMode()` returns `"keycloak"`
   - And `config.IsSaaSMode()` returns `true`
   - And `config.IsLocalAuth()` returns `false`

2. **`AUTH_MODE=zitadel` backward compatibility with deprecation warning:**
   - Given `AUTH_MODE=zitadel` is set
   - When `InitAuthConfig()` is called
   - Then the mode is internally normalized to `"keycloak"`
   - And a deprecation warning is logged: `"AUTH_MODE=zitadel is deprecated, use AUTH_MODE=keycloak"`
   - And `config.AuthMode()` returns `"keycloak"`
   - And `config.IsSaaSMode()` returns `true`

3. **`AUTH_MODE=local` behavior completely unchanged:**
   - Given `AUTH_MODE=local` is set
   - When the server starts
   - Then all local mode behavior is identical to before this change
   - And no deprecation warnings are logged

4. **`KEYCLOAK_ISSUER` and `KEYCLOAK_CLIENT_ID` env vars read correctly:**
   - Given `AUTH_MODE=keycloak` is set
   - When the server starts
   - Then `KEYCLOAK_ISSUER` is read (required, or startup fails)
   - And `KEYCLOAK_CLIENT_ID` is read (required, or startup fails)
   - And `config.KeycloakIssuer()` and `config.KeycloakClientID()` return the values

5. **Backward-compat env var fallback for `ZITADEL_*` vars:**
   - Given `AUTH_MODE=keycloak` is set with `ZITADEL_ISSUER` but no `KEYCLOAK_ISSUER`
   - When `InitAuthConfig()` is called
   - Then `ZITADEL_ISSUER` is used as fallback for `KEYCLOAK_ISSUER`
   - And a deprecation warning is logged for each fallback env var used

6. **`config/features.go` updated for Keycloak naming:**
   - Given `config/features.go` has `RequiresZitadelAuth()` function
   - When this story is complete
   - Then it is renamed to `RequiresOIDCAuth()` (provider-neutral)
   - And `IsSaaSMode()` still returns `true` for keycloak mode

7. **`main.go` updated with Keycloak variable names and log messages:**
   - Given the server starts in keycloak mode
   - When startup logging occurs
   - Then log messages reference "keycloak" not "zitadel"
   - And variable names in main.go use `keycloak*` prefix

8. **Go server builds clean:**
   - Given all changes are applied
   - When `go build ./...` and `go vet ./...` are run
   - Then both commands complete with zero errors

## Tasks / Subtasks

- [ ] **Task 1: Update `config/auth.go` constants and struct** (AC: #1, #2, #4)
  - [ ] 1.1: Change `ModeZitadel = "zitadel"` to `ModeKeycloak = "keycloak"`
  - [ ] 1.2: Rename `authConfigData` fields: `zitadelIssuer` -> `keycloakIssuer`, `zitadelClientID` -> `keycloakClientID`
  - [ ] 1.3: Update `DefaultTenantID` comment: change "Zitadel organization ID" to "Keycloak organization ID"

- [ ] **Task 2: Update `InitAuthConfig()` for keycloak mode with backward compatibility** (AC: #1, #2, #3, #4, #5)
  - [ ] 2.1: Accept `AUTH_MODE=keycloak` as valid mode
  - [ ] 2.2: Accept `AUTH_MODE=zitadel` as deprecated alias: normalize to `"keycloak"` internally and log deprecation warning using zerolog `Warn()`
  - [ ] 2.3: Update error message for invalid AUTH_MODE: `"must be 'local' or 'keycloak'"` (also mention `'zitadel'` as deprecated in the error)
  - [ ] 2.4: In keycloak mode block: read `KEYCLOAK_ISSUER` env var first, fall back to `ZITADEL_ISSUER` if not set (log deprecation warning on fallback)
  - [ ] 2.5: In keycloak mode block: read `KEYCLOAK_CLIENT_ID` env var first, fall back to `ZITADEL_CLIENT_ID` if not set (log deprecation warning on fallback)
  - [ ] 2.6: Update required-var error messages: `"KEYCLOAK_ISSUER is required in keycloak mode"`
  - [ ] 2.7: In local mode else-block: update stored field names from `zitadelIssuer`/`zitadelClientID` to `keycloakIssuer`/`keycloakClientID` (these are ignored in local mode but stored for completeness)

- [ ] **Task 3: Update exported getter functions** (AC: #4)
  - [ ] 3.1: Rename `ZitadelIssuer()` to `KeycloakIssuer()` — returns `keycloakIssuer` field
  - [ ] 3.2: Rename `ZitadelClientID()` to `KeycloakClientID()` — returns `keycloakClientID` field
  - [ ] 3.3: Update godoc comments on all renamed functions to reference Keycloak

- [ ] **Task 4: Update `IsSaaSMode()` and related functions** (AC: #1, #2)
  - [ ] 4.1: Change `IsSaaSMode()` comparison from `ModeZitadel` to `ModeKeycloak`
  - [ ] 4.2: Update `IsSaaSMode()` godoc from "Zitadel" to "Keycloak"
  - [ ] 4.3: Update `AuthMode()` godoc from `"local" or "zitadel"` to `"local" or "keycloak"`

- [ ] **Task 5: Update `config/features.go`** (AC: #6)
  - [ ] 5.1: Rename `RequiresZitadelAuth()` to `RequiresOIDCAuth()`
  - [ ] 5.2: Update godoc: "Zitadel OIDC authentication" -> "OIDC authentication (Keycloak)"
  - [ ] 5.3: Update `SupportsSuperAdmin()` godoc: "Zitadel mode" -> "SaaS (Keycloak) mode"
  - [ ] 5.4: Update `SupportsMultiTenant()` godoc: "Zitadel mode" -> "SaaS (Keycloak) mode", "Zitadel organization" -> "Keycloak organization"

- [ ] **Task 6: Update callers of renamed functions** (AC: #7)
  - [ ] 6.1: In `cmd/server/main.go`: rename `zitadelIssuer` variable to `keycloakIssuer`
  - [ ] 6.2: In `cmd/server/main.go`: rename `zitadelDiscoveryURL` variable to `keycloakDiscoveryURL` and update the env var read from `ZITADEL_DISCOVERY_URL` to `KEYCLOAK_DISCOVERY_URL` (with `ZITADEL_DISCOVERY_URL` fallback)
  - [ ] 6.3: In `cmd/server/main.go`: rename `zitadelClientID` variable to `keycloakClientID`
  - [ ] 6.4: In `cmd/server/main.go`: update `config.ZitadelIssuer()` call to `config.KeycloakIssuer()`
  - [ ] 6.5: In `cmd/server/main.go`: update `config.ZitadelClientID()` call to `config.KeycloakClientID()`
  - [ ] 6.6: In `cmd/server/main.go`: update all log messages from "zitadel" to "keycloak" (e.g., `zitadel_issuer` log field -> `keycloak_issuer`, startup message `"Using Zitadel JWKS"` -> `"Using Keycloak JWKS"`)
  - [ ] 6.7: In `cmd/server/main.go`: update comment on super-admin routes from `AUTH_MODE=zitadel` to `AUTH_MODE=keycloak`
  - [ ] 6.8: In `cmd/server/main.go`: update `healthHandler` construction: rename `zitadelDiscoveryURL` param
  - [ ] 6.9: In `cmd/server/main.go`: update `NewModeAwareAuthMiddleware()` call with renamed params (keep function signature change for Story 15.3)
  - [ ] 6.10: Search remaining Go files for `config.ZitadelIssuer()` and `config.ZitadelClientID()` calls and update to new names. Key files to check:
    - `internal/handlers/auth_config.go` — `config.ZitadelIssuer()` and `config.ZitadelClientID()` calls
    - `internal/middleware/auth.go` — parameter names in `NewModeAwareAuthMiddleware()` (rename params, but keep function working; deep middleware refactoring is Story 15.3)
    - `internal/handlers/health.go` — may reference Zitadel discovery URL
  - [ ] 6.11: Update `RequiresZitadelAuth()` callers to `RequiresOIDCAuth()` — search entire codebase for `RequiresZitadelAuth`

- [ ] **Task 7: Update `handlers/auth_config.go`** (AC: #4)
  - [ ] 7.1: Rename `ZitadelAuthority` field to `KeycloakAuthority` with JSON tag `"keycloak_authority,omitempty"`
  - [ ] 7.2: Rename `ZitadelClientID` field to `KeycloakClientID` with JSON tag `"keycloak_client_id,omitempty"` (note: using `keycloak_client_id` not just `client_id` for clarity in this story; Story 15.2 may simplify)
  - [ ] 7.3: Update `GetAuthConfig()` SaaS mode block to use `config.KeycloakIssuer()` and `config.KeycloakClientID()`
  - [ ] 7.4: Update `Mode` field: when mode is keycloak, the response `mode` field returns `"keycloak"`
  - [ ] 7.5: Update log warning messages from `ZITADEL_ISSUER` to `KEYCLOAK_ISSUER`
  - [ ] 7.6: Update godoc comments on response struct and handler function

- [ ] **Task 8: Update config package tests** (AC: #1, #2, #3, #4, #5, #8)
  - [ ] 8.1: In `tests/config/auth_test.go`: update `TestInitAuthConfig_ZitadelModeValid` to `TestInitAuthConfig_KeycloakModeValid` — use `AUTH_MODE=keycloak`, `KEYCLOAK_ISSUER`, `KEYCLOAK_CLIENT_ID`
  - [ ] 8.2: Add `TestInitAuthConfig_ZitadelModeDeprecated` — verify `AUTH_MODE=zitadel` is accepted but normalized to `"keycloak"`
  - [ ] 8.3: Add `TestInitAuthConfig_KeycloakEnvVarFallback` — verify `ZITADEL_ISSUER`/`ZITADEL_CLIENT_ID` used as fallback when `KEYCLOAK_*` not set
  - [ ] 8.4: Update test for missing ISSUER error: expect `"KEYCLOAK_ISSUER is required"`
  - [ ] 8.5: Update test for missing CLIENT_ID error: expect `"KEYCLOAK_CLIENT_ID is required"`
  - [ ] 8.6: Update all references to `config.ZitadelIssuer()` -> `config.KeycloakIssuer()` in tests
  - [ ] 8.7: Update all references to `config.ZitadelClientID()` -> `config.KeycloakClientID()` in tests
  - [ ] 8.8: Add test verifying `AUTH_MODE=local` still works exactly as before (regression test)
  - [ ] 8.9: Add test verifying invalid AUTH_MODE error message mentions both `keycloak` and deprecated `zitadel`

- [ ] **Task 9: Update handler tests for auth config endpoint** (AC: #7, #8)
  - [ ] 9.1: In `tests/handlers/auth_config_test.go`: update SaaS mode test to expect `"mode": "keycloak"`, `"keycloak_authority"`, `"keycloak_client_id"` in JSON response
  - [ ] 9.2: Verify local mode test still expects `"mode": "local"` (unchanged)

- [ ] **Task 10: Build verification** (AC: #8)
  - [ ] 10.1: Run `cd apis-server && go build ./...` — zero errors
  - [ ] 10.2: Run `cd apis-server && go vet ./...` — zero warnings
  - [ ] 10.3: Run `cd apis-server && go test ./internal/config/...` — all tests pass
  - [ ] 10.4: Run `cd apis-server && go test ./tests/config/...` — all tests pass

## Dev Notes

### Architecture Compliance

**Go Patterns (from CLAUDE.md):**
- Package naming: `internal/config` for configuration
- Error wrapping: `fmt.Errorf("config: ...")` prefix pattern (already established)
- Structured logging with zerolog
- PascalCase exports, camelCase private functions
- Tests in separate `tests/` directory (not co-located)

**Backward Compatibility Strategy:**

The backward compatibility approach has two layers:

1. **AUTH_MODE value:** `zitadel` is silently normalized to `keycloak` with a deprecation warning. This means `config.AuthMode()` always returns either `"local"` or `"keycloak"`, never `"zitadel"`. Downstream code only needs to check for `ModeKeycloak`.

2. **Environment variable names:** `ZITADEL_ISSUER` and `ZITADEL_CLIENT_ID` are used as fallbacks when `KEYCLOAK_ISSUER` and `KEYCLOAK_CLIENT_ID` are not set. Each fallback usage logs a deprecation warning.

This allows existing deployments to upgrade the server binary without immediately changing their `.env` files.

### Files to Modify

| File | Change Type |
|------|------------|
| `apis-server/internal/config/auth.go` | Rename constants, struct fields, functions, env var reads |
| `apis-server/internal/config/features.go` | Rename `RequiresZitadelAuth` -> `RequiresOIDCAuth`, update godocs |
| `apis-server/cmd/server/main.go` | Rename local variables, update log messages, update function calls |
| `apis-server/internal/handlers/auth_config.go` | Rename response struct fields, update JSON tags, update handler logic |
| `apis-server/tests/config/auth_test.go` | Update test cases for keycloak mode, add deprecation tests |
| `apis-server/tests/handlers/auth_config_test.go` | Update expected JSON response fields |

### Files to Search for Callers

After renaming, grep for any remaining references. Key callers to check:

```
config.ZitadelIssuer()    -> config.KeycloakIssuer()
config.ZitadelClientID()  -> config.KeycloakClientID()
config.ModeZitadel        -> config.ModeKeycloak
RequiresZitadelAuth()     -> RequiresOIDCAuth()
```

Callers identified in the codebase:
- `apis-server/cmd/server/main.go` (lines 75, 83) — direct calls to `config.ZitadelIssuer()` and `config.ZitadelClientID()`
- `apis-server/internal/handlers/auth_config.go` (lines 82-83) — `config.ZitadelIssuer()` and `config.ZitadelClientID()` in SaaS response
- `apis-server/internal/middleware/auth.go` (line 582) — `NewModeAwareAuthMiddleware(zitadelIssuer, ...)` param names (function signature update deferred to Story 15.3, but variable names passed to it change here)
- `apis-server/internal/handlers/health.go` — may reference `zitadelDiscoveryURL`

### Environment Variables Summary

| Old Variable | New Variable | Fallback Behavior |
|-------------|-------------|-------------------|
| `AUTH_MODE=zitadel` | `AUTH_MODE=keycloak` | `zitadel` accepted with deprecation warning |
| `ZITADEL_ISSUER` | `KEYCLOAK_ISSUER` | Old name used as fallback with warning |
| `ZITADEL_CLIENT_ID` | `KEYCLOAK_CLIENT_ID` | Old name used as fallback with warning |
| `ZITADEL_DISCOVERY_URL` | `KEYCLOAK_DISCOVERY_URL` | Old name used as fallback with warning |

### Deprecation Warning Pattern

```go
// In InitAuthConfig():
if mode == "zitadel" {
    log.Warn().
        Str("deprecated_value", "zitadel").
        Str("use_instead", "keycloak").
        Msg("config: AUTH_MODE=zitadel is deprecated, use AUTH_MODE=keycloak")
    mode = ModeKeycloak
}

// For env var fallback:
keycloakIssuer := os.Getenv("KEYCLOAK_ISSUER")
if keycloakIssuer == "" {
    keycloakIssuer = os.Getenv("ZITADEL_ISSUER")
    if keycloakIssuer != "" {
        log.Warn().
            Str("deprecated_var", "ZITADEL_ISSUER").
            Str("use_instead", "KEYCLOAK_ISSUER").
            Msg("config: ZITADEL_ISSUER is deprecated, use KEYCLOAK_ISSUER")
    }
}
```

### Scope Boundary

This story changes **config and naming only**. It does NOT:
- Modify JWT validation logic (Story 15.3)
- Change the `ZitadelClaims` struct in middleware (Story 15.3)
- Update secrets management (Story 15.2)
- Modify the `NewModeAwareAuthMiddleware` function signature (Story 15.3)
- Touch any frontend code (Stories 15.5, 15.6)
- Modify Docker Compose (Story 15.7)

The middleware function `NewModeAwareAuthMiddleware()` still has Zitadel-named parameters after this story. That is intentional -- the parameter names and internal logic of that function are updated in Story 15.3. This story only changes the variable names passed TO it from `main.go` and the config functions it may call internally.

### What Can Break

1. **Any code calling `config.ZitadelIssuer()` or `config.ZitadelClientID()`** will fail to compile. This is intentional -- it forces all callers to be updated.
2. **Any code comparing `config.AuthMode() == "zitadel"`** will never match because the mode is now `"keycloak"`. All comparisons should use `config.ModeKeycloak` constant or `config.IsSaaSMode()`.
3. **Test files using `AUTH_MODE=zitadel`** must be updated to use `AUTH_MODE=keycloak` or rely on the deprecation fallback.

### Previous Story Context

This story builds on Story 13.2 (AUTH_MODE Infrastructure) which created:
- `apis-server/internal/config/auth.go` -- the file being modified
- `apis-server/internal/config/features.go` -- the file being modified
- `apis-server/tests/config/auth_test.go` -- the test file being updated
- The `InitAuthConfig()` / `AuthMode()` / `IsSaaSMode()` pattern used throughout the server

### Testing Strategy

**Unit tests (config package):**
- Use `t.Setenv()` to set environment variables
- Call `config.ResetAuthConfig()` before/after each test
- Verify both new (`AUTH_MODE=keycloak`) and deprecated (`AUTH_MODE=zitadel`) paths
- Verify env var fallback behavior (new var takes precedence over old)

**Handler tests (auth_config endpoint):**
- Use `httptest.NewRecorder()` pattern
- Verify JSON response fields match new naming
- Verify local mode response is unchanged

## Dependencies

- **Depends on:** Epic 13 (complete) -- this story modifies code created by Story 13.2
- **Blocks:** Stories 15.2, 15.3, 15.5 (all depend on config changes from this story)

## References

- [Source: _bmad-output/planning-artifacts/epic-15-keycloak-migration.md - Story 15.1]
- [Source: _bmad-output/planning-artifacts/prd-addendum-keycloak-migration.md - FR-KC-01, FR-KC-14, FR-KC-15]
- [Source: apis-server/internal/config/auth.go - Current auth config implementation]
- [Source: apis-server/internal/config/features.go - Current feature detection helpers]
- [Source: apis-server/cmd/server/main.go - Current startup flow with Zitadel vars]
- [Source: apis-server/internal/handlers/auth_config.go - Current auth config endpoint]
- [Source: apis-server/tests/config/auth_test.go - Current config tests]
- [Source: _bmad-output/implementation-artifacts/13-2-auth-mode-infrastructure.md - Story this builds upon]
