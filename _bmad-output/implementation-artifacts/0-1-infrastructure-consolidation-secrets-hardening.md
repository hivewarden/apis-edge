# Story 0-1: Infrastructure Consolidation & Secrets Hardening

Status: in progress

## Story

As an **operator**,
I want the infrastructure properly configured for production readiness,
So that we have a simplified stack with proper secrets management.

## Acceptance Criteria

### AC1: YugabyteDB Version Verified
**Given** the docker-compose configuration
**When** I check the YugabyteDB version
**Then** it is 2.21.1 or higher (required for Zitadel compatibility)

### AC2: Zitadel Database Configuration *(Amended)*
**Given** YugabyteDB 2.21.1+ is running
**When** Zitadel starts
**Then** Zitadel runs with a documented database configuration
**And** if YugabyteDB direct connection is not possible, the reason is documented
**And** a clear migration path is noted for future YugabyteDB support

*Amendment Note: Original AC required removing zitadel-db. Investigation revealed YugabyteDB has stored procedure compatibility issues with Zitadel (see [discussion #8840](https://github.com/zitadel/zitadel/discussions/8840)). zitadel-db is intentionally kept until Zitadel improves YugabyteDB support.*

### AC3: SOPS Encryption Activated
**Given** the secrets management setup
**When** I check the SOPS configuration
**Then** a real age key is configured (not placeholder)
**And** `secrets/secrets.enc.yaml` exists with encrypted values

### AC4: OpenBao Unsealing Documented
**Given** production deployment needs
**When** I review the documentation
**Then** there is a clear procedure for:
- Switching OpenBao to production (sealed) mode
- Storing unsealer keys in SOPS
- Unsealing OpenBao on startup

### AC5: Full Stack Verification
**Given** all changes are applied
**When** I run `docker compose up`
**Then** all services start successfully
**And** health endpoint returns OK
**And** authentication flow works end-to-end

## Tasks / Subtasks

- [x] **Task 1: YugabyteDB Version** (AC: 1) ✅
  - [x] 1.1: Check current YugabyteDB image version
  - [x] 1.2: Pin to 2024.2.7.2-b1 (LTS) - exceeds 2.21.1 requirement
  - [x] 1.3: Verify startup and health

- [x] **Task 2: Zitadel + YugabyteDB Integration** (AC: 2) ⚠️ PARTIAL
  - [x] 2.1: Check current Zitadel image version - pinned to v4.9.2
  - [x] 2.2: Attempted YugabyteDB direct connection
  - [x] 2.3: **KEPT zitadel-db** - YugabyteDB has stored procedure compatibility issues
  - [x] 2.4: Zitadel starts successfully on dedicated PostgreSQL
  - **Note:** YugabyteDB direct integration blocked by SQL error: `return type mismatch in function declared to return eventstore.events2`. See https://github.com/zitadel/zitadel/discussions/8840

- [x] **Task 3: SOPS Activation** (AC: 3) ✅
  - [x] 3.1: Used existing age key pair from ~/.config/sops/age/keys.txt
  - [x] 3.2: Updated `.sops.yaml` with real public key
  - [x] 3.3: Created and encrypted `secrets/secrets.enc.yaml`
  - [x] 3.4: Key stored in standard location (not in repo)

- [x] **Task 4: OpenBao Production Documentation** (AC: 4) ✅
  - [x] 4.1: Documented production mode configuration in docs/SECRETS-MANAGEMENT.md
  - [x] 4.2: Documented unsealer key generation and SOPS storage
  - [x] 4.3: Created `scripts/unseal-openbao.sh` template

- [x] **Task 5: Full Stack Verification** (AC: 5) ⚠️ PARTIAL
  - [x] 5.1: Run `docker compose down -v` (clean slate)
  - [x] 5.2: Run `docker compose up --build` - Fixed Go 1.24 version in Dockerfile
  - [x] 5.3: Database migrations run successfully (added pgcrypto extension)
  - [x] 5.4: Bootstrap Zitadel client id automatically (docker-compose `zitadel-bootstrap`)
  - [x] 5.5: Verify services + health endpoints (`scripts/verify-epic-0.sh`)
  - [ ] 5.6: Manual: Login via Zitadel and call a protected endpoint (`GET /api/me`)
  - **Note:** Auth flow is no longer blocked by missing `ZITADEL_CLIENT_ID`; it now requires a manual browser login to fully validate end-to-end behavior.

## Dev Notes

### Background

This story was identified during the Epic 1 retrospective (2026-01-22). Two infrastructure gaps were discovered:

1. **SOPS/OpenBao**: The secrets management infrastructure was scaffolded in Story 1-1 but never activated. SOPS has a placeholder age key, and OpenBao runs in dev mode only.

2. **Zitadel/YugabyteDB**: A separate PostgreSQL container (`zitadel-db`) was added as a workaround because Zitadel had compatibility issues with YugabyteDB. However, Zitadel releases from Dec 2025+ support YugabyteDB 2.21.1+ directly.

### Architecture References

**From CLAUDE.md - Secrets Management:**
- OpenBao (Vault-compatible) for secrets
- SOPS + age for encrypted local files
- Easy swap to external OpenBao via environment variables

**YugabyteDB Compatibility:**
- Zitadel requires YugabyteDB 2.21.1+ for full PostgreSQL compatibility
- Earlier versions have subtle SQL incompatibilities

### Files Likely to Change

- `docker-compose.yml` - Remove zitadel-db, update versions
- `.sops.yaml` - Replace placeholder age key
- `secrets/secrets.enc.yaml` - NEW: Encrypted secrets file
- `scripts/unseal-openbao.sh` - NEW: Unsealing template
- `docs/SECRETS-MANAGEMENT.md` - NEW: Production secrets documentation

### Testing Requirements

- Full docker compose stack must start cleanly
- Health endpoint returns 200 OK
- Zitadel login flow works
- Tenant isolation (RLS) still functions
- All existing tests pass

### Common Pitfalls to Avoid

1. **Don't commit the age private key** - Only public key goes in `.sops.yaml`
2. **Don't forget to test auth flow** - Zitadel DB change could break sessions
3. **Don't skip the clean slate test** - Use `docker compose down -v` before verification
4. **Don't remove zitadel-db until Zitadel works with YugabyteDB** - Verify first

### References

- [Source: Epic 1 Retrospective - Gap identified by Jermoo]
- [Source: architecture.md - Secrets Management section]
- [Source: CLAUDE.md - Secrets Management section]
- [YugabyteDB Release Notes - 2.21.1+]
- [Zitadel Changelog - Dec 2025 release]

## Dev Agent Record

### Implementation Summary

**Date:** 2026-01-22
**Agent:** Claude (dev-story workflow)

### Changes Made

1. **docker-compose.yml**
   - Pinned YugabyteDB to `2024.2.7.2-b1` (LTS, exceeds 2.21.1 requirement)
   - Pinned Zitadel to `v4.9.2`
   - Added `yugabytedb-init` service to create databases before other services start
   - Updated apis-server to depend on `yugabytedb-init` (service_completed_successfully)
   - **Kept zitadel-db PostgreSQL** due to YugabyteDB stored procedure compatibility issues
   - Added `zitadel_db_data` volume back

2. **scripts/init-yugabytedb.sh** (NEW)
   - Creates `zitadel` and `apis` databases
   - Creates `zitadel_user` with SUPERUSER privileges
   - Enables `pgcrypto` extension for `gen_random_uuid()`

3. **scripts/unseal-openbao.sh** (NEW)
   - Template script for unsealing OpenBao using SOPS-encrypted keys
   - Decrypts keys from SOPS and applies them to unseal OpenBao

4. **docs/SECRETS-MANAGEMENT.md** (NEW)
   - Comprehensive secrets management documentation
   - Local dev, team dev, and production deployment procedures
   - OpenBao production mode setup and unsealing
   - Security best practices

5. **.sops.yaml**
   - Updated with real age public key: `age1ddsze7ed9ux78zgn2jnx066ugc6kzp23hvh6e0z2kxkrag2qsy9sja68hc`

6. **secrets/secrets.enc.yaml** (NEW)
   - SOPS-encrypted development secrets
   - Contains database and Zitadel credentials

7. **apis-server/Dockerfile**
   - Updated Go version from 1.22 to 1.24 (required by go.mod)

8. **.env.example**
   - Updated comment to clarify Zitadel uses dedicated PostgreSQL

### Known Issues

1. **Zitadel + YugabyteDB Direct Integration**
   - Error: `return type mismatch in function declared to return eventstore.events2`
   - Root cause: YugabyteDB stored procedure compatibility gap
   - Workaround: Keep dedicated PostgreSQL for Zitadel
   - Tracking: https://github.com/zitadel/zitadel/discussions/8840

2. **End-to-end auth still needs manual runtime verification**
   - The stack now bootstraps the OIDC client id automatically for local dev
   - Manual check: open the dashboard, log in, and confirm `GET /api/me` succeeds

### Verification Results

| Component | Status | Notes |
|-----------|--------|-------|
| YugabyteDB | ✅ Healthy | Version 2024.2.7.2-b1 |
| OpenBao | ✅ Healthy | Dev mode with apis-dev-token |
| Zitadel-db | ✅ Healthy | PostgreSQL 16 |
| Zitadel | ✅ Running | v4.9.2, OIDC endpoints registered |
| DB Migrations | ✅ Pass | 23 migrations applied |
| apis-server | ✅ Healthy | Starts without manual Zitadel steps (client id auto-generated for local dev) |
| apis-dashboard | ✅ Healthy | Vite dev server reachable on 5173 |

## Change Log

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-22 | Claude (dev-story) | Implemented Tasks 1-5, documented YugabyteDB compatibility issues |
| 2026-01-22 | Epic 1 Retrospective | Story created to address infrastructure gaps |
| 2026-01-26 | Codex (GPT-5.2) | Automated Zitadel bootstrap, wired OpenBao secrets, hardened Yugabyte init, and added `scripts/verify-epic-0.sh` |
