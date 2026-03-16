# Code Review: Story 2.5 Live Video WebSocket Proxy

**Review Date:** 2026-01-26  
**Reviewer:** Codex (GPT-5.2)  
**Story File:** `_bmad-output/implementation-artifacts/2-5-live-video-websocket-proxy.md`

## Story Verdict

- **Score:** 3.0 / 10
- **Verdict:** **FAIL**
- **Rationale:** The UI and handler exist, but the WebSocket endpoint is behind JWT auth that requires an `Authorization` header which browser WebSockets don’t send; the dashboard opens `new WebSocket(...)` without any token, so the stream likely can’t connect (`apis-server/internal/middleware/auth.go:246-253` `Missing authorization header` + `apis-server/cmd/server/main.go:146-149` `r.Use(authMiddleware)` + `apis-dashboard/src/components/LiveStream.tsx:54-57` `new WebSocket(wsUrl)`).

---

## Acceptance Criteria Verification

| AC | Status | Evidence | Notes |
|---|---|---|---|
| AC1: “View Live Feed” opens player; stream via WSS through server | Missing | `apis-dashboard/src/pages/UnitDetail.tsx:193-200` `View Live Feed` + `apis-dashboard/src/components/LiveStream.tsx:54-57` `wsUrl = ... /ws/stream/${unitId}` + `apis-server/cmd/server/main.go:174` `r.Get("/ws/stream/{id}", handlers.Stream)` + `apis-server/internal/middleware/auth.go:246-253` `Missing authorization header` | Without an auth mechanism compatible with browser WS (no headers), the endpoint is not reachable under normal auth. |
| AC2: Online streaming shows frames (<500ms latency) until closed | Needs runtime verification | `apis-server/internal/handlers/stream.go:143-159` `readMJPEGFrame` + `ws.WriteMessage(websocket.BinaryMessage, frame)` + `apis-dashboard/src/components/LiveStream.tsx:66-74` `URL.createObjectURL(event.data)` | Latency and actual MJPEG parsing correctness require a real unit stream and browser runtime. |
| AC3: Offline unit shows message and no connection attempt | Implemented | `apis-dashboard/src/pages/UnitDetail.tsx:193-200` `disabled={unit.status !== 'online' ...}` + `apis-dashboard/src/components/LiveStream.tsx:46-49` `if (unitStatus !== 'online') ... return` + `apis-dashboard/src/components/LiveStream.tsx:135-140` `Unit is offline - live feed unavailable` | UI blocks opening + component returns early. |
| AC4: Reconnect on drop (3 retries exponential backoff) with message | Implemented | `apis-dashboard/src/components/LiveStream.tsx:16-18` `MAX_RETRIES = 3` + `apis-dashboard/src/components/LiveStream.tsx:89-96` `delay = INITIAL_RETRY_DELAY * Math.pow(2, currentRetryCount)` + `apis-dashboard/src/components/LiveStream.tsx:176-182` `Connection lost - Reconnecting...` | Retry count stored in ref to avoid stale closures (`apis-dashboard/src/components/LiveStream.tsx:35-36`). |
| AC5: Close terminates WS; server resources released | Implemented | `apis-dashboard/src/components/LiveStream.tsx:38-42` `wsRef.current.close()` + `apis-server/internal/handlers/stream.go:156-159` `ws.WriteMessage ... break` + `apis-server/internal/handlers/stream.go:87-94` `defer ... activeStreams[unitID]--` | Server cleanup depends on write failure detection; works when client disconnects. |

---

## Findings

**F1: WebSocket auth is incompatible with the current JWT middleware (stream cannot connect from browser)**  
- Severity: Critical  
- Category: Correctness / Security  
- Evidence: `apis-server/internal/middleware/auth.go:246-253` `authHeader := r.Header.Get("Authorization") ... respondUnauthorized` + `apis-server/cmd/server/main.go:146-149` `r.Use(authMiddleware)` + `apis-server/cmd/server/main.go:174` `r.Get("/ws/stream/{id}", handlers.Stream)` + `apis-dashboard/src/components/LiveStream.tsx:54-57` `const ws = new WebSocket(wsUrl)`  
- Why it matters: This blocks the primary feature of the story: authenticated live streaming from the dashboard.  
- Recommended fix: Implement a WS-auth-compatible mechanism, e.g.:
  - Option A: Accept a `token` query parameter (short-lived) and validate it in a dedicated WS auth middleware, **or**
  - Option B: Use an HttpOnly cookie session for the dashboard and validate cookie in WS handshake, **or**
  - Option C: Use `Sec-WebSocket-Protocol` subprotocol as a bearer token carrier (with strict validation).  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given an authenticated dashboard session, when it opens `wss://.../ws/stream/{id}`, then the server authenticates the request without requiring an `Authorization` header.
  - AC2: Given an unauthenticated client, when it opens the socket, then it is rejected with `401` (or equivalent close code) and no stream proxying occurs.
  - Tests/Verification: add a Go integration test that performs a WS handshake with the chosen auth method; run `go test ./...` and a browser manual check.  
- “Out of scope?”: no

**F2: WebSocket upgrader allows all origins (`CheckOrigin` returns true)**  
- Severity: High  
- Category: Security  
- Evidence: `apis-server/internal/handlers/stream.go:30-33` `CheckOrigin: func(...) bool { return true }`  
- Why it matters: If/when auth is made cookie-based (common for WS), `CheckOrigin=true` becomes a CSWSH risk (cross-site sites can open authenticated WS using ambient cookies).  
- Recommended fix: Restrict origins to same-origin and/or an allowlist (configurable), or validate `Origin`/`Host` explicitly during upgrade.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given an Origin not in the allowlist, when a WS upgrade is attempted, then it is rejected.
  - AC2: Given a valid Origin, when a WS upgrade is attempted, then it succeeds.
  - Tests/Verification: add tests around `CheckOrigin`; run `go test ./internal/handlers -run UpgraderConfiguration`.  
- “Out of scope?”: no

**F3: MJPEG frame parsing has no maximum frame size / boundary parsing (DoS risk)**  
- Severity: Medium  
- Category: Security / Reliability / Performance  
- Evidence: `apis-server/internal/handlers/stream.go:199-213` `for { ... frame.WriteByte(b) ... if prevByte == 0xFF && b == 0xD9 { break } }`  
- Why it matters: A malformed or adversarial stream could omit the end marker and force unbounded buffering until EOF, increasing memory pressure and potentially crashing the server.  
- Recommended fix: Parse MJPEG boundaries + `Content-Length` (preferred) and impose a max frame size cap (e.g., 1–2MB) with early abort.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given a frame exceeds the configured max size, when streaming, then the server aborts the stream and logs a warning.
  - AC2: Given well-formed MJPEG with `Content-Length`, when streaming, then frames are forwarded without scanning for markers.
  - Tests/Verification: add parser tests for oversized frames; run `go test ./internal/handlers -run ReadMJPEGFrame`.  
- “Out of scope?”: no

---

## Story Score Breakdown (0–2 each)

- **AC completeness:** 0.0 / 2 (AC1 is missing due to auth mismatch; `apis-server/internal/middleware/auth.go:246-253` `Missing authorization header`)  
- **Correctness / edge cases:** 0.5 / 2 (core connection path blocked; parsing is naive; `apis-server/internal/handlers/stream.go:175-215` `readMJPEGFrame`)  
- **Security / privacy / secrets:** 0.5 / 2 (`CheckOrigin=true` is risky; `apis-server/internal/handlers/stream.go:30-33` `return true`)  
- **Testing / verification:** 1.0 / 2 (component tests exist; `apis-dashboard/tests/components/LiveStream.test.tsx:164-183` `retries with exponential backoff`; backend tests are mostly unit-level, not WS-auth integration)  
- **Maintainability / clarity / docs:** 1.0 / 2 (handler/component are readable; architectural auth gap remains; `apis-dashboard/src/components/LiveStream.tsx:54-57` `wsUrl = ...`)  

## What I Could Not Verify (story-specific)

- Real MJPEG stream behavior, latency, and cleanup under load (requires a live unit MJPEG endpoint and browser runtime; `apis-server/internal/handlers/stream.go:110-116` `Timeout: 0` streaming client).  
