# Epic 0 Code Review Summary

**Review Date:** 2026-01-26  
**Reviewer:** Codex (GPT-5.2)  
**Epic:** 0

## Executive Summary

- **Overall verdict:** **CONCERNS**
- **Overall score:** 7.5 / 10
- **Per-epic scores + verdicts:**
  - **Epic 0:** 7.5 / 10 — **CONCERNS**
- **Top 5 cross-cutting risks (ranked):**
  1. **Auth flow is still not automatically verified** (`scripts/verify-epic-0.sh:66-69` “Manual auth verification…”).
  2. **Bootstrap volume is world-writable** (`docker-compose.yml:77` `chmod 777 /bootstrap`).
  3. **OpenBao is dev-mode by default** (`docker-compose.yml:257` `server -dev -dev-root-token-id=...`).
  4. **Zitadel→Yugabyte migration is doc-only** (`docs/INFRASTRUCTURE-INTEGRATION.md:141-154` “intended migration path…”).
  5. **Dev defaults include hard-coded dev credentials** (`.env.example:21-24` `OPENBAO_TOKEN=apis-dev-token` + `.env.example:48-49` `ZITADEL_ADMIN_PASSWORD=Admin123!`).
- **Remediation priorities:**
  - **Do first:** Add an automated E2E auth smoke test.
  - **Do next:** Provide a sealed-mode OpenBao compose override and tighten bootstrap perms.
  - **Nice-to-have:** Make Zitadel bootstrap idempotent and reduce operator foot-guns.

| Epic | Story | Title | Score (0–10) | Verdict | Critical | High | Med | Low |
|-----:|------:|-------|-------------:|--------|---------:|-----:|----:|----:|
| 0 | 0-1 | Infrastructure Consolidation & Secrets Hardening | 7.5 | CONCERNS | 0 | 0 | 2 | 1 |

**What I Could Not Verify (and why)**  
- Browser-based auth flow: a real login via Zitadel and a successful `GET /api/me` call (requires interactive credentials/session).  
- Actual YugabyteDB backend for Zitadel (blocked by upstream compatibility; docs exist but are untested).  

---

## Epic-Level “AI Fix Backlog”

### E01 — Medium — Add an automated end-to-end auth smoke test
- **Applies to stories:** 0-1
- **Files likely touched:** `apis-dashboard/`, `apis-server/`, `docs/`, CI config (if present)
- **Fix Acceptance Criteria:**
  - **Given** the stack is running **When** the E2E test runs **Then** it completes a login and obtains an access token.
  - **Given** a valid token **When** the test calls `GET /api/me` **Then** it returns `200` with non-empty `user_id` and `org_id`.
- **Verification steps:** run the E2E test locally and in CI; keep a manual fallback runbook.

### E02 — Medium — Provide sealed-mode OpenBao compose override (keep dev mode default)
- **Applies to stories:** 0-1
- **Files likely touched:** `docker-compose.openbao.prod.yml` (new), `docs/SECRETS-MANAGEMENT.md`
- **Fix Acceptance Criteria:**
  - **Given** prod override is enabled **When** OpenBao starts **Then** it uses persistent storage and is sealed on boot (non-dev).
  - **Given** a restart **When** OpenBao comes up **Then** it remains sealed until unsealed via documented procedure.
- **Verification steps:** `docker compose -f docker-compose.yml -f docker-compose.openbao.prod.yml up -d openbao` and `curl -sf http://localhost:8200/v1/sys/health`.

### E03 — Low — Tighten bootstrap volume permissions (avoid `chmod 777`)
- **Applies to stories:** 0-1
- **Files likely touched:** `docker-compose.yml`
- **Fix Acceptance Criteria:**
  - **Given** a fresh volume **When** the stack starts **Then** Zitadel can write the bootstrap outputs without world-writable permissions.
  - **Given** the bootstrap volume **When** inspected **Then** permissions are not `777`.
- **Verification steps:** `docker compose down -v && docker compose up -d` and inspect `/bootstrap` perms.

### E04 — Low — Make Zitadel bootstrap idempotent (avoid creating duplicate projects/apps)
- **Applies to stories:** 0-1
- **Files likely touched:** `scripts/bootstrap-zitadel.mjs`
- **Fix Acceptance Criteria:**
  - **Given** a running stack **When** `zitadel-bootstrap` runs repeatedly **Then** it reuses the existing project/app and does not create duplicates.
  - **Given** the env file exists **When** it already contains client ids **Then** bootstrap exits without mutating state.
- **Verification steps:** delete/re-run and confirm only one project/app exists in Zitadel.

### E05 — Low — Document safe rotation for dev tokens/credentials
- **Applies to stories:** 0-1
- **Files likely touched:** `.env.example`, `docs/SECRETS-MANAGEMENT.md`, `scripts/bootstrap-openbao.sh`
- **Fix Acceptance Criteria:**
  - **Given** a developer wants to rotate local dev tokens **When** they follow docs **Then** they can rotate without leaking secrets in logs or committing plaintext.
- **Verification steps:** doc review + dry-run on a fresh `docker compose down -v`.
