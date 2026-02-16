# APIS Full Security Review — 2026-02-06

**Auditor:** Claude Opus 4.6 Security Review
**Project:** APIS (Anti-Predator Interference System)
**Scope:** Full codebase — Server (Go), Dashboard (React), Edge Firmware (C/ESP-IDF)
**Prior Audit:** V2 report dated 2026-01-31 (77 findings, 58 resolved)

---

## Executive Summary

This review identified **73 findings** across all three codebases. Despite the prior audit resolving 58 issues, significant vulnerabilities remain — several are regressions or were missed in the original audit, particularly in the edge firmware safety-critical code and the server authentication lifecycle.

The three most dangerous patterns are:
1. **CSRF middleware exists but was never wired into routes** — all cookie-authenticated state-changing endpoints are unprotected
2. **Edge device uses no TLS and predictable auth tokens** — an attacker on the same network has full device control including laser
3. **No token revocation** — logout, password change, and account deactivation don't actually invalidate sessions (up to 7 days)

### Findings by Severity and Component

| Component | CRITICAL | HIGH | MEDIUM | LOW | Total |
|-----------|----------|------|--------|-----|-------|
| Server: Auth/Middleware/Secrets | 4 | 6 | 10 | 7 | 27 |
| Server: Handlers/Storage | 3 | 5 | 6 | 5 | 19 |
| Dashboard (React) | 1 | 3 | 5 | 5 | 14 |
| Edge Firmware (C) | 3 | 8 | 8 | 5 | 24 |
| **Deduplicated Total** | **11** | **17** | **24** | **21** | **73** |

> Note: Some findings (CSRF not applied, CORS missing X-CSRF-Token, secureCompare timing) were found by multiple reviewers and are deduplicated in the totals above.

---

## CRITICAL Findings (11)

### CRIT-01: CSRF Middleware Defined But Never Applied
- **Component:** Server
- **Files:** `apis-server/cmd/server/main.go` (routes), `apis-server/internal/middleware/csrf.go`
- **Description:** `CSRFProtection` middleware is fully implemented. CSRF cookies are set on login. But the middleware is **never added to any route group** in `main.go`. Tokens are issued but never validated — complete CSRF bypass.
- **Impact:** Any state-changing endpoint (POST/PUT/DELETE/PATCH) is vulnerable to cross-site request forgery. An attacker can craft a page that causes an authenticated user's browser to delete hives, change settings, create users, etc.
- **Fix:** Add `r.Use(authmw.CSRFProtection)` to protected routes. Add `X-CSRF-Token` to CORS AllowedHeaders.

### CRIT-02: No Token Revocation Mechanism
- **Component:** Server
- **Files:** `apis-server/internal/auth/local_jwt.go:145-147`, `apis-server/internal/middleware/auth.go:487-509`
- **Description:** JWT tokens include a JTI "for revocation support" but no revocation check exists anywhere. Tokens are valid for their full 24h (or 7-day remember-me) lifetime regardless of logout, password change, or account deactivation.
- **Impact:** Compromised tokens cannot be invalidated. Password changes don't protect accounts. Deactivated users keep access.
- **Fix:** Implement token revocation store (DB table or cache) keyed by JTI. Check in auth middleware. Invalidate all user tokens on password change/deactivation/logout.

### CRIT-03: Super-Admin Routes Bypass Tenant Isolation
- **Component:** Server
- **Files:** `apis-server/cmd/server/main.go:480-507`, `apis-server/internal/middleware/superadmin.go:58`
- **Description:** `/api/admin` routes skip `TenantMiddleware`. Super-admin check is based on JWT email claim vs. static env var. In Zitadel mode, if email claims are mutable, privilege escalation is possible.
- **Impact:** A tenant admin could potentially escalate to super-admin by manipulating their Zitadel email claim.
- **Fix:** Validate super-admin against a database record, not just JWT email.

### CRIT-04: CORS Does Not Allow X-CSRF-Token Header
- **Component:** Server
- **File:** `apis-server/cmd/server/main.go:162`
- **Description:** CORS `AllowedHeaders` omits `X-CSRF-Token`. Even when CSRF middleware is enabled, browsers will strip this header from cross-origin requests.
- **Fix:** Add `"X-CSRF-Token"` to AllowedHeaders.

### CRIT-05: Command Injection via File Extension in Transcription
- **Component:** Server
- **File:** `apis-server/internal/handlers/transcribe.go:100-106, 228`
- **Description:** User-supplied filename extension flows into `os.CreateTemp` and then into `exec.Command("ffmpeg", "-i", audioPath, ...)`. No extension whitelist.
- **Fix:** Whitelist allowed extensions (`.webm`, `.wav`, `.mp3`, `.ogg`, `.m4a`). Reject others.

### CRIT-06: OpenAI API Key Exposed in Process Arguments
- **Component:** Server
- **File:** `apis-server/internal/handlers/transcribe.go:287-294`
- **Description:** API key passed as `curl` CLI argument, visible via `ps` or `/proc/<pid>/cmdline`.
- **Fix:** Replace `curl` subprocess with Go `net/http` client for the Whisper API call.

### CRIT-07: Edge Auth Tokens Generated With Predictable PRNG
- **Component:** Edge
- **File:** `apis-edge/src/http/http_server.c:296-306`
- **Description:** `generate_random_token()` uses `srand(time(NULL) ^ getpid())` + `rand()`. Trivially predictable on embedded systems where boot time and PID are guessable.
- **Impact:** Attacker can predict the local auth token and gain full device control, including laser arm/disarm.
- **Fix:** Use `/dev/urandom` (Pi) or `esp_fill_random()` (ESP32).

### CRIT-08: Edge Device Has No TLS — All Communication in Cleartext
- **Component:** Edge
- **Files:** `apis-edge/src/server/server_comm.c:124-218`, `apis-edge/src/upload/clip_uploader.c:324-527`
- **Description:** Heartbeat and clip upload use raw POSIX sockets. API keys sent in `X-API-Key` header over plaintext HTTP. No TLS handshake occurs despite `https://` in default config URL.
- **Impact:** Network observer can steal API keys, inject false config updates, impersonate the server.
- **Fix:** Integrate mbedTLS (Pi) or `esp_tls` (ESP32) for all server communication.

### CRIT-09: Edge Auth Token Logged in Plaintext
- **Component:** Edge
- **File:** `apis-edge/src/http/http_server.c:349`
- **Description:** `LOG_INFO("Local API Token: %s", g_local_auth_token)` — token visible in logs, serial output, and any log forwarding system.
- **Fix:** Display token only via dedicated secure channel (serial during first-time setup), not general logging.

### CRIT-10: DEV_MODE Auth Bypass Can Survive Production Builds
- **Component:** Dashboard
- **Files:** `apis-dashboard/src/config.ts:83`, `apis-dashboard/vite.config.ts:9-13`
- **Description:** `DEV_MODE` fallback reads `VITE_DEV_MODE` env var at build time. Misconfigured build (wrong mode, missing define) bakes auth bypass into production bundle. Dev provider returns `{ authenticated: true }` with admin role.
- **Fix:** Remove `VITE_DEV_MODE` fallback. Only use compile-time `__DEV_MODE__`. Add CI assertion that production bundles contain `false`.

### CRIT-11: Impersonation Endpoints Missing CSRF + Using Raw fetch()
- **Component:** Dashboard
- **Files:** `apis-dashboard/src/pages/admin/TenantDetail.tsx:301-307`, `Tenants.tsx:513-519`
- **Description:** Impersonation POST uses raw `fetch()` bypassing `apiClient` interceptors. No CSRF token sent. Impersonation is the most privileged operation in the system.
- **Fix:** Use `apiClient.post()` instead of raw `fetch()`.

---

## HIGH Findings (17)

| ID | Component | Finding | File(s) |
|----|-----------|---------|---------|
| HIGH-01 | Server | Tenant `set_config` uses `false` (session scope) instead of `true` (transaction scope) — tenant context leaks between pooled connections | `middleware/tenant.go:81` |
| HIGH-02 | Server | `secureCompare` early-exits on length mismatch — use `crypto/subtle.ConstantTimeCompare` | `middleware/csrf.go:163-172` |
| HIGH-03 | Server | Impersonation JWT Subject is super-admin's UserID, not target user — breaks tenant middleware lookup | `auth/local_jwt.go:209-227` |
| HIGH-04 | Server | Logout clears cookie but doesn't invalidate token server-side (valid up to 7 days) | `handlers/auth_local.go:419-443` |
| HIGH-05 | Server | Password change doesn't invalidate existing sessions | `handlers/auth_local.go:646-677` |
| HIGH-06 | Server | Rate limiter is in-memory only — bypassed in multi-instance SaaS deployments | `middleware/ratelimit.go:12-27` |
| HIGH-07 | Server | WebSocket `CheckOrigin` returns `true` for all origins | `handlers/stream.go:28-35` |
| HIGH-08 | Server | Unbounded MJPEG frame buffer — malicious unit can cause OOM | `handlers/stream.go:268-309` |
| HIGH-09 | Server | `/api/admin/clips/purge` not restricted to admin role — any authenticated user can purge | `cmd/server/main.go:408` |
| HIGH-10 | Server | Double connection release race in UnitAuth middleware | `middleware/unitauth.go:45-86` |
| HIGH-11 | Server | `ListSites`, `ListHives`, `ListUnits` return unbounded result sets — no pagination | `handlers/sites.go, hives.go, units.go` |
| HIGH-12 | Dashboard | Background sync uses raw `fetch()` with Bearer token, bypassing apiClient interceptors | `services/backgroundSync.ts:148-159` |
| HIGH-13 | Dashboard | Auth config integrity hash is trivially recomputable — security theater against XSS | `config.ts:27-49` |
| HIGH-14 | Edge | Timing side-channel in `verify_local_auth()` — early return on length mismatch | `http_server.c:374-380` |
| HIGH-15 | Edge | `config_manager_get()` returns raw pointer without lock — torn reads possible | `config_manager.c:659-661` |
| HIGH-16 | Edge | Wildcard CORS `Access-Control-Allow-Origin: *` on all endpoints including `/arm`, `/disarm` | `http_server.c:415, 671-677` |
| HIGH-17 | Edge | Safety layer callbacks invoked under mutex — deadlock risk with laser active | `safety_layer.c:142-158` |

---

## MEDIUM Findings (24)

| ID | Component | Finding |
|----|-----------|---------|
| MED-01 | Server | OpenBao token sent over HTTP by default (`http://localhost:8200`) |
| MED-02 | Server | File-based secrets backend doesn't validate file permissions (0600) |
| MED-03 | Server | `readSecretFile` has potential path traversal (no containment check) |
| MED-04 | Server | `DISABLE_AUTH` guard uses exact `GO_ENV == "production"` check — bypassable |
| MED-05 | Server | `DevAuthMiddleware` grants admin role to all requests |
| MED-06 | Server | Impersonation tenant ID validated only by length (`< 32`), not UUID format |
| MED-07 | Server | JWT expiry validation has zero clock skew tolerance |
| MED-08 | Server | Local JWT `ValidateLocalJWT` doesn't check NotBefore (nbf) claim |
| MED-09 | Server | OpenBao error responses may contain sensitive info in logs |
| MED-10 | Server | Impersonation action tracking uses request context in background goroutine |
| MED-11 | Server | CSV export vulnerable to formula injection (`=`, `+`, `-`, `@` prefixes) |
| MED-12 | Server | SSRF/DNS rebinding gap in `ValidateUnitIP` (TOCTOU between check and connect) |
| MED-13 | Dashboard | Open redirect on Login — `startsWith("/")` doesn't block `//evil.com` |
| MED-14 | Dashboard | Client-side admin tab visibility not server-enforced — Super Admin tab shown to all SaaS users |
| MED-15 | Dashboard | `require()` in Settings.tsx breaks ESM module isolation |
| MED-16 | Dashboard | SiteMapView passes user coordinates directly into external URL |
| MED-17 | Dashboard | Service worker caches API responses (including sensitive data) for 24h with StaleWhileRevalidate |
| MED-18 | Dashboard | LoginForm claims "Protected by ReCaptcha" but no ReCaptcha exists |
| MED-19 | Edge | `localtime()` used without thread safety — use `localtime_r()` |
| MED-20 | Edge | Integer overflow in upload Content-Length calculation |
| MED-21 | Edge | `clip_recorder_start()` returns pointer to static buffer after releasing mutex |
| MED-22 | Edge | `event_logger_log()` has mutex gap between insert and auto-prune |
| MED-23 | Edge | `atoi()` used for Content-Length parsing — no validation, exploitable via negative values |
| MED-24 | Edge | No path traversal protection on clip paths in uploader/storage |

---

## LOW Findings (21)

| ID | Component | Finding |
|----|-----------|---------|
| LOW-01 | Server | JWT secret minimum 32 chars (NIST minimum) — consider 64 |
| LOW-02 | Server | Password policy allows 8-char all-lowercase (no breach DB check) |
| LOW-03 | Server | Login handler leaks timing info about user existence (bcrypt vs immediate return) |
| LOW-04 | Server | Common passwords list only ~1000 entries (industry standard: 10K+) |
| LOW-05 | Server | `AllowCredentials: true` with potentially broad CORS origins |
| LOW-06 | Server | Missing HSTS, CSP, Referrer-Policy, Permissions-Policy headers |
| LOW-07 | Server | Secrets test uses `SECRETS_SOURCE` but code reads `SECRETS_BACKEND` |
| LOW-08 | Server | No limit on inspection frames per inspection |
| LOW-09 | Server | Hive ID disclosed in export error messages (IDOR enumeration) |
| LOW-10 | Server | `RequireConn` panics on nil (vs graceful error) |
| LOW-11 | Server | Content-Disposition header injection possible via clip ID |
| LOW-12 | Server | Bearer token parsing has fragile string slicing logic |
| LOW-13 | Dashboard | Auth config in sessionStorage enables downgrade attacks |
| LOW-14 | Dashboard | Verbose console logging in auth cleanup service |
| LOW-15 | Dashboard | `user.avatar` URL not validated (tracking pixel risk) |
| LOW-16 | Dashboard | No HTTPS enforcement warning in API client for production |
| LOW-17 | Dashboard | WebSocket unitId not validated before URL construction |
| LOW-18 | Edge | Silent hostname truncation in `http_parse_url()` |
| LOW-19 | Edge | `gmtime()` used without thread safety |
| LOW-20 | Edge | MJPEG stream blocks single-threaded server indefinitely |
| LOW-21 | Edge | Upload queue file not written atomically (power loss risk) |

---

## Positive Security Observations

Despite the findings, several good security patterns are already in place:

1. **In-memory OIDC token storage** (dashboard) — `InMemoryWebStorage` instead of localStorage
2. **Error sanitization** (dashboard) — JWT/API key redaction from error messages
3. **No `dangerouslySetInnerHTML`** across the entire React codebase
4. **Auth endpoint exclusion from service worker cache** — `NetworkOnly` for auth routes
5. **Comprehensive auth cleanup on logout** — IndexedDB, sessionStorage, localStorage, SW caches
6. **URL validation utilities** — blocking `javascript:`, `vbscript:`, `data:`, `//` protocols
7. **Cookie-based session in local mode** — `credentials: 'include'` instead of localStorage tokens
8. **Safety layer architecture** (edge) — laser calls route through safety enforcement
9. **Config atomic writes** (edge) — `config_manager_save()` uses temp file + rename
10. **Parameterized SQL queries** throughout the storage layer (no string concatenation)

---

## Priority Remediation Roadmap

### P0 — Fix Before Any Production Deployment

| # | Finding | Effort | Impact |
|---|---------|--------|--------|
| 1 | CRIT-01: Wire up CSRFProtection middleware + CRIT-04: CORS header | Small | Fixes entire CSRF attack surface |
| 2 | CRIT-02: Implement token revocation + HIGH-04/05: Invalidate on logout/password change | Medium | Closes session lifecycle gaps |
| 3 | CRIT-05: Whitelist transcription file extensions | Small | Closes command injection |
| 4 | CRIT-06: Replace curl subprocess with Go net/http | Small | Stops API key leakage |
| 5 | CRIT-07: Use cryptographic PRNG for edge auth tokens | Small | Prevents token prediction |
| 6 | CRIT-08: Implement TLS in edge communication | Large | Prevents credential theft |
| 7 | HIGH-01: Fix `set_config` to transaction scope (`true`) | Tiny | Prevents tenant data leakage |
| 8 | HIGH-09: Move clip purge behind admin middleware | Tiny | Prevents unauthorized data deletion |

### P1 — Fix Before Multi-User/SaaS Deployment

| # | Finding | Effort |
|---|---------|--------|
| 1 | CRIT-03: Database-backed super-admin validation | Medium |
| 2 | HIGH-06: Distributed rate limiting (Redis backend) | Medium |
| 3 | HIGH-07: Validate WebSocket origins | Small |
| 4 | HIGH-08: Cap MJPEG frame buffer size | Small |
| 5 | HIGH-11: Add pagination to unbounded list endpoints | Medium |
| 6 | HIGH-16: Restrict edge CORS to dashboard origin | Small |
| 7 | HIGH-17: Fix safety layer deadlock (invoke callbacks outside mutex) | Medium |
| 8 | MED-11: CSV formula injection protection | Small |
| 9 | MED-12: Fix SSRF/DNS rebinding in stream proxy | Medium |

### P2 — Harden Before Public Internet Exposure

| # | Finding | Effort |
|---|---------|--------|
| 1 | CRIT-09: Remove auth token from general logging | Tiny |
| 2 | CRIT-10: Eliminate DEV_MODE runtime fallback | Small |
| 3 | CRIT-11: Fix impersonation to use apiClient | Small |
| 4 | HIGH-14: Fix edge timing side-channel | Small |
| 5 | HIGH-15: Lock-protected config snapshots | Small |
| 6 | MED-04/05: Tighten DISABLE_AUTH guard | Small |
| 7 | LOW-06: Add security headers (HSTS, CSP, Referrer-Policy) | Small |

---

## Comparison with Prior Audit (2026-01-31)

| Metric | V2 Audit (Jan 31) | This Review (Feb 6) |
|--------|-------------------|---------------------|
| Total findings | 77 | 73 |
| Critical | 12 (4 remaining) | 11 |
| Resolved from V2 | 58 (75.3%) | — |
| **New findings not in V2** | — | ~25 |

Key new findings not in the V2 audit:
- CSRF middleware never wired up (may have been "resolved" by writing the middleware, but it was never applied)
- Token revocation completely absent
- Transcription command injection + API key exposure
- CSV formula injection
- Several edge firmware race conditions and deadlock risks
- Dashboard impersonation CSRF bypass

---

*Report generated 2026-02-06 by Claude Opus 4.6. Full agent transcripts available in `/private/tmp/claude-501/` task output files.*
