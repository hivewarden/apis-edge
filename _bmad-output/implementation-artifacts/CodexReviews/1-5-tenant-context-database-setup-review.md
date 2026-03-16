# Code Review: Story 1.5 Tenant Context & Database Setup

**Review Date:** 2026-01-26  
**Reviewer:** Codex (GPT-5.2)  
**Story File:** `_bmad-output/implementation-artifacts/1-5-tenant-context-database-setup.md`

## Story Verdict

- **Score:** 4.0 / 10
- **Verdict:** **FAIL**
- **Rationale:** Core schema/middleware exist, but key checklist items in a security-critical story are marked complete yet are missing/incorrect (e.g., BYPASSRLS “migration user” policy and cross-tenant test coverage) (`_bmad-output/implementation-artifacts/1-5-tenant-context-database-setup.md:62` `Create bypass policy...`).

---

## Acceptance Criteria Verification

| AC | Status | Evidence | Notes |
|---|---|---|---|
| AC1: Database schema exists (tenants, users) | Implemented | `apis-server/internal/storage/migrations/0001_tenants_users.sql:8-14` `CREATE TABLE ... tenants` + `apis-server/internal/storage/migrations/0001_tenants_users.sql:18-25` `CREATE TABLE ... users` | Columns required by AC are present; extra columns exist (plan/settings). |
| AC2: Auto user/tenant creation on first login | Needs runtime verification | `apis-server/internal/middleware/tenant.go:70-84` `EnsureUserProvisioned(...)` + `apis-server/internal/services/provisioning.go:71-85` `GetOrCreateTenant... CreateUser...` | Logic exists; requires runtime DB + real JWT claims to prove. |
| AC3: Tenant context set per request; RLS filters queries | Implemented | `apis-server/internal/middleware/tenant.go:62-67` `SET LOCAL app.tenant_id = ...` + `apis-server/internal/storage/migrations/0002_rls_policies.sql:17-18` `USING (tenant_id = current_setting(...))` | Tenant context is set before handlers; RLS is enabled for users. |
| AC4: RLS fail-safe when tenant context missing | Implemented | `apis-server/internal/storage/migrations/0002_rls_policies.sql:12-18` `current_setting('app.tenant_id', true)` | `true` arg returns NULL when unset → policy evaluates to NULL → no rows. |
| AC5: Tenant isolation security | Needs runtime verification | `apis-server/internal/middleware/tenant.go:33-38` `claims := GetClaims...` (tenant derived from JWT, not request body) + `apis-server/internal/middleware/auth.go:376-379` `if claims.OrgID == "" ...` | End-to-end proof requires runtime requests attempting cross-tenant access. |

---

## Findings

**F1: Task marked complete: “bypass policy for migration user (BYPASSRLS)” is not implemented**  
- Severity: Critical  
- Category: Security / Correctness  
- Evidence: `_bmad-output/implementation-artifacts/1-5-tenant-context-database-setup.md:62` `Create bypass policy for migration user` + `apis-server/internal/storage/migrations/0002_rls_policies.sql:17-24` only creates a single `users` policy and explicitly says “Tenants table does NOT have RLS”  
- Why it matters: This story’s checklist claims an RLS bypass strategy exists, but the repo does not encode one. That’s a governance/security footgun once more tables get RLS (migrations/ops tooling can break unexpectedly).  
- Recommended fix: Either (a) implement the promised approach (create a dedicated migration role with BYPASSRLS/owner semantics + explicit policies), or (b) update the story/tasking to reflect the real approach (migrations run under a privileged role) and codify it in scripts/docs.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given migrations run, when RLS is enabled on tenant tables, then migrations still succeed without disabling RLS globally.
  - AC2: Given the codebase claims a bypass mechanism, when inspecting migrations/config, then the mechanism is actually present and documented.
  - Tests/Verification: run `go test ./...`; if introducing a role-based approach, add a DB-backed integration test verifying migrations with the intended role.  
- “Out of scope?”: no

**F2: Task marked complete: “RLS blocks cross-tenant access” is not actually tested (test logic is wrong)**  
- Severity: Critical  
- Category: Security / Testing  
- Evidence: `_bmad-output/implementation-artifacts/1-5-tenant-context-database-setup.md:90-92` `Test RLS blocks cross-tenant access` + `apis-server/tests/integration/tenant_isolation_test.go:137-140` comment says “user B” but code fetches `userA.ID` and asserts success  
- Why it matters: Tenant isolation is the highest-risk area; a broken test gives false confidence and makes regressions likely.  
- Recommended fix: Rewrite `TestTenantIsolationE2E` so it (1) provisions two tenants/users with tenant context set correctly, (2) sets tenant A context, (3) attempts to read tenant B user, and (4) asserts “no rows / ErrNotFound”. Also avoid parameter placeholders for `SET LOCAL` if not supported by the DB/driver (your own middleware uses string interpolation).  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given tenant A context is set, when querying tenant B’s user by ID, then the query returns `ErrNotFound` (and does not leak data).
  - AC2: Given no tenant context is set, when listing users, then zero rows are returned (fail-safe).
  - Tests/Verification: make the integration test runnable via compose (`DATABASE_URL=... go test ./tests/integration -run TenantIsolationE2E`).  
- “Out of scope?”: no

**F3: Tenant ID validation may be too strict for real Zitadel org IDs (risk of rejecting valid tokens)**  
- Severity: Medium  
- Category: Reliability / Security  
- Evidence: `apis-server/internal/middleware/tenant.go:19` `regexp.MustCompile(\`^[a-zA-Z0-9_-]+$\`)` + `apis-server/internal/middleware/tenant.go:52-55` `Invalid tenant ID format`  
- Why it matters: If Zitadel org IDs include other characters (or future formats change), authenticated requests will fail with 400s, breaking the whole API for those tenants.  
- Recommended fix: Confirm Zitadel org ID format for your deployment and adjust validation accordingly. If you need strictness, consider an allowlist of known-safe characters validated against Zitadel’s actual IDs (and add tests).  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given a real Zitadel org ID format, when TenantMiddleware validates it, then legitimate IDs pass and injection attempts fail.
  - Tests/Verification: add unit tests for `tenantIDPattern` with representative Zitadel IDs and malicious payloads.  
- “Out of scope?”: no

---

## Story Score Breakdown (0–2 each)

- **AC completeness:** 1.5 / 2 (core mechanics exist; runtime proof still needed for AC2/AC5)  
- **Correctness / edge cases:** 1.0 / 2 (logic is plausible; integration test quality issues reduce confidence)  
- **Security / privacy / secrets:** 1.0 / 2 (RLS policy is present, but bypass strategy + verification are not as claimed)  
- **Testing / verification:** 0.0 / 2 (cross-tenant “test” does not test cross-tenant access; `apis-server/tests/integration/tenant_isolation_test.go:137-140`)  
- **Maintainability / clarity / docs:** 0.5 / 2 (story checklist diverges from repo reality; critical for a security story)  

## What I Could Not Verify (story-specific)

- Actual RLS enforcement in YugabyteDB with the `apis` role as configured by compose (requires running DB and executing cross-tenant queries).  
- Provisioning behavior on first real login with Zitadel tokens (requires live OIDC + DB; `apis-server/internal/services/provisioning.go:71-86`).  

