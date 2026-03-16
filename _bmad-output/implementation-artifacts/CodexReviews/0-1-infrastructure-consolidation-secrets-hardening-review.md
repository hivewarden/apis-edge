# Code Review: Story 0-1 Infrastructure Consolidation & Secrets Hardening

**Review Date:** 2026-01-26  
**Reviewer:** Codex (GPT-5.2)  
**Story File:** `_bmad-output/implementation-artifacts/0-1-infrastructure-consolidation-secrets-hardening.md`

## Story Verdict

- **Score:** 7.5 / 10
- **Verdict:** **CONCERNS**
- **Rationale:** The stack is now bootstrappable (Zitadel app + OpenBao seeding) and DB init is least-privileged, but end-to-end auth still needs a manual runtime check.

---

## Acceptance Criteria Verification

| AC | Status | Evidence | Notes |
|---|---|---|---|
| AC1: YugabyteDB Version Verified | Implemented | `docker-compose.yml:5` `image: yugabytedb/yugabyte:2024.2.7.2-b1` | Tag is pinned; version can be confirmed via `SELECT version()` if needed. |
| AC2: Zitadel Database Configuration *(Amended)* | Implemented | `docker-compose.yml:50-52` “Keeping separate PostgreSQL… compatibility issues” + `docs/INFRASTRUCTURE-INTEGRATION.md:137-154` “intended migration path” | Migration is documented with validation/rollback; actual Yugabyte migration still depends on upstream compatibility. |
| AC3: SOPS Encryption Activated | Implemented | `.sops.yaml:21-23` `age: ... age1ddsze7...` + `secrets/secrets.enc.yaml:21-23` `sops: age: recipient: ...` | Encrypted secrets file exists and is SOPS-formatted. |
| AC4: OpenBao Unsealing Documented | Implemented | `docs/SECRETS-MANAGEMENT.md:121-122` “must run in sealed mode” + `docs/SECRETS-MANAGEMENT.md:206-211` “./scripts/unseal-openbao.sh” | Procedure is documented; sealed-mode automation is not enabled by default in compose. |
| AC5: Full Stack Verification | Partial | `docker-compose.yml:126-127` “creates the APIS OIDC application…” + `docker-compose.yml:185-203` `depends_on: zitadel-bootstrap` + `scripts/verify-epic-0.sh:53-69` “checks… Manual auth verification” | Stack startup + health checks are repeatable; OIDC login + `GET /api/me` still needs manual browser verification. |

---

## Findings

**F1: End-to-end auth verification is still manual**  
- Severity: Medium  
- Category: Testing / Reliability  
- Evidence: `scripts/verify-epic-0.sh:66-69` `Manual auth verification (still required): ... Confirm ... /api/me`  
- Why it matters: Auth regressions (OIDC redirect/JWKS/claims) can slip in even if containers are “healthy”.  
- Recommended fix: Add a headless E2E auth smoke test (e.g., Playwright) that logs in and calls `GET /api/me`.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given the stack is running, when the E2E test runs, then it completes a Zitadel login and gets a token.
  - AC2: Given a valid token, when the test calls `GET /api/me`, then it returns `200` with a non-empty user id/org id.
  - Tests/Verification: add CI step `npm test:e2e` (or similar) and document local run steps.  
- “Out of scope?”: no

**F2: `zitadel-bootstrap-init` makes the bootstrap volume world-writable (`chmod 777`)**  
- Severity: Low  
- Category: Security / Reliability  
- Evidence: `docker-compose.yml:77` `entrypoint: ["/bin/sh", "-c", "chmod 777 /bootstrap"]`  
- Why it matters: It’s acceptable for local dev, but it’s an avoidable permission foot-gun and makes later productionization harder.  
- Recommended fix: Replace `chmod 777` with a tighter `chown`/`chmod` for the specific UID/GID used by Zitadel (or use a dedicated init image that matches Zitadel’s UID).  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given a fresh volume, when the stack starts, then Zitadel can write the PAT/env files without `chmod 777`.
  - AC2: Given the bootstrap volume, when inspected, then permissions are not world-writable.  
  - Tests/Verification: `docker compose down -v && docker compose up -d` and `docker exec ... ls -ld /bootstrap`.  
- “Out of scope?”: no (low effort, improves hygiene)

**F3: OpenBao runs in dev mode by default (no production-mode compose automation)**  
- Severity: Medium  
- Category: Security / Docs  
- Evidence: `docker-compose.yml:257` `command: server -dev -dev-root-token-id=...`  
- Why it matters: “Secrets hardening” is a production-readiness epic; relying on dev-mode defaults invites accidental insecure deployments.  
- Recommended fix: Provide a `docker-compose.openbao.prod.yml` (or similar) that runs OpenBao sealed with persistent storage and document how to enable it.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given production mode is enabled, when OpenBao starts, then it is sealed and uses persistent storage.
  - AC2: Given a restart, when OpenBao comes back up, then it remains sealed until unsealed via documented procedure.
  - Tests/Verification: `docker compose -f docker-compose.yml -f docker-compose.openbao.prod.yml up -d openbao` and `curl -sf http://localhost:8200/v1/sys/health`.  
- “Out of scope?”: no (but should be kept optional for local dev)

---

## Story Score Breakdown (0–2 each)

- **AC completeness:** 1.5 / 2 (AC5 still needs runtime auth verification)
- **Correctness / edge cases:** 1.5 / 2 (bootstrap + JWKS/discovery wiring is solid; migration is doc-only)
- **Security / privacy / secrets:** 1.5 / 2 (least-priv DB role + OpenBao wiring; dev-mode defaults remain)
- **Testing / verification:** 1.5 / 2 (unit tests + smoke script; missing automated auth E2E)
- **Maintainability / clarity / docs:** 1.5 / 2 (docs updated; a few infra hardening follow-ups remain)

## What I Could Not Verify (story-specific)

- Actual browser login via Zitadel and a successful `GET /api/me` call (requires an interactive auth flow).
- The future “Zitadel → YugabyteDB” migration (depends on upstream compatibility; docs exist but are untested).
