# Story 13.3: Retrofit Auth Middleware

Status: done

## Story

As a developer,
I want the auth middleware to validate tokens from both local JWT and Zitadel,
so that authenticated requests work in both deployment modes.

## Acceptance Criteria

1. **Local Mode Validation:**
   - Extract JWT from `apis_session` cookie OR `Authorization: Bearer` header
   - Validate signature using `JWT_SECRET` (HS256 algorithm)
   - Verify `exp` claim (reject expired tokens)
   - Extract claims: `sub`, `tenant_id`, `email`, `name`, `role`
   - Set context values: `user_id`, `tenant_id`, `role`, `email`

2. **SaaS Mode Validation (existing, preserve):**
   - Validate against Zitadel JWKS (RS256 algorithm)
   - Extract `sub`, `urn:zitadel:iam:org:id`, roles from claims
   - Auto-provision user/tenant on first login (existing behavior preserved)

3. **Unified Context Output:**
   - `ctx.Value("user_id")` - from `sub` claim
   - `ctx.Value("tenant_id")` - from `tenant_id` (local) or `org_id` (Zitadel)
   - `ctx.Value("role")` - from `role` (local) or roles array (Zitadel)
   - `ctx.Value("email")` - from `email` claim

4. **Error Responses (JSON format, consistent both modes):**
   - Missing token -> 401 `{"error": "Authentication required", "code": 401}`
   - Invalid signature -> 401 `{"error": "Invalid token", "code": 401}`
   - Expired token -> 401 `{"error": "Token expired", "code": 401}`

5. **Mode-Aware Middleware Selection:**
   - `NewAuthMiddleware()` must check `config.IsLocalAuth()` and return appropriate validator
   - Local mode: Use new `LocalAuthMiddleware` with HS256 validation
   - SaaS mode: Use existing Zitadel JWKS validation
   - `DISABLE_AUTH=true` still bypasses both (DevAuthMiddleware)

## Tasks / Subtasks

- [x] **Task 1: Create local JWT validation package** (AC: #1, #4)
  - [x] 1.1: Create `apis-server/internal/auth/local_jwt.go`
  - [x] 1.2: Implement `ValidateLocalJWT(tokenString, secret string) (*LocalClaims, error)`
  - [x] 1.3: Parse JWT with HS256 signature algorithm only (reject RS256)
  - [x] 1.4: Validate signature against `config.JWTSecret()`
  - [x] 1.5: Verify `exp` claim not expired (return `ErrTokenExpired` if expired)
  - [x] 1.6: Extract required claims: sub, tenant_id, email, name, role
  - [x] 1.7: Return typed errors: `ErrInvalidToken`, `ErrTokenExpired`, `ErrMissingClaims`

- [x] **Task 2: Create unified claims type** (AC: #3)
  - [x] 2.1: Create `apis-server/internal/auth/claims.go`
  - [x] 2.2: Define `UnifiedClaims` struct with fields for both modes
  - [x] 2.3: Implement `FromLocalClaims(*LocalClaims) *UnifiedClaims`
  - [x] 2.4: Implement `FromZitadelClaims(*ZitadelClaims) *UnifiedClaims`
  - [x] 2.5: Define context key constants (reuse existing `ClaimsKey` from middleware)

- [x] **Task 3: Create local auth middleware** (AC: #1, #4, #5)
  - [x] 3.1: Create `LocalAuthMiddleware()` function in `middleware/auth.go`
  - [x] 3.2: Extract token from `apis_session` cookie first, then `Authorization: Bearer` header
  - [x] 3.3: Call `auth.ValidateLocalJWT()` for validation
  - [x] 3.4: Convert `LocalClaims` to `Claims` struct (existing type, maintain compatibility)
  - [x] 3.5: Set claims in context using existing `ClaimsKey`
  - [x] 3.6: Return 401 with appropriate error message on failure

- [x] **Task 4: Refactor middleware factory to be mode-aware** (AC: #5)
  - [x] 4.1: Create `NewModeAwareAuthMiddleware()` function
  - [x] 4.2: If `config.IsAuthDisabled()` -> return `DevAuthMiddleware()`
  - [x] 4.3: If `config.IsLocalAuth()` -> return `LocalAuthMiddleware()`
  - [x] 4.4: If `config.IsSaaSMode()` -> return existing Zitadel middleware
  - [x] 4.5: Update `cmd/server/main.go` to use `NewModeAwareAuthMiddleware()`

- [x] **Task 5: Extend Claims struct for local mode fields** (AC: #3)
  - [x] 5.1: Add `TenantID string` field to existing `Claims` struct (currently only has OrgID)
  - [x] 5.2: Add `Role string` field (single role for local mode, derive from Roles array in SaaS)
  - [x] 5.3: Ensure existing code using `claims.OrgID` still works (backward compatible)
  - [x] 5.4: Update `GetClaims()` helper to work with both claim types

- [x] **Task 6: Write unit tests for local JWT validation** (AC: #1, #4)
  - [x] 6.1: Create `apis-server/tests/auth/local_jwt_test.go`
  - [x] 6.2: Test valid HS256 token -> returns claims
  - [x] 6.3: Test invalid signature -> returns ErrInvalidToken
  - [x] 6.4: Test expired token -> returns ErrTokenExpired
  - [x] 6.5: Test missing required claims -> returns ErrMissingClaims
  - [x] 6.6: Test RS256 token rejected (wrong algorithm)
  - [x] 6.7: Test token extraction from cookie

- [x] **Task 7: Write integration tests for middleware** (AC: #1, #2, #3, #4, #5)
  - [x] 7.1: Create `apis-server/tests/middleware/auth_test.go`
  - [x] 7.2: Test local mode with valid token -> request proceeds, context has claims
  - [x] 7.3: Test local mode with invalid token -> 401 response
  - [x] 7.4: Test local mode with expired token -> 401 "Token expired"
  - [x] 7.5: Test SaaS mode still works (mock JWKS)
  - [x] 7.6: Test mode switching via config

## Dev Notes

### Architecture Compliance

**Package Structure (from CLAUDE.md):**
- New files go in `internal/auth/` for JWT logic (reusable across handlers)
- Middleware stays in `internal/middleware/`
- Tests go in `tests/` directory (not co-located)

**Go Patterns:**
- Error wrapping: `fmt.Errorf("auth: failed to validate JWT: %w", err)`
- Structured logging with zerolog (already imported in auth.go)
- PascalCase exports, camelCase private

**JWT Library:** Use `github.com/go-jose/go-jose/v4/jwt` (already imported in auth.go)

### Existing Code Analysis

**Current middleware/auth.go has:**
- `Claims` struct with: `UserID`, `OrgID`, `Email`, `Name`, `Roles []string`
- `ZitadelClaims` struct for Zitadel-specific JWT parsing
- `ClaimsKey` context key constant
- `GetClaims(ctx)` and `RequireClaims(ctx)` helpers
- `DevAuthMiddleware()` for DISABLE_AUTH mode
- `NewAuthMiddleware(issuer, clientID)` for Zitadel

**Key insight:** The `Claims` struct needs `TenantID` added. Currently only has `OrgID` which maps to Zitadel's org_id. For local mode, we need both. Maintain backward compatibility by keeping `OrgID` populated from `TenantID` in local mode.

### config/auth.go Helpers (from Story 13.2)

Already available:
```go
config.IsLocalAuth() bool      // true for AUTH_MODE=local
config.IsSaaSMode() bool       // true for AUTH_MODE=zitadel
config.JWTSecret() string      // JWT signing secret (min 32 chars)
config.IsAuthDisabled() bool   // true for DISABLE_AUTH=true
config.DefaultTenantUUID()     // "00000000-0000-0000-0000-000000000000"
```

### Local JWT Structure (from Story 13.8 spec)

Local mode JWTs will be created by story 13.8 with these claims:
```json
{
  "sub": "user-uuid",
  "tenant_id": "00000000-0000-0000-0000-000000000000",
  "email": "user@example.com",
  "name": "Display Name",
  "role": "admin",
  "iat": 1737590400,
  "exp": 1738195200
}
```

### Cookie vs Header Priority

1. Check `apis_session` cookie first (browser requests)
2. Fall back to `Authorization: Bearer` header (API clients, mobile)
3. If neither present -> 401

This order matters because:
- Browsers send cookies automatically
- API clients/devices use Authorization header
- Cookie takes priority to support both in same request

### Error Response Consistency

Match existing `respondUnauthorized()` format:
```go
func respondUnauthorized(w http.ResponseWriter, message string) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(http.StatusUnauthorized)
    json.NewEncoder(w).Encode(map[string]any{
        "error": message,
        "code":  http.StatusUnauthorized,
    })
}
```

### Backward Compatibility Requirements

1. **Existing handlers use `claims.OrgID`** for tenant context
   - Solution: Populate `OrgID` from `TenantID` in local mode
   - Both fields point to same value, handlers work unchanged

2. **Existing handlers use `claims.Roles` (array)**
   - Local mode has single `role` string
   - Convert to single-element array: `Roles: []string{localClaims.Role}`

3. **Tenant middleware expects `claims.OrgID`**
   - See story 13.4 for tenant middleware retrofit
   - This story just ensures `OrgID` is populated

### Security Considerations

1. **Algorithm confusion attack prevention:** Only accept HS256 for local mode
   - Explicitly check algorithm, reject RS256 tokens in local mode
   - Prevents attacker using Zitadel-style token with HS256 claim

2. **Secret validation:** `config.JWTSecret()` already validates min 32 chars at startup

3. **Timing attacks:** Use constant-time comparison (crypto/subtle) if comparing secrets directly

### Testing Strategy

**Unit tests (tests/auth/):**
- Test JWT parsing and validation in isolation
- Use test JWTs generated with known secrets
- Test error conditions thoroughly

**Integration tests (tests/middleware/):**
- Test full HTTP request flow with httptest
- Mock config for mode switching
- Test both cookie and header token extraction

**Test JWT generation helper:**
```go
func generateTestJWT(claims map[string]any, secret string, exp time.Time) string {
    // Use go-jose to create test tokens
}
```

### Files to Create

| File | Purpose |
|------|---------|
| `apis-server/internal/auth/local_jwt.go` | Local JWT validation logic |
| `apis-server/internal/auth/claims.go` | Unified claims handling |
| `apis-server/tests/auth/local_jwt_test.go` | Unit tests for JWT validation |
| `apis-server/tests/middleware/auth_test.go` | Integration tests for middleware |

### Files to Modify

| File | Changes |
|------|---------|
| `apis-server/internal/middleware/auth.go` | Add LocalAuthMiddleware, NewModeAwareAuthMiddleware, extend Claims struct |
| `apis-server/cmd/server/main.go` | Use NewModeAwareAuthMiddleware() instead of conditional logic |

### Previous Story Learnings (13.2)

From story 13.2 remediation:
- Use `mustGetConfig()` pattern carefully with mutex
- Test files go in `tests/` directory, not co-located
- Log warnings clearly for dev mode activation
- Document panic behavior in function godocs

### Project Structure Notes

**Alignment with unified project structure:**
- Auth package: `internal/auth/` (new, for reusable auth logic)
- Middleware package: `internal/middleware/` (existing)
- Test location: `tests/auth/`, `tests/middleware/`

**No conflicts detected with existing code.**

### References

- [Source: apis-server/internal/middleware/auth.go - Current Zitadel auth implementation]
- [Source: apis-server/internal/config/auth.go - AUTH_MODE helpers from story 13.2]
- [Source: _bmad-output/planning-artifacts/epic-13-dual-auth-mode.md - Story 13.3 requirements]
- [Source: _bmad-output/planning-artifacts/architecture.md - JWT claims structure]
- [Source: CLAUDE.md - Go patterns and project conventions]

## Test Criteria

- [x] Valid local JWT token -> request proceeds with context set
- [x] Invalid signature -> 401 "Invalid token"
- [x] Expired token -> 401 "Token expired"
- [x] Missing token -> 401 "Authentication required"
- [x] Local mode accepts HS256 tokens
- [x] Local mode rejects RS256 tokens (algorithm confusion prevention)
- [x] SaaS mode accepts RS256 Zitadel tokens (existing behavior preserved)
- [x] Token from cookie extracted correctly
- [x] Token from Authorization header extracted correctly
- [x] Cookie takes priority over header when both present
- [x] Claims set in context correctly in both modes
- [x] Existing handlers using claims.OrgID still work in local mode

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A

### Completion Notes List

1. **Task 1 Complete**: Created `internal/auth/local_jwt.go` with `ValidateLocalJWT()` function that validates HS256 JWTs, verifies expiration, extracts claims, and returns typed errors (`ErrInvalidToken`, `ErrTokenExpired`, `ErrMissingClaims`, `ErrInvalidAlgorithm`). Also added `ExtractTokenFromCookieOrHeader()` helper.

2. **Task 2 Complete**: Created `internal/auth/claims.go` with `UnifiedClaims` struct and conversion functions `FromLocalClaims()` and `FromZitadelClaims()`. The UnifiedClaims type provides a consistent interface for both authentication modes. **Note:** This file was deleted during remediation as dead code - the middleware uses the `Claims` struct directly instead.

3. **Task 3 Complete**: Added `LocalAuthMiddleware()` to `internal/middleware/auth.go`. It extracts tokens from `apis_session` cookie or `Authorization: Bearer` header (cookie priority), validates using the auth package, converts to the existing Claims struct, and returns appropriate 401 errors.

4. **Task 4 Complete**: Added `NewModeAwareAuthMiddleware()` function that selects the appropriate auth strategy based on `config.IsAuthDisabled()`, `config.IsLocalAuth()`, or SaaS mode. Updated `cmd/server/main.go` to use this new function instead of conditional logic.

5. **Task 5 Complete**: Extended the `Claims` struct with `TenantID` and `Role` fields. Both local and Zitadel modes now populate `OrgID` and `TenantID` with the same value for backward compatibility. The `Role` field contains the primary role (single value for local mode, first element of Roles array for SaaS mode).

6. **Task 6 Complete**: Created comprehensive unit tests in `tests/auth/local_jwt_test.go` covering valid tokens, invalid signatures, expired tokens, missing claims, malformed tokens, algorithm rejection, and token extraction.

7. **Task 7 Complete**: Created integration tests in `tests/middleware/auth_test.go` covering local auth with cookie/header, cookie priority, missing/invalid/expired tokens, dev mode bypass, mode-aware middleware selection, and backward compatibility verification.

### Change Log

- 2026-01-27: Implemented local JWT validation, unified claims, and mode-aware auth middleware (Story 13.3)
- 2026-01-27: Remediation: Fixed 6 code review issues (H1-H2, M1-M4)

### File List

**New Files:**
- `apis-server/internal/auth/local_jwt.go` - Local JWT validation with HS256 support
- `apis-server/tests/auth/local_jwt_test.go` - Unit tests for JWT validation (13 tests)
- `apis-server/tests/middleware/auth_test.go` - Integration tests for middleware (15 tests)

**Deleted Files (dead code):**
- `apis-server/internal/auth/claims.go` - UnifiedClaims was never used; middleware uses Claims directly

**Modified Files:**
- `apis-server/internal/middleware/auth.go` - Added LocalAuthMiddleware, NewModeAwareAuthMiddleware, extended Claims struct
- `apis-server/cmd/server/main.go` - Simplified to use NewModeAwareAuthMiddleware()
