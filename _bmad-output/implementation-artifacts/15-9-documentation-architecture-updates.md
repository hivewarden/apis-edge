# Story 15.9: Documentation & Architecture Updates

Status: ready-for-dev

## Story

As a developer or AI agent,
I want all project documentation to reference Keycloak instead of Zitadel, and the database column `zitadel_user_id` renamed to `external_user_id`,
so that the codebase is fully consistent with the Keycloak migration and future-proofed for any IdP changes.

## Context

This is Story 9 in Epic 15 (Keycloak Migration). It depends on Stories 15.4 (Tenant Middleware) and 15.6 (Login & Callback), both completed. The architecture doc (`architecture.md`) was partially updated in a previous v3.1 pass -- the main auth sections already reference Keycloak. This story completes the documentation sweep across `docs/` files and performs the `zitadel_user_id` -> `external_user_id` database column rename plus the corresponding Go code refactor.

**Scope of changes:**
1. `docs/DEPLOYMENT-MODES.md` -- Replace all Zitadel references with Keycloak (10 occurrences)
2. `docs/INFRASTRUCTURE-INTEGRATION.md` -- Replace all Zitadel references with Keycloak (25+ occurrences), remove obsolete "Migrating Zitadel to YugabyteDB" section, rewrite "Shared vs Dedicated" section for Keycloak
3. `docs/SECRETS-MANAGEMENT.md` -- Replace 1 Zitadel reference with Keycloak
4. `_bmad-output/planning-artifacts/architecture.md` -- Verify Zitadel references are only in historical/ADR sections (already mostly done in v3.1)
5. New migration: `apis-server/internal/storage/migrations/0036_rename_zitadel_user_id.sql` -- Rename column, update indexes, update table comment
6. `apis-server/internal/storage/users.go` -- Rename `ZitadelUserID` field to `ExternalUserID`, rename `GetUserByZitadelID()` to `GetUserByExternalID()`, update all SQL references from `zitadel_user_id` to `external_user_id`
7. All Go files referencing `ZitadelUserID` or `GetUserByZitadelID` -- Update to new names
8. Go test files referencing the old names -- Update to match

**What is NOT in scope:**
- CLAUDE.md updates (completed in Story 15.8)
- `.env.*.example` updates (completed in Story 15.8)
- Docker Compose changes (completed in Story 15.7)
- React/dashboard code changes (no dashboard files reference `zitadel_user_id`)

**FR coverage:** FR-KC-17 (documentation), NFR-KC-06 (rename `zitadel_user_id` to `external_user_id`)

## Acceptance Criteria

1. **No Zitadel in DEPLOYMENT-MODES.md:** Zero references to "zitadel" or "Zitadel" remain (case-insensitive)
2. **No Zitadel in INFRASTRUCTURE-INTEGRATION.md:** Zero references to "zitadel" or "Zitadel" remain (case-insensitive)
3. **No Zitadel in SECRETS-MANAGEMENT.md:** Zero references to "zitadel" or "Zitadel" remain (case-insensitive)
4. **Architecture doc Zitadel references only in historical sections:** The only remaining "zitadel" references in `architecture.md` are in the ADR decision reversal note (line ~2358) and the v3.0 changelog entry (line ~2494). All other sections reference Keycloak.
5. **Migration file exists:** `apis-server/internal/storage/migrations/0036_rename_zitadel_user_id.sql` renames the column and updates indexes
6. **Go struct field renamed:** `storage.User.ZitadelUserID` renamed to `storage.User.ExternalUserID` with JSON tag `external_user_id`
7. **Go function renamed:** `storage.GetUserByZitadelID()` renamed to `storage.GetUserByExternalID()`
8. **All SQL queries updated:** All references to `zitadel_user_id` in Go source files updated to `external_user_id`
9. **All callers updated:** Every Go file that references `ZitadelUserID` or `GetUserByZitadelID` is updated to use the new names
10. **Go server builds clean:** `go build ./...` and `go vet ./...` pass with zero errors
11. **DEPLOYMENT-MODES.md SaaS stack shows Keycloak:** The SaaS stack diagram shows `keycloak` instead of `zitadel`
12. **DEPLOYMENT-MODES.md Auth mode is keycloak:** Auth mode table shows `keycloak` not `zitadel`
13. **INFRASTRUCTURE-INTEGRATION.md shared IdP is Keycloak:** The "Shared vs Dedicated" section describes Keycloak realms, not Zitadel projects
14. **INFRASTRUCTURE-INTEGRATION.md obsolete section removed:** The "Future: Migrating Zitadel to YugabyteDB" section is removed (no longer relevant -- Keycloak uses its own PostgreSQL via CloudNativePG)
15. **SECRETS-MANAGEMENT.md production example updated:** The production example command references Keycloak, not Zitadel

## Tasks / Subtasks

- [ ] **Task 1: Update docs/DEPLOYMENT-MODES.md** (AC: #1, #11, #12)
  - [ ] 1.1: In "What's NOT Included" section (line 36), change `- Zitadel (OIDC provider) - replaced by local auth` to `- Keycloak (OIDC provider) - replaced by local auth`
  - [ ] 1.2: In the SaaS Stack diagram (line 82), change `│  zitadel          (OIDC identity provider)      │` to `│  keycloak         (OIDC identity provider)      │`
  - [ ] 1.3: In the SaaS Secrets path section (line 96), change `├── zitadel         # Zitadel client secrets` to `├── keycloak        # Keycloak client secrets`
  - [ ] 1.4: In the Security Model (SaaS) section (line 102), change `- **Auth**: Zitadel OIDC with MFA support` to `- **Auth**: Keycloak OIDC with MFA support`
  - [ ] 1.5: In the Environment Variables table (line 117), change `| \`AUTH_MODE\` | \`local\` | \`zitadel\` |` to `| \`AUTH_MODE\` | \`local\` | \`keycloak\` |`
  - [ ] 1.6: In the Docker Compose Profiles section (line 148-149), change `zitadel:` and `profiles: ["saas"]  # SaaS only` to `keycloak:` with the same profile
  - [ ] 1.7: In the SaaS Deployment Checklist (line 182), change `- [ ] Zitadel configured with real TLS certificates` to `- [ ] Keycloak configured with real TLS certificates`
  - [ ] 1.8: In the "Configure Zitadel users" upgrade section (lines 216-218), replace:
    ```
    5. **Configure Keycloak users**
       - Create Keycloak realm for APIS
       - Migrate local users to Keycloak accounts
    ```

- [ ] **Task 2: Update docs/INFRASTRUCTURE-INTEGRATION.md** (AC: #2, #13, #14)
  - [ ] 2.1: In the architecture diagram (line 25), change `│  │  - Zitadel      │` to `│  │  - Keycloak     │`
  - [ ] 2.2: In the Secret Path Convention section (lines 54-59), replace:
    ```
    │   └── apis/          # APIS application secrets (THIS APP)
    │       ├── database   # APIS-specific DB credentials
    │       ├── keycloak   # Keycloak OIDC config (SaaS mode)
    │       └── api        # APIS server config
    ```
    Remove the `rtp/zitadel` reference as well -- RTP secrets are not APIS's concern.
  - [ ] 2.3: Replace the entire "Zitadel OIDC (non-secret config)" comment block (lines 78-81) with:
    ```bash
    # Keycloak OIDC (non-secret config)
    # OIDC client ID is configured in the Keycloak honeybee realm.
    # - Local dev: auto-imported from keycloak/realm-honeybee.json (docker compose)
    # - Shared infra: create the client once in Keycloak and set KEYCLOAK_ISSUER + KEYCLOAK_CLIENT_ID
    ```
  - [ ] 2.4: Replace the entire "Shared vs Dedicated Zitadel" section (lines 115-135) with a "Shared vs Dedicated Keycloak" section:
    ```markdown
    ## Shared vs Dedicated Keycloak

    Two options:

    ### Option A: Shared Keycloak (Recommended for simplicity)

    - APIS uses a dedicated realm (`honeybee`) in the shared Keycloak instance
    - Users can SSO between applications via the shared Keycloak
    - Managed by Keycloak Operator in K3s (SSIK infrastructure)

    ```yaml
    # In APIS .env
    KEYCLOAK_ISSUER=https://auth.yourdomain.com/realms/honeybee
    KEYCLOAK_CLIENT_ID=apis-dashboard
    ```

    ### Option B: Dedicated Keycloak

    - APIS runs its own Keycloak instance
    - Complete isolation
    - More infrastructure to manage
    ```
  - [ ] 2.5: Remove the entire "Future: Migrating Zitadel to YugabyteDB" section (lines 137-155). This is no longer relevant -- Keycloak uses PostgreSQL (managed by CloudNativePG operator in production, or docker-compose locally). No YugabyteDB compatibility concern.
  - [ ] 2.6: In the Network Phase 1-2 diagram (line 190), change `├── Zitadel` to `├── Keycloak`
  - [ ] 2.7: In the Integration Checklist (line 253), change `- [ ] Zitadel project/client configured (if using shared Zitadel)` to `- [ ] Keycloak realm/client configured (if using shared Keycloak)`
  - [ ] 2.8: In the Quick Start section (line 272), change `docker compose stop yugabytedb zitadel openbao` to `docker compose stop yugabytedb keycloak openbao`

- [ ] **Task 3: Update docs/SECRETS-MANAGEMENT.md** (AC: #3, #15)
  - [ ] 3.1: In the Production Option A section (line 116), change `docker compose up apis-server apis-dashboard yugabytedb zitadel` to `docker compose up apis-server apis-dashboard yugabytedb keycloak`

- [ ] **Task 4: Verify architecture.md Zitadel references** (AC: #4)
  - [ ] 4.1: Run `grep -in zitadel _bmad-output/planning-artifacts/architecture.md` and verify that ALL matches are in:
    - The ADR historical note (line ~2358): "The original architecture...selected Zitadel..."
    - The "replaces `@zitadel/react`" note (line ~619) -- historical context
    - The "replaces Zitadel's JWT profile auth" note (line ~621) -- historical context
    - The v3.0 changelog entry (line ~2494): "Zitadel OIDC"
    - The v3.1 changelog entry (line ~2493): describes what was replaced
  - [ ] 4.2: Confirm no Zitadel references exist in non-historical sections (auth flow, JWT claims, data model, etc.)

- [ ] **Task 5: Create migration SQL** (AC: #5)
  - [ ] 5.1: Create `apis-server/internal/storage/migrations/0036_rename_zitadel_user_id.sql`:
    ```sql
    -- Migration: 0036_rename_zitadel_user_id.sql
    -- Rename zitadel_user_id column to external_user_id.
    -- This is a non-destructive rename as part of the Keycloak migration (Epic 15).
    -- The column stores the OIDC "sub" claim from whichever external IdP is configured.

    -- 1. Rename the column
    DO $$
    BEGIN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = 'zitadel_user_id'
        ) AND NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = 'external_user_id'
        ) THEN
            ALTER TABLE users RENAME COLUMN zitadel_user_id TO external_user_id;
        END IF;
    END $$;

    -- 2. Drop old partial unique index and recreate with new column name
    DROP INDEX IF EXISTS idx_users_zitadel_user_id_unique;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_external_user_id_unique
        ON users(external_user_id) WHERE external_user_id IS NOT NULL;

    -- 3. Update table comment
    COMMENT ON TABLE users IS 'User accounts supporting both local authentication (password_hash) and external OIDC mode (external_user_id). In local mode, external_user_id is NULL. In SaaS/Keycloak mode, password_hash is NULL.';

    -- 4. Update column comment
    COMMENT ON COLUMN users.external_user_id IS 'OIDC sub claim from external identity provider (Keycloak). NULL for local auth users.';
    ```

- [ ] **Task 6: Rename Go struct field and function** (AC: #6, #7, #8)
  - [ ] 6.1: In `apis-server/internal/storage/users.go`:
    - Rename `ZitadelUserID` field to `ExternalUserID` in the `User` struct
    - Change JSON tag from `zitadel_user_id` to `external_user_id`
    - Update the comment from "Zitadel-synced" to "external OIDC-synced"
    - Rename `GetUserByZitadelID()` to `GetUserByExternalID()`
    - Update all function comments and doc strings
    - Replace all SQL column references from `zitadel_user_id` to `external_user_id` in every function:
      - `GetUserByExternalID()` (formerly `GetUserByZitadelID`)
      - `GetUserByID()`
      - `CreateUser()`
      - `GetUserByEmail()`
      - `ListUsersByTenant()`
      - `CreateLocalUser()`
      - `GetUserByEmailWithPassword()`
      - `CreateFirstAdminAtomic()`
      - `CreateLocalUserWithMustChange()`
      - `GetUserByIDFull()`
      - `ListUsersByTenantFull()`
      - `UpdateUser()`

- [ ] **Task 7: Update all callers of renamed symbols** (AC: #9)
  - [ ] 7.1: Update `apis-server/internal/services/provisioning.go`:
    - Line 54: `storage.GetUserByZitadelID(...)` -> `storage.GetUserByExternalID(...)`
    - Line 81: `ZitadelUserID: claims.UserID` -> `ExternalUserID: claims.UserID`
  - [ ] 7.2: Update `apis-server/internal/handlers/me.go`:
    - Line 65: `user.ZitadelUserID` -> `user.ExternalUserID`
  - [ ] 7.3: Update `apis-server/internal/storage/invite_tokens.go`:
    - Line 280: SQL `zitadel_user_id` -> `external_user_id` in INSERT statement
  - [ ] 7.4: Update `apis-server/internal/middleware/tenant_test.go`:
    - Line 27: `ZitadelUserID:` -> `ExternalUserID:`
    - Line 39: `expectedUser.ZitadelUserID` -> `expectedUser.ExternalUserID` and update comment about deferral
  - [ ] 7.5: Update `apis-server/tests/middleware/tenant_test.go`:
    - Line 97: `ZitadelUserID:` -> `ExternalUserID:`
  - [ ] 7.6: Update `apis-server/internal/handlers/me_test.go`:
    - Line 27: `ZitadelUserID:` -> `ExternalUserID:`
  - [ ] 7.7: Update `apis-server/internal/services/provisioning_test.go`:
    - Line 41: SQL `zitadel_user_id` -> `external_user_id` in cleanup query
    - Line 61: `user.ZitadelUserID` -> `user.ExternalUserID`
    - Line 152: SQL `zitadel_user_id` -> `external_user_id` in cleanup query
  - [ ] 7.8: Update `apis-server/tests/storage/migrations_dual_auth_test.go`:
    - All references to `zitadel_user_id` in SQL strings -> `external_user_id`
    - All assertion messages mentioning `zitadel_user_id` -> `external_user_id`
    - Index name references: `idx_users_zitadel_user_id_unique` -> `idx_users_external_user_id_unique`

- [ ] **Task 8: Build verification** (AC: #10)
  - [ ] 8.1: Run `cd apis-server && go build ./...` -- expect zero errors
  - [ ] 8.2: Run `cd apis-server && go vet ./...` -- expect zero warnings
  - [ ] 8.3: Run `grep -rni 'ZitadelUserID\|GetUserByZitadelID\|zitadel_user_id' apis-server/internal/ apis-server/tests/` -- expect matches only in migration files (0001, 0023) which are historical

- [ ] **Task 9: Final documentation verification** (AC: #1, #2, #3, #4)
  - [ ] 9.1: `grep -i zitadel docs/DEPLOYMENT-MODES.md` -- expect zero matches
  - [ ] 9.2: `grep -i zitadel docs/INFRASTRUCTURE-INTEGRATION.md` -- expect zero matches
  - [ ] 9.3: `grep -i zitadel docs/SECRETS-MANAGEMENT.md` -- expect zero matches
  - [ ] 9.4: Verify `architecture.md` Zitadel references are only in ADR/changelog (Task 4)

## Dev Notes

### Architecture Compliance

**Dual-Mode Design (from CLAUDE.md):**
This story modifies documentation and performs a database column rename. Both deployment modes continue to work identically. The `external_user_id` column name is intentionally IdP-agnostic so it works whether `AUTH_MODE=keycloak` or any future IdP.

**Migration Safety:**
The `ALTER TABLE RENAME COLUMN` is a metadata-only operation in PostgreSQL/YugabyteDB -- it does not rewrite the table. The migration is idempotent (checks for column existence before renaming). Indexes are dropped and recreated with new names.

### docs/DEPLOYMENT-MODES.md Change Summary

| Line | Section | Old | New |
|------|---------|-----|-----|
| 36 | What's NOT Included | `Zitadel (OIDC provider)` | `Keycloak (OIDC provider)` |
| 82 | SaaS Stack diagram | `zitadel` | `keycloak` |
| 96 | Secrets paths | `zitadel` / `Zitadel client secrets` | `keycloak` / `Keycloak client secrets` |
| 102 | Security Model | `Zitadel OIDC` | `Keycloak OIDC` |
| 117 | Env vars table | `zitadel` | `keycloak` |
| 148-149 | Docker Compose profiles | `zitadel:` | `keycloak:` |
| 182 | SaaS checklist | `Zitadel configured` | `Keycloak configured` |
| 216-218 | Upgrade path | `Configure Zitadel users` | `Configure Keycloak users` |

### docs/INFRASTRUCTURE-INTEGRATION.md Change Summary

Major restructuring needed:
- Architecture diagram: `Zitadel` -> `Keycloak`
- Secret path convention: `zitadel` -> `keycloak`
- "Shared vs Dedicated Zitadel" section rewritten for Keycloak (realms instead of projects)
- "Future: Migrating Zitadel to YugabyteDB" section removed entirely (not applicable to Keycloak)
- Network diagrams: `Zitadel` -> `Keycloak`
- Checklist: `Zitadel` -> `Keycloak`
- Quick start: `zitadel` -> `keycloak` in docker compose commands

### docs/SECRETS-MANAGEMENT.md Change Summary

Single change: production example docker compose command replaces `zitadel` with `keycloak`.

### Go Code Rename Summary

| File | Old Symbol | New Symbol |
|------|-----------|------------|
| `storage/users.go` | `User.ZitadelUserID` | `User.ExternalUserID` |
| `storage/users.go` | `GetUserByZitadelID()` | `GetUserByExternalID()` |
| `storage/users.go` | SQL `zitadel_user_id` (30+ refs) | SQL `external_user_id` |
| `services/provisioning.go` | `storage.GetUserByZitadelID()` | `storage.GetUserByExternalID()` |
| `services/provisioning.go` | `ZitadelUserID: claims.UserID` | `ExternalUserID: claims.UserID` |
| `handlers/me.go` | `user.ZitadelUserID` | `user.ExternalUserID` |
| `storage/invite_tokens.go` | SQL `zitadel_user_id` | SQL `external_user_id` |
| `middleware/tenant_test.go` | `ZitadelUserID:` | `ExternalUserID:` |
| `tests/middleware/tenant_test.go` | `ZitadelUserID:` | `ExternalUserID:` |
| `handlers/me_test.go` | `ZitadelUserID:` | `ExternalUserID:` |
| `services/provisioning_test.go` | `ZitadelUserID` / SQL refs | `ExternalUserID` / SQL refs |
| `tests/storage/migrations_dual_auth_test.go` | SQL `zitadel_user_id` | SQL `external_user_id` |

### Migration files NOT modified

The following migration files contain historical references to `zitadel_user_id` and should NOT be modified:
- `0001_tenants_users.sql` -- Original migration that created the column
- `0023_dual_auth_users.sql` -- Migration that made the column nullable

Modifying historical migrations would break idempotency for databases that have already applied them. The new migration `0036_rename_zitadel_user_id.sql` handles the rename.

### Files Modified

- `docs/DEPLOYMENT-MODES.md` (replace 10 Zitadel references with Keycloak)
- `docs/INFRASTRUCTURE-INTEGRATION.md` (major overhaul: 25+ Zitadel references, remove obsolete section)
- `docs/SECRETS-MANAGEMENT.md` (replace 1 Zitadel reference)
- `apis-server/internal/storage/users.go` (rename field, function, update SQL)
- `apis-server/internal/services/provisioning.go` (update caller)
- `apis-server/internal/handlers/me.go` (update field reference)
- `apis-server/internal/storage/invite_tokens.go` (update SQL)
- `apis-server/internal/middleware/tenant_test.go` (update test fixture)
- `apis-server/tests/middleware/tenant_test.go` (update test fixture)
- `apis-server/internal/handlers/me_test.go` (update test fixture)
- `apis-server/internal/services/provisioning_test.go` (update test fixtures and SQL)
- `apis-server/tests/storage/migrations_dual_auth_test.go` (update test SQL and assertions)

### Files Created

- `apis-server/internal/storage/migrations/0036_rename_zitadel_user_id.sql`

### Files Deleted

None.

### References

- [Source: docs/DEPLOYMENT-MODES.md - Current file with 10 Zitadel references]
- [Source: docs/INFRASTRUCTURE-INTEGRATION.md - Current file with 25+ Zitadel references]
- [Source: docs/SECRETS-MANAGEMENT.md - Current file with 1 Zitadel reference]
- [Source: _bmad-output/planning-artifacts/architecture.md - Already updated in v3.1, verify only]
- [Source: apis-server/internal/storage/users.go - Contains ZitadelUserID field and GetUserByZitadelID function]
- [Source: _bmad-output/planning-artifacts/epic-15-keycloak-migration.md - Story 15.9 requirements]
- [Source: _bmad-output/implementation-artifacts/15-8-environment-templates-claudemd.md - Predecessor story]

## Test Criteria

- [ ] `grep -i zitadel docs/DEPLOYMENT-MODES.md` returns zero matches
- [ ] `grep -i zitadel docs/INFRASTRUCTURE-INTEGRATION.md` returns zero matches
- [ ] `grep -i zitadel docs/SECRETS-MANAGEMENT.md` returns zero matches
- [ ] `grep -in zitadel _bmad-output/planning-artifacts/architecture.md` returns matches only in ADR/changelog lines (~619, ~621, ~2358, ~2493, ~2494)
- [ ] `docs/DEPLOYMENT-MODES.md` SaaS Stack diagram shows `keycloak` not `zitadel`
- [ ] `docs/DEPLOYMENT-MODES.md` Auth mode table shows `keycloak` not `zitadel`
- [ ] `docs/DEPLOYMENT-MODES.md` Docker Compose profiles show `keycloak:` not `zitadel:`
- [ ] `docs/INFRASTRUCTURE-INTEGRATION.md` has "Shared vs Dedicated Keycloak" section
- [ ] `docs/INFRASTRUCTURE-INTEGRATION.md` does NOT have "Future: Migrating Zitadel to YugabyteDB" section
- [ ] `docs/INFRASTRUCTURE-INTEGRATION.md` architecture diagram shows `Keycloak` not `Zitadel`
- [ ] `docs/INFRASTRUCTURE-INTEGRATION.md` secret path shows `keycloak` not `zitadel`
- [ ] `docs/SECRETS-MANAGEMENT.md` production example references `keycloak` not `zitadel`
- [ ] Migration file `0036_rename_zitadel_user_id.sql` exists and is syntactically valid
- [ ] Migration is idempotent (checks column existence before renaming)
- [ ] Migration recreates the partial unique index with new name `idx_users_external_user_id_unique`
- [ ] `storage.User` struct field is `ExternalUserID` with JSON tag `external_user_id`
- [ ] `storage.GetUserByExternalID()` function exists and `GetUserByZitadelID()` does not
- [ ] All SQL in `apis-server/internal/` references `external_user_id` not `zitadel_user_id` (except historical migrations 0001, 0023)
- [ ] `cd apis-server && go build ./...` succeeds with zero errors
- [ ] `cd apis-server && go vet ./...` succeeds with zero warnings
- [ ] `grep -rn 'ZitadelUserID\|GetUserByZitadelID' apis-server/internal/ apis-server/tests/` returns zero matches (excluding migration SQL files)
- [ ] Historical migration files `0001_tenants_users.sql` and `0023_dual_auth_users.sql` are NOT modified

## Change Log

- 2026-02-08: Story created for Epic 15 Keycloak Migration
