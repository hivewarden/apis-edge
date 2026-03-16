# Code Review: Story 13-8 Login/Logout Endpoints

**Reviewer:** Claude Opus 4.5
**Date:** 2026-01-27
**Status:** PASSED (after remediation)

---

## Summary

Story 13-8 implements POST /api/auth/login, POST /api/auth/logout, and GET /api/auth/me endpoints for local authentication mode. The implementation is generally solid with good security practices, but there are **7 issues** that need to be addressed.

---

## Security Checklist Evaluation

| Check | Status | Notes |
|-------|--------|-------|
| Rate limiting (5/email/15min) | PASS | Correctly implemented |
| Generic error messages | PASS | "Invalid credentials" for all auth failures |
| Password verified with bcrypt | PASS | Using bcrypt.CompareHashAndPassword |
| Cookie flags (HttpOnly, Secure, SameSite) | PARTIAL | SameSite=Strict may be too restrictive |
| JWT contains all required claims | PASS | sub, tenant_id, email, name, role, iat, exp |
| Session duration configurable | PASS | 7 days / 30 days with remember_me |
| No timing attacks | PARTIAL | Issue with rate limiting before auth |

---

## Issues Found

### Issue 1: Rate Limiter Memory Leak - No Cleanup Mechanism

**Severity:** MEDIUM
**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/middleware/ratelimit_login.go`
**Lines:** 16-35

**Status:** FIXED

**Description:**
The `LoginRateLimiter` stores attempt timestamps in an in-memory map but has no mechanism to clean up stale entries. Entries are only removed on successful login (`ClearAttempts`) or when a new attempt is made for the same email. If an attacker tries many different email addresses, the map will grow indefinitely until the server is restarted.

**Impact:**
Memory exhaustion attack vector. An attacker could enumerate many email addresses causing unbounded memory growth.

**Resolution:**
Added a background cleanup goroutine in `NewLoginRateLimiter()` that runs every 5 minutes and removes stale entries via the new `cleanupStale()` method. Also added `GetEntryCount()` for testing/monitoring.

Changes made:
- `NewLoginRateLimiter()`: Now starts background cleanup goroutine
- `cleanupStale()`: New method that removes entries with all expired timestamps
- `GetEntryCount()`: New method for testing the cleanup mechanism

---

### Issue 2: Rate Limit Records Attempt Before Full Validation

**Severity:** LOW
**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/auth_local.go`
**Lines:** 124-134

**Description:**
The rate limiter records an attempt before checking if the user exists or verifying the password. While the comment says "This prevents timing attacks," it actually makes it easier for an attacker to enumerate which emails are rate-limited without providing any credential information.

**Current flow:**
1. Validate email format
2. Record rate limit attempt <-- recorded even if user doesn't exist
3. Check if user exists
4. Verify password

**Impact:**
Minor information leak. An attacker can differentiate between "email doesn't exist" and "rate limited" by observing response timing/codes for non-existent emails.

**Recommendation:**
This is intentional per the comment and follows common practice. However, for perfect enumeration protection, consider always performing a dummy bcrypt comparison even when the user doesn't exist. Mark as ACCEPTABLE if this is intentional design.

---

### Issue 3: SameSite=Strict May Block Legitimate Cross-Origin Flows

**Severity:** LOW
**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/setup.go`
**Lines:** 236

**Description:**
The session cookie uses `SameSite: http.SameSiteStrictMode`. While this is the most secure option, it can break legitimate use cases:
- OAuth/OIDC redirect flows from external IdPs
- Links from email verification pages
- Embedded iframes (if ever needed)

**Impact:**
Users may be unexpectedly logged out after following external links to the application.

**Recommendation:**
Consider using `SameSiteLaxMode` which still protects against CSRF for POST requests while allowing cookies to be sent on top-level navigation. Since this is local auth mode (not Zitadel OIDC), Strict may be acceptable. Document the trade-off.

---

### Issue 4: Missing Integration Test with Real Database

**Severity:** MEDIUM
**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/tests/handlers/auth_local_test.go`

**Status:** FIXED

**Description:**
The test file contains excellent unit tests for validation, rate limiting, JWT creation, and logout. However, there is no integration test that:
1. Creates a user in the database
2. Attempts login with correct credentials
3. Verifies the JWT cookie is set correctly
4. Verifies the response contains correct user data

All login tests use `nil` for the database pool, which only tests the "database not configured" path.

**Impact:**
The happy path (successful login with valid credentials) is never tested. A bug in the database query, password verification flow, or response marshaling would not be caught.

**Resolution:**
Added comprehensive integration tests to `auth_local_test.go`:

1. `TestLogin_SuccessWithDatabase` - Full integration test that:
   - Creates a test user with known password in the database
   - Tests successful login and verifies response body (user data)
   - Verifies session cookie is set with correct flags (HttpOnly, SameSite=Strict)
   - Validates the JWT token can be decoded correctly
   - Tests wrong password returns 401 with generic error message
   - Tests non-existent user returns 401 with generic error message

2. `TestLogin_CookieDuration` - Tests cookie MaxAge values:
   - Default session: 7 days (604800 seconds)
   - Remember me: 30 days (2592000 seconds)

3. `TestLoginRateLimiter_Cleanup` - Tests the cleanup mechanism works

All integration tests skip when `DATABASE_URL` is not set, following project conventions.

---

### Issue 5: Logout Does Not Require Authentication

**Severity:** LOW
**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/cmd/server/main.go`
**Lines:** 164

**Description:**
The logout endpoint is in the public routes group (no authentication required). While this is functionally harmless (clearing a non-existent cookie is a no-op), it's inconsistent with typical API design where logout requires a valid session.

```go
// Current (public):
r.Post("/api/auth/logout", handlers.Logout())

// Should be in protected group:
r.Group(func(r chi.Router) {
    r.Use(authMiddleware)
    r.Post("/api/auth/logout", handlers.Logout())
})
```

**Impact:**
Minor inconsistency. No security impact since clearing a cookie is idempotent.

**Recommendation:**
Move logout to protected routes for consistency, or document why it's intentionally public. Some argue public logout is better UX (user can always "log out" even with expired session).

---

### Issue 6: Email Logging in Rate Limit Warning

**Severity:** LOW
**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/auth_local.go`
**Lines:** 128-132

**Description:**
When rate limiting is triggered, the email address is logged:

```go
log.Warn().
    Str("email", req.Email).
    Int("retry_after", retryAfter).
    Msg("Login rate limit exceeded")
```

Depending on log aggregation and retention policies, this could be a minor PII concern or help attackers confirm email enumeration.

**Impact:**
PII in logs. May conflict with GDPR or privacy policies.

**Recommendation:**
Consider hashing the email or only logging it in debug mode:

```go
log.Warn().
    Str("email_hash", sha256Hash(req.Email)[:8]).
    Int("retry_after", retryAfter).
    Msg("Login rate limit exceeded")
```

---

### Issue 7: No Test for Remember Me Cookie Duration

**Severity:** LOW
**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/tests/handlers/auth_local_test.go`

**Description:**
The test file verifies JWT creation with `remember_me` flag affects token expiry, but there's no test verifying the cookie's `MaxAge` is correctly set based on `remember_me`.

The `TestLogout` test checks `MaxAge=-1` for deletion, but no test verifies:
- Default login sets `MaxAge` to 7 days (604800 seconds)
- `remember_me=true` sets `MaxAge` to 30 days (2592000 seconds)

**Impact:**
Cookie duration could be wrong without detection.

**Recommendation:**
Add a test that mocks a successful login response and verifies cookie MaxAge:

```go
func TestLogin_CookieDuration(t *testing.T) {
    // Test default duration (7 days)
    // Test remember_me duration (30 days)
}
```

---

## Summary of Required Actions

| Issue | Severity | Action | Status |
|-------|----------|--------|--------|
| 1. Rate limiter memory leak | MEDIUM | Add cleanup goroutine or use bounded cache | FIXED |
| 2. Rate limit before auth | LOW | ACCEPTABLE - document as intentional | ACCEPTABLE |
| 3. SameSite=Strict | LOW | ACCEPTABLE - document trade-off | ACCEPTABLE |
| 4. Missing integration test | MEDIUM | Add database integration test | FIXED |
| 5. Unauthenticated logout | LOW | ACCEPTABLE - document decision | ACCEPTABLE |
| 6. Email in logs | LOW | Hash email or use debug level | DEFERRED |
| 7. Missing cookie duration test | LOW | Add test for MaxAge values | FIXED (included in Issue 4 fix) |

---

## Verdict

**PASSED** - All MEDIUM issues resolved.

Fixes applied (2026-01-27):
1. **Issue 1** (MEDIUM): Added background cleanup goroutine and `cleanupStale()` method to rate limiter
2. **Issue 4** (MEDIUM): Added comprehensive integration tests including `TestLogin_SuccessWithDatabase` and `TestLogin_CookieDuration`
3. **Issue 7** (LOW): Cookie duration tests added as part of Issue 4 fix

Issues 2, 3, 5 marked as ACCEPTABLE (intentional design decisions).
Issue 6 deferred to future improvement.
