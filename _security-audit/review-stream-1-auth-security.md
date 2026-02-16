# Security Code Review -- Stream 1: Server Auth, Security Middleware, Secrets

**Date:** 2026-02-06
**Reviewer:** Claude Opus 4.6 (automated code review)
**Scope:** Go server authentication, authorization middleware, CSRF, rate limiting, secrets management, token revocation, route registration

---

## Summary

This review covers the authentication and security infrastructure of the APIS Go server. The codebase reflects a recent security remediation pass (Batches 1-8) that addressed many baseline concerns. The overall architecture is sound: dual-mode auth (local JWT / Zitadel OIDC), compound rate limiting, CSRF double-submit cookie pattern, tenant isolation via PostgreSQL RLS, and a layered secrets backend with fallback. However, several issues remain, ranging from a data corruption bug in the Retry-After header to a logic flaw that allows authentication bypass in unset `GO_ENV` environments.

**Findings:** 17 total
- CRITICAL: 2
- HIGH: 4
- MEDIUM: 5
- LOW: 4
- INFO: 2

---

## Findings

### CRITICAL

#### C-1: Retry-After Header Data Corruption in RespondAccountLockedError

- **File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/errors.go`
- **Line:** 194
- **Code:**
  ```go
  w.Header().Set("Retry-After", string(rune(retryAfterSeconds)))
  ```
- **Description:** `string(rune(retryAfterSeconds))` converts the integer to a Unicode code point, then to a UTF-8 string. For example, if `retryAfterSeconds` is 60, this produces the Unicode character `<` (U+003C), not the string `"60"`. For values above 127, this produces multi-byte UTF-8 sequences that are completely uninterpretable by HTTP clients.
- **Risk:** Every account lockout response sends a corrupted `Retry-After` header. HTTP clients and browsers that rely on this header will either fail to parse it or wait an incorrect duration. This also violates RFC 7231 Section 7.1.3 which requires the value to be a non-negative decimal integer representing seconds.
- **Fix:** Replace with `strconv.Itoa(retryAfterSeconds)`:
  ```go
  w.Header().Set("Retry-After", strconv.Itoa(retryAfterSeconds))
  ```
- **Note:** The `ratelimit` package's `RespondRateLimited` function in `helpers.go:74` correctly uses `strconv.Itoa(retryAfter)`, confirming this is an inconsistency rather than a project-wide pattern.

---

#### C-2: DISABLE_AUTH Bypass When GO_ENV Is Unset

- **File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/middleware/auth.go`
- **Line:** 597
- **Code:**
  ```go
  goEnv := strings.ToLower(strings.TrimSpace(os.Getenv("GO_ENV")))
  if goEnv != "development" && goEnv != "test" && goEnv != "" {
      log.Fatal()./* ... */
  }
  ```
- **Description:** The guard condition `goEnv != ""` means that when `GO_ENV` is not set (empty string), the condition is `false`, and the `log.Fatal()` is **not** executed. This allows `DISABLE_AUTH=true` to take effect in any environment where `GO_ENV` is simply not set. In many deployment scenarios (Docker containers, systemd units, cloud platforms), `GO_ENV` is not set by default. An attacker or misconfiguration could set `DISABLE_AUTH=true` without `GO_ENV` being explicitly set, completely bypassing authentication.
- **Risk:** Full authentication bypass in production if `DISABLE_AUTH=true` is set and `GO_ENV` is unset. This defeats the entire purpose of the security guard.
- **Fix:** Invert the logic to allowlist only known safe environments:
  ```go
  if goEnv != "development" && goEnv != "test" {
      log.Fatal()./* ... */
  }
  ```
  This ensures that `DISABLE_AUTH` is only permitted when `GO_ENV` is explicitly set to `"development"` or `"test"`.
- **Note:** The second guard (`I_UNDERSTAND_AUTH_DISABLED=yes`) provides a secondary check, but it is a weaker defense since it can also be set via environment without understanding the implications.

---

### HIGH

#### H-1: Logout Endpoint in Public Routes Group -- Token Revocation May Silently Fail

- **File:** `/Users/jermodelaruelle/Projects/apis/apis-server/cmd/server/main.go`
- **Line:** 202
- **File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/auth_local.go`
- **Lines:** 422-466
- **Code (main.go):**
  ```go
  // Public routes group (no auth middleware)
  r.Group(func(r chi.Router) {
      // ...
      r.Post("/api/auth/logout", handlers.Logout())
  })
  ```
- **Description:** The `/api/auth/logout` endpoint is registered in the public routes group, meaning no authentication middleware runs before the handler. Inside `Logout()`, the handler calls `middleware.GetClaims(r.Context())` which returns `nil` since no auth middleware populated the context. The handler gracefully handles this (`if claims != nil`), but the token revocation logic is entirely skipped. The logout response still clears the session and CSRF cookies in the browser, but the server-side token is **never revoked**. This means the token remains valid until natural expiry (up to 24 hours or 7 days for remember-me tokens).
- **Risk:** Stolen tokens remain valid after logout. A user who logs out believing their session is invalidated is still vulnerable if their token was compromised. This is especially concerning for shared/public computers.
- **Fix:** Move the logout endpoint into the protected routes group, or create a lightweight auth extraction (without full validation) that can extract claims for revocation purposes without returning 401.

---

#### H-2: Dummy Hash Bcrypt Cost Mismatch Enables User Enumeration

- **File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/auth/password.go`
- **Line:** 89
- **Code:**
  ```go
  var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("dummy-password-for-timing"), bcrypt.DefaultCost)
  ```
- **Description:** `bcrypt.DefaultCost` is 10, but the configured bcrypt cost (via `BcryptCost()`) defaults to 12 and can be set as high as 15 via the `BCRYPT_COST` environment variable. When a login attempt targets a non-existent user, `DummyPasswordCheck` compares against cost-10 hash. When targeting an existing user, the real comparison uses cost-12 (or higher). Each bcrypt cost increment doubles computation time, so cost-12 takes approximately 4x longer than cost-10. An attacker can statistically distinguish existing from non-existing users by measuring response times.
- **Risk:** User enumeration via timing side-channel. The entire purpose of the dummy hash is to prevent this, but the cost mismatch undermines it.
- **Fix:** Generate the dummy hash with the same cost used for real passwords:
  ```go
  var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("dummy-password-for-timing"), BcryptCost())
  ```
  Note: Since `BcryptCost()` uses `sync.Once`, ensure the dummy hash is initialized after the bcrypt cost is configured (or use a lazy initialization pattern).

---

#### H-3: Token Revocation Store Is In-Memory Only -- Ineffective in Multi-Instance SaaS

- **File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/storage/token_revocations.go`
- **Lines:** 13-35
- **Description:** `TokenRevocationStore` is a process-local in-memory singleton (`sync.Once` + `map[string]tokenRevocation`). In SaaS mode with multiple server instances behind a load balancer, a token revoked on one instance is still accepted by all other instances. The `RevokeAllForUser` function (password change) has the same limitation.
- **Risk:** In multi-instance deployments, token revocation is unreliable. A user changing their password or logging out only invalidates their token on the instance that handled the request. Compromised tokens can still be used against other instances until natural expiry.
- **Fix:** For SaaS mode, use a shared store (Redis, database table, or the existing Redis rate limiter infrastructure). The `ratelimit` package already has Redis integration that could serve as a pattern.

---

#### H-4: IP Address Extraction Trusts Client-Supplied Headers

- **File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/ratelimit/helpers.go`
- **Lines:** 21-43
- **Code:**
  ```go
  func ExtractIP(r *http.Request) string {
      if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
          parts := strings.Split(xff, ",")
          ip := strings.TrimSpace(parts[0])
          // ...
      }
  ```
- **Description:** The `ExtractIP` function reads `X-Forwarded-For` and `X-Real-IP` headers directly from the request. These headers can be freely set by any HTTP client. While `main.go` uses `chi/middleware.RealIP` (which overwrites `RemoteAddr`), the `ExtractIP` function is called independently and reads the raw headers, not `RemoteAddr`. An attacker can cycle through forged IP addresses in `X-Forwarded-For` to bypass per-IP rate limiting entirely.
- **Risk:** Per-IP rate limiting on login endpoints can be circumvented by IP spoofing, allowing unlimited login attempts from a single source.
- **Fix:** Either (a) rely on `r.RemoteAddr` (which `chi/middleware.RealIP` has already set to the trusted proxy value) instead of re-parsing headers, or (b) implement a trusted proxy chain where only the last hop's `X-Forwarded-For` entry is used.

---

### MEDIUM

#### M-1: No Clock Skew Tolerance on JWT Expiry Check

- **File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/auth/local_jwt.go`
- **Line:** 89
- **Code:**
  ```go
  if claims.Expiry.Time().Before(time.Now()) {
      return nil, ErrTokenExpired
  }
  ```
- **Description:** The `NotBefore` claim check (line 95) has a 30-second clock skew tolerance, but the `Expiry` check has none. In distributed systems, minor clock differences between the token-issuing instance and the validating instance can cause tokens to be rejected slightly before their intended expiry.
- **Risk:** In multi-instance deployments, users may experience intermittent authentication failures near token expiry. This is more of a reliability concern than a security vulnerability, but it creates a poor user experience and can lead to support tickets.
- **Fix:** Apply the same 30-second tolerance to the expiry check:
  ```go
  if claims.Expiry.Time().Add(30 * time.Second).Before(time.Now()) {
      return nil, ErrTokenExpired
  }
  ```

---

#### M-2: No Issuer Claim Validation in Local JWT

- **File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/auth/local_jwt.go`
- **Lines:** 100-111
- **Description:** `ValidateLocalJWT` checks `sub`, `tenant_id`, and `email` claims but does not validate the `iss` (issuer) claim. The `CreateLocalJWT` function sets `Issuer: "apis-server"` (line 159), but this is never verified during validation. If multiple services share the same JWT secret (e.g., in a shared infrastructure environment), tokens from other services would be accepted.
- **Risk:** Token confusion across services sharing the same signing secret. In the documented shared Hetzner infrastructure (with RTP/RateThePlate alongside APIS), this could be exploitable if secrets are inadvertently shared.
- **Fix:** Add issuer validation:
  ```go
  if claims.Issuer != "apis-server" {
      return nil, fmt.Errorf("%w: invalid issuer", ErrInvalidToken)
  }
  ```

---

#### M-3: LoginRateLimiter Goroutine Leak -- No Stop Channel

- **File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/middleware/ratelimit_login.go`
- **Lines:** 42-48
- **Code:**
  ```go
  go func() {
      ticker := time.NewTicker(5 * time.Minute)
      defer ticker.Stop()
      for range ticker.C {
          rl.cleanupStale()
      }
  }()
  ```
- **Description:** The `LoginRateLimiter` starts a background cleanup goroutine with no way to stop it. Unlike the newer `MemoryLimiter` (which has a `Stop()` method and `stopCh` channel) and `TokenRevocationStore` (which also has `Stop()`), this older implementation has no lifecycle management. Every call to `NewLoginRateLimiter` starts a goroutine that runs forever.
- **Risk:** Goroutine leak in tests and during hot-reload scenarios. In production, this is a single instance so the impact is minimal, but it violates the established pattern and makes testing harder (goroutine leak detectors will flag this).
- **Fix:** Add a `stopCh` channel and `Stop()` method matching the pattern used in `MemoryLimiter` and `TokenRevocationStore`.

---

#### M-4: Older RateLimiter Has No Cleanup and No Stop Mechanism

- **File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/middleware/ratelimit.go`
- **Lines:** 17-75
- **Description:** The `RateLimiter` struct in `middleware/ratelimit.go` (used for export and transcribe rate limiting) has no background cleanup goroutine. Stale timestamps are only cleaned up lazily during the `Allow()` call. If a tenant makes requests, stops, and never makes another request, their timestamp entries persist indefinitely. Additionally, there is no `Stop()` method.
- **Risk:** Unbounded memory growth over time in long-running servers with many distinct tenants. Each tenant accumulates entries that are never cleaned up unless that specific tenant makes another request.
- **Fix:** Either (a) add a cleanup goroutine matching the newer `MemoryLimiter` pattern, or (b) migrate these rate limiters to use the `ratelimit` package which already has proper lifecycle management.

---

#### M-5: Redis Rate Limiter Fails Open on Error

- **File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/ratelimit/redis.go`
- **Lines:** 120-124
- **Code:**
  ```go
  if err != nil {
      log.Error().Err(err).Str("key", key).Msg("Redis rate limit check failed")
      // On Redis error, allow the request (fail open) to prevent service disruption
      return true, rl.config.MaxRequests - 1, now.Add(rl.config.WindowPeriod), nil
  }
  ```
- **Description:** When Redis is unavailable, the rate limiter allows all requests (fail open). This is documented and intentional for availability, but means a Redis outage (or a targeted attack against Redis) completely disables rate limiting for login endpoints in SaaS mode.
- **Risk:** An attacker who can cause Redis to become unavailable (e.g., connection exhaustion, network partition) can then perform unlimited login brute force attacks.
- **Fix:** Consider a hybrid approach: maintain an in-memory fallback rate limiter that activates when Redis is unavailable. Log the failover prominently so operators are alerted.

---

### LOW

#### L-1: Secret File Permissions Warned But Not Enforced

- **File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/secrets/secrets.go`
- **Lines:** 442-446
- **Code:**
  ```go
  if perm&0077 != 0 {
      log.Warn().
          Str("file", name).
          Str("permissions", fmt.Sprintf("%04o", perm)).
          Msg("Secret file has overly permissive permissions (should be 0600 or 0400)")
  }
  ```
- **Description:** When using the file-based secrets backend, overly permissive file permissions (e.g., 0644, world-readable) produce a warning log but the secret is still read and used. This allows the application to start with insecure secret files.
- **Risk:** In standalone deployments where the operator may not monitor logs, secrets could be world-readable without anyone noticing. This is defense-in-depth: the warning is good, but enforcement would be better.
- **Fix:** Consider making this a fatal error in SaaS/production mode or adding a `STRICT_SECRET_PERMISSIONS=true` option that refuses to read world-readable secret files.

---

#### L-2: Database SSLMode Defaults to "disable"

- **File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/secrets/secrets.go`
- **Lines:** 169-171
- **Code:**
  ```go
  if sslMode == "" {
      sslMode = "disable"
  }
  ```
- **Description:** When `SSLMode` is not explicitly configured, the database connection string defaults to `sslmode=disable`. In production SaaS mode where the database may be on a separate host, this means credentials are sent in plaintext over the network.
- **Risk:** Database credentials exposed on the network in production deployments where SSL is not explicitly configured. The comment acknowledges this is for development, but the default is unsafe for production.
- **Fix:** Default to `"require"` when `DEPLOYMENT_MODE=saas`, and only default to `"disable"` for `standalone` mode:
  ```go
  if sslMode == "" {
      if d.DeploymentMode == "saas" {
          sslMode = "require"
      } else {
          sslMode = "disable"
      }
  }
  ```

---

#### L-3: OpenBao Token Stored in Plain Struct Field

- **File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/secrets/secrets.go`
- **Lines:** 64, 101
- **Code:**
  ```go
  type Config struct {
      // ...
      Token  string // OpenBao token (only used if Source=openbao)
      // ...
  }
  ```
- **Description:** The OpenBao authentication token is stored as a plain string in the `Config` struct. This token grants access to the entire secrets store. If the process memory is dumped (via core dump, debugging, or memory inspection), the token is exposed. The log output at line 138-144 masks the address but does not log the token, which is good.
- **Risk:** Low in practice since accessing process memory requires host-level compromise, at which point the attacker likely already has access to environment variables. However, core dumps and heap profilers could inadvertently expose the token.
- **Fix:** Consider wrapping the token in a type that implements `fmt.Stringer` to prevent accidental logging/serialization, and zeroing the memory after use if feasible.

---

#### L-4: CSRF Token and Session Cookie Lifetime Mismatch

- **File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/middleware/csrf.go`
- **Line:** 74
- **File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/auth_local.go`
- **Description:** The CSRF cookie has a `MaxAge` of 7 days (604800 seconds). The session cookie has a `MaxAge` derived from the JWT expiry (24 hours default, 7 days for remember-me). For default sessions (24h), the CSRF cookie outlives the session cookie by 6 days. During this window, the CSRF cookie exists but the session does not, which is benign. However, if the session is renewed (e.g., new login), the old CSRF token is still valid alongside the new session, potentially causing confusion.
- **Risk:** Low practical impact since CSRF tokens are validated via double-submit (cookie must match header), and a new login generates a new CSRF cookie. The stale CSRF cookie is simply overwritten.
- **Fix:** Align CSRF cookie `MaxAge` with the session token's actual expiry duration for consistency. This is a minor hygiene improvement.

---

### INFO

#### I-1: Secrets Fallback Chain Can Silently Downgrade Security

- **File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/secrets/secrets.go`
- **Lines:** 17-18 (package comment), and throughout `GetDatabaseConfig`, `GetJWTConfig`
- **Description:** The documented fallback chain `openbao -> file -> env` means that if OpenBao is temporarily unavailable, the system silently falls back to environment variables. While this ensures availability, it means a SaaS deployment could unknowingly run with weaker secret management. The fallback is logged at WARN level.
- **Risk:** Informational. The design is intentional for availability, and the WARN log is present. Operators should set up alerting on these warnings.
- **Recommendation:** Consider adding a `STRICT_SECRETS=true` option that disables fallback in SaaS mode, forcing the application to fail if the configured backend is unavailable.

---

#### I-2: Admin Routes Bypass TenantMiddleware (Intentional but Worth Documenting)

- **File:** `/Users/jermodelaruelle/Projects/apis/apis-server/cmd/server/main.go`
- **Lines:** Approximately 280+ (admin route group)
- **Description:** The `/api/admin/*` routes are registered with `authMiddleware` and `SuperAdminMiddleware` but without `TenantMiddleware`. This means no `SET LOCAL app.tenant_id` is executed for admin requests, so PostgreSQL RLS policies do not apply. This is intentional since super-admins need cross-tenant visibility, but it means any SQL queries in admin handlers must not rely on RLS for isolation.
- **Risk:** Informational. If a future developer adds a query to an admin handler that assumes RLS is active, it could leak data across tenants. The pattern is correct today but fragile.
- **Recommendation:** Add a comment in the admin route group explicitly noting that RLS is not active and all admin queries must handle tenant isolation manually.

---

## Files Reviewed

### Auth Package
| File | Path |
|------|------|
| API Key | `apis-server/internal/auth/apikey.go` |
| Local JWT | `apis-server/internal/auth/local_jwt.go` |
| Password | `apis-server/internal/auth/password.go` |
| Common Passwords | `apis-server/internal/auth/common_passwords.go` |

### Config Package
| File | Path |
|------|------|
| Auth Config | `apis-server/internal/config/auth.go` |
| Feature Flags | `apis-server/internal/config/features.go` |

### Secrets Package
| File | Path |
|------|------|
| Secrets Client | `apis-server/internal/secrets/secrets.go` |
| Secrets Tests | `apis-server/internal/secrets/secrets_test.go` |

### Middleware Package
| File | Path |
|------|------|
| Auth Middleware | `apis-server/internal/middleware/auth.go` |
| Auth Middleware Tests | `apis-server/internal/middleware/auth_test.go` |
| CSRF | `apis-server/internal/middleware/csrf.go` |
| Security Headers | `apis-server/internal/middleware/security.go` |
| Security Tests | `apis-server/internal/middleware/security_test.go` |
| Rate Limiter (export) | `apis-server/internal/middleware/ratelimit.go` |
| Rate Limiter (login) | `apis-server/internal/middleware/ratelimit_login.go` |
| Tenant | `apis-server/internal/middleware/tenant.go` |
| Unit Auth | `apis-server/internal/middleware/unitauth.go` |
| Super Admin | `apis-server/internal/middleware/superadmin.go` |
| Audit | `apis-server/internal/middleware/audit.go` |

### Handlers Package
| File | Path |
|------|------|
| Auth Local | `apis-server/internal/handlers/auth_local.go` |
| Auth Config | `apis-server/internal/handlers/auth_config.go` |
| Setup | `apis-server/internal/handlers/setup.go` |
| Errors | `apis-server/internal/handlers/errors.go` |

### Rate Limiting Package
| File | Path |
|------|------|
| Limiter Interface | `apis-server/internal/ratelimit/limiter.go` |
| Memory Limiter | `apis-server/internal/ratelimit/memory.go` |
| Redis Limiter | `apis-server/internal/ratelimit/redis.go` |
| Lockout | `apis-server/internal/ratelimit/lockout.go` |
| Helpers | `apis-server/internal/ratelimit/helpers.go` |

### Storage Package
| File | Path |
|------|------|
| Token Revocations | `apis-server/internal/storage/token_revocations.go` |

### Entry Point
| File | Path |
|------|------|
| Main | `apis-server/cmd/server/main.go` |

### Test Files
| File | Path |
|------|------|
| Local JWT Tests | `apis-server/internal/auth/local_jwt_test.go` |
| Password Tests | `apis-server/internal/auth/password_test.go` |
| Auth Middleware Tests | `apis-server/internal/middleware/auth_test.go` |
| Security Middleware Tests | `apis-server/internal/middleware/security_test.go` |
| Auth Local Handler Tests | `apis-server/tests/handlers/auth_local_test.go` |
| Setup Handler Tests | `apis-server/tests/handlers/setup_test.go` |
| Rate Limit Integration Tests | `apis-server/tests/handlers/ratelimit_integration_test.go` |
| Auth Config Tests | `apis-server/tests/handlers/auth_config_test.go` |
| Config Auth Tests | `apis-server/tests/config/auth_test.go` |
| Rate Limit Helpers Tests | `apis-server/tests/ratelimit/helpers_test.go` |
| Secrets Tests | `apis-server/internal/secrets/secrets_test.go` |

---

## Metrics

| Severity | Count |
|----------|-------|
| CRITICAL | 2 |
| HIGH | 4 |
| MEDIUM | 5 |
| LOW | 4 |
| INFO | 2 |
| **Total** | **17** |

### Risk Distribution

- **Authentication bypass:** 2 findings (C-2, H-1)
- **Data corruption / correctness:** 1 finding (C-1)
- **Timing side-channel:** 1 finding (H-2)
- **Multi-instance reliability:** 2 findings (H-3, M-1)
- **Rate limiting evasion:** 2 findings (H-4, M-5)
- **Memory / resource leaks:** 2 findings (M-3, M-4)
- **JWT validation gaps:** 1 finding (M-2)
- **Configuration safety:** 3 findings (L-1, L-2, I-1)
- **Secret handling:** 1 finding (L-3)
- **Consistency / hygiene:** 2 findings (L-4, I-2)

### Positive Observations

The following security measures are well-implemented and deserve recognition:

1. **Algorithm confusion prevention** (local_jwt.go:68) -- ParseSigned restricts to HS256 only, with a secondary parse to distinguish algorithm mismatch from malformed tokens.
2. **CSRF double-submit cookie** (csrf.go) -- Uses `crypto/subtle.ConstantTimeCompare` for timing-safe comparison, 256-bit entropy, and proper cookie attributes.
3. **Compound rate limiting** (auth_local.go, ratelimit package) -- Login uses both per-email and per-IP limits with account lockout, providing defense-in-depth.
4. **Tenant isolation via RLS** (tenant.go) -- Uses PostgreSQL `SET LOCAL app.tenant_id` for row-level security, with defense-in-depth mismatch detection.
5. **Password validation** (password.go) -- Bcrypt with configurable cost, common password dictionary, and 8-72 character range (72 is bcrypt's max).
6. **Security headers** (security.go) -- Comprehensive headers including CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, and Permissions-Policy.
7. **Path traversal protection** (secrets.go:432) -- File-based secrets backend validates paths against the secrets directory using `filepath.Abs` prefix check.
8. **Super admin middleware** (superadmin.go) -- Returns 404 (not 403) in local mode to hide endpoint existence; uses generic error messages to prevent role enumeration.
9. **JWT token revocation infrastructure** (token_revocations.go) -- Per-token (JTI) and per-user revocation with automatic cleanup, proper lifecycle management with Stop().
10. **Request body size limiting** (security.go) -- `MaxBodySize` middleware using `http.MaxBytesReader` with configurable limits per route type.
