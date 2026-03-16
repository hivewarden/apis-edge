# Code Review: Story 3.1 Detection Events Table & API

**Review Date:** 2026-01-26  
**Reviewer:** Codex (GPT-5.2)  
**Story File:** `_bmad-output/implementation-artifacts/3-1-detection-events-table-api.md`

## Story Verdict

- **Score:** 6.5 / 10
- **Verdict:** **CONCERNS**
- **Rationale:** Core endpoints and schema exist, but tenant isolation depends on request-scoped DB session state whose correctness is hard to prove without runtime DB tests, and some edge cases (date parsing, error mapping) reduce reliability (`apis-server/internal/storage/migrations/0007_detections.sql:27-32` `ENABLE ROW LEVEL SECURITY` + `apis-server/internal/middleware/unitauth.go:63` `SET LOCAL app.tenant_id = $1` + `apis-server/internal/handlers/detections.go:286-292` `if err == nil { referenceDate = parsed }`).

---

## Acceptance Criteria Verification

| AC | Status | Evidence | Notes |
|---|---|---|---|
| AC1: POST `/api/units/detections` stores detection; returns 201 | Implemented | `apis-server/cmd/server/main.go:347` `r.Post("/api/units/detections", handlers.CreateDetection)` + `apis-server/internal/handlers/detections.go:158` `storage.CreateDetection(... unit.TenantID, unit.ID, *unit.SiteID, ... temperatureC)` + `apis-server/internal/handlers/detections.go:175` `http.StatusCreated` | Requires a migrated DB at runtime, but the handler/storage wiring matches the AC. |
| AC2: GET `/api/detections?...` returns detections with required fields | Implemented | `apis-server/internal/handlers/detections.go:180` `func ListDetections` + `apis-server/internal/handlers/detections.go:27-38` `UnitID ... DetectedAt ... Confidence ... LaserActivated` + `apis-server/internal/handlers/detections.go:236-244` `respondJSON(... Meta: {Total, Page, PerPage})` | Date-range filtering is applied via `parseDateRange()` (`apis-server/internal/handlers/detections.go:491-507` `fromStr ... toStr ...`). |
| AC3: GET `/api/detections/stats?...range=day` returns aggregated stats | Implemented | `apis-server/internal/handlers/detections.go:253` `func GetDetectionStats` + `apis-server/internal/storage/detections.go:167-170` `HourlyBreakdown: make([]int, 24)` + `apis-server/internal/storage/detections.go:204-213` `EXTRACT(HOUR FROM detected_at AT TIME ZONE $4)` | Range computation is centralized in `calculateDateRange()` (`apis-server/internal/handlers/detections.go:538-573` `case "day": ...`). |
| AC4: Store cached temperature (if available) + associate to unit’s site | Implemented | `apis-server/internal/handlers/detections.go:128-133` `if unit.SiteID == nil { ... }` + `apis-server/internal/handlers/detections.go:148` `temperatureC = services.GetCachedTemperature(... )` + `apis-server/internal/storage/migrations/0007_detections.sql:8-16` `site_id ... temperature_c` | Temperature is only captured when the in-memory weather cache has an entry; no TTL check is applied for “capture-time” usage (`apis-server/internal/services/weather.go:271-273` `return &data.Temperature`). |
| AC5: Tenant isolation enforced via RLS | Needs runtime verification | `apis-server/internal/storage/migrations/0007_detections.sql:27-32` `ENABLE ROW LEVEL SECURITY` + `apis-server/internal/storage/migrations/0007_detections.sql:32` `current_setting('app.tenant_id', true)` + `apis-server/internal/middleware/tenant.go:62` `SET LOCAL app.tenant_id = ...` | Policy + middleware exist, but correctness depends on DB/session semantics and connection pooling behavior. |

---

## Findings

**F1: Tenant isolation depends on request-scoped DB session state; verify `SET LOCAL` semantics and pool safety**  
- Severity: High  
- Category: Security / Correctness / Reliability  
- Evidence: `apis-server/internal/storage/migrations/0007_detections.sql:32` `current_setting('app.tenant_id', true)` + `apis-server/internal/middleware/tenant.go:62` `SET LOCAL app.tenant_id = ...` + `apis-server/internal/middleware/unitauth.go:63` `SET LOCAL app.tenant_id = $1`  
- Why it matters: If tenant context doesn’t reliably apply for the full request (or leaks across pooled connections), detections could be invisible (false “not found”) or, worst case, cross-tenant data could be returned.  
- Recommended fix: Make tenant scoping provably safe by either (a) wrapping handler DB work in an explicit transaction and using `SET LOCAL` inside it, or (b) using a parameterized `set_config('app.tenant_id', $1, true)` call per transaction, and adding explicit reset on connection release if session-scoped settings are used.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given tenant A and tenant B have detections, when tenant A calls `GET /api/detections?site_id=...`, then only tenant A detections are returned (and tenant B’s are never visible).
  - AC2: Given a pooled connection is released after serving tenant A, when the next request is tenant B, then tenant B’s queries are scoped correctly (no residual tenant A scoping).
  - Tests/Verification: add a DB-backed integration test that provisions two tenants, inserts detections for both, and asserts isolation using real connections; run `go test ./...` with `DATABASE_URL` set.  
- “Out of scope?”: no

**F2: `GET /api/detections/{id}` returns 404 for all errors (masks internal failures)**  
- Severity: Medium  
- Category: Correctness / Reliability  
- Evidence: `apis-server/internal/handlers/detections.go:75-79` `if err != nil { ... respondError(w, "Detection not found", http.StatusNotFound) }`  
- Why it matters: If the DB is down, migrations are missing, or SQL fails, clients will incorrectly see “not found,” making incidents harder to diagnose and potentially breaking retries/backoff logic.  
- Recommended fix: Distinguish `storage.ErrNotFound` from other errors and return `500` for unexpected failures; log at error level for non-not-found cases.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given a detection ID does not exist, when I call `GET /api/detections/{id}`, then I receive HTTP 404.
  - AC2: Given the DB query fails (simulated), when I call the same endpoint, then I receive HTTP 500 with `{error, code}`.
  - Tests/Verification: add handler tests that simulate `storage.ErrNotFound` vs generic error (via small indirection or test-only hook); run `go test ./internal/handlers -run GetDetectionByID`.  
- “Out of scope?”: no

**F3: Invalid `date` / `from` / `to` query params are silently ignored**  
- Severity: Medium  
- Category: Correctness / UX  
- Evidence: `apis-server/internal/handlers/detections.go:287-292` `parsed, err := time.Parse... if err == nil { referenceDate = parsed }` + `apis-server/internal/handlers/detections.go:496-507` `if parsed, err := time.Parse...; err == nil { ... }`  
- Why it matters: A typo like `date=2026-13-40` will fall back to “now” without warning, causing dashboards to show unexpected data and making debugging hard.  
- Recommended fix: If a date parameter is present but invalid, return `400 Bad Request` with a clear error message; do the same for `from/to`.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given `date` is provided but invalid, when I call `GET /api/detections/stats`, then I receive HTTP 400 with a message like “invalid date format (expected YYYY-MM-DD)”.
  - AC2: Given `from` or `to` is invalid, when I call `GET /api/detections`, then I receive HTTP 400 (no silent fallback).
  - Tests/Verification: add handler tests for invalid `date/from/to`; run `go test ./internal/handlers -run ParseDateRange|GetDetectionStats`.  
- “Out of scope?”: no

---

## Story Score Breakdown (0–2 each)

- **AC completeness:** 1.5 / 2 (AC5 is not provable without runtime DB verification; policy exists but needs end-to-end validation)  
- **Correctness / edge cases:** 1.5 / 2 (core flows implemented; date parsing + error mapping need tightening)  
- **Security / privacy / secrets:** 1.0 / 2 (RLS pattern is correct in principle but must be proven safe with pool behavior; `apis-server/internal/middleware/unitauth.go:63` `SET LOCAL app.tenant_id = $1`)  
- **Testing / verification:** 1.0 / 2 (request/response structure tests exist; no DB/RLS integration tests for detections)  
- **Maintainability / clarity / docs:** 1.5 / 2 (clear separation handlers/storage/migrations; some consistency gaps around validation and error taxonomy)

## What I Could Not Verify (story-specific)

- DB-backed behavior: migrations applied, actual inserts/reads, and RLS isolation for detections (requires running DB + integration tests with `DATABASE_URL`; policy exists in `apis-server/internal/storage/migrations/0007_detections.sql:27-32`).  
- Real unit posting behavior (auth with real `X-API-Key`, unit→site assignment present) without a running stack (`apis-server/cmd/server/main.go:339` `r.Use(authmw.UnitAuth(storage.DB))`).  

