# APIS Full Codebase Review — Synthesis Report

**Date:** 2026-02-06
**Reviewer:** Claude Opus 4.6 (automated, 8 parallel review streams + synthesis)
**Scope:** Full codebase — Go server (116 files), React dashboard (220+ files), C edge firmware (31K lines)

---

## Executive Summary

This comprehensive review across 8 parallel streams identified **168 findings** spanning all three components. After deduplication (3 duplicates removed), there are **165 unique findings**: **14 CRITICAL**, **37 HIGH**, **59 MEDIUM**, **49 LOW**, and **22 INFO**.

The most dangerous findings are in the **edge firmware safety layer** — 5 deadlock bugs that can render the entire laser safety system inoperative. The **server** has authentication bypass vulnerabilities and data layer correctness issues. The **dashboard** has missing authorization guards and offline data integrity risks.

### Severity Distribution by Component

| Component | CRITICAL | HIGH | MEDIUM | LOW | INFO | Total |
|-----------|----------|------|--------|-----|------|-------|
| Go Server | 5 | 17 | 31 | 23 | 14 | 90 |
| React Dashboard | 4 | 11 | 20 | 18 | 13 | 66 |
| Edge Firmware | 8 | 12 | 16 | 14 | 10 | 60 |
| **Cross-cutting** | -3 | -3 | 0 | -6 | -4 | -16 |
| **Total (deduplicated)** | **14** | **37** | **59** | **49** | **22** | **165** |

*Note: Negative cross-cutting row represents deduplication of findings reported by multiple streams.*

---

## Deduplicated Findings

The following findings were reported by multiple streams and are counted only once:

| Finding | Streams | Counted Under |
|---------|---------|---------------|
| `string(rune())` Retry-After corruption (`errors.go:194`) | S1-C1, S3A-C1, S3B-C1 | Server Auth (S1-C1) |
| X-Forwarded-For IP spoofing in rate limiting | S1-H4, S3B-M5 | Server Auth (S1-H4) |
| Token revocation in-memory only | S1-H3, S2-M13 | Server Auth (S1-H3) |

---

## Priority 0 — Fix Immediately (Physical Safety / Auth Bypass)

These findings pose immediate risk of physical harm or complete security bypass.

### P0-1: Edge Safety Layer Deadlocks (5 bugs) — LASER SAFETY
**Stream 7: C7-CRIT-001 through C7-CRIT-004**
- `safety_layer.c`: `notify_failure()`, `notify_watchdog_warning()`, and `set_state_internal()` re-acquire `safety_mutex` while callers already hold it → **deadlock on every safety check failure**
- `laser_controller.c`: `set_state()` invokes callback while holding `g_mutex` → same deadlock pattern
- **Impact:** If any callback is registered, the first safety violation deadlocks the safety system. The laser remains in whatever state it was in, with no further safety enforcement.
- **Fix:** Copy callback pointer under lock, invoke outside lock (the "copy-under-lock" pattern already used correctly in targeting's timeout callback).

### P0-2: Targeting Bypasses Safety Audit Trail
**Stream 7: C7-CRIT-005**
- `targeting.c` calls `laser_controller_off()` directly at 4 locations instead of `safety_laser_off()`
- **Impact:** Laser deactivation not recorded by safety layer, breaking audit trail and potentially allowing state inconsistency between safety layer and laser controller.

### P0-3: DISABLE_AUTH Bypass When GO_ENV Unset
**Stream 1: C-2**
- `middleware/auth.go:597`: `goEnv != ""` condition means auth bypass works when `GO_ENV` is simply not set (common in production containers).
- **Fix:** Remove `&& goEnv != ""` — only allow DISABLE_AUTH in explicit `development` or `test` environments.

### P0-4: TLS Verification Disabled + Silent HTTP Fallback
**Stream 8: C-01 + H-01**
- `tls_client.c:234`: Certificate verification set to `MBEDTLS_SSL_VERIFY_OPTIONAL`
- `server_comm.c:327-334`: Silent HTTPS→HTTP fallback on TLS failure
- **Impact:** Combined effect: API keys transmitted in plaintext to any MITM attacker. The device will happily connect to an impersonator.

---

## Priority 1 — Fix Before Release (Security / Data Integrity)

### Server Authentication & Authorization

| ID | Finding | File:Line | Severity |
|----|---------|-----------|----------|
| S1-C1 | `string(rune())` corrupts Retry-After header | `errors.go:194` | CRITICAL |
| S1-H1 | Logout in public routes group — token revocation silently fails | `main.go:202` | HIGH |
| S1-H2 | Bcrypt cost mismatch enables user enumeration timing attack | `password.go:89` | HIGH |
| S4-C1 | Admin routes have no client-side role guard | `App.tsx:269-272` | CRITICAL |
| S4-C2 | OIDC callback doesn't validate returnTo (open redirect) | `Callback.tsx:38-40` | CRITICAL |
| S3B-H1 | SSRF via Ollama endpoint — internal network access | `settings_beebrain.go:333-358` | HIGH |
| S3B-H2 | Invite tokens fully exposed in ListInvites response | `invite.go:640-673` | HIGH |

### Server Data Layer

| ID | Finding | File:Line | Severity |
|----|---------|-----------|----------|
| S2-C2 | AdminListAllTenants references nonexistent columns → runtime SQL error | `admin.go` | CRITICAL |
| S2-C3 | ListAuditLog selects renamed column → runtime SQL error | `audit_log.go` | CRITICAL |
| S2-H7 | Missing `FORCE ROW LEVEL SECURITY` on all tables except users | All migrations | HIGH |
| S2-H1 | Non-atomic hive creation (queen history outside transaction) | `hives.go` | HIGH |
| S2-H4 | TOCTOU races in 5+ update functions (read-then-write) | Multiple | HIGH |
| S2-H5 | UpdateHive RETURNING missing `status` and `lost_at` fields | `hives.go` | HIGH |

### Edge Firmware

| ID | Finding | File:Line | Severity |
|----|---------|-----------|----------|
| S8-C2 | CORS origin reflected without validation | `http_server.c:579-591` | CRITICAL |
| S8-C3 | `config_manager_get()` returns raw pointer without locking | `config_manager.c:665-667` | CRITICAL |
| S8-H5 | `rand()` fallback for auth token generation | `http_server.c:322-334` | HIGH |
| S7-H1-H4 | Lock ordering violations + callbacks under lock (6 findings) | Multiple | HIGH |

### Dashboard

| ID | Finding | File:Line | Severity |
|----|---------|-----------|----------|
| S6-C1 | `clearAllCache` doesn't clear tasks/sync_queue → cross-user data leakage | `offlineCache.ts:325-336` | CRITICAL |
| S6-C2 | Non-atomic delete-then-put in `markAsSynced` → data loss on crash | `offlineInspection.ts:282-325` | CRITICAL |
| S4-H2 | Service worker caches API data across user sessions | `vite.config.ts:77-88` | HIGH |
| S4-H3 | DEV_MODE enabled in non-production build modes | `vite.config.ts:13` | HIGH |

---

## Priority 2 — Fix in Next Sprint (Reliability / Code Quality)

### Systemic Patterns Identified

These are recurring issues found across multiple files/components that warrant systematic remediation:

#### Pattern A: Missing Request Body Size Limits (Server)
**Streams 3A, 3B** — Most JSON-parsing handlers lack `http.MaxBytesReader`. The security middleware applies a global 10MB limit, but individual endpoints handling small payloads (labels, settings, tasks) should have tighter limits.
- **Affected:** ~20+ handler functions
- **Fix:** Add per-endpoint body size limits using the existing `MaxBodySize` middleware.

#### Pattern B: Hook Pattern Non-Compliance (Dashboard)
**Stream 5: H-1** — ~30 of 54 hooks are missing the `isMountedRef` cleanup pattern required by CLAUDE.md.
- **Risk:** Memory leaks and "setState on unmounted component" warnings.
- **Fix:** Create a `useIsMounted()` utility hook and retrofit all non-compliant hooks.

#### Pattern C: Non-Atomic Database Operations (Server)
**Stream 2: H1, H2, H4** — Multiple storage functions perform read-then-write without transactions, creating TOCTOU race conditions.
- **Affected:** Hive creation, label rename, hive field increment/decrement, 5+ update functions
- **Fix:** Wrap related operations in database transactions.

#### Pattern D: Callback-Under-Lock Anti-Pattern (Edge)
**Streams 7, 8** — Safety layer, laser controller, servo controller, button handler, and targeting all invoke user callbacks while holding their respective mutexes.
- **Risk:** Deadlocks when callbacks interact with other locked modules.
- **Fix:** Copy function pointer under lock, release lock, then invoke callback.

#### Pattern E: Test Quality Gap (Server)
**Stream 2** — Test quality rated 2/10. Most storage tests only verify struct field assignment, not actual database operations. **Stream 3B** — 7 of 18 test files contain "documentation tests" that validate expectations rather than behavior.
- **Fix:** Replace mock tests with integration tests using testcontainers or in-memory PostgreSQL.

#### Pattern F: pthread Usage in Shared Code (Edge)
**Stream 8: H-02** — `storage_manager.c`, `event_logger.c`, `clip_recorder.c` use `pthread` directly instead of HAL abstraction. Won't compile on ESP32.
- **Fix:** Replace with HAL thread/mutex primitives or conditional compilation.

---

## Priority 3 — Address When Convenient (Medium Severity)

### Server (31 Medium findings across Streams 1, 2, 3A, 3B)

Key themes:
- **JWT validation gaps** — No clock skew on expiry, no issuer validation, no audience claim
- **Rate limiter lifecycle** — Goroutine leaks in older rate limiters, Redis fail-open
- **Pagination gaps** — Missing limits on several list endpoints, unbounded `hive_ids` arrays
- **Memory/pooling** — Global mutable DB pool, hardcoded pool config, double-buffered clip uploads
- **Audit logging** — Uses `context.Background()` losing tenant context, `X-Forwarded-For` spoofable

### Dashboard (20 Medium findings across Streams 4, 5, 6)

Key themes:
- **Zitadel config race** — UserManager initialized at module load before `fetchAuthConfig()` completes
- **Token refresh race** — No coordination for concurrent 401 → refresh → retry
- **God components** — HiveDetail (756 lines), Settings (1040 lines), Tenants (997 lines)
- **Code duplication** — Repeated patterns across hooks and components
- **Offline sync gaps** — Tasks table missing from storage calculations, no max retry count, dual sync-on-reconnect race

### Edge (16 Medium findings across Streams 7, 8)

Key themes:
- **Detection pipeline** — No thread safety, flood fill stack overflow silently corrupts results
- **Storage** — Rate limit table exhaustion, `SQLITE_STATIC` fragility, `_Thread_local` ESP32 compat
- **Timer/memory** — `localtime()` not thread-safe, static buffer TOCTOU, VACUUM under mutex

---

## Stream Reports

| Stream | Report File | Files Reviewed | Findings |
|--------|-------------|----------------|----------|
| 1 — Server Auth/Security | `review-stream-1-auth-security.md` | 34 | 2C, 4H, 5M, 4L, 2I |
| 2 — Server Data Layer | `review-stream-2-data-layer.md` | 81 | 3C, 7H, 14M, 7L |
| 3A — Core Handlers | `review-stream-3a-core-handlers.md` | 28 | 1C, 3H, 6M, 7L, 5I |
| 3B — Extended Handlers | `review-stream-3b-extended-handlers.md` | 42 | 1C, 3H, 6M, 5L, 5I |
| 4 — Dashboard Auth/Routing | `review-stream-4-dashboard-auth.md` | 44 | 2C, 4H, 5M, 5L, 7I |
| 5 — Dashboard Components | `review-stream-5-dashboard-components.md` | 100+ | 0C, 4H, 8M, 7L, 3I |
| 6 — Dashboard Offline/PWA | `review-stream-6-dashboard-offline.md` | 23 | 2C, 3H, 7M, 6L |
| 7 — Edge Safety/Targeting | `review-stream-7-edge-safety.md` | 28 | 5C, 6H, 8M, 7L, 5I |
| 8 — Edge Comms/Storage | `review-stream-8-edge-comms.md` | 57 | 3C, 6H, 8M, 7L, 5I |

---

## Recommended Remediation Order

### Phase 1: Safety & Auth (1-2 days)
1. Fix 5 safety layer deadlocks (P0-1) — **highest priority, physical safety**
2. Fix targeting safety bypass (P0-2)
3. Fix DISABLE_AUTH guard (P0-3) — one-line fix
4. Fix TLS verification + HTTP fallback (P0-4)
5. Fix `string(rune())` bug (S1-C1) — one-line fix
6. Move logout to protected routes (S1-H1)
7. Add admin route role guards (S4-C1)
8. Fix OIDC callback open redirect (S4-C2)

### Phase 2: Data Integrity & Security (2-3 days)
9. Fix runtime SQL errors from column mismatches (S2-C2, S2-C3)
10. Add `FORCE ROW LEVEL SECURITY` to all tables (S2-H7)
11. Fix CORS origin validation on edge HTTP server (S8-C2)
12. Fix config_manager raw pointer race (S8-C3)
13. Fix clearAllCache to include tasks/sync_queue (S6-C1)
14. Fix non-atomic markAsSynced (S6-C2)
15. Fix SSRF in Ollama endpoint validation (S3B-H1)
16. Fix invite token exposure (S3B-H2)
17. Fix SW API caching across sessions (S4-H2)

### Phase 3: Systematic Patterns (3-5 days)
18. Wrap non-atomic DB operations in transactions (Pattern C)
19. Fix callback-under-lock pattern in edge firmware (Pattern D)
20. Replace pthread with HAL primitives (Pattern F)
21. Add `useIsMounted()` utility and retrofit 30 hooks (Pattern B)
22. Add per-endpoint body size limits (Pattern A)
23. Fix bcrypt cost mismatch for timing resistance (S1-H2)
24. Fix rand() auth token generation (S8-H5)

### Phase 4: Quality & Reliability (ongoing)
25. Improve test quality — replace mock tests with integration tests (Pattern E)
26. Refactor god components (Settings, HiveDetail, Tenants)
27. Fix remaining Medium/Low findings from individual stream reports

---

## Positive Observations

Across all streams, reviewers noted several well-implemented security measures:

1. **Algorithm confusion prevention** in JWT validation (HS256 only)
2. **CSRF double-submit cookie** with constant-time comparison
3. **Compound rate limiting** (per-email + per-IP + lockout)
4. **Tenant isolation via PostgreSQL RLS** with defense-in-depth checks
5. **Password validation** with bcrypt, common password dictionary, and length limits
6. **Comprehensive security headers** (CSP, HSTS, X-Frame-Options, etc.)
7. **Path traversal protection** in secrets and file handling
8. **Super admin middleware** that returns 404 to hide endpoint existence
9. **SSRF protection** in stream proxy handler
10. **CSV injection prevention** in export handler
11. **Error sanitization framework** that redacts internal details
12. **`_Static_assert`** for compile-time safety validation in edge firmware
13. **Servo tilt hard-limits** preventing physical over-rotation
14. **In-memory OIDC token storage** preventing XSS token theft
15. **Comprehensive auth cleanup on logout** clearing IndexedDB, SW caches, storage
