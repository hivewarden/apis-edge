# Code Review: Story 1.1 Project Scaffolding & Docker Compose

**Review Date:** 2026-01-26  
**Reviewer:** Codex (GPT-5.2)  
**Story File:** `_bmad-output/implementation-artifacts/1-1-project-scaffolding-docker-compose.md`

## Story Verdict

- **Score:** 6.5 / 10
- **Verdict:** **CONCERNS**
- **Rationale:** The repo structure and compose wiring exist, but “fresh clone → `docker compose up`” is not fully deterministic because Zitadel requires unset env vars (no defaults) (`docker-compose.yml:89` `ZITADEL_MASTERKEY=${ZITADEL_MASTERKEY}`) while `.env` is gitignored (`.gitignore:2` `.env`).

---

## Acceptance Criteria Verification

| AC | Status | Evidence | Notes |
|---|---|---|---|
| AC1: Docker Compose orchestrates all services | Needs runtime verification | `docker-compose.yml:9` `"5433:5433"` + `docker-compose.yml:87` `"8080:8080"` + `docker-compose.yml:160` `"3000:3000"` + `docker-compose.yml:220` `"5173:5173"` | Ports and services are defined, but stack bootstrappability depends on env setup for Zitadel (`docker-compose.yml:89` `ZITADEL_MASTERKEY=...`, `docker-compose.yml:108` `...PASSWORD=${ZITADEL_ADMIN_PASSWORD}`). |
| AC2: Health endpoint works | Implemented | `apis-server/cmd/server/main.go:138` `"/api/health"` + `apis-server/internal/handlers/health.go:26-29` `type HealthResponse struct { Data ... }` + `apis-server/internal/handlers/health.go:111-114` `Status: status, Version: ... Checks: ...` | Response is a superset of the original “status ok” and follows CLAUDE-style `{ "data": ... }` wrapping. |
| AC3: Repository structure follows CLAUDE.md | Implemented | `apis-server/cmd/server/main.go:1` `package main` + `apis-dashboard/src/App.tsx:52` `function App()` + `docker-compose.yml:1` `services:` | Directory layout matches the documented monorepo structure. |

---

## Findings

**F1: “Fresh clone → docker compose up” is not deterministic (required env vars + docs mismatch)**  
- Severity: High  
- Category: Reliability / Docs  
- Evidence: `docs/SECRETS-MANAGEMENT.md:47-48` `docker compose up` + `docker-compose.yml:89` `ZITADEL_MASTERKEY=${ZITADEL_MASTERKEY}` + `.gitignore:2` `.env`  
- Why it matters: A foundational “it boots” story must be reproducible. Requiring unstated secrets/env setup turns AC1 into tribal knowledge and causes onboarding friction.  
- Recommended fix: Provide a deterministic bootstrap path. Options: (a) add safe dev defaults in compose for Zitadel secrets, (b) add a `scripts/setup-dev-env.sh` that creates `.env` from `.env.example` (and generates random values), and (c) update docs to explicitly require the step.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given a fresh clone with no `.env`, when I run `docker compose up --build`, then the stack starts (or prints a single actionable error telling me exactly what to generate/run).
  - AC2: Given defaults are used, when `docker compose config` is rendered, then required Zitadel/OpenBao/Yugabyte envs are non-empty for local dev.
  - Tests/Verification: `cp .env.example .env && docker compose up --build`; optionally add a `scripts/verify-epic-1.sh` smoke script.  
- “Out of scope?”: no

**F2: Zitadel has no healthcheck; bootstrap depends only on “service_started” (race-prone)**  
- Severity: Medium  
- Category: Reliability  
- Evidence: `docker-compose.yml:82-88` `zitadel: ... ports: ...` (no `healthcheck`) + `docker-compose.yml:146-148` `condition: service_started`  
- Why it matters: `zitadel-bootstrap` can run before Zitadel is ready to serve management/discovery endpoints, leading to flaky starts and “works on my machine” behavior.  
- Recommended fix: Add a Zitadel healthcheck (e.g., HTTP GET `/.well-known/openid-configuration`) and change `zitadel-bootstrap.depends_on.zitadel.condition` to `service_healthy`.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given `docker compose up`, when `zitadel-bootstrap` runs, then Zitadel is already healthy and bootstrap is repeatable.
  - AC2: Given Zitadel is unhealthy, when compose is starting, then `zitadel-bootstrap` waits rather than failing immediately.
  - Tests/Verification: `docker compose up --build` twice in a row; confirm `apis-zitadel-bootstrap` succeeds both times.  
- “Out of scope?”: no

**F3: `.env.example` ships fixed dev credentials (easy to accidentally reuse unsafely)**  
- Severity: Low  
- Category: Security / Docs  
- Evidence: `.env.example:48-49` `ZITADEL_MASTERKEY=...` + `ZITADEL_ADMIN_PASSWORD=...`  
- Why it matters: Example values tend to leak into real deployments; fixed secrets increase the blast radius if someone runs “dev compose” outside localhost.  
- Recommended fix: Keep `.env.example` but add a generator path (script or documented one-liner) that produces random values and clearly labels fixed values as “DO NOT USE outside localhost”.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given local dev, when I bootstrap env, then Zitadel masterkey/admin password are randomly generated (or explicitly confirmed by the user).
  - AC2: Given someone uses the defaults, when docs are read, then the risk is clearly stated next to the variables.
  - Tests/Verification: run the generator; confirm `.env` differs from `.env.example`.  
- “Out of scope?”: no

---

## Story Score Breakdown (0–2 each)

- **AC completeness:** 1.5 / 2 (compose wiring exists but end-to-end boot is not fully deterministic without explicit env bootstrap; `docker-compose.yml:89` `ZITADEL_MASTERKEY=...`)  
- **Correctness / edge cases:** 1.5 / 2 (good depends_on usage, but Zitadel bootstrap is race-prone without a healthcheck; `docker-compose.yml:146-148` `service_started`)  
- **Security / privacy / secrets:** 1.5 / 2 (images pinned and server runs as non-root, but dev secrets ergonomics could be safer; `.env.example:48-49`)  
- **Testing / verification:** 1.0 / 2 (no automated “compose boots” verification; only manual scripts exist elsewhere)  
- **Maintainability / clarity / docs:** 1.0 / 2 (docs say “no configuration needed” but compose requires env; `docs/SECRETS-MANAGEMENT.md:47-48`)  

## What I Could Not Verify (story-specific)

- `docker compose up --build` on a truly fresh clone (no `.env`) starting all services and reaching steady-state health within 60 seconds (requires running Docker locally with enough resources).  
- Actual service reachability from the host (ports 5433/8080/3000/5173) beyond the static compose configuration (`docker-compose.yml:9`, `docker-compose.yml:87`, `docker-compose.yml:160`, `docker-compose.yml:220`).  

