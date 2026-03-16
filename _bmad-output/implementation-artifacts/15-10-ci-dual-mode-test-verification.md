# Story 15.10: CI Dual-Mode Test Verification

Status: ready-for-dev

## Story

As a developer or CI pipeline,
I want all tests to pass in both auth modes and all remaining Zitadel references to be removed from source code,
so that the Keycloak migration is fully verified and the codebase contains zero references to the deprecated identity provider.

## Context

This is the **final story** in Epic 15 (Keycloak Migration). All preceding stories (15.1 through 15.9) are complete. Stories 15.1-15.4 migrated the Go backend, 15.5-15.6 migrated the React dashboard, 15.7-15.8 updated infrastructure and env templates, and 15.9 updated documentation and renamed `zitadel_user_id` to `external_user_id`.

During the epic, backward-compatibility shims were intentionally left in place -- deprecated `SetupZitadelMode()` wrappers in test utilities, `ZITADEL_*` env var fallbacks in secrets/config code, and comments referencing "Zitadel". This story performs the final cleanup: rename the test file, remove all deprecated shims, update every remaining reference, and verify the complete test suite passes.

**Current state (from codebase grep):**

### Go server (`apis-server/`) -- 20 files with "zitadel" references:

1. **`tests/auth_zitadel_test.go`** -- Filename only; all test content already uses Keycloak terminology. Needs file rename to `auth_keycloak_test.go` and removal of the "will be renamed in Story 15.10" comment.

2. **`tests/testutil/auth.go`** -- Contains deprecated backward-compat aliases: `TestZitadelIssuer`, `TestZitadelClientID`, `SetupZitadelMode()`, `SetupZitadelModeWithSuperAdmin()`, `SkipIfNotZitadelMode()`, `IsZitadelMode()`, `IsSaaSMode()` (checks for "zitadel"). Also saves/restores `ZITADEL_ISSUER` and `ZITADEL_CLIENT_ID` env vars in setup functions.

3. **`tests/testutil/auth_test.go`** -- Tests the deprecated aliases: `TestSetupZitadelMode_BackwardCompat`, `IsSaaSMode returns true for deprecated zitadel`, `TestZitadelIssuer`/`TestZitadelClientID` equality assertions.

4. **`tests/auth_local_test.go`** -- `TestLocalMode_LoginRejectedInZitadelMode` function and its comments referencing Zitadel. Calls `testutil.SetupZitadelMode(t)`.

5. **`tests/config/auth_test.go`** -- Tests for deprecated `AUTH_MODE=zitadel` backward compat, `ZITADEL_ISSUER`/`ZITADEL_CLIENT_ID` fallback tests.

6. **`tests/middleware/tenant_test.go`** -- Sets `ZITADEL_ISSUER`/`ZITADEL_CLIENT_ID` env vars, references "Zitadel claims", uses `setupTestConfig(t, "zitadel")`.

7. **`tests/middleware/auth_test.go`** -- Sets `ZITADEL_ISSUER`/`ZITADEL_CLIENT_ID` env vars, has test for "old Zitadel JSON tags no longer parse".

8. **`tests/handlers/setup_test.go`** -- Sets `AUTH_MODE=zitadel` and `ZITADEL_*` env vars in one test.

9. **`internal/config/auth.go`** -- Backward-compat: accepts `AUTH_MODE=zitadel`, falls back to `ZITADEL_ISSUER`/`ZITADEL_CLIENT_ID`.

10. **`internal/secrets/secrets.go`** -- `envWithFallback()` calls reading `ZITADEL_ISSUER`, `ZITADEL_CLIENT_ID`, `ZITADEL_ADMIN_USERNAME`, `ZITADEL_ADMIN_PASSWORD`.

11. **`internal/secrets/secrets_test.go`** -- Tests for deprecated `ZITADEL_*` env var fallbacks and OpenBao-to-env fallback with `ZITADEL_*` vars.

12. **`internal/middleware/auth_test.go`** -- Test "old Zitadel JSON tags no longer parse" with Zitadel-format claim URNs.

13. **`internal/handlers/me.go`** -- Comment with example showing `zitadel-sub-123`.

14. **`internal/handlers/me_test.go`** -- Test fixture using `zitadel-user-123` as user ID.

15. **`internal/handlers/auth_local.go`** -- Log message "likely Zitadel user".

16. **`internal/handlers/admin_impersonate.go`** -- Comment "Requires SaaS mode (AUTH_MODE=zitadel)".

17. **`internal/handlers/health.go`** -- Falls back to `ZITADEL_ISSUER` env var.

18. **`internal/storage/tenants.go`** -- Comment "map 1:1 with Zitadel Organizations".

19. **`internal/auth/local_jwt.go`** -- Comment "RS256 tokens (e.g., from Zitadel) will be rejected".

20. **`cmd/server/main.go`** -- Fallback to `ZITADEL_DISCOVERY_URL` env var.

### Dashboard source (`apis-dashboard/src/`) -- 8 files with "zitadel" references:

1. **`src/services/whisperTranscription.ts`** -- Two comments mentioning "Zitadel auth modes" / "Zitadel mode".
2. **`src/pages/admin/TenantDetail.tsx`** -- UI string `AUTH_MODE=zitadel`.
3. **`src/pages/admin/Tenants.tsx`** -- UI string `AUTH_MODE=zitadel`.
4. **`src/pages/admin/BeeBrainConfig.tsx`** -- UI string `AUTH_MODE=zitadel`.
5. **`src/pages/settings/Users.tsx`** -- Comments "Zitadel/SaaS" and UI string "Zitadel".
6. **`src/providers/localAuthProvider.ts`** -- Comment "switched from local to zitadel".
7. **`src/utils/sanitizeError.ts`** -- Comment "Zitadel specific tokens".
8. **`src/hooks/useImpersonation.ts`** -- Comment "SaaS (Zitadel) mode".

### Dashboard tests (`apis-dashboard/tests/`) -- 3 files with "zitadel" references:

1. **`tests/utils/authTestUtils.ts`** -- Deprecated aliases: `mockZitadelAuthConfig`, `isZitadelMode`, `skipIfNotZitadelMode`.
2. **`tests/auth/DualModeAuth.test.tsx`** -- Comment "Sign in with Zitadel" (line 202).
3. **`tests/providers/authConfig.test.ts`** -- Test for rejected `mode: "zitadel"` config with `zitadel_authority` / `zitadel_client_id`.

**NFR coverage:** NFR-KC-02 (auth endpoint latency < 200ms p95), NFR-KC-03 (CI tests both modes), FR-KC-15 (standalone mode unchanged).

## Acceptance Criteria

1. **File renamed:** `apis-server/tests/auth_zitadel_test.go` renamed to `apis-server/tests/auth_keycloak_test.go`; the "will be renamed in Story 15.10" comment removed.
2. **Go deprecated test utilities removed:** Remove from `tests/testutil/auth.go`: `TestZitadelIssuer`, `TestZitadelClientID`, `SetupZitadelMode()`, `SetupZitadelModeWithSuperAdmin()`, `SkipIfNotZitadelMode()`, `IsZitadelMode()`. Update `IsSaaSMode()` to only check for `"keycloak"`. Remove `ZITADEL_*` env var save/restore from `SetupKeycloakMode` and `SetupKeycloakModeWithSuperAdmin`.
3. **Go test callers updated:** All test files that called deprecated helpers (`SetupZitadelMode`, `ZITADEL_*` env vars, etc.) updated to use Keycloak equivalents.
4. **Go backward-compat env fallbacks removed:** Remove `ZITADEL_*` env var fallback reads from `internal/config/auth.go`, `internal/secrets/secrets.go`, `internal/handlers/health.go`, `cmd/server/main.go`. The `AUTH_MODE=zitadel` backward-compat in `config/auth.go` should also be removed.
5. **Go backward-compat tests removed/updated:** Tests that specifically test `ZITADEL_*` fallback behavior (`secrets_test.go`, `config/auth_test.go`) should be removed or rewritten to test only Keycloak env vars.
6. **Go comments/strings cleaned:** All remaining "zitadel" references in comments, log messages, and doc strings updated to "Keycloak" or generic "external IdP" as appropriate (20 files listed above).
7. **Dashboard source cleaned:** All 8 dashboard source files with "zitadel" references updated to reference "Keycloak" instead.
8. **Dashboard test utils cleaned:** Remove deprecated aliases (`mockZitadelAuthConfig`, `isZitadelMode`, `skipIfNotZitadelMode`) from `tests/utils/authTestUtils.ts`.
9. **Dashboard tests cleaned:** Update `DualModeAuth.test.tsx` (line 202 comment) and `authConfig.test.ts` (zitadel rejection test -- either remove or update description to clarify it tests invalid mode values).
10. **Go test suite passes:** `cd apis-server && go test ./...` passes with zero failures.
11. **Dashboard test suite passes:** `cd apis-dashboard && npx vitest run` passes with zero failures.
12. **Go builds clean:** `go build ./...` and `go vet ./...` produce zero errors.
13. **TypeScript compiles clean:** `npx tsc --noEmit` produces zero errors.
14. **Zero zitadel grep:** `grep -ri "zitadel" apis-server/ apis-dashboard/src/ apis-dashboard/tests/ --include="*.go" --include="*.ts" --include="*.tsx"` returns zero results. (Git history and `_bmad-output/` planning artifacts are excluded from this check.)
15. **AUTH_MODE=local tests pass:** Tests gated by `SkipIfNotLocalMode` / `isLocalMode()` pass when running with `AUTH_MODE=local` (or unset).
16. **AUTH_MODE=keycloak tests pass:** Tests gated by `SkipIfNotKeycloakMode` / `isKeycloakMode()` pass when running with `AUTH_MODE=keycloak`.

## Tasks / Subtasks

### Task 1: Rename Go test file (AC: #1)

- [ ] 1.1: `git mv apis-server/tests/auth_zitadel_test.go apis-server/tests/auth_keycloak_test.go`
- [ ] 1.2: In `auth_keycloak_test.go`, remove the comment on line 3: `// Retained as auth_zitadel_test.go for git history; will be renamed in Story 15.10.`
- [ ] 1.3: Replace with: `// This file contains tests that only run in Keycloak (SaaS) auth mode.`

### Task 2: Remove deprecated Go test utilities (AC: #2)

- [ ] 2.1: In `tests/testutil/auth.go`, remove:
  - `const TestZitadelIssuer = TestKeycloakIssuer` (line 26)
  - `const TestZitadelClientID = TestKeycloakClientID` (line 29)
  - `func SetupZitadelMode(t *testing.T) func()` (lines 133-140)
  - `func SetupZitadelModeWithSuperAdmin(t *testing.T, superAdminEmails string) func()` (lines 196-201)
  - `func SkipIfNotZitadelMode(t *testing.T)` (lines 256-260)
  - `func IsZitadelMode() bool` (lines 483-487)
- [ ] 2.2: In `tests/testutil/auth.go`, update `IsSaaSMode()` (line 489-492): change `return mode == "keycloak" || mode == "zitadel"` to `return mode == "keycloak"`
- [ ] 2.3: In `tests/testutil/auth.go`, update `SkipIfNotKeycloakMode()` (line 246-254): remove `&& mode != "zitadel"` check and the "Also accepts zitadel" comment (lines 238, 250-251)
- [ ] 2.4: In `SetupKeycloakMode()` and `SetupKeycloakModeWithSuperAdmin()`, remove the `origZitadelIssuer`/`origZitadelClientID` save/restore and the `os.Unsetenv("ZITADEL_ISSUER")`/`os.Unsetenv("ZITADEL_CLIENT_ID")` lines. Remove the "Also save deprecated env vars" comments.
- [ ] 2.5: In `tests/testutil/auth_test.go`, remove:
  - `TestSetupZitadelMode_BackwardCompat` test function
  - `IsSaaSMode returns true for deprecated zitadel` sub-test
  - `TestZitadelIssuer`/`TestZitadelClientID` equality assertions

### Task 3: Update Go test callers (AC: #3)

- [ ] 3.1: In `tests/auth_local_test.go`:
  - Rename `TestLocalMode_LoginRejectedInZitadelMode` to `TestLocalMode_LoginRejectedInKeycloakMode`
  - Update comments from "Zitadel mode" to "Keycloak mode"
  - Change `testutil.SetupZitadelMode(t)` to `testutil.SetupKeycloakMode(t)`
  - Update the comment "Super admin: NO (no Zitadel)" to "Super admin: NO (no Keycloak)"
- [ ] 3.2: In `tests/middleware/tenant_test.go`:
  - Change `setupTestConfig(t, "zitadel")` calls to `setupTestConfig(t, "keycloak")`
  - Update the `setupTestConfig` function: change `if mode == "zitadel"` to `if mode == "keycloak"`, change `ZITADEL_ISSUER`/`ZITADEL_CLIENT_ID` to `KEYCLOAK_ISSUER`/`KEYCLOAK_CLIENT_ID` (both setenv and unsetenv)
  - Update comments from "Zitadel claims" to "Keycloak claims"
  - Change `tenantID := "zitadel-org-123"` to `tenantID := "keycloak-org-123"` (or a generic name like `"saas-org-123"`)
  - Change `UserID: "zitadel-user-456"` to `UserID: "keycloak-user-456"`
  - Change `UserID: "new-zitadel-user-"` to `UserID: "new-keycloak-user-"`
  - Update the test case struct with `UserID: "zitadel-user"`, `OrgID: "zitadel-org-123"`, `TenantID: "zitadel-org-123"` to use `"keycloak-user"`, `"keycloak-org-123"`, `"keycloak-org-123"`
- [ ] 3.3: In `tests/middleware/auth_test.go`:
  - Change `if mode == "keycloak" || mode == "zitadel"` to `if mode == "keycloak"`
  - Change `ZITADEL_ISSUER`/`ZITADEL_CLIENT_ID` setenv/unsetenv to `KEYCLOAK_ISSUER`/`KEYCLOAK_CLIENT_ID`
  - Update "old Zitadel JSON tags no longer parse" test: rename to "old OIDC vendor-specific JSON tags no longer parse" or similar; update the comments but keep the Zitadel URN claim format as test data (since those are valid test vectors -- they just shouldn't produce results)
- [ ] 3.4: In `tests/handlers/setup_test.go`:
  - Change `t.Setenv("AUTH_MODE", "zitadel")` to `t.Setenv("AUTH_MODE", "keycloak")`
  - Change `t.Setenv("ZITADEL_ISSUER", ...)` to `t.Setenv("KEYCLOAK_ISSUER", ...)`
  - Change `t.Setenv("ZITADEL_CLIENT_ID", ...)` to `t.Setenv("KEYCLOAK_CLIENT_ID", ...)`
  - Update comment from "Set zitadel mode" to "Set keycloak mode"

### Task 4: Remove Go backward-compat env fallbacks (AC: #4)

- [ ] 4.1: In `internal/config/auth.go`:
  - Remove the `AUTH_MODE=zitadel` backward-compat block (lines 74-80 approx): the `if mode == "zitadel"` block that normalizes to keycloak
  - Update the error message (line 84) to remove `'zitadel' is also accepted but deprecated`
  - Remove the `ZITADEL_ISSUER` fallback in keycloakIssuer read (lines 103-112 approx)
  - Remove the `ZITADEL_CLIENT_ID` fallback in keycloakClientID read (lines 118-126 approx)
  - Remove backward-compat comments (lines 54-55)
- [ ] 4.2: In `internal/secrets/secrets.go`:
  - Change `envWithFallback("KEYCLOAK_ISSUER", "ZITADEL_ISSUER", ...)` to just `getEnvOrDefault("KEYCLOAK_ISSUER", ...)` (or however env reads are structured without fallback)
  - Do the same for `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD` -- remove their `ZITADEL_*` fallbacks
  - Apply same changes in the OpenBao fallback section (lines 381-385)
- [ ] 4.3: In `internal/handlers/health.go`:
  - Remove the `ZITADEL_ISSUER` fallback block (line 53 approx)
- [ ] 4.4: In `cmd/server/main.go`:
  - Remove the `ZITADEL_DISCOVERY_URL` fallback block (lines 81-88 approx)

### Task 5: Remove/update Go backward-compat tests (AC: #5)

- [ ] 5.1: In `tests/config/auth_test.go`:
  - Remove `TestInitAuthConfig_ZitadelModeDeprecated` (tests `AUTH_MODE=zitadel` normalization -- no longer supported)
  - Remove/rewrite the `ZITADEL_ISSUER`/`ZITADEL_CLIENT_ID` fallback test (the one using `t.Setenv("ZITADEL_ISSUER", ...)`) -- replace with a test that KEYCLOAK_ISSUER/KEYCLOAK_CLIENT_ID are read correctly
  - Remove the Keycloak-takes-precedence-over-Zitadel test (no longer relevant since fallback removed)
  - Update the error message assertion to no longer expect "zitadel" in the error string (line 181-182)
  - Remove `{"ZITADEL", "keycloak"}` and `{"Zitadel", "keycloak"}` from any table-driven test cases (line 657-659)
  - Update any tests that set `ZITADEL_*` env vars to use `KEYCLOAK_*` instead, or remove if testing removed fallback logic
- [ ] 5.2: In `internal/secrets/secrets_test.go`:
  - Remove the test that sets `ZITADEL_*` env vars to test fallback (lines 116-125 approx)
  - Remove the Keycloak-precedence-over-Zitadel test (lines 134-143 approx)
  - Remove the OpenBao-to-ZITADEL-env-fallback test (lines 233-254 approx)
  - Remove `ZITADEL_*` vars from the env cleanup list (lines 294-296 approx)
- [ ] 5.3: In `internal/middleware/auth_test.go`:
  - Keep the "old vendor-specific JSON tags no longer parse" test but rename it from "old Zitadel JSON tags" to "old vendor-specific JSON tags". The test data (Zitadel URN claims) is valid as negative test vectors -- just update the test name and comments.

### Task 6: Clean Go comments and strings (AC: #6)

- [ ] 6.1: In `internal/handlers/me.go`: Change `"user_id": "zitadel-sub-123"` example to `"user_id": "ext-sub-123"` or `"user_id": "keycloak-sub-123"`
- [ ] 6.2: In `internal/handlers/me_test.go`: Change `UserID: "zitadel-user-123"` and `ExternalUserID: "zitadel-user-123"` to `"external-user-123"` (or similar), and `assert.Contains(t, w.Body.String(), "zitadel-user-123")` accordingly
- [ ] 6.3: In `internal/handlers/auth_local.go`: Change `"likely Zitadel user"` to `"likely external IdP user"` or `"likely Keycloak user"`
- [ ] 6.4: In `internal/handlers/admin_impersonate.go`: Change `"Requires SaaS mode (AUTH_MODE=zitadel)"` to `"Requires SaaS mode (AUTH_MODE=keycloak)"`
- [ ] 6.5: In `internal/storage/tenants.go`: Change `"map 1:1 with Zitadel Organizations"` to `"map 1:1 with Keycloak Organizations"`
- [ ] 6.6: In `internal/auth/local_jwt.go`: Change `"RS256 tokens (e.g., from Zitadel)"` to `"RS256 tokens (e.g., from Keycloak)"`

### Task 7: Clean dashboard source files (AC: #7)

- [ ] 7.1: In `src/services/whisperTranscription.ts`: Change "Zitadel auth modes" to "Keycloak auth modes" and "Zitadel mode" to "Keycloak mode"
- [ ] 7.2: In `src/pages/admin/TenantDetail.tsx`: Change `AUTH_MODE=zitadel` to `AUTH_MODE=keycloak`
- [ ] 7.3: In `src/pages/admin/Tenants.tsx`: Change `AUTH_MODE=zitadel` to `AUTH_MODE=keycloak`
- [ ] 7.4: In `src/pages/admin/BeeBrainConfig.tsx`: Change `AUTH_MODE=zitadel` to `AUTH_MODE=keycloak`
- [ ] 7.5: In `src/pages/settings/Users.tsx`: Change "Zitadel/SaaS" to "Keycloak/SaaS", "Zitadel" to "Keycloak" in comments and UI string; change `"User management is handled by your identity provider (Zitadel) in SaaS mode."` to `"User management is handled by your identity provider (Keycloak) in SaaS mode."`
- [ ] 7.6: In `src/providers/localAuthProvider.ts`: Change "switched from local to zitadel" to "switched from local to keycloak"
- [ ] 7.7: In `src/utils/sanitizeError.ts`: Change "Zitadel specific tokens" to "OIDC provider-specific tokens" (or "Keycloak specific tokens")
- [ ] 7.8: In `src/hooks/useImpersonation.ts`: Change "SaaS (Zitadel) mode" to "SaaS (Keycloak) mode"

### Task 8: Clean dashboard test files (AC: #8, #9)

- [ ] 8.1: In `tests/utils/authTestUtils.ts`, remove deprecated aliases:
  - `export const mockZitadelAuthConfig = mockKeycloakAuthConfig;` (line 77)
  - `export const isZitadelMode = isKeycloakMode;` (line 163)
  - `export const skipIfNotZitadelMode = skipIfNotKeycloakMode;` (line 228)
- [ ] 8.2: In `tests/auth/DualModeAuth.test.tsx`, update the comment on line 202 from `"Sign in with Zitadel"` to `"Sign in with SSO"` or remove the note since Story 15.6 has already renamed the component
- [ ] 8.3: In `tests/providers/authConfig.test.ts`, update the test on line 141:
  - Keep the test (it validates that `mode: "zitadel"` is rejected as invalid)
  - Update the test description to: `'rejects invalid config with unrecognized mode value'` (or keep the "zitadel" mention since it's testing that old format is rejected -- decision: keep it as a valid negative test case, but update the description to clarify intent)

### Task 9: Verify Go test suite (AC: #10, #12, #15, #16)

- [ ] 9.1: Run `cd apis-server && go build ./...` -- must pass with zero errors
- [ ] 9.2: Run `cd apis-server && go vet ./...` -- must pass with zero errors
- [ ] 9.3: Run `cd apis-server && go test ./...` -- must pass with zero failures (both AUTH_MODE=local default path and explicit test checks)
- [ ] 9.4: Run `cd apis-server && AUTH_MODE=keycloak KEYCLOAK_ISSUER=http://localhost:8080 KEYCLOAK_CLIENT_ID=test go test ./...` -- verify keycloak-mode-gated tests are included

### Task 10: Verify dashboard test suite (AC: #11, #13, #15, #16)

- [ ] 10.1: Run `cd apis-dashboard && npx tsc --noEmit` -- must pass with zero errors
- [ ] 10.2: Run `cd apis-dashboard && npx vitest run` -- must pass with zero failures (local mode)
- [ ] 10.3: Run `cd apis-dashboard && VITE_AUTH_MODE=keycloak npx vitest run` -- verify keycloak-mode-gated tests are included

### Task 11: Final grep verification (AC: #14)

- [ ] 11.1: Run case-insensitive grep for "zitadel" across all Go source files in `apis-server/` (excluding `_bmad-output/`). Must return zero results.
- [ ] 11.2: Run case-insensitive grep for "zitadel" across all TS/TSX files in `apis-dashboard/src/` and `apis-dashboard/tests/`. Must return zero results.
- [ ] 11.3: Exception: `_bmad-output/` planning artifacts and story files may contain "zitadel" for historical reference. These are not checked.
- [ ] 11.4: Exception: `package.json` / `package-lock.json` may contain "zitadel" if any transitive dependency references it (unlikely post-15.5 removal). Verify and note if present.

## Technical Notes

### Approach for backward-compat removal

The backward-compatibility layer (`AUTH_MODE=zitadel` normalization, `ZITADEL_*` env var fallbacks) was added in Stories 15.1-15.2 to allow a gradual migration. Now that all stories are complete, these shims serve no purpose -- any deployment still using `AUTH_MODE=zitadel` should be updated to `AUTH_MODE=keycloak` before upgrading to this version. The removal is a clean break.

### Test data note

In `internal/middleware/auth_test.go`, the "old vendor-specific JSON tags no longer parse" test uses Zitadel-format URN claim keys (`urn:zitadel:iam:org:id`, etc.) as negative test vectors. These should remain as test data (they demonstrate that old-format tokens are rejected), but the test name and comments should be updated to not reference "Zitadel" as the current provider.

### File rename approach

Use `git mv` for the `auth_zitadel_test.go` -> `auth_keycloak_test.go` rename to preserve git history.

### Impact on config/secrets

Removing `ZITADEL_*` env fallbacks means any deployment currently relying on these vars will break. This is intentional -- the migration is complete. The `.env.saas.example` was already updated in Story 15.8 to use `KEYCLOAK_*` vars.

## Dev Notes

- This is a refactoring/cleanup story with no new functionality
- The primary risk is breaking existing tests -- run the full suite after each major change group
- Consider doing Tasks 1-6 (Go changes) as a batch, verifying Go tests, then Tasks 7-8 (dashboard changes), verifying dashboard tests, then Task 11 (final grep)
- The `envWithFallback()` helper function in `secrets.go` may need to be simplified or removed if it was only used for Zitadel fallbacks -- check if it has other uses before removing entirely

## References

- Epic 15 file: `_bmad-output/planning-artifacts/epic-15-keycloak-migration.md`
- Story 15.1 (auth config): `_bmad-output/implementation-artifacts/15-1-auth-mode-config-env-vars.md`
- Story 15.2 (secrets): `_bmad-output/implementation-artifacts/15-2-secrets-auth-config-endpoint.md`
- Story 15.5 (dashboard auth provider): `_bmad-output/implementation-artifacts/15-5-keycloak-auth-provider-react.md`
- Story 15.9 (documentation): `_bmad-output/implementation-artifacts/15-9-documentation-architecture-updates.md`
