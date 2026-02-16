# Epic 15: Keycloak Migration — Security Review

**Date:** 2026-02-08
**Reviewer:** Claude Opus 4.6
**Scope:** Epic 15 story-level review + holistic project security assessment
**Status:** Pre-implementation review (Epic 15 is draft, not yet implemented)

---

## Executive Summary

Epic 15 is an infrastructure-driven migration from Zitadel to Keycloak as the OIDC identity provider for SaaS mode. The migration is well-designed with strong security foundations: PKCE S256 enforcement, in-memory token storage, defense-in-depth tenant isolation, and clean mode separation. However, this review identifies **21 findings** — **3 CRITICAL**, **6 HIGH**, **7 MEDIUM**, and **5 LOW** — that should be addressed during implementation.

The most significant risks are: (1) stale Zitadel secrets remaining in the OpenBao bootstrap script, (2) JWKS key rotation gap with no `kid`-mismatch cache refresh, and (3) the CI workflow still referencing `AUTH_MODE=zitadel` which will silently break after migration.

### Severity Distribution

| Severity | Count | Category |
|----------|-------|----------|
| CRITICAL | 3 | Stale secrets, CI breakage, org_id mapper uncertainty |
| HIGH | 6 | JWKS rotation, role ordering, HTTPS enforcement, dev credentials, OpenBao exposure, network segmentation |
| MEDIUM | 7 | Backward-compat window, masterkey removal silence, token-on-refresh UX, config cache non-crypto hash, SQL interpolation, dashboard source mount, Keycloak HTTP mode |
| LOW | 5 | Primary role logic, envWithFallback cleanup, .dockerignore, Keycloak admin console, SSO session length |

---

## Part 1: Epic 15 Story-Level Findings

### CRITICAL

#### E15-C1: Stale Zitadel Secrets in OpenBao Bootstrap Script
**Files:** `scripts/bootstrap-openbao.sh:85-96`
**Story:** Not covered by any Epic 15 story (gap)

The bootstrap script writes hardcoded Zitadel secrets to OpenBao:
```bash
write_secret "${SECRET_PATH}/zitadel" '{
    "masterkey": "MasterkeyNeedsToHave32Chars!!",
    "admin_username": "admin",
    "admin_password": "Admin123!"
}'
write_secret "${SECRET_PATH}/api" '{
    "zitadel_issuer": "http://localhost:8080"
}'
```

And the SOPS path (lines 140-155) also extracts and writes Zitadel-specific secrets.

**Impact:** After migration, the bootstrap script still writes stale Zitadel secrets to OpenBao under `secret/data/apis/zitadel`. If the vault is accessible (see E15-H5), these are dead credentials that appear operational. More critically, the `api` secret path still references `zitadel_issuer`, which could confuse future operators or automated tooling.

**Story 15.10 requires zero "zitadel" references in source code**, but `bootstrap-openbao.sh` is in `scripts/` and appears to be missed by the grep scope.

**Recommendation:** Add to Story 15.8 or 15.9:
1. Replace `zitadel` secret path with `keycloak` in `bootstrap_defaults()`
2. Replace `zitadel_issuer` in `api` secret with `keycloak_issuer`
3. Update `bootstrap_from_sops()` to extract Keycloak config instead of Zitadel
4. Update `secrets/secrets.template.yaml` and `secrets/secrets.enc.yaml`
5. Ensure Story 15.10's grep covers `scripts/*.sh` and `secrets/*.yaml`

---

#### E15-C2: CI Workflow Still References `AUTH_MODE=zitadel`
**File:** `.github/workflows/test.yml:2,25,30-32,79`
**Story:** 15.10 (CI Dual-Mode Test Verification) — but the file is not listed in 15.10's scope

The CI workflow:
```yaml
# Line 2: Runs tests in both auth modes (local and zitadel)
# Line 25: auth_mode: [local, zitadel]
# Line 31: ZITADEL_ISSUER: ${{ matrix.auth_mode == 'zitadel' && 'http://localhost:8080' || '' }}
# Line 32: ZITADEL_CLIENT_ID: ${{ matrix.auth_mode == 'zitadel' && 'test-client-id' || '' }}
```

**Impact:** After Story 15.10 removes the `AUTH_MODE=zitadel` backward-compat shim, CI will either:
- Fail to start the server (if zitadel mode is rejected), breaking the CI pipeline entirely
- Or silently skip the SaaS auth test if the matrix value doesn't match any valid mode

Either outcome means **SaaS mode is untested in CI** after migration — directly violating NFR-KC-03.

**Recommendation:** Add `.github/workflows/test.yml` to Story 15.10's file list. Update:
- `auth_mode: [local, zitadel]` → `auth_mode: [local, keycloak]`
- `ZITADEL_ISSUER` / `ZITADEL_CLIENT_ID` → `KEYCLOAK_ISSUER` / `KEYCLOAK_CLIENT_ID`
- All conditional expressions and comments

---

#### E15-C3: `org_id` Protocol Mapper Uncertainty — No Fallback Implementation
**Stories:** 15.3, 15.4, 15.7
**PRD Risk 2:** Acknowledged but mitigation incomplete

The PRD addendum (Section 6, Risk 2) states:
> "Fall back to lookup tenant from user table (by `sub` claim) if Organizations feature is unavailable."

However, **no story actually implements this fallback**. Story 15.3's `ValidateRequiredClaims()` rejects tokens without `org_id`, and Story 15.4 relies on `org_id` being present. If the Keycloak Organizations mapper doesn't import correctly (acknowledged as uncertain in Story 15.7), **all SaaS users get 401 errors**.

**Impact:** Keycloak Organizations is a relatively new feature (GA since v25). The realm import behavior for organization protocol mappers is explicitly noted as uncertain. Without a fallback, a mapper misconfiguration renders SaaS mode completely inoperable.

**Recommendation:** Implement the fallback described in the PRD:
1. In `ValidateRequiredClaims()`: If `org_id` is empty, log a warning (not error)
2. In tenant middleware: If `claims.TenantID` is empty in SaaS mode, look up the user by `sub` claim and use their stored `tenant_id`
3. Add a startup health check that validates a test token against the JWKS endpoint and checks for `org_id` presence, logging a WARN if missing
4. Document this as a known limitation in Story 15.9

---

### HIGH

#### E15-H1: No JWKS `kid` Mismatch Cache Refresh
**File:** `apis-server/internal/middleware/auth.go` (JWKS cache)
**Story:** 15.3

The JWKS cache has a 1-hour TTL. Story 15.3 explicitly notes:
> "A future enhancement could force-refresh JWKS on `kid` mismatch, but this is not implemented."

**Impact:** When Keycloak rotates signing keys (which it does automatically), there is up to a **1-hour window** where new tokens signed with the new key are rejected. During this window, all newly issued tokens fail validation, causing widespread 401 errors for active users.

Keycloak's default key rotation policy creates new keys and gradually phases out old ones, but the transition period can be shorter than 1 hour depending on admin actions (manual rotation, key import).

**Recommendation:** Add to Story 15.3: On `kid` not found in cached JWKS, perform a single synchronous JWKS refresh (with a rate limit of at most once per 30 seconds to prevent abuse). This is a standard pattern in OIDC libraries:
```go
key, err := getKeyFromCache(kid)
if err == ErrKeyNotFound {
    if refreshAllowed() { // rate-limited
        refreshJWKS()
        key, err = getKeyFromCache(kid)
    }
}
```

---

#### E15-H2: Non-Deterministic Role Ordering — `roles[0]` as Primary Role
**Story:** 15.3
**File:** `apis-server/internal/middleware/auth.go` (claims extraction)

The story specifies `primaryRole = roles[0]` from `realm_access.roles`. Keycloak does **not** guarantee role ordering in the JWT claims array. The order can change between token issuances for the same user.

**Impact:** If authorization decisions depend on the "primary" role (e.g., showing admin UI, allowing admin operations), a user with both `admin` and `user` roles could intermittently lose admin access when the role array order changes.

**Recommendation:** Implement deterministic primary role selection with explicit priority:
```go
func selectPrimaryRole(roles []string) string {
    priority := map[string]int{"admin": 0, "user": 1, "viewer": 2}
    best := roles[0]
    for _, r := range roles[1:] {
        if p, ok := priority[r]; ok && p < priority[best] {
            best = r
        }
    }
    return best
}
```

---

#### E15-H3: No HTTPS Enforcement for `KEYCLOAK_ISSUER` in Production
**Story:** 15.1
**File:** `apis-server/internal/config/auth.go`

The config reads `KEYCLOAK_ISSUER` as a plain string with no URL scheme validation. In production, an HTTP issuer URL means:
1. JWKS fetched over plaintext (MITM can inject rogue signing keys)
2. Token issuer validation matches an HTTP URL (tokens could be issued by a MITM)

**Impact:** A misconfigured production deployment with `KEYCLOAK_ISSUER=http://...` would silently operate without TLS on the token validation path.

**Recommendation:** Add to Story 15.1's `InitAuthConfig()`:
```go
if !config.IsLocalAuth() && !strings.HasPrefix(keycloakIssuer, "https://") {
    if os.Getenv("GO_ENV") == "production" {
        return fmt.Errorf("KEYCLOAK_ISSUER must use HTTPS in production")
    }
    log.Warn().Str("issuer", keycloakIssuer).Msg("KEYCLOAK_ISSUER uses HTTP — acceptable for dev only")
}
```

---

#### E15-H4: Dev Credentials in Version-Controlled Realm File
**Story:** 15.7
**File:** `keycloak/realm-honeybee.json` (to be created)

The realm file will contain:
- User `admin@apis.local` with password `admin` and role `admin`
- `KEYCLOAK_ADMIN_PASSWORD=admin` default in docker-compose

**Impact:** If the realm file is used in production (even accidentally), a fully privileged admin account exists with a trivial password. The docker-compose default admin password is also `admin`.

**Recommendation:**
1. Add a prominent comment in the realm JSON: `"_WARNING": "DEV ONLY — this user must be deleted in production"`
2. Add a startup check in Story 15.10: if `GO_ENV=production` and Keycloak admin console is reachable, attempt to verify that the default dev user does not exist (or log a CRITICAL warning)
3. Consider moving the dev user to a separate `realm-honeybee-dev-users.json` file that is only mounted in the `dev` profile

---

#### E15-H5: OpenBao Vault Exposed on 0.0.0.0 with Predictable Dev Token
**File:** `docker-compose.yml:284-288` (existing, not new to Epic 15)
**Story:** Not directly in Epic 15 scope, but relevant because Epic 15 adds Keycloak secrets to the vault

OpenBao is exposed on port 8200 to all network interfaces with a default dev token of `apis-dev-token`. After Epic 15, this vault will contain Keycloak configuration secrets in addition to existing database credentials.

**Impact:** Anyone on the local network can read all vault secrets including the new Keycloak configuration. Combined with E15-C1 (stale Zitadel secrets), the vault exposure surface grows.

**Recommendation:** Bind OpenBao to `127.0.0.1:8200` in docker-compose (matching the YugabyteDB pattern):
```yaml
ports:
  - "127.0.0.1:8200:8200"
```

---

#### E15-H6: Flat Docker Network — No Segmentation Between Keycloak and Application
**File:** `docker-compose.yml` (existing)
**Story:** 15.7 adds Keycloak to this flat network

All services (YugabyteDB, apis-server, apis-dashboard, Keycloak, OpenBao) share a single `apis-network`. A compromised Keycloak container has direct network access to the database and vault.

**Impact:** In a defense-in-depth model, the identity provider should be network-isolated from the data layer. A Keycloak vulnerability (Keycloak has had CVEs in the past) would grant lateral access to all other services.

**Recommendation:** Add to Story 15.7: Create separate networks:
```yaml
networks:
  frontend:     # dashboard, apis-server, keycloak (public-facing)
  backend:      # apis-server, yugabytedb (data layer)
  auth:         # keycloak, yugabytedb (keycloak DB only)
  secrets:      # apis-server, openbao
```

This is a production hardening recommendation. The single-network dev setup is acceptable for local development.

---

### MEDIUM

#### E15-M1: Backward-Compatibility Window Creates Configuration Confusion
**Stories:** 15.1, 15.2 (add compat), 15.10 (remove compat)

Between Stories 15.1 and 15.10, both `ZITADEL_*` and `KEYCLOAK_*` env vars are accepted. Both `AUTH_MODE=zitadel` and `AUTH_MODE=keycloak` work.

**Impact:** During the migration window, operators might mix old and new env vars (e.g., `AUTH_MODE=keycloak` with `ZITADEL_ISSUER`), leading to subtle misconfigurations. The fallback chain makes debugging harder.

**Recommendation:** In Story 15.1, when a `ZITADEL_*` fallback is used, log the specific env var that should be renamed:
```
WARN: ZITADEL_ISSUER is deprecated, rename to KEYCLOAK_ISSUER
```
This is already partially specified but should be explicit for every fallback variable.

---

#### E15-M2: `ZITADEL_MASTERKEY` Removal Without Operator Warning
**Story:** 15.2

The `Masterkey` field is removed from the secrets config. Operators who have `ZITADEL_MASTERKEY` set will have no indication that it's being ignored.

**Impact:** If the masterkey was used for anything beyond Zitadel (unlikely but possible), its silent removal could have unintended consequences.

**Recommendation:** In Story 15.1 or 15.2, if `ZITADEL_MASTERKEY` is set in the environment, log:
```
INFO: ZITADEL_MASTERKEY is no longer used (Keycloak does not require a masterkey). You can safely remove it.
```

---

#### E15-M3: In-Memory Token Storage — Token Loss on Page Refresh
**Story:** 15.5

`InMemoryWebStorage` means tokens are lost on every page refresh. The SSO session (up to 72 hours) allows seamless re-authentication, but the redirect round-trip adds latency.

**Impact:** UX friction on page refresh. If Keycloak is temporarily unreachable during a refresh, the user is locked out until Keycloak recovers — even though they had a valid session moments ago.

**Recommendation:** This is the correct security posture for an SPA. Document this trade-off in Story 15.9's documentation updates. Consider adding a brief "Reconnecting..." loading state in the dashboard when the re-authentication redirect occurs, rather than a full login page flash.

---

#### E15-M4: Auth Config Cache Uses Non-Cryptographic Hash
**File:** `apis-dashboard/src/config.ts` (existing)
**Story:** Not modified by Epic 15, but relevant

The auth config cached in `sessionStorage` uses a dual `simpleHash` with session time-origin salt. This is explicitly noted as non-cryptographic (security tag S4-M1).

**Impact:** An XSS attack could modify the cached auth config (e.g., changing the Keycloak authority URL to an attacker-controlled server) and the hash would not prevent this since the attacker can recompute it.

**Recommendation:** This is an accepted risk from the existing design. The real protection is server-side JWT validation. However, Epic 15 should ensure that the Keycloak authority URL from the cache is validated against the server on token refresh (the OIDC discovery document fetch provides this implicitly). No action needed beyond awareness.

---

#### E15-M5: SQL Variable Interpolation in `init-yugabytedb.sh`
**File:** `scripts/init-yugabytedb.sh:26-29, 58-61` (existing, modified by 15.7)
**Story:** 15.7 (adds Keycloak DB creation)

Story 15.7 adds Keycloak database user creation using the same pattern:
```sql
CREATE USER ${KEYCLOAK_DB_USER} WITH PASSWORD '${KEYCLOAK_DB_PASSWORD}';
```

**Impact:** If `KEYCLOAK_DB_USER` or `KEYCLOAK_DB_PASSWORD` contains a single quote, semicolon, or other SQL metacharacter, this is vulnerable to SQL injection. In practice, these values come from `.env` files controlled by the operator, so the risk is low.

**Recommendation:** Use `psql` variables or escape single quotes:
```bash
PGPASSWORD="$YSQL_PASSWORD" psql ... -c "CREATE USER $(echo "$KEYCLOAK_DB_USER" | sed "s/'/''/g") WITH PASSWORD '$(echo "$KEYCLOAK_DB_PASSWORD" | sed "s/'/''/g")';"
```

---

#### E15-M6: Dashboard Source Directory Mounted Read-Write in Docker
**File:** `docker-compose.yml:215` (existing)

`./apis-dashboard:/app` is mounted read-write. A compromised dashboard container could modify source files.

**Impact:** Dev convenience, but if used in production-like environments, an attacker who compromises the Vite dev server could modify source code or inject malicious JavaScript.

**Recommendation:** Not an Epic 15 issue, but the dashboard Dockerfile should be used for production (build step, nginx/serve, no source mount). The current setup is clearly dev-only.

---

#### E15-M7: Keycloak `KC_HTTP_ENABLED=true` Without Production Guard
**Story:** 15.7

Keycloak is configured with `KC_HTTP_ENABLED=true` and `KC_HOSTNAME_STRICT=false` for development. No mechanism prevents this configuration from being used in production.

**Impact:** If deployed to production without modification, Keycloak accepts HTTP connections, and hostname validation is disabled (potential host header attacks).

**Recommendation:** Add a comment in docker-compose.yml and the realm file:
```yaml
# DEV ONLY: Production must use KC_HOSTNAME=auth.yourdomain.com
# and remove KC_HTTP_ENABLED + KC_HOSTNAME_STRICT
```
Optionally, add to the production checklist in `.env.saas.example`.

---

### LOW

#### E15-L1: Primary Role Selection Logic
**Story:** 15.3

Related to E15-H2 but lower severity: the `Claims.Role` field (singular) is used in some handlers for display purposes. If it's only used for display (not authorization), the non-deterministic ordering is cosmetic, not a security issue.

**Recommendation:** Audit all uses of `Claims.Role` vs `Claims.Roles` (plural) to confirm whether any authorization decisions depend on the singular `Role` field.

---

#### E15-L2: `envWithFallback()` Helper May Have Orphaned Uses
**Story:** 15.10

Story 15.10 notes that `envWithFallback()` may need cleanup if it was only used for Zitadel fallbacks.

**Recommendation:** After removing all Zitadel fallbacks, grep for remaining `envWithFallback()` calls. If none remain, remove the helper entirely.

---

#### E15-L3: Missing `.dockerignore` Verification
**File:** `apis-server/Dockerfile` (existing)

The multi-stage build copies `COPY . .` in the builder stage. Without a `.dockerignore`, `.env`, `.git/`, `secrets/`, and other sensitive files are sent to the build context.

**Recommendation:** Verify `.dockerignore` exists and excludes: `.env`, `.env.*`, `secrets/`, `.git/`, `_security-audit/`, `_bmad-output/`, `node_modules/`.

---

#### E15-L4: Keycloak Admin Console Accessible Without Restriction
**Story:** 15.7

Port 8081 (Keycloak admin) is exposed on `0.0.0.0`. The admin console provides full control over the realm, clients, users, and protocol mappers.

**Recommendation:** Bind to `127.0.0.1:8081:8080` in docker-compose for dev. Production should not expose the admin console publicly (access via VPN/bastion only).

---

#### E15-L5: SSO Session Max Lifetime of 72 Hours
**Story:** 15.7

The SSO session max lifespan is 72 hours. Combined with in-memory token storage, a user who keeps their browser open for 72 hours will eventually be forced to fully re-authenticate.

**Impact:** Minimal — 72 hours is a reasonable maximum. But operators should be aware that this is the hard session limit even with active use.

**Recommendation:** Document in Story 15.9. No code change needed.

---

## Part 2: Holistic Project Security Assessment

This section assesses the overall security posture of the APIS project considering Epic 15's changes alongside the existing codebase.

### 2.1 Previous Security Remediation Status

The February 2026 security audit identified 165 findings (14C, 37H, 59M, 49L, 22I). The remediation was marked complete. Epic 15 should not regress any of these fixes, but several are relevant:

| Previous Finding | Epic 15 Interaction | Risk |
|-----------------|---------------------|------|
| S1-C2: DISABLE_AUTH bypass | Epic 15 preserves the fix | OK |
| S4-C2: OIDC callback open redirect | Fixed with `getSafeReturnToFromState()` — preserved | OK |
| S1-H3: Token revocation in-memory only | Local mode only, Keycloak mode uses token expiry | OK |
| S1-H4: X-Forwarded-For IP spoofing | Unrelated to Epic 15 | OK |
| S8-C2: CORS origin reflected (edge) | Unrelated to Epic 15 | OK |

**No regressions identified** from the previous security remediation.

### 2.2 Authentication Architecture Assessment

Post-Epic 15, the authentication architecture is:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Mode Selection (startup)                      │
│          config.AuthMode() == "local" || "keycloak"             │
├────────────────────────┬────────────────────────────────────────┤
│     Local Mode         │          Keycloak Mode                 │
├────────────────────────┼────────────────────────────────────────┤
│ HS256 symmetric JWT    │ RS256 asymmetric JWT (JWKS)            │
│ bcrypt passwords       │ OIDC Authorization Code + PKCE S256    │
│ Session cookies        │ Bearer tokens (in-memory)              │
│ CSRF double-submit     │ No CSRF needed (Bearer)                │
│ Account lockout        │ Keycloak handles lockout               │
│ Rate limiting          │ Rate limiting (server-side)            │
│ Token revocation (JTI) │ Token expiry (15min), refresh tokens   │
└────────────────────────┴────────────────────────────────────────┘
                    │
                    ▼
        Unified Claims struct → Tenant Middleware → RLS
```

**Strengths:**
- Clean separation between modes with no shared mutable state
- Both modes produce the same `Claims` struct for downstream consumption
- Defense-in-depth tenant isolation (JWT claim → middleware check → RLS)
- PKCE S256 enforced at both client and server
- In-memory token storage (XSS-resistant)
- Direct Access Grants disabled (OAuth 2.1 compliant)

**Weaknesses:**
- JWKS cache without `kid`-mismatch refresh (E15-H1)
- No production HTTPS enforcement for issuer URL (E15-H3)
- org_id claim dependency without fallback (E15-C3)

### 2.3 Secrets Management Assessment

```
┌─────────────────────────────────────────────────────────────────┐
│                 Secrets Flow (Post-Epic 15)                      │
├─────────────────────────────────────────────────────────────────┤
│ OpenBao                                                         │
│ ├── secret/data/apis/database    → DB credentials               │
│ ├── secret/data/apis/jwt         → JWT signing key              │
│ ├── secret/data/apis/keycloak    → Keycloak config (NEW)        │
│ └── secret/data/apis/zitadel     → STALE (E15-C1)              │
│                                                                  │
│ File Backend: ./secrets/ (chmod 600, path traversal protected)  │
│ Env Backend: environment variables (fallback)                    │
└─────────────────────────────────────────────────────────────────┘
```

**Strengths:**
- Three-backend fallback chain ensures availability
- Path traversal prevention in file backend
- File permission checking (warns on >0600)
- Non-localhost HTTP warning for OpenBao
- Token redaction in `Config.String()`

**Weaknesses:**
- Stale `zitadel` secret path in OpenBao after migration (E15-C1)
- OpenBao dev mode with predictable token in docker-compose (E15-H5)
- `ClientSecret` added to `KeycloakConfig` without rotation mechanism

### 2.4 Infrastructure Security Assessment

| Service | Port Binding | Auth | Encryption | Assessment |
|---------|-------------|------|------------|------------|
| YugabyteDB | 127.0.0.1:5433 | Password | sslmode varies by mode | Good |
| apis-server | 0.0.0.0:3000 | JWT/Cookie | HTTP (dev) | Needs TLS proxy for prod |
| apis-dashboard | 0.0.0.0:5173 | N/A (SPA) | HTTP (dev) | Vite dev server, prod uses build |
| Keycloak (NEW) | 0.0.0.0:8081 | Admin password | HTTP (dev) | E15-H4, E15-L4 |
| OpenBao | 0.0.0.0:8200 | Dev token | HTTP (dev) | E15-H5 |

**Network segmentation is absent** (E15-H6). All services are on a single Docker bridge network.

### 2.5 Cross-Epic Security Controls Integrity

| Control | Epic 13 (Dual Auth) | Epic 15 (Keycloak) | Status |
|---------|--------------------|--------------------|--------|
| RLS tenant isolation | Implemented | Preserved | OK |
| Defense-in-depth tenant check | Implemented | Preserved | OK |
| CSRF double-submit (local) | Implemented | Not modified | OK |
| Session cookie security | Implemented | Not modified | OK |
| Rate limiting + lockout | Implemented | Not modified | OK |
| Algorithm confusion prevention | Implemented | Not applicable (RS256/JWKS) | OK |
| Production auth safety | Implemented | Preserved | OK |
| Security headers | Implemented | Not modified | OK |
| Body size limits | Implemented | Not modified | OK |
| Token revocation (local) | Implemented | Not modified | OK |
| Open redirect prevention | Implemented | Preserved | OK |
| Auth cleanup on logout | Implemented | Updated for Keycloak | OK |

**All cross-epic security controls are preserved.** No regressions identified.

### 2.6 Edge Device Security (Unchanged)

Epic 15 explicitly states edge device auth (API key over HTTPS) is unchanged. The previous security audit's edge findings (TLS verification, CORS, config_manager locking) are orthogonal to this migration. No interaction.

---

## Part 3: Recommendations Summary

### Must Fix Before Implementation (CRITICAL)

| ID | Finding | Story to Add To |
|----|---------|-----------------|
| E15-C1 | Update `bootstrap-openbao.sh` to replace Zitadel secrets with Keycloak | 15.8 or 15.9 |
| E15-C2 | Update `.github/workflows/test.yml` for `AUTH_MODE=keycloak` | 15.10 |
| E15-C3 | Implement `org_id` fallback (lookup by `sub` claim) | 15.4 |

### Should Fix During Implementation (HIGH)

| ID | Finding | Story |
|----|---------|-------|
| E15-H1 | Add JWKS `kid`-mismatch cache refresh | 15.3 |
| E15-H2 | Deterministic primary role selection | 15.3 |
| E15-H3 | HTTPS enforcement for `KEYCLOAK_ISSUER` in production | 15.1 |
| E15-H4 | Dev credentials documentation/separation | 15.7 |
| E15-H5 | Bind OpenBao to 127.0.0.1 | 15.7 (or separate) |
| E15-H6 | Network segmentation recommendation | 15.7 (production doc) |

### Consider During Implementation (MEDIUM)

| ID | Finding | Story |
|----|---------|-------|
| E15-M1 | Explicit deprecation warnings per env var | 15.1 |
| E15-M2 | ZITADEL_MASTERKEY removal warning | 15.2 |
| E15-M3 | Document token-on-refresh behavior | 15.9 |
| E15-M5 | SQL variable escaping in init script | 15.7 |
| E15-M7 | Keycloak HTTP mode production guard | 15.7 |

---

## Part 4: Positive Security Design Decisions

The following security design decisions in Epic 15 are commendable:

1. **PKCE S256 enforced at both client and server** — not just supported, but required
2. **In-memory token storage** — strongest XSS mitigation for SPAs
3. **Direct Access Grants disabled** — OAuth 2.1 compliance
4. **`fullScopeAllowed: false`** — least privilege on the OIDC client
5. **Provider-neutral naming** (`OIDCLoginButton`, `external_user_id`) — future-proofs against another IdP change
6. **Structured deprecation lifecycle** — backward compat in early stories, clean removal in final story
7. **Realm import idempotency** — `--import-realm` creates once, skips on restart
8. **Read-only realm mount** (`:ro`) — prevents container from modifying import data
9. **Registration disabled** — users created by admin/invite only
10. **Clean mode separation** — standalone mode is completely untouched

---

**End of Review**

*Reviewed by Claude Opus 4.6 on 2026-02-08. This review should be validated by a human security engineer before implementation begins.*
