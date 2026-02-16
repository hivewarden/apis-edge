# Story 15.2: Secrets & Auth Config Endpoint

Status: ready-for-dev

## Story

As a system administrator deploying APIS in SaaS mode,
I want the secrets management package to retrieve Keycloak configuration (instead of Zitadel) from all three backends (env, file, OpenBao),
so that the server can source Keycloak connection details securely regardless of deployment infrastructure.

## Goal

Update the secrets management package to replace the `ZitadelConfig` struct and `GetZitadelConfig()` method with `KeycloakConfig` and `GetKeycloakConfig()`. Remove the Zitadel-specific `Masterkey` field (Keycloak does not use a masterkey). Add a `ClientSecret` field for backend-to-backend operations. Update the OpenBao secret path from `zitadel` to `keycloak`. Verify the auth config endpoint (`GET /api/auth/config`) returns the correct Keycloak fields.

**FRs Covered:** FR-KC-11 (`/api/auth/config` returns keycloak config), FR-KC-13 (Secrets replaces `GetZitadelConfig()`), FR-KC-15 (Standalone mode unchanged).

## Acceptance Criteria

1. **`GetKeycloakConfig()` reads from all three backends (env, file, openbao):**
   - Given `SECRETS_BACKEND=env` with `KEYCLOAK_ISSUER`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`, `KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD` set
   - When `client.GetKeycloakConfig()` is called
   - Then a `KeycloakConfig` struct is returned with all fields populated from env vars
   - Given `SECRETS_BACKEND=file` with `keycloak_client_secret` and `keycloak_admin_password` files in `SECRETS_DIR`
   - When `client.GetKeycloakConfig()` is called
   - Then file values override env var defaults for those fields
   - Given `SECRETS_BACKEND=openbao` with secrets at `secret/data/apis/keycloak`
   - When `client.GetKeycloakConfig()` is called
   - Then secrets are read from OpenBao at the `keycloak` subpath (not `zitadel`)

2. **`KeycloakConfig` struct has correct fields (no `Masterkey`):**
   - Given the `KeycloakConfig` struct definition
   - Then it has the fields: `Issuer`, `ClientID`, `ClientSecret`, `AdminUsername`, `AdminPassword`
   - And it does NOT have a `Masterkey` field (Keycloak does not use a masterkey)

3. **OpenBao path updated from `zitadel` to `keycloak`:**
   - Given `SECRETS_BACKEND=openbao`
   - When `GetKeycloakConfig()` is called
   - Then the HTTP request is made to `{OPENBAO_SECRET_PATH}/keycloak` (not `{OPENBAO_SECRET_PATH}/zitadel`)

4. **`GET /api/auth/config` returns `keycloak_authority` and `client_id` in SaaS mode:**
   - Given `AUTH_MODE=keycloak` with `KEYCLOAK_ISSUER=https://keycloak.example.com/realms/honeybee` and `KEYCLOAK_CLIENT_ID=apis-dashboard`
   - When `GET /api/auth/config` is called
   - Then the response is:
     ```json
     {
       "mode": "keycloak",
       "keycloak_authority": "https://keycloak.example.com/realms/honeybee",
       "client_id": "apis-dashboard"
     }
     ```
   - NOTE: This AC verifies the endpoint works correctly end-to-end. Story 15.1 already renamed the response struct fields. This story confirms the contract is correct and adds the `client_id` field simplification (see Task 5 for detail).

5. **`GET /api/auth/config` returns only `mode: "local"` in standalone mode (unchanged):**
   - Given `AUTH_MODE=local`
   - When `GET /api/auth/config` is called
   - Then the response is:
     ```json
     {
       "mode": "local",
       "setup_required": true
     }
     ```
   - And no `keycloak_authority` or `client_id` fields are present

6. **OpenBao fallback to env on failure:**
   - Given `SECRETS_BACKEND=openbao` but OpenBao is unreachable
   - When `GetKeycloakConfig()` is called
   - Then the method falls back to env vars (matching existing `GetDatabaseConfig()` fallback pattern)
   - And a warning is logged

7. **`GetZitadelConfig()` removed:**
   - Given the codebase after this story
   - Then `GetZitadelConfig()`, `ZitadelConfig`, and all Zitadel-specific helper methods are removed from `secrets.go`
   - And no callers of `GetZitadelConfig()` exist anywhere in the codebase

8. **Backward-compatible env var fallback:**
   - Given `SECRETS_BACKEND=env` with `ZITADEL_MASTERKEY` set but no `KEYCLOAK_*` vars
   - When `GetKeycloakConfig()` is called
   - Then `ZITADEL_ADMIN_PASSWORD` is used as fallback for `KEYCLOAK_ADMIN_PASSWORD`
   - And a deprecation warning is logged for each fallback env var used
   - And `ZITADEL_MASTERKEY` is ignored (no equivalent field in `KeycloakConfig`)

9. **Go server builds clean:**
   - Given all changes are applied
   - When `go build ./...` and `go vet ./...` are run
   - Then both commands complete with zero errors

10. **All secrets tests pass:**
    - Given all changes are applied
    - When `go test ./internal/secrets/...` is run
    - Then all tests pass, including new tests for `GetKeycloakConfig()`

## Tasks / Subtasks

- [ ] **Task 1: Replace `ZitadelConfig` struct with `KeycloakConfig`** (AC: #2, #7)
  - [ ] 1.1: In `apis-server/internal/secrets/secrets.go`, rename the section header comment from `Zitadel Configuration (SaaS Mode)` to `Keycloak Configuration (SaaS Mode)`
  - [ ] 1.2: Replace `ZitadelConfig` struct with `KeycloakConfig`:
    ```go
    // KeycloakConfig holds Keycloak identity provider configuration.
    // AI/LLM Context: Used in SaaS mode (AUTH_MODE=keycloak) for OIDC authentication.
    // In standalone mode, this is not used.
    type KeycloakConfig struct {
        Issuer        string
        ClientID      string
        ClientSecret  string // For backend-to-backend operations (e.g., admin API calls)
        AdminUsername string
        AdminPassword string
    }
    ```
  - [ ] 1.3: Remove the `Masterkey` field (Keycloak does not use a masterkey; the Zitadel masterkey was for encrypting Zitadel's internal database)
  - [ ] 1.4: Add `ClientSecret` field (Keycloak backend clients may need a client secret for server-to-server operations like token introspection or admin API access)

- [ ] **Task 2: Replace `GetZitadelConfig()` with `GetKeycloakConfig()`** (AC: #1, #3, #6, #7)
  - [ ] 2.1: Rename `GetZitadelConfig()` to `GetKeycloakConfig()` with updated godoc:
    ```go
    // GetKeycloakConfig returns Keycloak identity provider configuration.
    //
    // AI/LLM Context: Only used when AUTH_MODE=keycloak (SaaS mode).
    // Standalone mode does not use Keycloak.
    func (c *Client) GetKeycloakConfig() (*KeycloakConfig, error) {
    ```
  - [ ] 2.2: Rename `getZitadelConfigFromEnv()` to `getKeycloakConfigFromEnv()` and update env var reads:
    - `ZITADEL_MASTERKEY` -> removed (no equivalent)
    - `ZITADEL_ADMIN_USERNAME` -> `KEYCLOAK_ADMIN` (Keycloak uses `KEYCLOAK_ADMIN` by convention)
    - `ZITADEL_ADMIN_PASSWORD` -> `KEYCLOAK_ADMIN_PASSWORD`
    - `ZITADEL_ISSUER` -> `KEYCLOAK_ISSUER`
    - `ZITADEL_CLIENT_ID` -> `KEYCLOAK_CLIENT_ID`
    - Add: `KEYCLOAK_CLIENT_SECRET` for the new field
  - [ ] 2.3: Add backward-compatible fallback for deprecated env vars:
    - If `KEYCLOAK_ADMIN_PASSWORD` is empty, fall back to `ZITADEL_ADMIN_PASSWORD` with deprecation warning
    - If `KEYCLOAK_ISSUER` is empty, fall back to `ZITADEL_ISSUER` with deprecation warning
    - If `KEYCLOAK_CLIENT_ID` is empty, fall back to `ZITADEL_CLIENT_ID` with deprecation warning
    - Pattern: same deprecation warning pattern used in `config/auth.go` (already implemented in Story 15.1)
  - [ ] 2.4: Rename `getZitadelConfigFromFile()` to `getKeycloakConfigFromFile()` and update file names:
    - `zitadel_masterkey` -> removed (no file read for masterkey)
    - `zitadel_admin_password` -> `keycloak_admin_password`
    - Add: `keycloak_client_secret` file read
  - [ ] 2.5: Rename `getZitadelConfigFromOpenBao()` to `getKeycloakConfigFromOpenBao()`:
    - Change `c.readSecret("zitadel")` to `c.readSecret("keycloak")` (updates the OpenBao path from `secret/data/apis/zitadel` to `secret/data/apis/keycloak`)
    - Update map key reads: `masterkey` -> removed, add `client_secret`
    - Update fallback env var names to `KEYCLOAK_*`
    - Update fallback log message from "Zitadel" to "Keycloak"

- [ ] **Task 3: Update JWTConfig comment** (AC: cosmetic)
  - [ ] 3.1: In the `JWTConfig` section comment, change "In SaaS mode, Zitadel handles token signing." to "In SaaS mode, Keycloak handles token signing via JWKS."

- [ ] **Task 4: Update `TestMain` to unset new env vars** (AC: #10)
  - [ ] 4.1: In `apis-server/internal/secrets/secrets_test.go`, update the `TestMain` function to also unset `KEYCLOAK_ISSUER`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`, `KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD`, and the deprecated `ZITADEL_*` equivalents

- [ ] **Task 5: Simplify auth config endpoint response field** (AC: #4)
  - [ ] 5.1: In `apis-server/internal/handlers/auth_config.go`, change the `KeycloakClientID` JSON tag from `"keycloak_client_id,omitempty"` to `"client_id,omitempty"` -- the `keycloak_authority` field already indicates this is Keycloak, so the client ID field does not need the `keycloak_` prefix. This makes the frontend consumption simpler and more provider-neutral.
  - [ ] 5.2: Update the struct field godoc comment: `// ClientID is the OIDC client ID for the identity provider. Only present in keycloak mode.`
  - [ ] 5.3: Rename the struct field from `KeycloakClientID` to `ClientID` (Go field name matches simplified JSON tag)
  - [ ] 5.4: Update the godoc example in the handler function to show the new response format:
    ```
    // SaaS mode response:
    //   {
    //     "mode": "keycloak",
    //     "keycloak_authority": "https://keycloak.example.com/realms/honeybee",
    //     "client_id": "apis-dashboard"
    //   }
    ```

- [ ] **Task 6: Write unit tests for `GetKeycloakConfig()` -- env backend** (AC: #1, #2, #8, #10)
  - [ ] 6.1: Add `TestClient_GetKeycloakConfig_Env` test:
    - Set `SECRETS_BACKEND=env`, `KEYCLOAK_ISSUER`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`, `KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD`
    - Call `NewClient().GetKeycloakConfig()`
    - Assert all fields populated correctly
    - Assert no `Masterkey` field exists (compile-time verification via struct)
  - [ ] 6.2: Add `TestClient_GetKeycloakConfig_EnvFallback` test:
    - Set `SECRETS_BACKEND=env` with `ZITADEL_ADMIN_PASSWORD` but no `KEYCLOAK_ADMIN_PASSWORD`
    - Call `NewClient().GetKeycloakConfig()`
    - Assert `AdminPassword` is read from `ZITADEL_ADMIN_PASSWORD` fallback
  - [ ] 6.3: Add `TestClient_GetKeycloakConfig_Env_DefaultValues` test:
    - Set `SECRETS_BACKEND=env` with minimal env vars
    - Verify default values are reasonable (e.g., `AdminUsername` defaults to `"admin"`, `Issuer` defaults to `"http://localhost:8080"`)

- [ ] **Task 7: Write unit tests for `GetKeycloakConfig()` -- OpenBao backend** (AC: #1, #3, #6, #10)
  - [ ] 7.1: Add `TestClient_GetKeycloakConfig_OpenBao` test:
    - Set up `httptest.NewServer` that serves a response at `/v1/secret/data/apis/keycloak` (note: `keycloak` not `zitadel`)
    - Assert the HTTP request path is `/v1/secret/data/apis/keycloak`
    - Assert all fields populated from the OpenBao response
  - [ ] 7.2: Add `TestClient_GetKeycloakConfig_OpenBaoFallback` test:
    - Set up `httptest.NewServer` that returns 500 error
    - Assert fallback to env vars
    - Assert no panic/crash on OpenBao failure

- [ ] **Task 8: Remove old Zitadel tests if any exist** (AC: #7, #10)
  - [ ] 8.1: Search `secrets_test.go` for any `Zitadel`-referencing tests and remove them (currently there are none, but verify after changes)

- [ ] **Task 9: Update auth config handler tests** (AC: #4, #5)
  - [ ] 9.1: In `apis-server/tests/handlers/auth_config_test.go`: update the SaaS mode test to expect `"client_id"` instead of `"keycloak_client_id"` in the JSON response (reflecting the Task 5 simplification)
  - [ ] 9.2: Verify local mode test still expects `"mode": "local"` and `"setup_required"` (no changes)
  - [ ] 9.3: Add a test verifying that the `client_id` field is absent in local mode responses

- [ ] **Task 10: Build verification** (AC: #9, #10)
  - [ ] 10.1: Run `cd apis-server && go build ./...` -- zero errors
  - [ ] 10.2: Run `cd apis-server && go vet ./...` -- zero warnings
  - [ ] 10.3: Run `cd apis-server && go test ./internal/secrets/...` -- all tests pass
  - [ ] 10.4: Run `cd apis-server && go test ./tests/handlers/...` -- all tests pass

## Dev Notes

### Architecture Compliance

**Go Patterns (from CLAUDE.md):**
- Error wrapping: `fmt.Errorf("secrets: failed to read Keycloak config: %w", err)` (existing pattern)
- Structured logging with zerolog (existing pattern)
- PascalCase exports, camelCase private functions
- Tests in `internal/secrets/` (co-located, matching existing `secrets_test.go` pattern) and `tests/handlers/` (separate directory, matching existing convention)

**Three-Backend Pattern:**
The secrets package supports env, file, and openbao backends. The `GetKeycloakConfig()` method must follow the exact same pattern as `GetDatabaseConfig()` and `GetJWTConfig()`:

```go
func (c *Client) GetKeycloakConfig() (*KeycloakConfig, error) {
    switch c.config.Source {
    case "openbao":
        return c.getKeycloakConfigFromOpenBao()
    case "file":
        return c.getKeycloakConfigFromFile()
    default:
        return c.getKeycloakConfigFromEnv(), nil
    }
}
```

### Current State (After Story 15.1)

Story 15.1 has already completed these changes:
- `config/auth.go`: `ModeKeycloak = "keycloak"`, `KeycloakIssuer()`, `KeycloakClientID()` getters
- `handlers/auth_config.go`: Response struct uses `KeycloakAuthority` and `KeycloakClientID` fields with JSON tags `"keycloak_authority,omitempty"` and `"keycloak_client_id,omitempty"`
- `cmd/server/main.go`: Uses `keycloakIssuer`, `keycloakDiscoveryURL`, `keycloakClientID` variable names

This story modifies the **secrets package** (untouched by 15.1) and makes a minor simplification to the auth config handler response (renaming the `keycloak_client_id` JSON tag to `client_id`).

### Files to Modify

| File | Change Type | Details |
|------|------------|---------|
| `apis-server/internal/secrets/secrets.go` | Major | Replace `ZitadelConfig` -> `KeycloakConfig`, update all env vars and OpenBao path |
| `apis-server/internal/secrets/secrets_test.go` | Major | Add new tests for `GetKeycloakConfig()`, update `TestMain` env var list |
| `apis-server/internal/handlers/auth_config.go` | Minor | Simplify `keycloak_client_id` JSON tag to `client_id` |
| `apis-server/tests/handlers/auth_config_test.go` | Minor | Update expected JSON field name in SaaS mode test |

### KeycloakConfig vs ZitadelConfig Field Mapping

| ZitadelConfig Field | KeycloakConfig Field | Env Var (New) | Env Var (Deprecated Fallback) | Notes |
|--------------------|--------------------|--------------|------------------------------|-------|
| `Masterkey` | *removed* | -- | `ZITADEL_MASTERKEY` (ignored) | Keycloak does not use a masterkey |
| `AdminUsername` | `AdminUsername` | `KEYCLOAK_ADMIN` | `ZITADEL_ADMIN_USERNAME` | Keycloak convention uses `KEYCLOAK_ADMIN` |
| `AdminPassword` | `AdminPassword` | `KEYCLOAK_ADMIN_PASSWORD` | `ZITADEL_ADMIN_PASSWORD` | Bootstrap admin password |
| `Issuer` | `Issuer` | `KEYCLOAK_ISSUER` | `ZITADEL_ISSUER` | OIDC issuer URL (includes `/realms/{name}`) |
| `ClientID` | `ClientID` | `KEYCLOAK_CLIENT_ID` | `ZITADEL_CLIENT_ID` | OIDC client identifier |
| *N/A* | `ClientSecret` | `KEYCLOAK_CLIENT_SECRET` | -- | New field for backend operations |

### OpenBao Secret Paths

| Old Path | New Path |
|---------|---------|
| `secret/data/apis/zitadel` | `secret/data/apis/keycloak` |

OpenBao key mapping within the `keycloak` secret:

| Key | Field |
|-----|-------|
| `issuer` | `Issuer` (non-secret, but stored for completeness) |
| `client_id` | `ClientID` (non-secret, but stored for completeness) |
| `client_secret` | `ClientSecret` |
| `admin_username` | `AdminUsername` |
| `admin_password` | `AdminPassword` |

### Auth Config Endpoint Response Change

**Before this story (Story 15.1 output):**
```json
{
  "mode": "keycloak",
  "keycloak_authority": "https://keycloak.example.com/realms/honeybee",
  "keycloak_client_id": "apis-dashboard"
}
```

**After this story:**
```json
{
  "mode": "keycloak",
  "keycloak_authority": "https://keycloak.example.com/realms/honeybee",
  "client_id": "apis-dashboard"
}
```

The `keycloak_authority` field retains its prefix because it is a Keycloak-specific URL (the OIDC authority/issuer). The `client_id` field drops the `keycloak_` prefix because client IDs are a generic OIDC concept and the `mode` field already disambiguates the provider.

### Backward Compatibility Strategy

The backward compatibility approach mirrors Story 15.1's pattern:

1. **Environment variables:** `ZITADEL_ADMIN_PASSWORD`, `ZITADEL_ISSUER`, and `ZITADEL_CLIENT_ID` are used as fallbacks when `KEYCLOAK_*` equivalents are not set. Each fallback usage logs a deprecation warning.

2. **`ZITADEL_MASTERKEY`** is silently ignored. There is no equivalent in Keycloak. No deprecation warning is needed because the field simply does not exist.

3. **`ZITADEL_ADMIN_USERNAME`** falls back for `KEYCLOAK_ADMIN`. Note the convention difference: Keycloak's official Docker image uses `KEYCLOAK_ADMIN` (not `KEYCLOAK_ADMIN_USERNAME`).

### Deprecation Warning Pattern

```go
func envWithFallback(newVar, oldVar, defaultVal string) string {
    val := getEnv(newVar, "")
    if val != "" {
        return val
    }
    val = getEnv(oldVar, "")
    if val != "" {
        log.Warn().
            Str("deprecated_var", oldVar).
            Str("use_instead", newVar).
            Msgf("secrets: %s is deprecated, use %s", oldVar, newVar)
        return val
    }
    return defaultVal
}
```

This helper can be introduced to DRY up the fallback pattern, or each fallback can be inline. The developer should choose based on readability.

### Security Considerations

1. **`ClientSecret` is sensitive:** Must not be logged. The `Config.String()` method already masks the OpenBao token; the `KeycloakConfig` struct does not implement `String()` so there is no risk of accidental logging via `fmt.Println(config)`.
2. **File permissions check:** The existing `readSecretFile()` method already warns about overly permissive file permissions (should be 0600 or 0400). No changes needed.
3. **OpenBao TLS:** The existing HTTP vs HTTPS warning for non-localhost OpenBao addresses applies unchanged.

### Scope Boundary

This story changes **secrets management and auth config response** only. It does NOT:
- Modify JWT validation logic (Story 15.3)
- Change the `ZitadelClaims` struct in middleware (Story 15.3)
- Touch any frontend code (Stories 15.5, 15.6)
- Modify Docker Compose (Story 15.7)
- Update documentation or CLAUDE.md (Stories 15.8, 15.9)

### Previous Story Context (15.1)

Story 15.1 updated:
- `config/auth.go`: `ModeZitadel` -> `ModeKeycloak`, `ZitadelIssuer()` -> `KeycloakIssuer()`, backward-compatible `AUTH_MODE=zitadel` deprecation
- `config/features.go`: `RequiresZitadelAuth()` -> `RequiresOIDCAuth()`
- `cmd/server/main.go`: Renamed all `zitadel*` variables to `keycloak*`, updated log messages
- `handlers/auth_config.go`: Response struct fields renamed to `keycloak_authority` and `keycloak_client_id`
- All config and handler tests updated

The secrets package (`internal/secrets/secrets.go`) was explicitly left untouched by Story 15.1 -- it still contains `ZitadelConfig` and `GetZitadelConfig()`. That is the primary target of this story.

### What Can Break

1. **Any future code calling `GetZitadelConfig()`** will fail to compile. Currently there are zero callers (verified by grep), so this is safe.
2. **Frontend code expecting `keycloak_client_id`** instead of `client_id` in the auth config response. Since the frontend has not yet been updated (Stories 15.5/15.6), this is the right time to establish the final field name before the frontend implementation locks it in.
3. **OpenBao infrastructure** using the old `secret/data/apis/zitadel` path will need to be migrated to `secret/data/apis/keycloak`. This is an infrastructure change that should happen alongside this code change.

### Testing Strategy

**Unit tests (secrets package -- co-located in `internal/secrets/secrets_test.go`):**
- Use `t.Setenv()` to set environment variables
- Use `httptest.NewServer` for OpenBao mock
- Follow exact patterns from existing `TestClient_GetDatabaseConfig_*` tests
- Test all three backends: env, file (skip if filesystem mocking is complex), openbao

**Handler tests (auth config endpoint -- in `tests/handlers/auth_config_test.go`):**
- Update SaaS mode response assertion: `"keycloak_client_id"` -> `"client_id"`
- Verify local mode response unchanged

## Dependencies

- **Depends on:** Story 15.1 (done) -- config package has Keycloak naming
- **Blocks:** None directly (15.3 is blocked by 15.1, not 15.2)
- **Related:** Story 15.3 will update the middleware that may eventually call `GetKeycloakConfig()` for JWKS configuration, though currently the middleware gets config from the `config` package, not `secrets`

## References

- [Source: _bmad-output/planning-artifacts/epic-15-keycloak-migration.md - Story 15.2]
- [Source: _bmad-output/planning-artifacts/prd-addendum-keycloak-migration.md - FR-KC-11, FR-KC-13]
- [Source: apis-server/internal/secrets/secrets.go - Current secrets implementation with ZitadelConfig]
- [Source: apis-server/internal/secrets/secrets_test.go - Current secrets tests]
- [Source: apis-server/internal/handlers/auth_config.go - Current auth config endpoint (already updated by 15.1)]
- [Source: apis-server/cmd/server/main.go - Server startup (already updated by 15.1)]
- [Source: _bmad-output/implementation-artifacts/15-1-auth-mode-config-env-vars.md - Preceding story]
- [Source: _bmad-output/implementation-artifacts/13-2-auth-mode-infrastructure.md - Original AUTH_MODE infrastructure story]
