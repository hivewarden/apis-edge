# Story 15.8: Environment Templates & CLAUDE.md

Status: ready-for-dev

## Story

As a developer or AI agent,
I want all environment templates and project instructions to reference Keycloak instead of Zitadel,
so that new contributors and LLMs have accurate instructions for setting up and understanding the APIS SaaS authentication stack.

## Context

This is Story 8 in Epic 15 (Keycloak Migration). It depends on Story 15.7 (Docker Compose & Keycloak Realm Setup) which has been completed. Story 15.7 replaced the Zitadel Docker services with Keycloak in docker-compose.yml. This story updates the environment templates and CLAUDE.md project instructions to match.

**Scope of changes:**
1. `.env.saas.example` -- Full overhaul: remove all Zitadel-specific env vars, add Keycloak equivalents
2. `.env.standalone.example` -- Minimal update: update comment references from Zitadel to Keycloak (lines 6, 108-109)
3. `CLAUDE.md` -- Update all Zitadel references to Keycloak across multiple sections
4. `apis-dashboard/vite.config.ts` -- Update vendor-auth chunk comment from `@zitadel/` to `oidc-client-ts` / `react-oidc-context`

**What is NOT in scope:**
- Docs folder updates (Story 15.9)
- Code changes to Go or React source files (Stories 15.1-15.6)
- Docker Compose changes (Story 15.7)

**FR coverage:** FR-KC-14 (env var naming), FR-KC-17 (documentation -- partial, CLAUDE.md only)

## Acceptance Criteria

1. **No Zitadel in .env.saas.example:** Zero references to "zitadel" or "Zitadel" remain (case-insensitive)
2. **Keycloak env vars present:** `.env.saas.example` contains `KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD`, `KEYCLOAK_ISSUER`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_DB_USER`, `KEYCLOAK_DB_PASSWORD`
3. **AUTH_MODE updated:** `.env.saas.example` sets `AUTH_MODE=keycloak`
4. **ZITADEL_MASTERKEY removed:** No masterkey env var (Keycloak does not need a separate encryption masterkey)
5. **ZITADEL_DB_PASSWORD replaced:** Replaced with `KEYCLOAK_DB_USER` and `KEYCLOAK_DB_PASSWORD`
6. **CLAUDE.md deployment modes table updated:** Auth column shows `keycloak` not `zitadel`
7. **CLAUDE.md technology stack updated:** Auth row shows `Local JWT / Keycloak OIDC`
8. **CLAUDE.md SaaS mode description updated:** References Keycloak instead of Zitadel
9. **CLAUDE.md key env vars table updated:** `AUTH_MODE` SaaS value is `keycloak`
10. **CLAUDE.md secrets section updated:** `GetZitadelConfig()` -> `GetKeycloakConfig()`, `secret/data/apis/zitadel` -> `secret/data/apis/keycloak`
11. **CLAUDE.md infrastructure section updated:** "Zitadel (shared)" -> "Keycloak (shared)", "Shared Zitadel or dedicated" -> "Shared Keycloak or dedicated"
12. **CLAUDE.md auth section updated:** Auth modes table, AI/LLM context comment, all references to Zitadel
13. **Standalone .env updated minimally:** `.env.standalone.example` updated only at lines referencing Zitadel (comment line 6, commented-out vars lines 108-109)
14. **vite.config.ts vendor chunk updated:** `@zitadel/` reference in manualChunks updated to match new auth library
15. **Production checklist updated:** `.env.saas.example` production checklist references Keycloak TLS and admin console security instead of Zitadel
16. **External services section updated:** `.env.saas.example` optional external services section references Keycloak instead of Zitadel

## Tasks / Subtasks

- [ ] **Task 1: Update .env.saas.example -- Deployment mode section** (AC: #3)
  - [ ] 1.1: Change header comment (line 6) from `Full stack with Zitadel (OIDC), OpenBao (secrets), optional BunkerWeb (WAF).` to `Full stack with Keycloak (OIDC), OpenBao (secrets), optional BunkerWeb (WAF).`
  - [ ] 1.2: Change AI/LLM context comment (line 21) from `multi-tenant isolation, OpenBao secrets, and Zitadel authentication.` to `multi-tenant isolation, OpenBao secrets, and Keycloak authentication.`
  - [ ] 1.3: Change `AUTH_MODE=zitadel` to `AUTH_MODE=keycloak` (line 24)

- [ ] **Task 2: Update .env.saas.example -- Database credentials section** (AC: #5)
  - [ ] 2.1: Replace the `ZITADEL_DB_PASSWORD` entry (line 51-52) with Keycloak database credentials:
    ```
    # Keycloak database credentials
    KEYCLOAK_DB_USER=keycloak
    KEYCLOAK_DB_PASSWORD=<generate-strong-password-here>
    ```

- [ ] **Task 3: Update .env.saas.example -- Replace Zitadel section with Keycloak** (AC: #1, #2, #4)
  - [ ] 3.1: Replace the entire Zitadel section (lines 72-91, from `# ZITADEL (Identity Provider)` through `DASHBOARD_ORIGIN`) with:
    ```
    # =============================================================================
    # KEYCLOAK (Identity Provider)
    # =============================================================================
    # AI/LLM Context: Keycloak provides OIDC authentication for SaaS mode.
    # Users authenticate via Keycloak, not local passwords.
    # The honeybee realm is auto-imported on first start from keycloak/realm-honeybee.json.

    # Keycloak admin credentials (for Admin Console at localhost:8081)
    KEYCLOAK_ADMIN=admin
    KEYCLOAK_ADMIN_PASSWORD=<initial-admin-password>

    # Keycloak OIDC issuer URL (change for production domain)
    KEYCLOAK_ISSUER=http://localhost:8081/realms/honeybee
    KEYCLOAK_CLIENT_ID=apis-dashboard

    # Dashboard OAuth redirect URIs (change for production domain)
    DASHBOARD_REDIRECT_URI=http://localhost:5173/callback
    DASHBOARD_POST_LOGOUT_URI=http://localhost:5173/login
    DASHBOARD_ORIGIN=http://localhost:5173
    ```
  - [ ] 3.2: Verify `ZITADEL_MASTERKEY` is removed entirely (Keycloak does not need an equivalent)
  - [ ] 3.3: Verify `ZITADEL_HOST_HEADER` is removed (Keycloak does not use this pattern)

- [ ] **Task 4: Update .env.saas.example -- Production checklist** (AC: #15)
  - [ ] 4.1: Replace Zitadel checklist items (lines 108-109):
    - `# [ ] Zitadel TLS enabled (--tlsMode external)` -> `# [ ] Keycloak TLS enabled (KC_HOSTNAME with HTTPS)`
    - `# [ ] Zitadel masterkey stored securely (not in env file)` -> `# [ ] Keycloak admin password changed from default`

- [ ] **Task 5: Update .env.saas.example -- External services section** (AC: #16)
  - [ ] 5.1: Replace the Zitadel external services block (lines 126-129):
    ```
    # External Keycloak:
    # KEYCLOAK_ISSUER=https://auth.example.com/realms/honeybee
    # KEYCLOAK_CLIENT_ID=apis-dashboard
    ```

- [ ] **Task 6: Update .env.standalone.example** (AC: #13)
  - [ ] 6.1: Update comment on line 6 from `# No external dependencies (no Zitadel, no OpenBao, no BunkerWeb).` to `# No external dependencies (no Keycloak, no OpenBao, no BunkerWeb).`
  - [ ] 6.2: Update the "IGNORE THESE" section (lines 108-109):
    ```
    # KEYCLOAK_ISSUER=
    # KEYCLOAK_CLIENT_ID=
    ```
    These replace the commented-out `ZITADEL_ISSUER` and `ZITADEL_CLIENT_ID`.

- [ ] **Task 7: Update CLAUDE.md -- Deployment Modes section** (AC: #6, #8, #9)
  - [ ] 7.1: In the deployment modes ASCII table (line 49), change `│ saas       │ Club hosting, SaaS     │ zitadel   │ openbao    │ true        │` to use `keycloak` in the Auth column
  - [ ] 7.2: In the "Starting Each Mode" section (line 60), change the SaaS comment from `# SaaS mode (full stack with Zitadel, OpenBao, BunkerWeb)` to `# SaaS mode (full stack with Keycloak, OpenBao, BunkerWeb)`
  - [ ] 7.3: In the "Key Environment Variables" table (line 70), change `AUTH_MODE` SaaS value from `zitadel` to `keycloak`

- [ ] **Task 8: Update CLAUDE.md -- Technology Stack table** (AC: #7)
  - [ ] 8.1: Change the Auth row (line 96) from `| Auth | Local JWT / Zitadel OIDC | Depends on AUTH_MODE |` to `| Auth | Local JWT / Keycloak OIDC | Depends on AUTH_MODE |`

- [ ] **Task 9: Update CLAUDE.md -- Secrets Management section** (AC: #10)
  - [ ] 9.1: In "Reading Secrets in Go" (line 204), change the comment from `// - GetZitadelConfig() - Zitadel settings for SaaS mode` to `// - GetKeycloakConfig() - Keycloak settings for SaaS mode`
  - [ ] 9.2: In "Secret paths in OpenBao" (line 233), change `- \`secret/data/apis/zitadel\` - Zitadel config` to `- \`secret/data/apis/keycloak\` - Keycloak config`

- [ ] **Task 10: Update CLAUDE.md -- Infrastructure section** (AC: #11)
  - [ ] 10.1: In "Key Infrastructure Details" (line 255), change `├── Zitadel (shared) - APIS can use same instance, separate project` to `├── Keycloak (shared) - APIS can use same instance, separate realm`
  - [ ] 10.2: In "APIS INTEGRATION POINTS" (line 263), change `├── Auth: Shared Zitadel or dedicated` to `├── Auth: Shared Keycloak or dedicated`

- [ ] **Task 11: Update CLAUDE.md -- Authentication section** (AC: #12)
  - [ ] 11.1: Update the AI/LLM context note (line 369) from `> Always check auth mode before assuming Zitadel/OIDC is available.` to `> Always check auth mode before assuming Keycloak/OIDC is available.`
  - [ ] 11.2: Update the Auth Modes table (line 376):
    - Change `| SaaS | \`zitadel\` | Zitadel OIDC | Zitadel handles sessions |` to `| SaaS | \`keycloak\` | Keycloak OIDC | Keycloak handles sessions |`

- [ ] **Task 12: Update apis-dashboard/vite.config.ts -- vendor-auth chunk** (AC: #14)
  - [ ] 12.1: In the `manualChunks` function (line 200-202), update the vendor-auth chunk detection:
    ```typescript
    // Vendor: Auth
    if (id.includes('node_modules/oidc-client-ts/') || id.includes('node_modules/react-oidc-context/')) {
      return 'vendor-auth';
    }
    ```
    This replaces the `@zitadel/` check since `@zitadel/react` has been removed in Story 15.5 and replaced with `react-oidc-context` + `oidc-client-ts`.

- [ ] **Task 13: Final verification** (AC: all)
  - [ ] 13.1: Grep `.env.saas.example` for "zitadel" (case-insensitive) -- expect zero matches
  - [ ] 13.2: Grep `.env.standalone.example` for "zitadel" (case-insensitive) -- expect zero matches
  - [ ] 13.3: Grep `CLAUDE.md` for "zitadel" (case-insensitive) -- expect zero matches
  - [ ] 13.4: Grep `apis-dashboard/vite.config.ts` for "zitadel" (case-insensitive) -- expect zero matches
  - [ ] 13.5: Verify `.env.saas.example` is a valid env file (no syntax errors, all keys present)
  - [ ] 13.6: Verify `CLAUDE.md` formatting is correct (no broken tables or code blocks)

## Dev Notes

### Architecture Compliance

**Dual-Mode Design (from CLAUDE.md):**
This story updates documentation and configuration templates only -- no runtime code changes. Both deployment modes must be accurately documented after changes.

**Files touched are all at the repository root** (or `apis-dashboard/` for vite.config.ts). No Go server code changes. No React component/page/hook changes.

### .env.saas.example Change Summary

| Old (Zitadel) | New (Keycloak) | Notes |
|---------------|----------------|-------|
| `AUTH_MODE=zitadel` | `AUTH_MODE=keycloak` | Core mode switch |
| `ZITADEL_DB_PASSWORD=...` | `KEYCLOAK_DB_USER=keycloak` | Keycloak has its own DB user |
| (none) | `KEYCLOAK_DB_PASSWORD=...` | New: DB password for keycloak role |
| `ZITADEL_MASTERKEY=...` | (removed) | Keycloak does not need external masterkey |
| `ZITADEL_ADMIN_PASSWORD=...` | `KEYCLOAK_ADMIN_PASSWORD=...` | Admin console login |
| (none) | `KEYCLOAK_ADMIN=admin` | New: Admin username (Zitadel used fixed email) |
| `ZITADEL_ISSUER=http://localhost:8080` | `KEYCLOAK_ISSUER=http://localhost:8081/realms/honeybee` | Port 8081, includes realm path |
| `ZITADEL_HOST_HEADER=localhost:8080` | (removed) | Keycloak does not use host header pattern |
| (none) | `KEYCLOAK_CLIENT_ID=apis-dashboard` | New: explicitly named client |

### CLAUDE.md Change Summary

Every Zitadel reference (11 occurrences total) must be updated:

| Line | Section | Old | New |
|------|---------|-----|-----|
| 49 | Deployment Modes table | `zitadel` | `keycloak` |
| 60 | Starting Each Mode | `Zitadel, OpenBao, BunkerWeb` | `Keycloak, OpenBao, BunkerWeb` |
| 70 | Key Environment Variables | `zitadel` | `keycloak` |
| 96 | Technology Stack | `Zitadel OIDC` | `Keycloak OIDC` |
| 204 | Reading Secrets | `GetZitadelConfig()` | `GetKeycloakConfig()` |
| 233 | Secret paths | `apis/zitadel` | `apis/keycloak` |
| 255 | Infrastructure Details | `Zitadel (shared)` | `Keycloak (shared)` |
| 263 | Integration Points | `Shared Zitadel` | `Shared Keycloak` |
| 369 | Auth context note | `Zitadel/OIDC` | `Keycloak/OIDC` |
| 376 | Auth Modes table | `zitadel` / `Zitadel OIDC` / `Zitadel handles sessions` | `keycloak` / `Keycloak OIDC` / `Keycloak handles sessions` |

### .env.standalone.example Change Summary

The epic says this file "should be unchanged" but it does contain 3 Zitadel references that should be updated for consistency:
- Line 6: Comment mentioning Zitadel in the header
- Lines 108-109: Commented-out Zitadel env vars in the "IGNORE THESE" section

These are cosmetic/documentation changes that do not affect standalone mode behavior at all. Updating them prevents confusion for developers who see stale Zitadel references.

### vite.config.ts Change Summary

The `manualChunks` function in `vite.config.ts` references `@zitadel/` for the vendor-auth chunk. Since Story 15.5 replaced `@zitadel/react` with `react-oidc-context` + `oidc-client-ts`, this chunk detection needs to match the new packages. Without this fix, the auth libraries would not be split into a separate chunk, potentially increasing the main bundle size.

### Keycloak Issuer URL Format

**Important difference from Zitadel:** Keycloak's OIDC issuer URL includes the realm path:
```
Zitadel:   http://localhost:8080
Keycloak:  http://localhost:8081/realms/honeybee
```

This is reflected in both `.env.saas.example` and in the infrastructure integration points. The `/realms/honeybee` suffix is part of the OIDC discovery URL (`{issuer}/.well-known/openid-configuration`).

### Port Change

Keycloak runs on port 8081 (mapped from internal 8080) to avoid conflicts. Zitadel used port 8080. This is reflected in the issuer URL and Admin Console URL.

### Files Modified

- `.env.saas.example` (replace Zitadel env vars with Keycloak equivalents)
- `.env.standalone.example` (update 3 Zitadel references in comments)
- `CLAUDE.md` (update 11 Zitadel references across multiple sections)
- `apis-dashboard/vite.config.ts` (update vendor-auth chunk detection)

### Files Created

None.

### Files Deleted

None.

### References

- [Source: .env.saas.example - Current file with Zitadel env vars]
- [Source: .env.standalone.example - Current file with minimal Zitadel references]
- [Source: CLAUDE.md - Project instructions with Zitadel references]
- [Source: apis-dashboard/vite.config.ts - Build config with @zitadel vendor chunk]
- [Source: _bmad-output/planning-artifacts/epic-15-keycloak-migration.md - Story 15.8 requirements]
- [Source: _bmad-output/implementation-artifacts/15-7-docker-compose-keycloak-realm.md - Predecessor story]

## Test Criteria

- [ ] `grep -i zitadel .env.saas.example` returns zero matches
- [ ] `grep -i zitadel .env.standalone.example` returns zero matches
- [ ] `grep -i zitadel CLAUDE.md` returns zero matches
- [ ] `grep -i zitadel apis-dashboard/vite.config.ts` returns zero matches
- [ ] `.env.saas.example` contains `AUTH_MODE=keycloak`
- [ ] `.env.saas.example` contains `KEYCLOAK_ADMIN=admin`
- [ ] `.env.saas.example` contains `KEYCLOAK_ADMIN_PASSWORD=`
- [ ] `.env.saas.example` contains `KEYCLOAK_ISSUER=http://localhost:8081/realms/honeybee`
- [ ] `.env.saas.example` contains `KEYCLOAK_CLIENT_ID=apis-dashboard`
- [ ] `.env.saas.example` contains `KEYCLOAK_DB_USER=keycloak`
- [ ] `.env.saas.example` contains `KEYCLOAK_DB_PASSWORD=`
- [ ] `.env.saas.example` does NOT contain `ZITADEL_MASTERKEY`
- [ ] `.env.saas.example` does NOT contain `ZITADEL_HOST_HEADER`
- [ ] `.env.standalone.example` contains `# No external dependencies (no Keycloak, no OpenBao, no BunkerWeb).`
- [ ] `.env.standalone.example` "IGNORE THESE" section references `KEYCLOAK_ISSUER` not `ZITADEL_ISSUER`
- [ ] `CLAUDE.md` Deployment Modes table Auth column says `keycloak`
- [ ] `CLAUDE.md` Technology Stack table Auth row says `Local JWT / Keycloak OIDC`
- [ ] `CLAUDE.md` Key Environment Variables table `AUTH_MODE` SaaS value is `keycloak`
- [ ] `CLAUDE.md` Starting Each Mode comment says "Keycloak, OpenBao, BunkerWeb"
- [ ] `CLAUDE.md` Secrets Reading section says `GetKeycloakConfig()`
- [ ] `CLAUDE.md` OpenBao secret paths say `secret/data/apis/keycloak`
- [ ] `CLAUDE.md` Infrastructure Details says "Keycloak (shared)"
- [ ] `CLAUDE.md` Auth Modes table says `keycloak` / `Keycloak OIDC` / `Keycloak handles sessions`
- [ ] `apis-dashboard/vite.config.ts` vendor-auth chunk matches `oidc-client-ts` and/or `react-oidc-context` (not `@zitadel/`)
- [ ] `CLAUDE.md` formatting is intact (no broken ASCII tables, no broken markdown tables, no broken code blocks)

## Change Log

- 2026-02-08: Story created for Epic 15 Keycloak Migration
