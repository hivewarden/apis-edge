# Epic 1 Code Review Summary

**Review Date:** 2026-01-26  
**Reviewer:** Codex (GPT-5.2)  
**Epic:** 1

## Executive Summary

- **Overall verdict:** **FAIL**
- **Overall score:** 6.0 / 10
- **Per-epic scores + verdicts:**
  - **Epic 1:** 6.0 / 10 — **FAIL**
- **Top 5 cross-cutting risks (ranked):**
  1. **Health endpoint contract + tests are inconsistent** → orchestration/monitoring confidence is low until the contract is unified (`apis-server/internal/handlers/health.go:26` `json:"data"` + `apis-server/internal/handlers/health_test.go:17` `json:"status"`).  
  2. **Dev bootstrap is not “fresh clone → compose up” deterministic** → docs claim no config needed, but compose requires env-only Zitadel secrets (`docs/SECRETS-MANAGEMENT.md:47-48` `docker compose up` + `docker-compose.yml:89` `ZITADEL_MASTERKEY=${ZITADEL_MASTERKEY}`).  
  3. **Tenant isolation verification is incomplete/incorrect** → a security-critical story has checked tasks that aren’t actually validated (`_bmad-output/implementation-artifacts/1-5-tenant-context-database-setup.md:90` `Test RLS blocks...` + `apis-server/tests/integration/tenant_isolation_test.go:137-140` “user B” comment but `userA.ID`).  
  4. **Auth UX flow does not match ACs** → protected routes redirect to `/login` instead of initiating Zitadel redirect automatically (`apis-dashboard/src/components/auth/AuthGuard.tsx:55-58` `navigate(\`/login?...`)`).  
  5. **Navigation active state and tests drift** → nested routes likely lose selection highlight and layout tests assert an outdated nav shape (`apis-dashboard/src/components/layout/AppLayout.tsx:92` `selectedKeys={[location.pathname]}` + `apis-dashboard/tests/layout.test.tsx:124-127` `length).toBe(8)`).
- **Remediation priorities:**
  - **Do first:** Align `/api/health` response + tests; fix startup logging to meet AC3 (`apis-server/cmd/server/main.go:31` `ConsoleWriter` + `apis-server/internal/handlers/health_test.go:195-197` `assert.Contains(... "status")`).  
  - **Do next:** Make docker-compose boot deterministic and add Zitadel healthcheck gating bootstrap (`docker-compose.yml:146-148` `condition: service_started`).  
  - **Nice-to-have:** Improve sidebar selection for nested routes and update layout tests to be resilient to nav growth (`apis-dashboard/src/components/layout/navItems.tsx:25` `key: '/calendar'`).

| Epic | Story | Title | Score (0–10) | Verdict | Critical | High | Med | Low |
|-----:|------:|-------|-------------:|--------|---------:|-----:|----:|----:|
| 1 | 1-1 | Project Scaffolding & Docker Compose | 6.5 | CONCERNS | 0 | 1 | 1 | 1 |
| 1 | 1-2 | Ant Design Theme Configuration | 9.0 | PASS | 0 | 0 | 0 | 3 |
| 1 | 1-3 | Sidebar Layout & Navigation Shell | 6.5 | CONCERNS | 0 | 0 | 2 | 1 |
| 1 | 1-4 | Zitadel OIDC Integration | 6.5 | CONCERNS | 0 | 1 | 2 | 0 |
| 1 | 1-5 | Tenant Context & Database Setup | 4.0 | FAIL | 2 | 0 | 1 | 0 |
| 1 | 1-6 | Health Endpoint & Deployment Verification | 3.5 | FAIL | 2 | 0 | 1 | 0 |

**What I Could Not Verify (and why)**  
- Full-stack `docker compose up --build` from a truly fresh clone with no `.env` (requires docker runtime + deterministic env bootstrap; `.env` is gitignored: `.gitignore:2` `.env`).  
- Real Zitadel OIDC login/logout and token refresh behavior (requires a live Zitadel instance and credentials; `apis-dashboard/src/pages/Callback.tsx:34` `signinRedirectCallback()`).  
- RLS behavior in Yugabyte under real multi-tenant traffic (requires DB running + cross-tenant query attempts; policy exists but verification tests are flawed).  

---

## Epic-Level “AI Fix Backlog”

### E01 — Critical — Unify `/api/health` JSON contract across code, tests, and story docs
- **Applies to stories:** 1-1, 1-6
- **Evidence:** `apis-server/internal/handlers/health.go:26-29` `json:"data"` + `apis-server/internal/handlers/health_test.go:17-21` `json:"status"...`
- **Files likely touched:** `apis-server/internal/handlers/health.go`, `apis-server/internal/handlers/health_test.go`, `_bmad-output/implementation-artifacts/1-6-health-endpoint-deployment-verification.md`
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** `/api/health` is called **When** all checks pass **Then** the JSON matches the documented contract (choose either top-level or `{data: ...}`) and returns 200.
  - **Given** a dependency fails **When** `/api/health` is called **Then** it returns 503 and the same JSON contract includes per-check error strings.
- **Verification steps:** `go test ./apis-server/internal/handlers -run HealthHandler`.

### E02 — Critical — Make startup logging meet AC3 (JSON by default + include port)
- **Applies to stories:** 1-6
- **Evidence:** `apis-server/cmd/server/main.go:31` `ConsoleWriter{...}` + `_bmad-output/implementation-artifacts/1-6-health-endpoint-deployment-verification.md:47-48` `"port":3000`
- **Files likely touched:** `apis-server/cmd/server/main.go`
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** the server starts **When** it logs “APIS server starting” **Then** the log line is JSON by default and includes `version` and `port`.
  - **Given** a dev-friendly format is desired **When** an env flag is set (e.g., `LOG_FORMAT=console`) **Then** ConsoleWriter is used without changing prod defaults.
- **Verification steps:** run the binary and inspect first log lines; ensure no schema regressions in log aggregation.

### E03 — High — Make compose boot deterministic for a fresh clone (no hidden `.env` requirement)
- **Applies to stories:** 1-1, 1-6
- **Evidence:** `docs/SECRETS-MANAGEMENT.md:47-48` `no configuration needed` + `docker-compose.yml:89` `ZITADEL_MASTERKEY=${ZITADEL_MASTERKEY}` + `.gitignore:2` `.env`
- **Files likely touched:** `docker-compose.yml`, `.env.example`, `docs/SECRETS-MANAGEMENT.md`, possibly a new `scripts/setup-dev-env.sh`
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** a fresh clone **When** `docker compose up --build` is run **Then** either (a) it starts successfully, or (b) it fails with one clear actionable step (no silent “empty masterkey” failures).
  - **Given** `.env.example` exists **When** `.env` is missing **Then** there is an explicit documented/scripted bootstrap step.
- **Verification steps:** remove `.env`; run compose; confirm behavior.

### E04 — Medium — Add a Zitadel healthcheck and gate `zitadel-bootstrap` on `service_healthy`
- **Applies to stories:** 1-1
- **Evidence:** `docker-compose.yml:82-88` `zitadel:` (no healthcheck) + `docker-compose.yml:146-148` `condition: service_started`
- **Files likely touched:** `docker-compose.yml`
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** Zitadel is not ready **When** compose starts **Then** `zitadel-bootstrap` waits until Zitadel is healthy instead of racing.
  - **Given** compose is started repeatedly **When** it is brought up twice in a row **Then** `zitadel-bootstrap` succeeds consistently.
- **Verification steps:** `docker compose up --build` twice; inspect container exit codes.

### E05 — Critical — Fix tenant isolation integration test to actually test cross-tenant denial
- **Applies to stories:** 1-5
- **Evidence:** `_bmad-output/implementation-artifacts/1-5-tenant-context-database-setup.md:90-92` `Test RLS blocks...` + `apis-server/tests/integration/tenant_isolation_test.go:137-140` comment vs `userA.ID`
- **Files likely touched:** `apis-server/tests/integration/tenant_isolation_test.go`
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** tenant A context **When** querying tenant B’s user row **Then** no rows are returned / `ErrNotFound` is produced.
  - **Given** no tenant context **When** listing users **Then** zero rows are returned (fail-safe).
- **Verification steps:** run the test with a real DB (`DATABASE_URL=... go test ./apis-server/tests/integration -run TenantIsolationE2E`).

### E06 — High — Implement (or correct) the claimed “migration BYPASSRLS” strategy
- **Applies to stories:** 1-5
- **Evidence:** `_bmad-output/implementation-artifacts/1-5-tenant-context-database-setup.md:62` `Create bypass policy...` + `apis-server/internal/storage/migrations/0002_rls_policies.sql:20-24` `Tenants table does NOT have RLS...`
- **Files likely touched:** `apis-server/internal/storage/migrations/0002_rls_policies.sql`, `scripts/init-yugabytedb.sh`, docs
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** RLS is enabled broadly **When** migrations run **Then** they succeed under a well-defined role/privilege model.
  - **Given** the story says a bypass exists **When** reviewing migrations/docs **Then** the repo reflects that reality (no checked-but-missing tasks).
- **Verification steps:** apply migrations on a fresh DB and run a smoke query under the app role.

### E07 — Medium — Confirm and test tenant ID validation against real Zitadel org IDs
- **Applies to stories:** 1-5
- **Evidence:** `apis-server/internal/middleware/tenant.go:19` `^[a-zA-Z0-9_-]+$`
- **Files likely touched:** `apis-server/internal/middleware/tenant.go`, `apis-server/internal/middleware/tenant_test.go`
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** a real org ID format **When** TenantMiddleware validates it **Then** it passes.
  - **Given** an injection attempt **When** validated **Then** it fails with 400.
- **Verification steps:** `go test ./apis-server/internal/middleware -run Tenant`.

### E08 — High — Make AuthGuard initiate OIDC redirect automatically (or explicitly update ACs)
- **Applies to stories:** 1-4
- **Evidence:** `apis-dashboard/src/components/auth/AuthGuard.tsx:55-58` `navigate(\`/login?...`)`
- **Files likely touched:** `apis-dashboard/src/components/auth/AuthGuard.tsx`, `apis-dashboard/src/pages/Login.tsx`, `apis-dashboard/tests/auth/AuthGuard.test.tsx`
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** an unauthenticated user **When** they open a protected route **Then** OIDC redirect begins automatically (no extra click), or the story ACs are updated to reflect intentional UX.
  - **Given** auth config is missing **When** redirect can’t start **Then** the UI shows a clear actionable error.
- **Verification steps:** `npm test` + manual OIDC verification in compose.

### E09 — Medium — Unify logout handling to avoid stale “authenticated” UI state
- **Applies to stories:** 1-4
- **Evidence:** `apis-dashboard/src/components/layout/AppLayout.tsx:44-45` `useAuth()` + `apis-dashboard/src/hooks/useAuth.ts:133-137` `removeUser()` (no navigation)
- **Files likely touched:** `apis-dashboard/src/components/layout/AppLayout.tsx`, `apis-dashboard/src/hooks/useAuth.ts`, `apis-dashboard/src/providers/refineAuthProvider.ts`, `apis-dashboard/src/components/auth/AuthGuard.tsx`
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** logout fails at the IdP **When** local session is cleared **Then** the user is redirected to `/login` immediately and protected views stop rendering.
  - **Given** logout succeeds **When** redirected back **Then** protected routes cannot be accessed until re-login.
- **Verification steps:** add a unit test that forces signout to reject; ensure redirect occurs.

### E10 — Medium — Fix sidebar active selection for nested routes
- **Applies to stories:** 1-3
- **Evidence:** `apis-dashboard/src/components/layout/AppLayout.tsx:92` `selectedKeys={[location.pathname]}`
- **Files likely touched:** `apis-dashboard/src/components/layout/AppLayout.tsx`, `apis-dashboard/tests/layout.test.tsx`
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** `/units/:id` **When** loaded **Then** “Units” is selected.
  - **Given** `/sites/:id/edit` **When** loaded **Then** “Sites” is selected.
- **Verification steps:** `npx vitest run tests/layout.test.tsx`.

### E11 — Medium — Update layout tests to match (or be resilient to) navigation growth
- **Applies to stories:** 1-3
- **Evidence:** `apis-dashboard/tests/layout.test.tsx:124-127` `length).toBe(8)` + `apis-dashboard/src/components/layout/navItems.tsx:25` `key: '/calendar'`
- **Files likely touched:** `apis-dashboard/tests/layout.test.tsx`
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** nav items evolve **When** tests run **Then** they validate required items without brittle exact-count assertions.
  - **Given** a required item is removed **When** tests run **Then** they fail with a clear message.
- **Verification steps:** `npm test` (or `npx vitest run tests/layout.test.tsx`).

### E12 — Low — Clean up theme redundancy and decide on baseline typography
- **Applies to stories:** 1-2
- **Evidence:** `apis-dashboard/src/theme/apisTheme.ts:77` `cssVariables` (unused) + `apis-dashboard/src/theme/apisTheme.ts:172` `fontSize: 14`
- **Files likely touched:** `apis-dashboard/src/theme/apisTheme.ts`, optionally `apis-dashboard/src/main.tsx`, `apis-dashboard/tests/theme.test.ts`
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** the theme is maintained **When** reading token definitions **Then** there is one canonical source per concept (no redundant Card background tokens).
  - **Given** mobile UX requirements **When** rendering body text **Then** font sizes meet readability goals.
- **Verification steps:** `npx vitest run tests/theme.test.ts` + quick manual visual check.

