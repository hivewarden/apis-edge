# Code Review: Story 1.6 Health Endpoint & Deployment Verification

**Review Date:** 2026-01-26  
**Reviewer:** Codex (GPT-5.2)  
**Story File:** `_bmad-output/implementation-artifacts/1-6-health-endpoint-deployment-verification.md`

## Story Verdict

- **Score:** 3.5 / 10
- **Verdict:** **FAIL**
- **Rationale:** Health handler exists and is public, but (1) response format conflicts with the story’s required shape and its tests, and (2) startup logging does not meet AC3 (not JSON; missing `port`) (`apis-server/cmd/server/main.go:31` `zerolog.ConsoleWriter`).

---

## Acceptance Criteria Verification

| AC | Status | Evidence | Notes |
|---|---|---|---|
| AC1: Health returns OK + expected JSON | Partial | `apis-server/internal/handlers/health.go:26-29` `type HealthResponse struct { Data ... }` + `apis-server/internal/handlers/health.go:109-114` `Status ... Version ... Checks ...` | Story AC example is top-level `{status,version,checks}`, but implementation wraps under `data`. |
| AC2: Degraded on DB failure (503) | Partial | `apis-server/internal/handlers/health.go:119-123` `StatusOK` vs `StatusServiceUnavailable` + `apis-server/internal/handlers/health.go:142-145` `return "error: " + err.Error()` | Behavior exists; response shape mismatch remains. |
| AC3: Structured startup logging (JSON + port) | Missing | `_bmad-output/implementation-artifacts/1-6-health-endpoint-deployment-verification.md:47-48` `"APIS server starting"... "port":3000` + `apis-server/cmd/server/main.go:31` `zerolog.ConsoleWriter` + `apis-server/cmd/server/main.go:34-37` `Msg("APIS server starting")` | ConsoleWriter makes logs non-JSON and `port` is not included in the “APIS server starting” log line. |
| AC4: Compose up --build + health 200 within 60s | Needs runtime verification | `docker-compose.yml:205` `wget ... /api/health` | Requires actual docker runtime; also depends on deterministic env bootstrap. |
| AC5: Health endpoint is unauthenticated | Implemented | `apis-server/cmd/server/main.go:133-140` health route registered before auth middleware + `apis-server/cmd/server/main.go:146-152` protected group applies `r.Use(authMiddleware)` | `/api/health` is outside JWT middleware chain. |

---

## Findings

**F1: Health response format and unit tests disagree (tests assert top-level fields; handler returns `{data: ...}`)**  
- Severity: Critical  
- Category: Correctness / Testing  
- Evidence: `apis-server/internal/handlers/health.go:26-29` `json:"data"` + `apis-server/internal/handlers/health_test.go:17-21` `json:"status"`/`"version"`/`"checks"` + `apis-server/internal/handlers/health_test.go:195-197` `assert.Contains(t, resp, "status")`  
- Why it matters: The health endpoint is relied on for orchestration and operator trust. A mismatch here means tests fail and the contract is unclear for clients/load balancers.  
- Recommended fix: Pick one canonical contract and make story + handler + tests consistent. If CLAUDE’s `{data: ...}` wrapper is mandatory, update story AC and tests accordingly; otherwise, remove wrapper in handler.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given `/api/health` is called, when it returns success, then its JSON matches the documented contract (either top-level or `{data: ...}`) consistently across code/docs/tests.
  - AC2: Given DB/Zitadel are down, when `/api/health` is called, then it returns 503 and includes per-check error strings in the same contract shape.
  - Tests/Verification: `go test ./internal/handlers -run HealthHandler` should pass.  
- “Out of scope?”: no

**F2: Startup logging does not meet AC3 (not JSON; “starting” log missing `port`) despite tasks being checked**  
- Severity: Critical  
- Category: Reliability / Observability  
- Evidence: `_bmad-output/implementation-artifacts/1-6-health-endpoint-deployment-verification.md:84-86` `Include version, port... in startup log` + `apis-server/cmd/server/main.go:31` `ConsoleWriter{...}` + `apis-server/cmd/server/main.go:34-37` `Msg("APIS server starting")`  
- Why it matters: Operators and monitoring depend on structured logs. Non-JSON logs and missing fields complicate ingestion and alerting. Also, the story checkbox being wrong is process debt.  
- Recommended fix: Default to JSON logs (remove ConsoleWriter) and include `port` in the “APIS server starting” log. If ConsoleWriter is desired for dev, gate it behind an env flag (e.g., `LOG_FORMAT=console|json`).  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given the server starts, when it logs “APIS server starting”, then the log line includes `version` and `port` and is valid JSON by default.
  - AC2: Given `LOG_FORMAT=console`, when set, then human-readable logs are used for local dev without breaking prod defaults.
  - Tests/Verification: add a small unit test around logger setup or document a manual `docker compose logs apis-server | head` check.  
- “Out of scope?”: no

**F3: Story claims Zitadel check uses JWKS endpoint, but implementation checks OIDC discovery (contract drift)**  
- Severity: Medium  
- Category: Docs / Correctness  
- Evidence: `_bmad-output/implementation-artifacts/1-6-health-endpoint-deployment-verification.md:68` `fetch JWKS endpoint` + `apis-server/internal/handlers/health.go:162-165` `/.well-known/openid-configuration`  
- Why it matters: The precise dependency being checked matters operationally (discovery might be up while JWKS fails, or vice versa). Drift between docs and behavior causes confusion during incidents.  
- Recommended fix: Either update the story/docs to match the discovery check, or change the implementation to validate JWKS reachability (or both checks).  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given Zitadel is reachable, when `/api/health` runs, then it checks the documented endpoint(s) and reports “ok”.
  - AC2: Given discovery is up but JWKS is failing (or vice versa), when `/api/health` runs, then it reports the correct degraded component.
  - Tests/Verification: extend `apis-server/internal/handlers/health_test.go` with a mock JWKS endpoint if needed.  
- “Out of scope?”: no

---

## Story Score Breakdown (0–2 each)

- **AC completeness:** 0.0 / 2 (AC3 is missing and AC1/AC2 are only partial due to response-shape mismatch)  
- **Correctness / edge cases:** 1.0 / 2 (core checks exist; contract mismatch is significant)  
- **Security / privacy / secrets:** 1.0 / 2 (endpoint is intentionally unauthenticated; ensure it never leaks secrets—currently it doesn’t)  
- **Testing / verification:** 0.0 / 2 (health tests assert the wrong JSON shape; `apis-server/internal/handlers/health_test.go:195-197`)  
- **Maintainability / clarity / docs:** 1.5 / 2 (handler code is clean, but story/docs/tests are inconsistent)  

## What I Could Not Verify (story-specific)

- Real dependency behavior under failure (Yugabyte unreachable, Zitadel unreachable) in the composed stack (requires runtime docker environment and controlled failures).  
- Log ingestion compatibility in the intended deployment environment (depends on whether logs must be JSON vs console).  

