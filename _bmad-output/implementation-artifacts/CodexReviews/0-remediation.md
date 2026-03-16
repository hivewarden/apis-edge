# Epic 0 Remediation Report

**Epic:** 0  
**Date:** 2026-01-26  
**Scope:** `_bmad-output/implementation-artifacts/0-1-infrastructure-consolidation-secrets-hardening.md` + supporting infra/code/docs.

## 1) Plan

- Read `0-summary.md` + `0-1-*-review.md` and prioritize Critical/High items first.
- Make the local stack bootstrappable without manual Zitadel console steps.
- Wire APIS runtime config to OpenBao (with deterministic env fallback).
- Remove unnecessary privileged DB initialization (least-privilege roles).
- Add repeatable verification (script + smoke checks) and update story tracking.
- Re-run the Epic 0 code review and overwrite the review artifacts.

## 2) Fix Log (mapped to review IDs)

**Item:** `F1`  
- Status: **Fixed**  
- Files changed: `docker-compose.yml`, `scripts/bootstrap-zitadel.mjs`, `.env.example`, `apis-server/cmd/server/main.go`, `apis-server/internal/middleware/auth.go`, `apis-server/internal/handlers/health.go`  
- What changed:
  - Added a deterministic local Zitadel bootstrap (`zitadel-bootstrap`) that creates the OIDC app and writes `/bootstrap/zitadel.env` with `ZITADEL_CLIENT_ID` + `VITE_ZITADEL_CLIENT_ID`.
  - Gated `apis-server`/`apis-dashboard` startup on bootstrap completion and source `/bootstrap/zitadel.env` at container start.
  - Made the server able to fetch discovery/JWKS from an internal URL while still validating tokens against the public issuer (Host-header handling for Zitadel).
  - Ensured `/api/health` responds to `HEAD` so compose healthchecks work.
- Verification:
  - `docker compose --env-file .env.example up -d --build`
  - `docker compose --env-file .env.example ps` (all services healthy)
  - `curl -sf http://localhost:3000/api/auth/config` returns a non-empty `client_id`
  - `scripts/verify-epic-0.sh` (passes)

**Item:** `F2`  
- Status: **Fixed**  
- Files changed: `apis-server/internal/secrets/secrets.go`, `apis-server/internal/secrets/secrets_test.go`, `apis-server/internal/storage/postgres.go`, `docker-compose.yml`, `scripts/bootstrap-openbao.sh`, `docs/SECRETS-MANAGEMENT.md`, `docs/INFRASTRUCTURE-INTEGRATION.md`  
- What changed:
  - `apis-server` now prefers OpenBao (`SECRETS_SOURCE=openbao`) for DB config and deterministically falls back to env vars if OpenBao is unavailable.
  - Added a one-shot `openbao-bootstrap` service to seed default dev secrets so `docker compose up` is bootstrappable.
  - Updated docs to match actual runtime wiring and removed incorrect “client_id=apis-dashboard” guidance.
- Verification:
  - `go test ./internal/secrets ./internal/storage ./internal/middleware` (pass)
  - `curl -s -o /dev/null -w '%{http_code}\\n' -H 'X-Vault-Token: apis-dev-token' http://localhost:8200/v1/secret/data/apis/database` → `200`

**Item:** `F3`  
- Status: **Fixed**  
- Files changed: `scripts/init-yugabytedb.sh`, `docker-compose.yml`, `.env.example`, `scripts/bootstrap-openbao.sh`  
- What changed:
  - Removed unused/hard-coded SUPERUSER creation and instead create a least-privileged `apis` role + `apis` DB owned by it.
  - Aligned DB credentials used by Yugabyte init, OpenBao bootstrap defaults, and server fallback env vars via `APIS_DB_USER/APIS_DB_PASSWORD`.
- Verification:
  - `docker exec -e PGPASSWORD=yugabyte apis-yugabytedb ysqlsh -h yugabytedb -U yugabyte -d yugabyte -c '\\du'` (confirms `apis` is not SUPERUSER; no unused superusers created)
  - `docker exec -e PGPASSWORD=yugabyte apis-yugabytedb ysqlsh -h yugabytedb -U yugabyte -d yugabyte -c '\\l apis'` (confirms `apis` DB owner is `apis`)

**Item:** `E05`  
- Status: **Fixed**  
- Files changed: `docs/INFRASTRUCTURE-INTEGRATION.md`  
- What changed:
  - Added an explicit “Future: Migrating Zitadel to YugabyteDB” plan with validation + rollback steps.
- Verification:
  - Documentation review (no runtime validation possible until Zitadel/Yugabyte compatibility improves).

**Item:** `E06`  
- Status: **Partially fixed**  
- Files changed: `docker-compose.yml`, `docs/SECRETS-MANAGEMENT.md`  
- What changed:
  - Pinned the OpenBao image tag (no `:latest` in compose; docs now also avoid `:latest` in the production snippet).
- Verification:
  - `docker compose --env-file .env.example ps` shows `openbao` healthy.
- Deferred part:
  - No sealed-mode compose profile/override file was added (docs describe the procedure; compose remains dev-mode by default).

**Item:** `E07`  
- Status: **Fixed**  
- Files changed: `scripts/verify-epic-0.sh`  
- What changed:
  - Added a repeatable verification script that checks container health + key endpoints and fails fast with actionable output.
- Verification:
  - `scripts/verify-epic-0.sh` (passes against local stack).

**Item:** `E08`  
- Status: **Fixed**  
- Files changed: `_bmad-output/implementation-artifacts/0-1-infrastructure-consolidation-secrets-hardening.md`  
- What changed:
  - Updated status + verification notes to reflect the resolved bootstrap path and remaining manual auth verification.
- Verification:
  - Story file review.

## 3) Verification Summary

- **Commands/tests executed**
  - `docker compose --env-file .env.example up -d --build`
  - `docker compose --env-file .env.example ps`
  - `scripts/verify-epic-0.sh`
  - `go test ./internal/secrets ./internal/storage ./internal/middleware` (pass)
  - `go test ./...` (fails in other packages unrelated to Epic 0 remediation)
- **Commands/tests not executed (and why)**
  - Fully automated end-to-end login (`apis-dashboard` → Zitadel → `GET /api/me`): requires an interactive browser flow (still documented as a manual step).
- **Runtime checks performed**
  - `curl -sf http://localhost:3000/api/health`
  - `curl -sf http://localhost:3000/api/auth/config`
  - `curl -sf http://localhost:8200/v1/sys/health`

## 4) Remaining Work

- `AC5` (auth flow): manually log in via `http://localhost:5173` and confirm `GET /api/me` succeeds with a real token.
- `E06` (sealed OpenBao): add a production-mode compose override/profile for sealed mode + persistent storage (docs exist; automation is still missing).
- Tighten local bootstrap perms: `zitadel-bootstrap-init` currently uses `chmod 777` on the shared bootstrap volume for reliability; consider a narrower `chown/chmod` strategy.

## 5) Meta Analysis: Improving `AI_EPIC_REMEDIATION_PROMPT.md`

- Add a **“Runtime verification checklist”** section that explicitly asks the remediator to validate container healthchecks (not just “service started”) and to record the exact commands run.
- Require a **“No-secrets output”** pass: scan scripts/docs for token/secret echoes and replace with placeholders (e.g., `\$OPENBAO_TOKEN`), even in “example commands”.
- Add a small **“infra gotchas”** rubric: YAML tabs, healthcheck `HEAD` vs `GET`, IPv6 `localhost` issues in containers, and Host-header quirks for IdPs behind internal hostnames.
- Encourage a **verification script** by default for infra-heavy epics (even if severity is Low), because it raises confidence and reduces future review churn.
- For single-story epics, allow a **smaller backlog** target automatically (e.g., 5–8 items) to reduce filler items.

