---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
inputDocuments:
  - prd-addendum-keycloak-migration.md
  - architecture.md
  - epic-13-dual-auth-mode.md
epicNumber: 15
epicTitle: "Keycloak Migration (Replace Zitadel)"
status: "draft"
totalStories: 10
phases: 4
---

# Epic 15: Keycloak Migration (Replace Zitadel)

## Overview

Replace all Zitadel-specific authentication code with Keycloak-compatible OIDC integration. This is an infrastructure-driven migration — no user-facing behavior changes. Standalone mode (`AUTH_MODE=local`) is completely unaffected.

**Epic Goal:** Migrate APIS SaaS mode from Zitadel OIDC to Keycloak OIDC while maintaining full standalone mode compatibility and multi-tenant isolation.

**Prerequisite:** Epic 13 (Dual Authentication Mode) should be complete or in progress. This epic modifies the SaaS code path established by Epic 13.

---

## Requirements Inventory

### Source PRD Addendum: `prd-addendum-keycloak-migration.md`

| ID | Requirement | Story |
|----|-------------|-------|
| FR-KC-01 | Replace `AUTH_MODE=zitadel` with `AUTH_MODE=keycloak` | 15.1 |
| FR-KC-02 | SaaS mode SHALL authenticate via Keycloak OIDC | 15.3 |
| FR-KC-03 | JWT validation with JWKS, issuer (including `/realms/{name}`), audience, expiry | 15.3 |
| FR-KC-04 | Roles from `realm_access.roles` | 15.3 |
| FR-KC-05 | Tenant ID from `org_id` claim | 15.4 |
| FR-KC-06 | Super-admin via `SUPER_ADMIN_EMAILS` | 15.4 |
| FR-KC-07 | Dashboard uses `react-oidc-context` | 15.5 |
| FR-KC-08 | Remove `@zitadel/react` | 15.5 |
| FR-KC-09 | Callback page handles Keycloak code exchange | 15.6 |
| FR-KC-10 | Token refresh via refresh tokens in memory | 15.5 |
| FR-KC-11 | `/api/auth/config` returns keycloak config | 15.2 |
| FR-KC-12 | Docker Compose replaces Zitadel with Keycloak | 15.7 |
| FR-KC-13 | Secrets replaces `GetZitadelConfig()` | 15.2 |
| FR-KC-14 | Env vars change `ZITADEL_*` to `KEYCLOAK_*` | 15.1 |
| FR-KC-15 | Standalone mode unchanged | All stories |
| FR-KC-16 | Edge device auth unchanged | N/A |
| FR-KC-17 | Documentation updated | 15.9 |
| NFR-KC-01 | JWKS cached with 1h TTL | 15.3 |
| NFR-KC-02 | Auth endpoints < 200ms p95 | 15.10 |
| NFR-KC-03 | CI tests both modes | 15.10 |
| NFR-KC-04 | Direct Access Grants disabled | 15.7 |
| NFR-KC-05 | PKCE S256 enforced | 15.7 |
| NFR-KC-06 | Rename `zitadel_user_id` to `external_user_id` | 15.9 |

---

## Phase 1: Backend Foundation (Stories 15.1 - 15.4)

Update the Go server to accept Keycloak JWTs. After this phase, the server validates Keycloak tokens and extracts claims correctly.

| Story | Title | FRs Covered | Depends On |
|-------|-------|-------------|------------|
| 15.1 | Auth mode config & env vars | FR-KC-01, FR-KC-14 | — |
| 15.2 | Secrets & auth config endpoint | FR-KC-11, FR-KC-13 | 15.1 |
| 15.3 | Auth middleware: Keycloak JWT validation | FR-KC-02, FR-KC-03, FR-KC-04, NFR-KC-01 | 15.1 |
| 15.4 | Tenant middleware: org_id claim extraction | FR-KC-05, FR-KC-06 | 15.3 |

## Phase 2: Dashboard Migration (Stories 15.5 - 15.6)

Replace the Zitadel SDK in the React dashboard. After this phase, the dashboard authenticates against Keycloak.

| Story | Title | FRs Covered | Depends On |
|-------|-------|-------------|------------|
| 15.5 | Keycloak auth provider (react-oidc-context) | FR-KC-07, FR-KC-08, FR-KC-10 | 15.1 |
| 15.6 | Login page & callback integration | FR-KC-09 | 15.5 |

## Phase 3: Infrastructure & Config (Stories 15.7 - 15.8)

Update Docker Compose, env templates, and Keycloak realm setup. After this phase, `docker compose --profile saas up` runs with Keycloak.

| Story | Title | FRs Covered | Depends On |
|-------|-------|-------------|------------|
| 15.7 | Docker Compose & Keycloak realm setup | FR-KC-12, NFR-KC-04, NFR-KC-05 | — |
| 15.8 | Environment templates & CLAUDE.md | FR-KC-14 | 15.7 |

## Phase 4: Verification & Cleanup (Stories 15.9 - 15.10)

Documentation updates and CI verification. After this phase, migration is complete.

| Story | Title | FRs Covered | Depends On |
|-------|-------|-------------|------------|
| 15.9 | Documentation & architecture updates | FR-KC-17 | 15.4, 15.6 |
| 15.10 | CI dual-mode test verification | NFR-KC-03, FR-KC-15 | All above |

---

## Story Details

### 15.1 — Auth Mode Config & Environment Variables

**Goal:** Update the auth mode infrastructure to recognize `keycloak` instead of `zitadel`.

**Files to modify:**
- `apis-server/internal/config/auth.go` — Rename `ModeZitadel` to `ModeKeycloak`, update env var names
- `apis-server/cmd/server/main.go` — Update variable names and startup logging

**Tasks:**
1. In `config/auth.go`: Change `ModeZitadel = "zitadel"` to `ModeKeycloak = "keycloak"`
2. Rename config functions: `ZitadelIssuer()` -> `KeycloakIssuer()`, `ZitadelClientID()` -> `KeycloakClientID()`
3. Update env var reads: `ZITADEL_ISSUER` -> `KEYCLOAK_ISSUER`, `ZITADEL_CLIENT_ID` -> `KEYCLOAK_CLIENT_ID`
4. Add backward-compat: if `AUTH_MODE=zitadel`, log deprecation warning and treat as `keycloak`
5. In `main.go`: Update variable names and log messages
6. Update `config/auth.go` tests

**Acceptance Criteria:**
- [ ] `AUTH_MODE=keycloak` recognized and sets SaaS mode
- [ ] `AUTH_MODE=zitadel` still works (logs deprecation warning)
- [ ] `AUTH_MODE=local` behavior unchanged
- [ ] `KEYCLOAK_ISSUER` and `KEYCLOAK_CLIENT_ID` env vars read correctly
- [ ] Go server builds clean (`go build ./...` and `go vet ./...`)

---

### 15.2 — Secrets & Auth Config Endpoint

**Goal:** Update secrets management and the public auth config endpoint for Keycloak.

**Files to modify:**
- `apis-server/internal/secrets/secrets.go` — Rename `ZitadelConfig` to `KeycloakConfig`
- `apis-server/internal/secrets/secrets_test.go` — Update tests
- `apis-server/internal/handlers/auth_config.go` — Update response fields

**Tasks:**
1. In `secrets.go`: Rename `ZitadelConfig` struct to `KeycloakConfig`
2. Rename `GetZitadelConfig()` to `GetKeycloakConfig()`
3. Update env var reads: `ZITADEL_MASTERKEY` -> removed (Keycloak doesn't need masterkey), keep `KEYCLOAK_ADMIN`/`KEYCLOAK_ADMIN_PASSWORD` for bootstrap
4. Update `KeycloakConfig` struct: remove `Masterkey`, keep `Issuer`, `ClientID`, add `ClientSecret` (for backend operations if needed)
5. Update OpenBao secret path: `zitadel` -> `keycloak`
6. In `auth_config.go`: Change response fields from `zitadel_authority`/`zitadel_client_id` to `keycloak_authority`/`client_id`
7. Update tests

**Acceptance Criteria:**
- [ ] `GetKeycloakConfig()` reads from all three backends (env, file, openbao)
- [ ] `GET /api/auth/config` returns `keycloak_authority` and `client_id` in SaaS mode
- [ ] `GET /api/auth/config` returns only `mode: "local"` in standalone mode (unchanged)
- [ ] OpenBao path `secret/data/apis/keycloak` used for SaaS secrets

---

### 15.3 — Auth Middleware: Keycloak JWT Validation

**Goal:** Update the OIDC JWT validation middleware to parse Keycloak token format.

**Files to modify:**
- `apis-server/internal/middleware/auth.go` — Claims struct, claim extraction logic

**Tasks:**
1. Rename `ZitadelClaims` struct to `KeycloakClaims` (or `OIDCClaims`)
2. Update claim JSON tags:
   - Remove `urn:zitadel:iam:org:id` -> Add `org_id` (custom Keycloak mapper)
   - Remove `urn:zitadel:iam:org:name` -> Add `org_name` (custom Keycloak mapper)
   - Remove `urn:zitadel:iam:user:roles` -> Add `realm_access` nested struct with `roles []string`
3. Update `extractFromKeycloakClaims()` to handle nested `realm_access.roles` structure
4. Update issuer validation: Keycloak issuer includes `/realms/{name}` path
5. Keep JWKS caching logic unchanged (standard OIDC, already works)
6. Update `NewModeAwareAuthMiddleware()` function: rename `zitadel*` params to `keycloak*` or generic `oidc*`
7. Update log messages from "zitadel" to "keycloak"
8. Update `middleware/auth_test.go` with Keycloak-format test JWTs

**Acceptance Criteria:**
- [ ] Keycloak RS256 JWTs validated via JWKS endpoint
- [ ] Roles extracted from `realm_access.roles` nested structure
- [ ] Issuer with `/realms/{name}` path accepted
- [ ] `Claims` struct populated correctly (TenantID, Email, Roles, Name)
- [ ] JWKS cached with 1-hour TTL, refreshed on `kid` mismatch
- [ ] LocalAuthMiddleware completely unchanged (verified by existing tests)
- [ ] All auth middleware tests pass

**Technical Notes:**
```go
// New claims struct
type KeycloakClaims struct {
    jwt.Claims
    Email             string `json:"email,omitempty"`
    EmailVerified     bool   `json:"email_verified,omitempty"`
    Name              string `json:"name,omitempty"`
    PreferredUsername  string `json:"preferred_username,omitempty"`
    OrgID             string `json:"org_id,omitempty"`
    OrgName           string `json:"org_name,omitempty"`
    RealmAccess       struct {
        Roles []string `json:"roles"`
    } `json:"realm_access,omitempty"`
}
```

---

### 15.4 — Tenant Middleware: org_id Claim Extraction

**Goal:** Update tenant resolution for Keycloak's organization claim format.

**Files to modify:**
- `apis-server/internal/middleware/tenant.go` — Update org_id extraction
- `apis-server/internal/middleware/tenant_test.go` — Update tests

**Tasks:**
1. Update SaaS mode tenant extraction from `urn:zitadel:iam:org:id` to `org_id` (populated by 15.3)
2. Verify auto-provisioning of new tenants still works with Keycloak claims
3. Verify super-admin email check works (uses standard `email` claim — no change expected)
4. Update tests with Keycloak-format claims

**Acceptance Criteria:**
- [ ] Tenant resolved from `org_id` claim in Keycloak JWTs
- [ ] New tenant auto-provisioned on first login (existing behavior)
- [ ] Super-admin check via `SUPER_ADMIN_EMAILS` works with Keycloak email claim
- [ ] RLS tenant isolation enforced (existing behavior)
- [ ] Local mode default tenant unchanged

---

### 15.5 — Keycloak Auth Provider (react-oidc-context)

**Goal:** Replace `@zitadel/react` with `react-oidc-context` for the dashboard SaaS auth flow.

**Files to modify/create:**
- `apis-dashboard/package.json` — Remove `@zitadel/react`, add `react-oidc-context`
- `apis-dashboard/src/providers/keycloakAuthProvider.ts` — New file (replaces `zitadelAuthProvider.ts`)
- `apis-dashboard/src/providers/refineAuthProvider.ts` — Update import to use new provider
- `apis-dashboard/src/providers/index.ts` — Update exports
- `apis-dashboard/src/config.ts` — Update env var names

**Tasks:**
1. `npm remove @zitadel/react && npm install react-oidc-context oidc-client-ts`
2. Create `keycloakAuthProvider.ts` implementing Refine's `AuthProvider` interface:
   - Use `UserManager` from `oidc-client-ts` (**must be added as direct dependency** — currently only a transitive dep of `@zitadel/react` which is being removed)
   - Configure for Keycloak realm: `authority = https://keycloak.example.com/realms/honeybee`
   - PKCE flow with `code_challenge_method: "S256"`
   - In-memory token storage (`InMemoryWebStorage`) — no localStorage
   - Extract roles from `realm_access.roles` in user profile
   - Token refresh via refresh tokens (not iframe)
3. Update `refineAuthProvider.ts` to import `keycloakAuthProvider` instead of `zitadelAuthProvider`
4. Update `config.ts`: `VITE_ZITADEL_AUTHORITY` -> `VITE_KEYCLOAK_AUTHORITY`, `VITE_ZITADEL_CLIENT_ID` -> `VITE_KEYCLOAK_CLIENT_ID`
5. Delete `zitadelAuthProvider.ts` (or keep as archive)
6. Update provider tests

**Acceptance Criteria:**
- [ ] `@zitadel/react` removed from `package.json`
- [ ] `react-oidc-context` and `oidc-client-ts` in dependencies
- [ ] OIDC login flow works: redirect to Keycloak -> auth -> callback -> dashboard
- [ ] Token refresh works via refresh tokens (not iframe)
- [ ] Roles extracted from `realm_access.roles`
- [ ] Logout redirects to Keycloak end-session endpoint
- [ ] `localAuthProvider` completely unchanged
- [ ] TypeScript compiles clean (`npx tsc --noEmit`)

---

### 15.6 — Login Page & Callback Integration

**Goal:** Update the Login page and OIDC callback to work with the new Keycloak provider.

**Files to modify:**
- `apis-dashboard/src/pages/Login.tsx` — Update comments, component references
- `apis-dashboard/src/pages/Callback.tsx` — Update import path
- `apis-dashboard/src/components/auth/ZitadelLoginButton.tsx` — Rename to `OIDCLoginButton.tsx`
- `apis-dashboard/src/components/auth/index.ts` — Update exports
- `apis-dashboard/src/types/auth.ts` — Update `AuthMode` type

**Tasks:**
1. Rename `ZitadelLoginButton.tsx` to `OIDCLoginButton.tsx`, update component name and text
2. Update Login page to render `OIDCLoginButton` instead of `ZitadelLoginButton`
3. Update `Callback.tsx` to import `getSafeReturnToFromState` from new provider
4. Update `AuthMode` type: `'local' | 'zitadel'` -> `'local' | 'keycloak'`
5. Update `AuthConfig` interface: rename `zitadel_authority` -> `keycloak_authority`
6. Update auth config cache integrity check in `config.ts`
7. Update component tests

**Acceptance Criteria:**
- [ ] Login page shows OIDC button in keycloak mode (same UX, different label)
- [ ] Callback page handles Keycloak authorization code exchange
- [ ] "Sign in with Zitadel" text removed everywhere
- [ ] AuthMode type no longer includes 'zitadel'
- [ ] All Login/Callback component tests pass

---

### 15.7 — Docker Compose & Keycloak Realm Setup

**Goal:** Replace Zitadel service with Keycloak in Docker Compose and provide realm initialization.

**Files to modify:**
- `docker-compose.yml` — Replace Zitadel service block with Keycloak
- New file: `keycloak/realm-honeybee.json` — Realm import with clients, roles, mappers

**Tasks:**
1. Remove `zitadel` and `zitadel-init` services from docker-compose.yml
2. Add `keycloak` service:
   ```yaml
   keycloak:
     image: quay.io/keycloak/keycloak:26.0
     profiles: ["saas"]
     environment:
       KEYCLOAK_ADMIN: ${KEYCLOAK_ADMIN:-admin}
       KEYCLOAK_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD}
       KC_DB: postgres
       KC_DB_URL: jdbc:postgresql://yugabytedb:5433/keycloak
       KC_DB_USERNAME: ${KEYCLOAK_DB_USER:-keycloak}
       KC_DB_PASSWORD: ${KEYCLOAK_DB_PASSWORD}
     command: start-dev --import-realm
     volumes:
       - ./keycloak:/opt/keycloak/data/import
     ports:
       - "8081:8080"
   ```
3. Create `keycloak/realm-honeybee.json` with:
   - Realm: `honeybee`
   - Client: `apis-dashboard` (public, PKCE S256, direct access grants disabled)
   - Roles: `admin`, `user`, `viewer`
   - Client scopes: `roles` with realm-roles mapper
   - Custom mappers: `org_id`, `org_name` (for Organizations)
   - Token lifetimes per PRD addendum Section 3.5
4. Update `scripts/init-yugabytedb.sh` to create `keycloak` database alongside `apis`

**Acceptance Criteria:**
- [ ] `docker compose --profile saas up` starts Keycloak (not Zitadel)
- [ ] Keycloak Admin Console accessible at `localhost:8081`
- [ ] `honeybee` realm created with correct client configuration
- [ ] PKCE S256 enforced on `apis-dashboard` client
- [ ] Direct Access Grants disabled
- [ ] `docker compose --profile standalone up` unchanged (no Keycloak)

---

### 15.8 — Environment Templates & CLAUDE.md

**Goal:** Update all environment templates and project instructions.

**Files to modify:**
- `.env.saas.example` — Replace `ZITADEL_*` with `KEYCLOAK_*`
- `CLAUDE.md` — Update auth references
- `apis-dashboard/vite.config.ts` — Update env var prefixes if referenced

**Tasks:**
1. Update `.env.saas.example`:
   - Remove: `ZITADEL_MASTERKEY`, `ZITADEL_ADMIN_PASSWORD`, `ZITADEL_ISSUER`, `ZITADEL_HOST_HEADER`
   - Add: `KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD`, `KEYCLOAK_ISSUER`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_DB_USER`, `KEYCLOAK_DB_PASSWORD`
2. Update `CLAUDE.md`:
   - Auth section: Replace all Zitadel references with Keycloak
   - Technology Stack table: `Auth` row -> `Local JWT / Keycloak OIDC`
   - Deployment Modes table: `Auth` column -> `local` / `keycloak`
   - Starting Each Mode section: Update SaaS description
   - Code Pattern section: Update example

**Acceptance Criteria:**
- [ ] No references to "zitadel" in `.env.saas.example`
- [ ] CLAUDE.md accurately describes Keycloak integration
- [ ] `.env.standalone.example` unchanged
- [ ] New developer can follow instructions to start SaaS mode with Keycloak

---

### 15.9 — Documentation & Architecture Updates

**Goal:** Update all project documentation to reflect Keycloak.

**Files to modify:**
- `_bmad-output/planning-artifacts/architecture.md` — Update auth sections, docker-compose, JWT claims
- `docs/DEPLOYMENT-MODES.md` — Update SaaS mode description
- `docs/INFRASTRUCTURE-INTEGRATION.md` — Update Keycloak integration points
- `docs/SECRETS-MANAGEMENT.md` — Update secret paths

**Tasks:**
1. Architecture doc: Update "Zitadel Integration" section to "Keycloak Integration"
2. Architecture doc: Update JWT claims structure example
3. Architecture doc: Update docker-compose service listing
4. Architecture doc: Replace "Zitadel over Keycloak" decision section with ADR (Architecture Decision Record) documenting the reversal — infrastructure standardization on SSIK/K3s drove the change, not a technical deficiency in Zitadel
5. Architecture doc: Update env vars table
6. Architecture doc: Update data model — rename `zitadel_user_id` column to `external_user_id` in users table schema, update `tenants` table comment from "Zitadel org_id" to "Keycloak org_id"
7. Update deployment modes doc
8. Update infrastructure integration doc (shared Keycloak instead of shared Zitadel)
9. Update secrets management doc (keycloak secret path)
10. Add migration SQL: `ALTER TABLE users RENAME COLUMN zitadel_user_id TO external_user_id;`

**Acceptance Criteria:**
- [ ] No references to "zitadel" in architecture doc (except ADR historical note)
- [ ] JWT claims example shows Keycloak format
- [ ] Docker-compose example shows Keycloak service
- [ ] Infrastructure integration points updated for Keycloak
- [ ] ADR documents Zitadel→Keycloak decision reversal with rationale
- [ ] `zitadel_user_id` column renamed to `external_user_id` in schema docs and migration

---

### 15.10 — CI Dual-Mode Test Verification

**Goal:** Verify all tests pass in both auth modes and clean up Zitadel test artifacts.

**Files to modify:**
- `apis-server/tests/auth_zitadel_test.go` — Rename to `auth_keycloak_test.go`, update test fixtures
- `apis-dashboard/tests/auth/DualModeAuth.test.tsx` — Update for keycloak mode
- Various test files that reference `zitadel` in test fixtures

**Tasks:**
1. Rename `auth_zitadel_test.go` to `auth_keycloak_test.go`
2. Update Go test fixtures to use Keycloak-format JWTs (realm_access.roles, org_id)
3. Update dashboard test mocks to return `mode: "keycloak"` from auth config
4. Run full Go test suite: `cd apis-server && go test ./...`
5. Run full dashboard test suite: `cd apis-dashboard && npx vitest run`
6. Verify `AUTH_MODE=local` tests pass unchanged
7. Verify `AUTH_MODE=keycloak` tests pass with new fixtures
8. Grep entire codebase for remaining "zitadel" references (should be zero in source, allowed in git history)
9. Verify auth endpoint latency (NFR-KC-02): confirm < 200ms p95 is not regressed by Keycloak JWKS validation path

**Acceptance Criteria:**
- [ ] `go test ./...` passes
- [ ] `npx vitest run` passes
- [ ] `go build ./...` and `go vet ./...` clean
- [ ] `npx tsc --noEmit` clean
- [ ] Zero "zitadel" references in source code (case-insensitive grep)
- [ ] Both auth modes tested in CI
- [ ] Auth endpoint latency < 200ms p95 (NFR-KC-02)

---

## FR Coverage Map

```
FR-KC-01  -> 15.1 (AUTH_MODE=keycloak)
FR-KC-02  -> 15.3 (Keycloak OIDC validation)
FR-KC-03  -> 15.3 (JWT validation with JWKS)
FR-KC-04  -> 15.3 (realm_access.roles extraction)
FR-KC-05  -> 15.4 (org_id tenant extraction)
FR-KC-06  -> 15.4 (Super-admin emails)
FR-KC-07  -> 15.5 (react-oidc-context)
FR-KC-08  -> 15.5 (Remove @zitadel/react)
FR-KC-09  -> 15.6 (Callback page)
FR-KC-10  -> 15.5 (Refresh tokens in memory)
FR-KC-11  -> 15.2 (Auth config endpoint)
FR-KC-12  -> 15.7 (Docker Compose)
FR-KC-13  -> 15.2 (Secrets GetKeycloakConfig)
FR-KC-14  -> 15.1, 15.8 (Env var naming)
FR-KC-15  -> All stories (Standalone unchanged)
FR-KC-16  -> N/A (Edge device - no changes)
FR-KC-17  -> 15.9 (Documentation)
NFR-KC-01 -> 15.3 (JWKS caching)
NFR-KC-02 -> 15.10 (Auth endpoint latency verification — carried forward from Epic 13)
NFR-KC-03 -> 15.10 (CI dual-mode)
NFR-KC-04 -> 15.7 (Direct Access Grants disabled)
NFR-KC-05 -> 15.7 (PKCE S256 enforced)
NFR-KC-06 -> 15.9 (Rename zitadel_user_id column to external_user_id)
```

---

## Dependency Graph

```
15.1 (Config & Env Vars)
  ├── 15.2 (Secrets & Auth Config Endpoint)
  ├── 15.3 (Auth Middleware)
  │     └── 15.4 (Tenant Middleware)
  └── 15.5 (Dashboard Auth Provider)
        └── 15.6 (Login & Callback)

15.7 (Docker Compose & Realm Setup) ← Independent, can be parallel with Phase 1

15.8 (Env Templates & CLAUDE.md) ← After 15.7
15.9 (Documentation) ← After 15.4 + 15.6
15.10 (CI Verification) ← After all stories
```

**Parallelism opportunities:**
- 15.7 can start immediately (infrastructure setup, no code dependencies)
- 15.2 and 15.3 can run in parallel after 15.1
- 15.5 can start as soon as 15.1 is done (frontend doesn't depend on backend middleware)
