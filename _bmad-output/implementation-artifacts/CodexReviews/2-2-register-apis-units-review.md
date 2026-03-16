# Code Review: Story 2.2 Register APIS Units

**Review Date:** 2026-01-26  
**Reviewer:** Codex (GPT-5.2)  
**Story File:** `_bmad-output/implementation-artifacts/2-2-register-apis-units.md`

## Story Verdict

- **Score:** 4.0 / 10
- **Verdict:** **FAIL**
- **Rationale:** Core unit registration + API key generation is present, but the story artifact marks middleware tests as complete even though the repo does not include the referenced `unitauth_test.go` (`_bmad-output/implementation-artifacts/2-2-register-apis-units.md:70` `4.5: Unit tests for middleware` + `_bmad-output/implementation-artifacts/2-2-register-apis-units.md:110` `unitauth_test.go`).

---

## Acceptance Criteria Verification

| AC | Status | Evidence | Notes |
|---|---|---|---|
| AC1: Register Unit form fields | Implemented | `apis-dashboard/src/pages/Units.tsx:118-124` `<Button ...> Register Unit` + `apis-dashboard/src/pages/UnitRegister.tsx:134-169` `Serial Number` / `Unit Name` / `Assigned Site` | Form fields match the story ACs (serial + optional name + optional site). |
| AC2: API key generated and shown once with warning + copy, unit appears in list | Implemented | `apis-server/internal/handlers/units.go:224-236` `APIKey: rawKey` + `Warning: "Save this API key..."` + `apis-dashboard/src/pages/UnitRegister.tsx:90-93` `setApiKey(...api_key)` + `setShowKeyModal(true)` + `apis-dashboard/src/components/APIKeyModal.tsx:66-74` `message="Save this API key securely"` + `apis-dashboard/src/components/APIKeyModal.tsx:49-56` `Copy to Clipboard` | Server returns raw key only on create; list response type omits it (`apis-server/internal/handlers/units.go:18-34` `UnitResponse ...` no `api_key`). |
| AC3: Unit detail shows fields and allows regenerate + edit | Implemented | `apis-dashboard/src/pages/UnitDetail.tsx:231-259` `Descriptions.Item label="Serial Number"` + `Last Seen` + `Assigned Site` + `apis-dashboard/src/pages/UnitDetail.tsx:201-210` `Regenerate Key` + `Edit` | Edit form supports updating name/site assignment (`apis-dashboard/src/pages/UnitEdit.tsx:104-114` `apiClient.put(\`/units/${id}\``). |
| AC4: Regenerate invalidates old key; new key shown once | Needs runtime verification | `apis-server/internal/storage/units.go:312-315` `UPDATE units SET api_key_hash = $2, api_key_prefix = $3` + `apis-server/internal/storage/units.go:233-236` `VerifyAPIKey(rawKey, unit.APIKeyHash)` | Logic indicates old hash is replaced, but verifying “old key immediately stops working” needs an authenticated request using the old key. |
| AC5: API key auth accepts valid / rejects invalid with 401 | Implemented | `apis-server/internal/middleware/unitauth.go:27-31` `API key required` + `apis-server/internal/middleware/unitauth.go:53-57` `Invalid API key` + `apis-server/internal/storage/units.go:211-217` `WHERE api_key_prefix = $1` | Auth is header-based (`X-API-Key`), separate from user JWT auth (`apis-server/cmd/server/main.go:335-343` `r.Use(authmw.UnitAuth(...))`). |

---

## Findings

**F1: Story claims middleware tests exist, but the referenced test file is missing**  
- Severity: Critical  
- Category: Testing / Maintainability  
- Evidence: `_bmad-output/implementation-artifacts/2-2-register-apis-units.md:70` `4.5: Unit tests for middleware` + `_bmad-output/implementation-artifacts/2-2-register-apis-units.md:110` `unitauth_test.go`  
- Why it matters: The unit auth middleware is security-critical (device authentication + tenant scoping via `SET LOCAL app.tenant_id`) and needs automated tests to prevent regressions (`apis-server/internal/middleware/unitauth.go:60-66` `SET LOCAL app.tenant_id = $1`).  
- Recommended fix: Add `apis-server/internal/middleware/unitauth_test.go` to test: missing header → 401, invalid key → 401, valid key → unit in context + tenant setting applied + conn released on panic.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given `X-API-Key` is missing, when a request hits a UnitAuth-protected route, then it returns `401` with JSON error.
  - AC2: Given `X-API-Key` is invalid, when the request hits the route, then it returns `401` and does not call downstream handler.
  - AC3: Given `X-API-Key` is valid, when the request hits the route, then the unit is present in context and `SET LOCAL app.tenant_id` is executed.
  - Tests/Verification: `go test ./internal/middleware -run UnitAuth`.  
- “Out of scope?”: no

**F2: API key prefix is stored in plaintext for indexed lookup (partial key material)**  
- Severity: Medium  
- Category: Security  
- Evidence: `apis-server/internal/storage/migrations/0005_units.sql:11-13` `api_key_hash ... api_key_prefix TEXT NOT NULL` + `apis-server/internal/auth/apikey.go:63-73` `ExtractAPIKeyPrefix returns the first 16 characters`  
- Why it matters: If the DB leaks, attackers gain 16 chars of the key (`apis_` + 11 hex ≈ 44 bits). It’s not sufficient alone, but it reduces brute-force space and becomes an avoidable secret-adjacent artifact.  
- Recommended fix: Replace `api_key_prefix` with a deterministic keyed digest for lookup (e.g., `HMAC-SHA256(apiKey)` stored/indexed) and keep bcrypt only for verification defense-in-depth.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given a raw API key, when storing a unit, then the DB stores a deterministic lookup value (HMAC) and a bcrypt verification hash.
  - AC2: Given a request with `X-API-Key`, when authenticating, then the DB lookup is `WHERE api_key_hmac = $1` (indexed) before bcrypt verify.
  - Tests/Verification: add tests for `HMAC` compute + lookup path; run `go test ./...`.  
- “Out of scope?”: no (security hardening)

**F3: “Unit storage tests” don’t cover the behaviors the story relies on**  
- Severity: Medium  
- Category: Testing  
- Evidence: `apis-server/internal/storage/units_test.go:10-11` `Full integration tests require database connection. These unit tests verify struct and error definitions.`  
- Why it matters: Key invariants (unique `(tenant_id, serial)`, “key returned once”, “regen invalidates old key”, RLS isolation) are DB-driven and are untested end-to-end.  
- Recommended fix: Add integration tests using a real DB service (compose Yugabyte or Postgres) to validate constraints and auth lookup paths.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given two units with the same serial in the same tenant, when creating the second, then it fails with conflict.
  - AC2: Given a unit and old key, when regenerating, then auth with the old key fails and auth with the new key succeeds.
  - Tests/Verification: create a DB-backed test package and run `go test ./tests/integration -run Units`.  
- “Out of scope?”: no (but requires test DB harness)

---

## Story Score Breakdown (0–2 each)

- **AC completeness:** 1.5 / 2 (AC4 “old key stops working immediately” needs runtime proof; `apis-server/internal/storage/units.go:312-315` `UPDATE ... api_key_hash ...`)  
- **Correctness / edge cases:** 1.0 / 2 (core flows exist; missing middleware test coverage increases regression risk; `_bmad-output/implementation-artifacts/2-2-register-apis-units.md:70` `Unit tests for middleware`)  
- **Security / privacy / secrets:** 1.0 / 2 (bcrypt hashing is good; `apis-server/internal/auth/apikey.go:33-38` `bcrypt.GenerateFromPassword`; prefix storage is avoidable; `apis-server/internal/storage/migrations/0005_units.sql:12`)  
- **Testing / verification:** 0.0 / 2 (middleware tests are claimed but missing; `_bmad-output/implementation-artifacts/2-2-register-apis-units.md:110` `unitauth_test.go`)  
- **Maintainability / clarity / docs:** 0.5 / 2 (code is organized, but requirements tracking is inconsistent due to missing test artifact; `_bmad-output/implementation-artifacts/2-2-register-apis-units.md:70` `4.5...`)  

## What I Could Not Verify (story-specific)

- That the old API key immediately stops working after regeneration (requires runtime request using the old key; `apis-server/internal/storage/units.go:312-315` `UPDATE ... api_key_hash`).  
- Actual RLS enforcement for units requires a running DB session with `app.tenant_id` set (`apis-server/internal/storage/migrations/0005_units.sql:30-32` `USING ... WITH CHECK ...`).  
