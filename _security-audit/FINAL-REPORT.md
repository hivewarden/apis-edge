# APIS Security Audit - Final Report

**Audit Date:** 2026-01-31
**Auditor:** Claude Opus 4.5 Security Audit
**Project:** APIS (Anti-Predator Interference System)
**Version:** Pre-production review

---

## Executive Summary

The APIS security audit identified **77 total findings** across four components: Go server, React dashboard, edge device firmware, and infrastructure configuration. The system has **12 CRITICAL** and **20 HIGH** severity vulnerabilities that must be remediated before production deployment.

### Overall Security Posture: CRITICAL - NOT PRODUCTION READY

The most severe issues span all components:

| Area | Critical Issue | Business Impact |
|------|----------------|-----------------|
| **Edge Device** | No TLS - credentials transmitted in plaintext | API keys can be intercepted, devices hijacked |
| **Edge Device** | Safety layer bypass in laser targeting | Physical safety hazard - eye injury, fire risk |
| **Infrastructure** | Auth bypass flag in production config | Complete authentication bypass possible |
| **Infrastructure** | Hardcoded credentials in docker-compose | Database compromise if config leaked |
| **Server** | Dev auth bypass compiled into binary | Authentication can be disabled at runtime |
| **Server** | Database SSL disabled | Database credentials exposed on network |

### Positive Findings

The codebase demonstrates several security best practices:

1. **PostgreSQL Row-Level Security (RLS)** - 29 tenant-scoped tables with fail-safe policies
2. **Parameterized SQL queries** - No SQL injection vulnerabilities found
3. **React JSX auto-escaping** - Built-in XSS protection for most content
4. **Mutex protection** - Most edge firmware modules properly synchronized
5. **Laser safety controls** - Tilt validation, cooldown periods, max on-time limits exist

---

## Audit Scope

### Components Reviewed

| Component | Technology | LOC | Files |
|-----------|------------|-----|-------|
| Server | Go 1.22, Chi, YugabyteDB | ~45,000 | 89 |
| Dashboard | React 18, Refine, Ant Design | ~63,000 | 147 |
| Edge Device | C, ESP-IDF/Pi HAL | ~32,000 | 52 |
| Infrastructure | Docker Compose, Shell | ~2,000 | 12 |

### Review Categories

- Authentication & Authorization
- Data Validation & Sanitization
- Cryptography & Secrets Management
- Multi-Tenant Isolation (RLS)
- Memory Safety (C code)
- Physical Safety Controls (Laser)
- Container Security
- Dependency Analysis

---

## Risk Summary

### By Severity

| Severity | Server | Dashboard | Edge | Infra | **Total** |
|----------|--------|-----------|------|-------|-----------|
| Critical | 2 | 0 | 5 | 5 | **12** |
| High | 6 | 3 | 6 | 7 | **22** |
| Medium | 9 | 9 | 7 | 5 | **30** |
| Low | 3 | 4 | 3 | 0 | **10** |
| Info | 3 | 0 | 0 | 0 | **3** |
| **Total** | **23** | **16** | **21** | **17** | **77** |

### By Risk Category

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| Authentication | 2 | 4 | 5 | 2 |
| Authorization | 0 | 3 | 3 | 0 |
| Data Validation | 0 | 2 | 4 | 2 |
| Cryptography/TLS | 2 | 2 | 2 | 0 |
| Secrets Management | 3 | 3 | 3 | 0 |
| Memory Safety | 0 | 2 | 3 | 1 |
| Physical Safety | 3 | 4 | 2 | 0 |
| Container Security | 0 | 2 | 4 | 0 |
| XSS/CSRF | 0 | 1 | 4 | 2 |
| Dependencies | 0 | 1 | 1 | 1 |

---

## Critical Findings Summary

### CRITICAL-001: Edge Device No TLS (COMM-001-1)

**Component:** Edge Device
**OWASP:** A02:2021 - Cryptographic Failures
**CWE:** CWE-319 (Cleartext Transmission of Sensitive Information)

All communication between edge device and server transmits API keys and detection data in plaintext. An attacker on the same network can intercept credentials and hijack devices.

**Remediation:** Implement mbedTLS with certificate pinning.

---

### CRITICAL-002: Laser Safety Layer Bypass (SAFETY-001-1)

**Component:** Edge Device
**OWASP:** A04:2021 - Insecure Design
**CWE:** CWE-693 (Protection Mechanism Failure)

The targeting module directly calls `laser_controller_on()` bypassing `safety_laser_on()`. This circumvents tilt validation, brownout detection, and max on-time limits.

**Location:** `targeting.c` lines 382, 450

**Remediation:** Replace all direct laser controller calls with safety layer API.

---

### CRITICAL-003: Race Condition in Laser Disarm (SAFETY-001-3)

**Component:** Edge Device
**OWASP:** A04:2021 - Insecure Design
**CWE:** CWE-362 (Race Condition)

The disarm sequence turns off the laser BEFORE setting `g_armed = false`. A concurrent tracking thread can re-fire the laser between these operations.

**Remediation:** Set `g_armed = false` atomically BEFORE turning off laser.

---

### CRITICAL-004: Auth Bypass Flag in Config (CONFIG-002-7)

**Component:** Infrastructure
**OWASP:** A07:2021 - Identification and Authentication Failures
**CWE:** CWE-287 (Improper Authentication)

The `DISABLE_AUTH` environment variable can bypass all authentication. This flag should never exist in production configuration.

**Remediation:** Remove DISABLE_AUTH capability entirely; use feature flags with proper access control if needed.

---

### CRITICAL-005: Zitadel Masterkey in Environment (CONFIG-002-6)

**Component:** Infrastructure
**OWASP:** A07:2021 - Identification and Authentication Failures
**CWE:** CWE-798 (Use of Hard-coded Credentials)

The Zitadel master encryption key is exposed in environment variables, visible in `docker inspect`, process listings, and potentially logs.

**Remediation:** Use file-based secrets via `--masterkeyFile /run/secrets/masterkey`.

---

### CRITICAL-006: Hardcoded Database Credentials (CONFIG-002-1)

**Component:** Infrastructure
**OWASP:** A07:2021 - Identification and Authentication Failures
**CWE:** CWE-798 (Use of Hard-coded Credentials)

Database passwords are hardcoded in `docker-compose.yml`. If this file is committed to a public repo or leaked, the database is compromised.

**Remediation:** Use Docker secrets or environment variable references with required validation.

---

### CRITICAL-007: Database SSL Disabled (DB-003-1)

**Component:** Server
**OWASP:** A02:2021 - Cryptographic Failures
**CWE:** CWE-319 (Cleartext Transmission of Sensitive Information)

Database connections use `sslmode=disable`. Credentials and queries are transmitted in plaintext.

**Location:** Database connection string configuration

**Remediation:** Enable `sslmode=verify-full` with proper CA certificate.

---

### CRITICAL-008: Dev Auth Bypass in Binary (AUTH-001-1)

**Component:** Server
**OWASP:** A07:2021 - Identification and Authentication Failures
**CWE:** CWE-489 (Active Debug Code)

The development authentication bypass code is compiled into the production binary and can be activated via environment variable.

**Remediation:** Use build tags to exclude dev auth from production builds.

---

### CRITICAL-009: No Certificate Validation (COMM-001-3)

**Component:** Edge Device
**OWASP:** A02:2021 - Cryptographic Failures
**CWE:** CWE-295 (Improper Certificate Validation)

Even if TLS were implemented, there is no certificate pinning or validation infrastructure. MITM attacks would succeed.

**Remediation:** Implement certificate pinning with embedded CA certificate.

---

### CRITICAL-010: HTTP API Arm Without Safety Check (SAFETY-001-2)

**Component:** Edge Device
**OWASP:** A04:2021 - Insecure Design
**CWE:** CWE-693 (Protection Mechanism Failure)

The HTTP `/arm` endpoint does not verify safety preconditions before arming the laser system.

**Remediation:** Add safety layer pre-checks to arm endpoint handler.

---

### CRITICAL-011: Local HTTP API No Authentication (COMM-001-7)

**Component:** Edge Device
**OWASP:** A07:2021 - Identification and Authentication Failures
**CWE:** CWE-306 (Missing Authentication for Critical Function)

The local HTTP control API (arm, disarm, configure) has no authentication. Anyone on the network can control the laser.

**Remediation:** Generate random auth token on first boot; require for all control endpoints.

---

### CRITICAL-012: OpenBao Dev Mode with Static Token (CONFIG-001-3)

**Component:** Infrastructure
**OWASP:** A05:2021 - Security Misconfiguration
**CWE:** CWE-798 (Use of Hard-coded Credentials)

OpenBao runs in `-dev` mode with a static, predictable token. All secrets are accessible with the known token.

**Remediation:** Configure OpenBao in production mode with auto-unseal or manual unsealing.

---

## OWASP Top 10 Coverage

| OWASP 2021 | Findings | Severity Distribution |
|------------|----------|----------------------|
| A01 - Broken Access Control | 12 | 0 Critical, 5 High, 5 Medium, 2 Low |
| A02 - Cryptographic Failures | 8 | 3 Critical, 2 High, 2 Medium, 1 Low |
| A03 - Injection | 4 | 0 Critical, 2 High, 1 Medium, 1 Low |
| A04 - Insecure Design | 9 | 4 Critical, 4 High, 1 Medium, 0 Low |
| A05 - Security Misconfiguration | 14 | 2 Critical, 5 High, 6 Medium, 1 Low |
| A06 - Vulnerable Components | 3 | 0 Critical, 1 High, 1 Medium, 1 Low |
| A07 - Auth Failures | 15 | 3 Critical, 4 High, 6 Medium, 2 Low |
| A08 - Software/Data Integrity | 2 | 0 Critical, 0 High, 2 Medium, 0 Low |
| A09 - Logging Failures | 4 | 0 Critical, 0 High, 2 Medium, 2 Low |
| A10 - SSRF | 2 | 0 Critical, 1 High, 1 Medium, 0 Low |

---

## Remediation Priorities

### P0 - Block Production (Immediate)

These issues MUST be fixed before any production deployment:

| ID | Finding | Component | Effort |
|----|---------|-----------|--------|
| COMM-001-1 | Implement TLS with mbedTLS | Edge | 3-5 days |
| COMM-001-3 | Add certificate pinning | Edge | 1-2 days |
| SAFETY-001-1 | Route all laser calls through safety layer | Edge | 1 day |
| SAFETY-001-3 | Fix disarm race condition | Edge | 0.5 days |
| CONFIG-002-7 | Remove auth bypass capability | Infra | 0.5 days |
| CONFIG-002-6 | Use file-based masterkey | Infra | 0.5 days |
| CONFIG-002-1 | Remove hardcoded credentials | Infra | 1 day |
| AUTH-001-1 | Remove dev auth from prod builds | Server | 1 day |
| DB-003-1 | Enable database SSL | Server | 1 day |
| COMM-001-7 | Add local HTTP authentication | Edge | 1-2 days |

**Estimated P0 Total:** 10-15 days

### P1 - Before Production (High Priority)

| ID | Finding | Component | Effort |
|----|---------|-----------|--------|
| DB-002-F1 | Fix IDOR in GetExportPresetByID | Server | 0.5 days |
| AUTH-002-F1 | Implement token invalidation on role change | Server | 2 days |
| COMM-001-2 | Secure API key storage (permissions) | Edge | 0.5 days |
| SAFETY-001-4 | Add hardware watchdog | Edge | 2 days |
| SAFETY-001-6 | E-stop blocks HTTP arm | Edge | 0.5 days |
| CONFIG-001-1 | Run containers as non-root | Infra | 1 day |
| CONFIG-001-4 | Enable Zitadel TLS | Infra | 1 day |
| AUTH-001-5 | Remove DEV_MODE from dashboard builds | Dashboard | 0.5 days |
| AUTH-001-1 | Move OIDC tokens to in-memory storage | Dashboard | 1 day |
| PWA-001-2 | Implement Content Security Policy | Dashboard | 1 day |

**Estimated P1 Total:** 10-12 days

### P2 - Medium Priority (Sprint 2+)

| ID | Finding | Component | Effort |
|----|---------|-----------|--------|
| AUTH-002-F7 | Fix setup endpoint race condition | Server | 1 day |
| INPUT-001-1 | Add SSRF protection | Server | 1 day |
| FILE-001-1 | Sanitize filename command injection | Server | 0.5 days |
| AUTH-001-7 | Implement CSRF tokens (local auth) | Dashboard | 1 day |
| XSS-001-1 | Replace innerHTML with React state | Dashboard | 1 day |
| MEMORY-001-2 | Validate Content-Length header | Edge | 0.5 days |
| CONFIG-001-5 | Enable read-only filesystems | Infra | 0.5 days |
| CONFIG-001-6 | Add resource limits | Infra | 0.5 days |

**Estimated P2 Total:** 6-8 days

---

## Component Summaries

### Server (Go)

**File:** [01-server/summary.md](01-server/summary.md)
**Posture:** GOOD with improvements needed

The server implements robust multi-tenant isolation via PostgreSQL RLS. Key concerns are the dev auth bypass and one IDOR vulnerability. The JWT implementation is secure with proper algorithm enforcement and secret requirements.

**Key Files Reviewed:**
- `internal/middleware/auth.go`, `tenant.go`, `unitauth.go`
- `internal/storage/*.go` (all 15 storage modules)
- `internal/handlers/*.go` (all 18 handler modules)
- 35 database migration files

### Dashboard (React)

**File:** [02-dashboard/summary.md](02-dashboard/summary.md)
**Posture:** REQUIRES IMPROVEMENT

The React dashboard benefits from JSX auto-escaping and Refine framework security patterns. Main concerns are OIDC token storage in sessionStorage (XSS vulnerable), missing CSP headers, and the DEV_MODE bypass shipping to production.

**Key Files Reviewed:**
- `src/providers/*.ts` (auth providers, API client)
- `src/components/*.tsx` (30+ components)
- `src/services/*.ts` (offline, cache, db)
- `src/pages/*.tsx` (25+ pages)

### Edge Device (C)

**File:** [03-edge/summary.md](03-edge/summary.md)
**Posture:** CRITICAL - IMMEDIATE ACTION REQUIRED

The edge firmware has severe vulnerabilities in communication security (no TLS) and laser safety (bypass possible). The firmware demonstrates good practices in many areas (snprintf, mutex protection, fail-safe GPIO) but the critical issues could lead to credential theft or physical safety hazards.

**Key Files Reviewed:**
- `src/server/server_comm.c`, `clip_uploader.c`
- `src/laser/laser_controller.c`, `targeting.c`, `coordinate_mapper.c`
- `src/safety/safety_layer.c`
- `src/http/http_server.c`

### Infrastructure

**File:** [04-infrastructure/summary.md](04-infrastructure/summary.md)
**Posture:** CRITICAL - NOT PRODUCTION READY

The infrastructure configuration is suitable for local development only. Production deployment requires separate compose files with hardened security settings, Docker secrets for credentials, and TLS enabled on all services.

**Key Files Reviewed:**
- `docker-compose.yml`
- `.env.example`
- `scripts/bootstrap-openbao.sh`, `init-yugabytedb.sh`
- `apis-server/Dockerfile`, `apis-dashboard/Dockerfile.dev`

---

## Production Readiness Checklist

### Authentication & Authorization
- [ ] `DISABLE_AUTH` removed from all configuration
- [ ] Dev auth code excluded from production builds
- [ ] JWT secrets randomly generated (not defaults)
- [ ] Token invalidation on role change implemented
- [ ] All admin endpoints verify super-admin role

### Secrets Management
- [ ] No credentials in docker-compose.yml
- [ ] All secrets via Docker secrets or OpenBao
- [ ] Masterkeys in files, not environment variables
- [ ] API keys stored with restricted file permissions

### Network Security
- [ ] TLS enabled for all services
- [ ] Database SSL mode = verify-full
- [ ] Certificate pinning on edge devices
- [ ] Local HTTP APIs require authentication
- [ ] Database ports not exposed to host

### Container Security
- [ ] All containers run as non-root
- [ ] Read-only filesystems where possible
- [ ] Resource limits defined (CPU, memory)
- [ ] `no-new-privileges` enabled

### Physical Safety (Edge)
- [ ] All laser calls routed through safety layer
- [ ] Race conditions in arm/disarm fixed
- [ ] Hardware watchdog implemented
- [ ] E-stop blocks all activation paths

### Web Security (Dashboard)
- [ ] Content Security Policy implemented
- [ ] OIDC tokens in memory storage
- [ ] DEV_MODE excluded from production bundle
- [ ] CSRF protection for local auth mode

---

## Appendix: All Findings by Component

### Server Findings (23)

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| AUTH-001-1 | CRITICAL | Dev auth bypass compiled into binary | Open |
| DB-003-1 | CRITICAL | Database SSL disabled | Open |
| DB-002-F1 | HIGH | IDOR in GetExportPresetByID | Open |
| AUTH-002-F1 | HIGH | Role stored in JWT without re-validation | Open |
| AUTH-002-F2 | HIGH | Tenant isolation relies solely on JWT claims | Open |
| INPUT-001-1 | HIGH | SSRF via weather API redirect | Open |
| FILE-001-1 | HIGH | Command injection via filename | Open |
| AUTH-001-2 | HIGH | JTI (JWT ID) not implemented | Open |
| AUTH-002-F7 | MEDIUM | Setup endpoint race condition | Open |
| AUTH-002-F4 | MEDIUM | Impersonation lacks origin IP tracking | Open |
| AUTH-002-F6 | MEDIUM | Horizontal access relies on RLS only | Open |
| DB-002-F6 | MEDIUM | Admin functions bypass RLS | Acceptable |
| INPUT-001-2 | MEDIUM | Body size limits inconsistent | Open |
| CRYPTO-001-1 | MEDIUM | bcrypt cost factor not configurable | Open |
| AUTH-001-3 | MEDIUM | Token expiration too long (24h) | Open |
| API-001-1 | MEDIUM | Rate limiting bypassed on login failures | Open |
| API-001-2 | MEDIUM | Insufficient error detail sanitization | Open |
| DB-002-F2 | INFO | Tables without RLS (by design) | Acceptable |
| DB-002-F3 | INFO | Tenant context validation | Mitigated |
| DB-002-F5 | INFO | RLS set before user lookup | Mitigated |
| AUTH-002-F5 | LOW | AdminOnly error message enumeration | Optional |
| FILE-001-2 | LOW | Path traversal logs may expose paths | Optional |
| DEPS-001-1 | LOW | Some dependencies have minor updates | Monitor |

### Dashboard Findings (16)

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| AUTH-001-5 | HIGH | DEV_MODE bypass persists in production | Open |
| AUTH-001-1 | HIGH | OIDC tokens in sessionStorage | Open |
| PWA-001-2 | HIGH | Missing Content Security Policy | Open |
| AUTH-001-7 | MEDIUM | Missing CSRF protection (local auth) | Open |
| AUTH-001-2 | MEDIUM | Orphaned localStorage token reference | Open |
| AUTH-001-3 | MEDIUM | Incomplete logout/session invalidation | Open |
| AUTH-001-4 | MEDIUM | Auth config cache without integrity | Open |
| XSS-001-1 | MEDIUM | Unsafe innerHTML in map components | Open |
| XSS-001-3 | MEDIUM | Unvalidated image URLs | Open |
| CSRF-001-1 | MEDIUM | Missing CSRF token implementation | Open |
| CSRF-001-2 | MEDIUM | Open redirect in auth flow | Open |
| PWA-001-1 | MEDIUM | Sensitive data in IndexedDB unencrypted | Open |
| PWA-001-3 | MEDIUM | Service worker cache poisoning risk | Open |
| XSS-001-2 | LOW | Dynamic style injection | Open |
| XSS-001-4 | LOW | JSON.parse without try-catch | Open |
| AUTH-001-6 | LOW | Token exposure in console logs | Open |
| CSRF-001-3 | LOW | Cookie security verification needed | Open |

### Edge Device Findings (21)

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| COMM-001-1 | CRITICAL | No TLS - plaintext credentials | Open |
| COMM-001-3 | CRITICAL | No certificate pinning/validation | Open |
| SAFETY-001-1 | CRITICAL | Targeting bypasses safety layer | Open |
| SAFETY-001-2 | CRITICAL | HTTP arm lacks safety pre-checks | Open |
| SAFETY-001-3 | CRITICAL | Race condition in disarm | Open |
| COMM-001-2 | HIGH | API key stored in plaintext | Open |
| COMM-001-7 | HIGH | Local HTTP API no authentication | Open |
| SAFETY-001-4 | HIGH | No hardware watchdog for laser | Open |
| SAFETY-001-5 | HIGH | Missing mutex for initialized flag | Open |
| SAFETY-001-6 | HIGH | Emergency stop bypassable via HTTP | Open |
| SAFETY-001-7 | HIGH | Callback use-after-free risk | Open |
| MEMORY-001-2 | HIGH | Content-Length overflow | Open |
| COMM-001-4 | MEDIUM | API key logged in errors | Open |
| COMM-001-5 | MEDIUM | No key rotation support | Open |
| COMM-001-6 | MEDIUM | Insecure fallback on auth failure | Open |
| SAFETY-001-8 | MEDIUM | Detection box coordinates unvalidated | Open |
| SAFETY-001-9 | MEDIUM | safety_laser_pulse misleading | Open |
| MEMORY-001-9 | MEDIUM | gethostbyname thread safety | Open |
| MEMORY-001-1 | MEDIUM | HTTP path truncation | Open |
| MEMORY-001-8 | HIGH | HTTP request truncation not detected | Open |
| MEMORY-001-3 | LOW | Format string in error message | Open |

### Infrastructure Findings (17)

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| CONFIG-002-7 | CRITICAL | Auth bypass flag in config | Open |
| CONFIG-002-6 | CRITICAL | Zitadel masterkey in env var | Open |
| CONFIG-002-1 | CRITICAL | Hardcoded database credentials | Open |
| CONFIG-002-2 | CRITICAL | Weak defaults in .env.example | Open |
| CONFIG-001-3 | CRITICAL | OpenBao dev mode with static token | Open |
| CONFIG-001-1 | HIGH | Dashboard runs as root | Open |
| CONFIG-001-4 | HIGH | Zitadel TLS disabled | Open |
| CONFIG-002-5 | HIGH | OpenBao token via env var | Open |
| CONFIG-001-2 | HIGH | Excessive YugabyteDB port exposure | Open |
| CONFIG-002-3 | HIGH | Secrets logged in bootstrap | Open |
| CONFIG-002-4 | HIGH | DB credentials in process cmdline | Open |
| CONFIG-001-5 | MEDIUM | Missing read-only filesystem | Open |
| CONFIG-001-6 | MEDIUM | Missing security options | Open |
| CONFIG-001-7 | MEDIUM | Volume mount exposes source | Open |
| CONFIG-001-8 | MEDIUM | Bootstrap chmod 777 | Open |
| PWA-001-4 | MEDIUM | Auth token reference in localStorage | Open |
| PWA-001-5 | MEDIUM | Insufficient cleanup on logout | Open |

---

## Revision History

| Date | Version | Change |
|------|---------|--------|
| 2026-01-31 | 1.0 | Initial security audit complete |

---

**Report Prepared By:** Claude Opus 4.5 Security Audit
**Review Status:** Complete - Ready for Stakeholder Review
