# Epic 2 Code Review Summary

**Review Date:** 2026-01-26  
**Reviewer:** Codex (GPT-5.2)  
**Epic:** 2

## Executive Summary

- **Overall verdict:** **FAIL**
- **Overall score:** 4.7 / 10
- **Per-epic scores + verdicts:**
  - **Epic 2:** 4.7 / 10 — **FAIL**
- **Top 5 cross-cutting risks (ranked):**
  1. **Live stream cannot authenticate from the browser** → feature is effectively broken until WS auth is redesigned (`apis-server/internal/middleware/auth.go:246` `authHeader := r.Header.Get("Authorization")` + `apis-dashboard/src/components/LiveStream.tsx:57` `const ws = new WebSocket(wsUrl);`).  
  2. **Unit “offline after 120s” is not implemented** → dashboard can show stale “online” status indefinitely (`apis-server/internal/storage/units.go:356` `status = 'online'` + `apis-dashboard/src/components/UnitStatusCard.tsx:74` `if (status === 'offline')`).  
  3. **“Disarmed” state is not representable** → UI maps `error → Disarmed`, but there is no `armed` field or clear way to produce `error` (`apis-dashboard/src/components/UnitStatusCard.tsx:49` `case 'error': ... label: 'Disarmed'` + `apis-server/internal/storage/migrations/0005_units.sql:16` `status TEXT DEFAULT 'offline'`).  
  4. **Security hardening gaps around WS streaming** → `CheckOrigin` allows all origins and MJPEG parsing buffers until `FFD9` (DoS/CSWSH risk depending on auth choice) (`apis-server/internal/handlers/stream.go:30` `return true` + `apis-server/internal/handlers/stream.go:199` `for { ... frame.WriteByte(b) ... }`).  
  5. **Testing/requirements drift reduces confidence** → story artifacts claim middleware tests that aren’t present, and heartbeat IP extraction tests conflict with secure defaults (`_bmad-output/implementation-artifacts/2-2-register-apis-units.md:110` `unitauth_test.go` + `apis-server/internal/handlers/units.go:458` `TrustProxyHeaders = false`).  
- **Remediation priorities:**
  - **Do first:** Fix WS auth for `/ws/stream/{id}` and lock down Origin checks (`apis-server/cmd/server/main.go:174` `r.Get("/ws/stream/{id}", handlers.Stream)`).  
  - **Do next:** Implement unit status semantics: offline threshold + `armed` flag end-to-end (DB→API→UI) (`apis-server/internal/storage/units.go:356` `status = 'online'`).  
  - **Nice-to-have:** Improve test coverage (DB/RLS integration tests) and remove DOM `innerHTML` fallbacks in map components (`apis-dashboard/src/components/SiteMapThumbnail.tsx:92` `innerHTML =`).

| Epic | Story | Title | Score (0–10) | Verdict | Critical | High | Med | Low |
|-----:|------:|-------|-------------:|--------|---------:|-----:|----:|----:|
| 2 | 2-1 | Create and Manage Sites | 7.0 | CONCERNS | 0 | 1 | 1 | 1 |
| 2 | 2-2 | Register APIS Units | 4.0 | FAIL | 1 | 0 | 2 | 0 |
| 2 | 2-3 | Unit Heartbeat Reception | 6.0 | CONCERNS | 0 | 1 | 2 | 0 |
| 2 | 2-4 | Unit Status Dashboard Cards | 3.5 | FAIL | 1 | 1 | 1 | 0 |
| 2 | 2-5 | Live Video WebSocket Proxy | 3.0 | FAIL | 1 | 1 | 1 | 0 |

**What I Could Not Verify (and why)**  
- End-to-end device auth: a real unit key, real heartbeat, and DB updates (requires running DB + a device or client using `X-API-Key`; `apis-server/cmd/server/main.go:339` `r.Use(authmw.UnitAuth(...))`).  
- “Old API key stops working immediately” after regeneration (needs runtime requests with old vs new key; `apis-server/internal/storage/units.go:312` `UPDATE units SET api_key_hash = ...`).  
- Live stream latency and MJPEG compatibility against the actual unit endpoint (requires a real MJPEG source at `http://<unit-ip>:8080/stream`; `apis-server/internal/handlers/stream.go:112` `http://%s:8080/stream`).  

---

## Epic-Level “AI Fix Backlog”

### E01 — Critical — Make WebSocket streaming authenticate in browsers
- **Applies to stories:** 2-5
- **Evidence:** `apis-server/internal/middleware/auth.go:246` `authHeader := r.Header.Get("Authorization")` + `apis-dashboard/src/components/LiveStream.tsx:57` `new WebSocket(wsUrl)`  
- **Files likely touched:** `apis-server/cmd/server/main.go`, `apis-server/internal/handlers/stream.go`, `apis-server/internal/middleware/*`, `apis-dashboard/src/components/LiveStream.tsx`
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** a logged-in dashboard user **When** it opens `wss://.../ws/stream/{unitId}` **Then** the server authenticates the WS handshake without requiring an `Authorization` header.
  - **Given** an unauthenticated client **When** it opens the same WS **Then** it is rejected (HTTP 401 during upgrade, or close with an auth failure code) and no unit stream is proxied.
- **Verification steps:** add a Go integration test for WS handshake; manual: open Unit Detail → click “View Live Feed” and confirm frames render.

### E02 — High — Restrict WebSocket Origin and/or host allowlist
- **Applies to stories:** 2-5
- **Evidence:** `apis-server/internal/handlers/stream.go:30` `CheckOrigin: func(...) bool { return true }`  
- **Files likely touched:** `apis-server/internal/handlers/stream.go`, `apis-server/cmd/server/main.go`, config/env docs
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** an Origin not on the allowlist **When** a WS upgrade is attempted **Then** it is rejected.
  - **Given** an allowlisted Origin **When** a WS upgrade is attempted **Then** it succeeds (assuming auth passes).
- **Verification steps:** `go test ./...` (new unit tests around origin check); validate with a browser + a non-allowed Origin.

### E03 — Critical — Implement “offline after 120s” semantics in `/api/units`
- **Applies to stories:** 2-3, 2-4
- **Evidence:** `apis-server/internal/storage/units.go:356` `status = 'online'` (no thresholding)  
- **Files likely touched:** `apis-server/internal/storage/units.go`, `apis-server/internal/handlers/units.go`, `apis-dashboard/src/components/UnitStatusCard.tsx`
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** a unit has `last_seen` older than 120 seconds **When** `GET /api/units` is called **Then** the unit is returned as `status: "offline"`.
  - **Given** a unit heartbeats **When** it sends `POST /api/units/heartbeat` **Then** subsequent `GET /api/units` returns it as `status: "online"`.
- **Verification steps:** DB-backed integration test; manual: stop heartbeats and confirm status flips after 120s.

### E04 — High — Add an explicit `armed` field and propagate it end-to-end
- **Applies to stories:** 2-3, 2-4
- **Evidence:** `apis-dashboard/src/components/UnitStatusCard.tsx:49` `case 'error': ... label: 'Disarmed'` (no backend source-of-truth)  
- **Files likely touched:** `apis-server/internal/storage/migrations/*` (new), `apis-server/internal/storage/units.go`, `apis-server/internal/handlers/units.go`, `apis-dashboard/src/components/UnitStatusCard.tsx`, `apis-dashboard/tests/components/UnitStatusCard.test.tsx`
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** a unit is online and `armed=true` **When** the dashboard renders cards **Then** it shows green “Armed”.
  - **Given** a unit is online and `armed=false` **When** the dashboard renders cards **Then** it shows yellow “Disarmed”.
- **Verification steps:** `go test ./...`; `npx vitest run tests/components/UnitStatusCard.test.tsx`.

### E05 — High — Implement “Units at this Site” list on Site Detail
- **Applies to stories:** 2-1
- **Evidence:** `apis-dashboard/src/pages/SiteDetail.tsx:399` `Units section - placeholder`  
- **Files likely touched:** `apis-dashboard/src/pages/SiteDetail.tsx`, `apis-server/internal/handlers/units.go` (filter), `apis-server/internal/storage/units.go`
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** a site has units assigned **When** I open site detail **Then** I see those units listed with status and a link to each unit detail.
  - **Given** a site has no units **When** I open site detail **Then** I see an empty state (current behavior acceptable).
- **Verification steps:** `npx vitest run tests/pages/SiteDetail.test.tsx` (update/add assertions).

### E06 — Medium — Support `GET /api/units?site_id=...` filtering (or remove the param)
- **Applies to stories:** 2-4 (and unblocks E05 UX)
- **Evidence:** `apis-dashboard/src/pages/Dashboard.tsx:160` ``selectedSiteId ? `/units?site_id=${selectedSiteId}` : '/units'`` + `apis-server/internal/handlers/units.go:105` `func ListUnits(...)` (no query parsing)  
- **Files likely touched:** `apis-server/internal/handlers/units.go`, `apis-server/internal/storage/units.go`, `apis-dashboard/src/pages/Dashboard.tsx`
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** `site_id` is provided **When** `GET /api/units` is called **Then** only units with that `site_id` are returned.
  - **Given** `site_id` is omitted **When** called **Then** all tenant units are returned.
- **Verification steps:** `go test ./internal/handlers -run ListUnits`; manual: Dashboard site selector filters unit cards.

### E07 — Critical — Add missing UnitAuth middleware tests (and align story tracking)
- **Applies to stories:** 2-2, 2-3
- **Evidence:** `_bmad-output/implementation-artifacts/2-2-register-apis-units.md:110` `unitauth_test.go` (claimed) + `apis-server/internal/middleware/unitauth.go:60` `SET LOCAL app.tenant_id = $1`  
- **Files likely touched:** `apis-server/internal/middleware/unitauth_test.go` (new), `apis-server/internal/middleware/unitauth.go`
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** `X-API-Key` is missing **When** a UnitAuth-protected endpoint is hit **Then** it returns `401` JSON.
  - **Given** `X-API-Key` is invalid **When** hit **Then** it returns `401` and does not call downstream.
  - **Given** `X-API-Key` is valid **When** hit **Then** the unit is present in context and tenant scoping is applied.
- **Verification steps:** `go test ./internal/middleware -run UnitAuth`.

### E08 — High — Fix heartbeat IP extraction tests to match secure default and add “trusted proxy” mode coverage
- **Applies to stories:** 2-3
- **Evidence:** `apis-server/internal/handlers/units_test.go:282` `Header.Set("X-Forwarded-For"...` + `apis-server/internal/handlers/units.go:458` `TrustProxyHeaders = false`  
- **Files likely touched:** `apis-server/internal/handlers/units_test.go`, `apis-server/internal/handlers/units.go`
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** `TrustProxyHeaders=false` **When** XFF/X-Real-IP are set **Then** `RemoteAddr` is used.
  - **Given** `TrustProxyHeaders=true` **When** XFF is set **Then** the first forwarded IP is used.
- **Verification steps:** `go test ./internal/handlers -run ExtractClientIP`.

### E09 — Medium — Make `TrustProxyHeaders` an explicit startup config (no global mutable)
- **Applies to stories:** 2-3
- **Evidence:** `apis-server/internal/handlers/units.go:454` `var TrustProxyHeaders = false`  
- **Files likely touched:** `apis-server/cmd/server/main.go`, `apis-server/internal/handlers/units.go`
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** an env flag (e.g., `TRUST_PROXY_HEADERS=true`) **When** the server starts **Then** heartbeat IP extraction trusts proxy headers.
  - **Given** the flag is false/unset **When** the server starts **Then** only `RemoteAddr` is used.
- **Verification steps:** unit tests for both modes; manual check behind a proxy.

### E10 — Medium — Reject invalid JSON when heartbeat has a non-empty body
- **Applies to stories:** 2-3
- **Evidence:** `apis-server/internal/handlers/units.go:405` `Decode(&req); ... Log but don't fail`  
- **Files likely touched:** `apis-server/internal/handlers/units.go`, `apis-server/internal/handlers/units_test.go`
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** a non-empty invalid JSON body **When** `/api/units/heartbeat` is called **Then** it returns `400` and does not update the unit.
  - **Given** an empty body **When** called **Then** it returns `200` and updates last_seen/status/ip.
- **Verification steps:** `go test ./internal/handlers -run Heartbeat`.

### E11 — Medium — Replace `api_key_prefix` with a keyed lookup (HMAC) instead of plaintext prefix
- **Applies to stories:** 2-2
- **Evidence:** `apis-server/internal/storage/migrations/0005_units.sql:12` `api_key_prefix TEXT NOT NULL`  
- **Files likely touched:** `apis-server/internal/auth/*`, `apis-server/internal/storage/migrations/*`, `apis-server/internal/storage/units.go`
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** an API key **When** a unit is created **Then** the DB stores a deterministic keyed digest for indexed lookup and a bcrypt hash for verification.
  - **Given** `X-API-Key` **When** authenticating **Then** the lookup uses the keyed digest (indexed) before bcrypt verify.
- **Verification steps:** `go test ./...`; migration applied on a fresh DB.

### E12 — Medium — Add frame-size limits and boundary/Content-Length parsing for MJPEG proxying
- **Applies to stories:** 2-5
- **Evidence:** `apis-server/internal/handlers/stream.go:199` `frame.WriteByte(b)` (unbounded until end marker)  
- **Files likely touched:** `apis-server/internal/handlers/stream.go`, `apis-server/internal/handlers/stream_test.go`
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** a frame exceeds a configured max (e.g., 2MB) **When** streaming **Then** the server aborts the stream and logs a warning.
  - **Given** MJPEG headers provide `Content-Length` **When** streaming **Then** frames are read by length (no marker scanning).
- **Verification steps:** `go test ./internal/handlers -run ReadMJPEGFrame`.

### E13 — Low — Remove `innerHTML` map error fallbacks; render React-safe placeholders instead
- **Applies to stories:** 2-1
- **Evidence:** `apis-dashboard/src/components/SiteMapThumbnail.tsx:92` `innerHTML = \``  
- **Files likely touched:** `apis-dashboard/src/components/SiteMapThumbnail.tsx`, `apis-dashboard/src/components/SiteMapView.tsx`, related tests
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** the map image fails to load **When** `onError` fires **Then** the UI shows a React-rendered fallback (no `innerHTML`).
  - **Given** the map image loads **When** displayed **Then** behavior remains unchanged.
- **Verification steps:** `npx vitest run tests/pages/Sites.test.tsx`.

### E14 — Medium — Add DB/RLS integration tests for Sites + Units
- **Applies to stories:** 2-1, 2-2, 2-3
- **Evidence:** `apis-server/internal/storage/sites_test.go:9` `Full integration tests require database connection.` + `apis-server/internal/storage/units_test.go:10` `Full integration tests require database connection.`  
- **Files likely touched:** `apis-server/tests/integration/*` (new tests), DB test harness/config docs
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** a test DB **When** tests run **Then** site/unit CRUD and tenant isolation (RLS) are verified end-to-end.
  - **Given** a site has units assigned **When** deleting the site **Then** it fails with a conflict-equivalent error.
- **Verification steps:** `go test ./tests/integration -run '(Sites|Units)'`.

