# APIS Repo-Wide Security Acceptance Criteria

**Last Updated:** 2026-02-15
**Scope:** Entire repository (`apis-server`, `apis-dashboard`, `apis-edge`, `docker-compose`/infrastructure)

## Objective
Define a single, testable security Definition of Done for this repository so releases can be accepted or rejected with clear criteria.

## Release Gate Levels
- **P0 (production blocker):** Must be complete before production release.
- **P1 (pre-production blocker):** Must be complete before go-live approval.
- **P2/P3 (hardening backlog):** Can be scheduled, but only with explicit risk acceptance.

## Acceptance Criteria

### AC-1: No Open Critical/High Findings for Production
- [ ] `remediation-tracker.yaml` contains **zero** findings with `status: open` where `severity` is `critical` or `high`.
- [ ] `remediation-tracker.yaml` contains **zero** findings with `status: in_progress` where `severity` is `critical` or `high`.
- [ ] Any exception is documented as `accepted_risk` with business owner, expiry date, and compensating controls.

Evidence:
- `yq -r '.findings[] | select((.status=="open" or .status=="in_progress") and (.severity=="critical" or .severity=="high")) | [.id,.component,.severity,.status,.title] | @tsv' _security-audit/remediation-tracker.yaml`
- Command output is empty.

### AC-2: Transport Security Is Enforced End-to-End
- [ ] Edge-to-server communication uses TLS in production.
- [ ] Edge validates server certificate chain and performs pinning/CA trust verification.
- [ ] Server-to-database connections use TLS (`sslmode=verify-full` or equivalent strict mode).
- [ ] No production endpoint allows fallback to cleartext protocols for sensitive operations.

Evidence:
- Config review for production manifests.
- Integration test proving TLS required and invalid certs are rejected.

### AC-3: Secrets Are Not Exposed via Environment Defaults
- [ ] No hardcoded production credentials in `docker-compose` or deployment manifests.
- [ ] Secrets are mounted via Docker/Kubernetes secrets or secret manager references.
- [ ] OpenBao runs in production mode (not dev mode) with unseal process documented.
- [ ] Zitadel master key is file-based secret, not plain env var.

Evidence:
- Security review of runtime manifests.
- Secret source documented in deployment runbook.

### AC-4: Production Auth Bypass Paths Are Disabled
- [ ] Production deploy path rejects/blocks `DISABLE_AUTH=true` and `VITE_DEV_MODE=true`.
- [ ] Startup checks fail closed if bypass flags are enabled in production.
- [ ] Auth mode and security-critical env flags are audited at startup with safe logging.

Evidence:
- Runtime startup logs.
- Automated deployment validation for forbidden flags.

### AC-5: Multi-Tenant Access Controls Are Verifiable
- [ ] Tenant isolation tests pass for all tenant-scoped read/write operations.
- [ ] Sensitive queries include explicit tenant filters or documented RLS-only rationale.
- [ ] Cross-tenant access regression tests exist for storage and handler layers.

Evidence:
- Test suite reports.
- Code review checklist completed for tenant-aware data access.

### AC-6: Edge Safety Controls Include Software and Hardware Safeguards
- [ ] All laser activation paths route through safety layer APIs.
- [ ] Emergency stop and safe-mode checks are enforced for arm/trigger flows.
- [ ] Hardware watchdog/kill path exists to force laser GPIO off on lockup/failure.

Evidence:
- Firmware integration tests.
- Hardware-in-the-loop test logs for watchdog behavior.

### AC-7: CI Has Security Gates (Not Only Functional Tests)
- [ ] CI runs static security analysis for Go and C/firmware code.
- [ ] CI runs dependency vulnerability scanning for Go and npm lockfiles.
- [ ] CI runs secret scanning against committed code/config.
- [ ] CI fails build on new Critical/High findings.

Evidence:
- `.github/workflows` includes security jobs.
- PR status checks enforce security jobs as required checks.

### AC-8: Accepted Risks Are Time-Boxed and Owned
- [ ] Every `accepted_risk` entry has owner, rationale, review date, and expiry date.
- [ ] Expired accepted risks automatically re-open as `open` until re-approved.
- [ ] Accepted risks include compensating controls and monitoring requirements.

Evidence:
- Tracker metadata for accepted risks.
- Risk review cadence documented (e.g., monthly security review).

## Current Baseline (as of 2026-02-15)

### Open Findings
- `DB-003-1` (server, critical, p0): Database SSL disabled.
- `COMM-001-1` (edge, critical, p0): No TLS for credential/data transmission.
- `COMM-001-3` (edge, critical, p0): No certificate pinning/validation.
- `CONFIG-002-6` (infra, critical, p0): Zitadel masterkey exposed in env var.
- `CONFIG-002-1` (infra, critical, p0): Hardcoded DB credentials.
- `CONFIG-001-3` (infra, critical, p0): OpenBao in dev mode.
- `SAFETY-001-4` (edge, high, p1): No hardware watchdog for laser GPIO.
- `CONFIG-001-4` (infra, high, p1): Zitadel TLS disabled.
- `CONFIG-002-5` (infra, high, p1): OpenBao token passed in env.
- `AUTH-002-F4` (server, medium, p2): Impersonation session lacks origin IP tracking.
- `AUTH-002-F6` (server, medium, p2): Horizontal access control relies solely on RLS.
- `CONFIG-001-7` (infra, medium, p2): Dev volume mount exposes full source.

### Accepted Risks
- `AUTH-002-F1` (server, high, p1): Role re-validation not performed per request.
- `DB-002-F6` (server, medium, p3): Admin functions bypass RLS by design.
- `DB-002-F2` (server, info, p3): Some tables without RLS by design.
- `PWA-001-1` (dashboard, medium, p2): IndexedDB encryption deferred.

## Exit Criteria for "Security Complete"
A release is considered security-acceptable only when:
- All AC-1 through AC-8 are satisfied.
- P0 and P1 items are closed or explicitly accepted by security and product owners.
- CI enforces security gates with blocking status checks.
- Evidence artifacts are attached to the release decision.
