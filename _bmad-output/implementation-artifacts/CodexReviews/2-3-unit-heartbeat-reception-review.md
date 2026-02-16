# Code Review: Story 2.3 Unit Heartbeat Reception

**Review Date:** 2026-01-26  
**Reviewer:** Codex (GPT-5.2)  
**Story File:** `_bmad-output/implementation-artifacts/2-3-unit-heartbeat-reception.md`

## Story Verdict

- **Score:** 6.0 / 10
- **Verdict:** **CONCERNS**
- **Rationale:** Heartbeat updates and telemetry persistence are implemented, but the story’s handler tests are currently inconsistent with the `TrustProxyHeaders` security default (`apis-server/internal/handlers/units_test.go:281-287` `X-Forwarded-For ... assert.Equal(...)` vs `apis-server/internal/handlers/units.go:458-469` `TrustProxyHeaders = false`).

---

## Acceptance Criteria Verification

| AC | Status | Evidence | Notes |
|---|---|---|---|
| AC1: Valid API key → 200 + server_time; last_seen updated; ip_address recorded | Implemented | `apis-server/cmd/server/main.go:335-343` `r.Use(authmw.UnitAuth(...))` + `apis-server/internal/handlers/units.go:411-423` `ip := extractClientIP` + `UpdateUnitHeartbeat(..., ip, ...)` + `apis-server/internal/storage/units.go:356` `last_seen = NOW(), ip_address = $2, status = 'online'` + `apis-server/internal/handlers/units.go:430-434` `ServerTime: ... Format(time.RFC3339)` | IP source depends on `TrustProxyHeaders` (`apis-server/internal/handlers/units.go:458-463` `only RemoteAddr is used`). |
| AC2: Telemetry payload fields persist to unit record | Implemented | `apis-server/internal/storage/migrations/0006_unit_telemetry.sql:7-9` `uptime_seconds ... cpu_temp ... free_heap` + `apis-server/internal/handlers/units.go:415-420` `HeartbeatInput{ ... UptimeSeconds ... CPUTemp ... FreeHeap }` + `apis-server/internal/storage/units.go:368-387` `, uptime_seconds = ... cpu_temp = ... free_heap = ...` | DetectionCountSince is parsed but intentionally not stored (`apis-server/internal/storage/migrations/0006_unit_telemetry.sql:11-13` `not stored per-unit`). |
| AC3: Invalid API key → 401; no DB update | Implemented | `apis-server/internal/middleware/unitauth.go:53-57` `Invalid API key ... StatusUnauthorized` | DB update path is behind UnitAuth and only runs on success (`apis-server/internal/handlers/units.go:386-392` `Authentication required` when unit missing). |
| AC4: Successful heartbeat sets status to online | Implemented | `apis-server/internal/storage/units.go:356` `status = 'online'` | There is no symmetric auto-offline mechanism here; offline threshold is handled (if at all) elsewhere. |

---

## Findings

**F1: Heartbeat IP extraction tests contradict the default security posture (and break `go test`)**  
- Severity: High  
- Category: Testing / Reliability  
- Evidence: `apis-server/internal/handlers/units_test.go:282-287` `req.Header.Set("X-Forwarded-For", ...)` + `assert.Equal(... "203.0.113.50")` vs `apis-server/internal/handlers/units.go:458-469` `TrustProxyHeaders = false` / `if TrustProxyHeaders { ... }`  
- Why it matters: This creates a false sense of coverage and can block CI; it also makes it unclear which behavior is intended by default.  
- Recommended fix: Update tests to cover both modes explicitly: set `TrustProxyHeaders = true` when validating XFF/X-Real-IP behavior, and add tests verifying RemoteAddr behavior when false.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given `TrustProxyHeaders=false`, when `X-Forwarded-For` is set, then `extractClientIP` returns `RemoteAddr` host.
  - AC2: Given `TrustProxyHeaders=true`, when `X-Forwarded-For` is set, then it returns the first forwarded IP.
  - Tests/Verification: run `go test ./internal/handlers -run ExtractClientIP`.  
- “Out of scope?”: no

**F2: `TrustProxyHeaders` is a global mutable toggle without a runtime configuration path**  
- Severity: Medium  
- Category: Reliability / Maintainability  
- Evidence: `apis-server/internal/handlers/units.go:454-458` `var TrustProxyHeaders = false`  
- Why it matters: Global mutable state complicates tests and deployments; behind a real reverse proxy, operators need a clear, deterministic way to enable trusted header parsing.  
- Recommended fix: Make this an environment-driven setting wired at startup (e.g., `TRUST_PROXY_HEADERS=true`) and pass it into the handler or wrap `extractClientIP` behind an injected config.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given `TRUST_PROXY_HEADERS=true`, when the server starts, then heartbeat IP extraction uses `X-Forwarded-For`/`X-Real-IP`.
  - AC2: Given `TRUST_PROXY_HEADERS` unset/false, when the server starts, then only `RemoteAddr` is used.
  - Tests/Verification: unit test both modes; smoke test heartbeat behind a proxy.  
- “Out of scope?”: no

**F3: Heartbeat handler silently ignores invalid JSON bodies (may mask device bugs)**  
- Severity: Medium  
- Category: Correctness / Observability  
- Evidence: `apis-server/internal/handlers/units.go:402-408` `Decode(&req); ... Log but don't fail - body is optional`  
- Why it matters: If a unit firmware bug starts sending malformed JSON, the server will still mark the unit online and update last_seen, making it harder to detect broken telemetry quickly.  
- Recommended fix: If `Content-Length > 0` and decoding fails, return `400 Bad Request` (or at least include an explicit error response while still allowing empty bodies).  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given a non-empty request body with invalid JSON, when `/api/units/heartbeat` is called, then it returns `400` and does not update the unit record.
  - AC2: Given an empty body, when the endpoint is called, then it returns `200` and updates last_seen/ip/status.
  - Tests/Verification: add handler tests for invalid JSON; run `go test ./internal/handlers -run Heartbeat`.  
- “Out of scope?”: no

---

## Story Score Breakdown (0–2 each)

- **AC completeness:** 2.0 / 2 (core DB update + server_time response implemented; `apis-server/internal/storage/units.go:356` `last_seen = NOW()` + `apis-server/internal/handlers/units.go:430-434` `ServerTime`)  
- **Correctness / edge cases:** 1.5 / 2 (time drift calculation is optional and safe; `apis-server/internal/handlers/units.go:437-443` `TimeDriftMs`)  
- **Security / privacy / secrets:** 1.5 / 2 (defaults to non-spoofable `RemoteAddr`; `apis-server/internal/handlers/units.go:456-463` `only RemoteAddr is used`)  
- **Testing / verification:** 0.5 / 2 (tests exist but are currently contradictory to the default behavior; `apis-server/internal/handlers/units_test.go:281-287` `X-Forwarded-For...`)  
- **Maintainability / clarity / docs:** 0.5 / 2 (global toggle without clear config path; `apis-server/internal/handlers/units.go:454-458` `TrustProxyHeaders`)  

## What I Could Not Verify (story-specific)

- Actual DB updates and RLS behavior during heartbeat require a running DB and unit auth flow (`apis-server/internal/middleware/unitauth.go:60-66` `SET LOCAL app.tenant_id = $1`).  
- Real-world client IP behavior behind the intended reverse proxy (needs deployment topology and header stripping guarantees; `apis-server/internal/handlers/units.go:465-467` `Only enable ... behind a reverse proxy`).  
