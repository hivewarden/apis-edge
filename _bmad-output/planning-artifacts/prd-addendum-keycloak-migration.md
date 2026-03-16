---
stepsCompleted:
  - step-01-init
  - step-02-research
  - step-03-codebase-assessment
  - step-04-drafting
inputDocuments:
  - prd.md
  - architecture.md
  - epic-13-dual-auth-mode.md
  - keycloak-migration-prompt (user provided)
workflowType: prd-addendum
parentPRD: prd.md
epicTarget: 15
date: '2026-02-07'
classification:
  domain: iot-agriculture
  projectType: saas_b2b
researchCompleted:
  - keycloak-best-practices-go-react
  - codebase-zitadel-impact-assessment
  - standalone-mode-isolation-verification
---

# PRD Addendum: Keycloak Migration (Zitadel Replacement)

**Author:** Jermoo
**Date:** 2026-02-07
**Version:** 1.2
**Status:** Validated
**Parent PRD:** prd.md (APIS v2.0)
**Supersedes:** SaaS auth sections of Epic 13 (Dual Authentication Mode)

---

## 1. Overview & Motivation

### 1.1 Problem Statement

APIS was designed to use Zitadel as the OIDC identity provider for SaaS mode. The shared infrastructure has been rebuilt using SSIK (Sovereign Secure Infrastructure Kit) on K3s, which standardizes on **Keycloak** as the identity provider across all hosted applications.

The Zitadel-specific code must be replaced with Keycloak equivalents while preserving the existing dual-mode architecture (`AUTH_MODE=local` for standalone, `AUTH_MODE=keycloak` for SaaS).

### 1.2 Driver

**Infrastructure-driven.** This is not a product feature change. The authentication behavior, user experience, and security posture remain identical. Only the underlying identity provider changes.

### 1.3 Solution Overview

Replace all Zitadel-specific authentication code with Keycloak-compatible OIDC integration:
1. **Go backend:** Update claims struct, middleware, and config to use Keycloak JWT format
2. **React dashboard:** Replace `@zitadel/react` SDK with generic OIDC library (`react-oidc-context`)
3. **Infrastructure:** Replace Zitadel container with Keycloak in docker-compose
4. **Configuration:** Update env vars and secrets management

### 1.4 What Does NOT Change

| Aspect | Status |
|--------|--------|
| Standalone mode (`AUTH_MODE=local`) | **ZERO changes** |
| Edge device auth (API keys over HTTPS) | **ZERO changes** |
| Database schema | **Cosmetic only** — rename `zitadel_user_id` column to `external_user_id` and update comments. No structural or migration-breaking changes. |
| Token lifetime values | Same numbers, different config location |
| PKCE enforcement for SPA | Remains mandatory |
| Multi-tenant isolation model | Same intent, different mechanism |
| User-facing login experience | Identical (OIDC redirect flow) |

---

## 2. Standalone Mode Impact Assessment

### 2.1 Methodology

Full codebase scan of all three APIS components for Zitadel-specific code, mapping shared vs isolated code paths.

### 2.2 Finding: Complete Isolation

The standalone mode (`AUTH_MODE=local`) is **completely isolated** from all Zitadel/OIDC code:

| Standalone Uses | SaaS Uses (Zitadel -> Keycloak) |
|----------------|-------------------------------|
| `LocalAuthMiddleware` (HS256 JWT) | `NewAuthMiddlewareWithDiscovery` (RS256 JWKS) |
| `localAuthProvider.ts` | `zitadelAuthProvider.ts` -> `keycloakAuthProvider.ts` |
| `LoginForm` component | `ZitadelLoginButton` -> `OIDCLoginButton` |
| `JWT_SECRET` env var | `KEYCLOAK_ISSUER` / `KEYCLOAK_CLIENT_ID` env vars |
| bcrypt password hashing | OIDC authorization code flow |
| Session cookies | OIDC tokens in memory |

**The `NewModeAwareAuthMiddleware()` function in `middleware/auth.go` selects the correct path at startup based on `AUTH_MODE`. The two paths share no code except the final `Claims` struct that both produce.**

### 2.3 Conclusion

No standalone-mode code, tests, configuration, or documentation requires modification for this migration. CI tests running `AUTH_MODE=local` will continue to pass without changes.

---

## 3. Keycloak Technical Decisions

### 3.1 Multi-Tenant Architecture

**Decision: One Keycloak realm per application (APIS = one realm)**

The SSIK infrastructure uses one realm per application:
```
Keycloak Instance
├── Realm: "platform"    -> Infrastructure admins
├── Realm: "rtp"         -> Rate the Plate
├── Realm: "honeybee"    -> APIS/Honeybee
└── Realm: "<appN>"      -> Future apps
```

Within the `honeybee` realm, multi-tenancy is handled by:
- **Keycloak Organizations** (Keycloak 25+) for tenant grouping
- Custom protocol mapper adding `org_id` claim to JWTs
- Existing APIS tenant isolation (RLS, tenant middleware) unchanged

This replaces Zitadel's Organization concept 1:1.

### 3.2 JWT Claims Mapping

| Zitadel Claim | Keycloak Equivalent | Notes |
|---------------|-------------------|-------|
| `urn:zitadel:iam:org:id` | `org_id` (custom mapper) | Organization ID for tenant isolation |
| `urn:zitadel:iam:org:name` | `org_name` (custom mapper) | Organization display name |
| `urn:zitadel:iam:user:roles` | `realm_access.roles` | Standard Keycloak nested structure |
| `email` | `email` | Standard OIDC claim (unchanged) |
| `name` | `name` | Standard OIDC claim (unchanged) |
| `preferred_username` | `preferred_username` | Standard OIDC claim (unchanged) |
| `sub` | `sub` | Standard OIDC claim (unchanged) |

**Keycloak JWT Example:**
```json
{
  "iss": "https://keycloak.example.com/realms/honeybee",
  "sub": "user-uuid",
  "email": "jermoo@example.com",
  "name": "Jermoo",
  "preferred_username": "jermoo",
  "realm_access": {
    "roles": ["admin", "user"]
  },
  "org_id": "tenant_xyz789",
  "org_name": "Jermoo's Apiary"
}
```

### 3.3 Library Choices

| Component | Current | New | Rationale |
|-----------|---------|-----|-----------|
| Go JWT validation | `go-jose/v4` | `go-jose/v4` (keep) | Already handles JWKS caching, split issuer/discovery URL. No reason to change. |
| React OIDC | `@zitadel/react` + `oidc-client-ts` (transitive) | `react-oidc-context` + `oidc-client-ts` (direct) | Provider-agnostic, active maintenance, React hooks. `keycloak-js` adapter is being deprecated by Keycloak team. **Note:** `oidc-client-ts` is currently a transitive dependency of `@zitadel/react` — it must be added as a direct dependency when `@zitadel/react` is removed. |
| Token storage | In-memory (`InMemoryWebStorage`) | In-memory (keep) | Security best practice for SPAs |

### 3.4 Keycloak Client Configuration

The APIS SPA client in the `honeybee` realm must be configured with:

| Setting | Value | Why |
|---------|-------|-----|
| Client type | Public | SPAs cannot hold a client secret |
| Standard flow | Enabled | Authorization code + PKCE |
| Direct access grants | **Disabled** | OAuth 2.1 compliance (password grant prohibited) |
| PKCE challenge method | `S256` | Enforced, not just supported |
| Web Origins | `https://app.apis.honeybeegood.be` | CORS for token endpoint |
| Valid Redirect URIs | `https://app.apis.honeybeegood.be/callback` | Post-login redirect |
| Full Scope Allowed | **Disabled** | Least privilege |

**Required Protocol Mappers (on `roles` client scope):**
- `realm roles` -> Maps `realm_access.roles` into JWT
- `client roles` -> Maps `resource_access.{client}.roles` into JWT
- Custom `org_id` mapper -> Maps Keycloak Organization ID to `org_id` claim
- Custom `org_name` mapper -> Maps Organization name to `org_name` claim

**Critical:** Without the realm roles mapper, roles will silently be absent from JWTs. This is the #1 Keycloak integration pitfall.

### 3.5 Token Lifetime Configuration

Applied at the **realm level** in Keycloak:

| Setting | Value | Keycloak Config Key |
|---------|-------|-------------------|
| Access token | 15 minutes | `accessTokenLifespan` |
| SSO session idle | 12 hours | `ssoSessionIdleTimeout` |
| SSO session max | 72 hours | `ssoSessionMaxLifespan` |
| Refresh token | 30 minutes (with rotation) | Client-level override |

### 3.6 OIDC Discovery URL

```
# Zitadel (old)
https://auth.example.com/.well-known/openid-configuration

# Keycloak (new) — note /realms/{name} path segment
https://keycloak.example.com/realms/honeybee/.well-known/openid-configuration
```

The issuer claim in JWTs will be: `https://keycloak.example.com/realms/honeybee`

---

## 4. Functional Requirements

### FR-KC: Keycloak Migration

| ID | Requirement |
|----|-------------|
| FR-KC-01 | System SHALL replace `AUTH_MODE=zitadel` with `AUTH_MODE=keycloak` |
| FR-KC-02 | SaaS mode SHALL authenticate via Keycloak OIDC (Authorization Code + PKCE) |
| FR-KC-03 | JWT validation SHALL verify signature via JWKS, issuer (including `/realms/{name}`), audience, and expiry |
| FR-KC-04 | Roles SHALL be extracted from `realm_access.roles` JWT claim |
| FR-KC-05 | Tenant ID SHALL be extracted from `org_id` JWT claim (Keycloak Organization mapper) |
| FR-KC-06 | Super-admin role SHALL continue to be determined by `SUPER_ADMIN_EMAILS` env var |
| FR-KC-07 | Dashboard SPA SHALL use `react-oidc-context` library for OIDC flow |
| FR-KC-08 | Dashboard SHALL remove `@zitadel/react` dependency |
| FR-KC-09 | OIDC callback page SHALL handle Keycloak authorization code exchange |
| FR-KC-10 | Token refresh SHALL use refresh tokens in memory (not iframe-based silent refresh) |
| FR-KC-11 | `GET /api/auth/config` SHALL return `keycloak_authority` and `client_id` in SaaS mode |
| FR-KC-12 | Docker Compose SaaS profile SHALL replace Zitadel service with Keycloak |
| FR-KC-13 | Secrets management SHALL support Keycloak configuration retrieval, replacing the Zitadel-specific secrets path |
| FR-KC-14 | Environment variables SHALL change from `ZITADEL_*` to `KEYCLOAK_*` prefix |
| FR-KC-15 | All standalone mode (`AUTH_MODE=local`) behavior SHALL remain unchanged |
| FR-KC-16 | Edge device authentication (API key) SHALL remain unchanged |
| FR-KC-17 | All documentation referencing Zitadel SHALL be updated to reference Keycloak |
| FR-KC-18 | Database column `zitadel_user_id` SHALL be renamed to `external_user_id` for provider neutrality |

### FR-KC-NFR: Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-KC-01 | JWKS SHALL be cached with 1-hour TTL and automatic refresh on `kid` mismatch |
| NFR-KC-02 | Auth endpoints SHALL respond in < 200ms p95 (unchanged from Epic 13) |
| NFR-KC-03 | CI SHALL run tests in both `AUTH_MODE=local` and `AUTH_MODE=keycloak` |
| NFR-KC-04 | Direct Access Grants SHALL be disabled on all Keycloak OIDC clients |
| NFR-KC-05 | PKCE `S256` challenge method SHALL be enforced (not just supported) |

---

## 5. File Impact Matrix

### 5.1 Major Changes (Logic / Dependencies)

| File | Current | Change |
|------|---------|--------|
| `apis-server/internal/middleware/auth.go` | `ZitadelClaims` struct, `urn:zitadel:*` claims parsing | Replace with `KeycloakClaims`, parse `realm_access.roles` + `org_id` |
| `apis-dashboard/src/providers/zitadelAuthProvider.ts` | Zitadel SDK integration | Replace with `keycloakAuthProvider.ts` using `react-oidc-context` |
| `apis-dashboard/package.json` | `@zitadel/react` dependency | Remove; add `react-oidc-context` |
| `docker-compose.yml` | Zitadel service + init | Replace with Keycloak service |
| `.env.saas.example` | `ZITADEL_*` variables | Replace with `KEYCLOAK_*` variables |

### 5.2 Minor Changes (Rename / Config)

| File | Change |
|------|--------|
| `apis-server/internal/config/auth.go` | `ModeZitadel` -> `ModeKeycloak`, env var names |
| `apis-server/internal/handlers/auth_config.go` | Response field names (`zitadel_authority` -> `keycloak_authority`) |
| `apis-server/internal/secrets/secrets.go` | `ZitadelConfig` -> `KeycloakConfig`, env var names |
| `apis-server/cmd/server/main.go` | Variable naming (cosmetic) |
| `apis-dashboard/src/config.ts` | `VITE_ZITADEL_*` -> `VITE_KEYCLOAK_*` |
| `apis-dashboard/src/providers/refineAuthProvider.ts` | Import path change |
| `apis-dashboard/src/pages/Callback.tsx` | Import path change |
| `apis-dashboard/src/components/auth/ZitadelLoginButton.tsx` | Rename to `OIDCLoginButton.tsx` |
| `apis-dashboard/src/types/auth.ts` | `AuthMode` union update |

### 5.3 No Changes Required

| Component | Reason |
|-----------|--------|
| All standalone-mode code | Completely isolated |
| Edge firmware (`apis-edge/`) | Uses API key auth only |
| Database migrations | Cosmetic rename only (`zitadel_user_id` -> `external_user_id`) — no structural changes |
| `apis-dashboard/src/providers/localAuthProvider.ts` | Standalone only |
| `apis-server/internal/handlers/auth_local.go` | Standalone only |
| All Epic 13 Phase 2 stories (local mode features) | Unaffected |

---

## 6. Migration Risks & Mitigations

### Risk 1: Silent Role Absence (CRITICAL)

**Risk:** Keycloak JWTs do not include `realm_access` by default. Without the "realm roles" protocol mapper, users authenticate successfully but have zero roles, causing silent authorization failures.

**Mitigation:** Keycloak realm import JSON must include the `roles` client scope with `realm roles` mapper. Acceptance tests must verify roles are present in JWTs. The diagnostic tool in Keycloak Admin (Client Scopes -> Evaluate -> Generated Access Token) must be used during setup.

### Risk 2: Tenant Isolation via Organizations

**Risk:** Keycloak Organizations (v25+) is a newer feature. Custom protocol mapper required for `org_id` claim.

**Mitigation:** Fall back to lookup tenant from user table (by `sub` claim) if Organizations feature is unavailable. Existing RLS enforcement on database ensures isolation regardless of claim source.

### Risk 3: OIDC Discovery URL Format

**Risk:** Keycloak uses `/realms/{name}` in the issuer URL. Code that constructs or validates issuer URLs must include this path segment.

**Mitigation:** Current code already separates discovery URL from issuer URL (the `discoveryBaseURL` pattern in `middleware/auth.go`). For Keycloak, both values are the same: `https://keycloak.example.com/realms/honeybee`.

### Risk 4: Third-Party Cookie Blocking

**Risk:** Modern browsers block third-party cookies, breaking iframe-based silent token refresh when Keycloak is on a different domain.

**Mitigation:** Use refresh tokens in memory via `oidc-client-ts` (already the approach). Do not rely on iframe silent refresh.

---

## 7. Relationship to Epic 13

Epic 13 (Dual Authentication Mode) has 22 stories across 5 phases. This migration affects **only the SaaS code path** in these specific stories:

| Story | Title | Impact |
|-------|-------|--------|
| 13.2 | AUTH_MODE infrastructure | Rename `zitadel` to `keycloak` |
| 13.3 | Retrofit auth middleware | Replace `ZitadelClaims` with `KeycloakClaims` |
| 13.4 | Retrofit tenant middleware | Update `org_id` claim extraction |
| 13.5 | Retrofit auth provider (React) | Replace Zitadel SDK with react-oidc-context |
| 13.6 | Retrofit Login page | Rename `ZitadelLoginButton` |
| 13.22 | Dual-mode CI testing | Update `AUTH_MODE=zitadel` to `AUTH_MODE=keycloak` |

**Stories 13.7-13.21 (standalone features, user management, super-admin, audit, security) are unaffected.**

This addendum creates a **new Epic 15** that either replaces the Zitadel-specific parts of those stories or is executed after Epic 13 as a migration pass.

---

## 8. ADR: Zitadel to Keycloak (Decision Reversal)

**Status:** Accepted
**Date:** 2026-02-07
**Deciders:** Jermoo (project owner)

**Context:** The original architecture (v2.0) selected Zitadel over Keycloak for its Go-native implementation, first-class multi-tenant Organizations, and lighter resource footprint. Both were evaluated as excellent options; Zitadel aligned better with the Go-centric stack at the time.

**Decision:** Replace Zitadel with Keycloak as the OIDC identity provider for SaaS mode.

**Rationale:** The shared infrastructure has been rebuilt on SSIK (Sovereign Secure Infrastructure Kit) running K3s, which standardizes on Keycloak across all hosted applications. Running Zitadel as a one-off alongside a Keycloak instance that already exists for the platform creates unnecessary operational overhead (two IdPs to maintain, monitor, backup, and update). Infrastructure consistency outweighs the original stack-alignment rationale.

**Consequences:**
- Positive: Single IdP across all SSIK-hosted applications, shared operational knowledge, unified user management for platform admins
- Positive: Keycloak Organizations (v25+) provides equivalent multi-tenant capability to Zitadel Organizations
- Negative: Keycloak is Java-based (heavier resource footprint than Go-based Zitadel) — accepted because it's shared infrastructure, not per-app cost
- Neutral: No user-facing behavior change. OIDC is OIDC — the redirect flow, token format, and security posture are functionally identical

**Original decision documented in:** `architecture.md` section "Zitadel over Keycloak" (to be updated by Story 15.9)

---

## 9. Acceptance Criteria (Epic-Level)

- [ ] `AUTH_MODE=keycloak` starts the server with Keycloak OIDC validation
- [ ] `AUTH_MODE=local` behavior is identical before and after migration
- [ ] JWT roles extracted from `realm_access.roles` (verified with real Keycloak JWT)
- [ ] Tenant isolation via `org_id` claim (verified with multi-tenant test)
- [ ] `@zitadel/react` removed from `package.json`
- [ ] `react-oidc-context` and `oidc-client-ts` listed as direct dependencies
- [ ] Docker Compose `saas` profile starts Keycloak (not Zitadel)
- [ ] No references to "zitadel" remain in source code (except git history)
- [ ] All existing tests pass in both auth modes
- [ ] Super-admin email check works with Keycloak JWTs
- [ ] PKCE S256 enforced on Keycloak client
- [ ] Direct Access Grants disabled on all Keycloak clients
- [ ] `zitadel_user_id` column renamed to `external_user_id` in schema and migrations (FR-KC-18)
- [ ] Auth endpoints respond < 200ms p95 (NFR-KC-02)
- [ ] JWT signature, issuer (including `/realms/{name}` path), audience, and expiry validated — invalid tokens rejected (FR-KC-03)
- [ ] OIDC callback page successfully exchanges Keycloak authorization code for tokens (FR-KC-09)
- [ ] Token refresh uses refresh tokens in memory — no iframe-based silent refresh (FR-KC-10)
- [ ] `GET /api/auth/config` returns `keycloak_authority` and `client_id` when `AUTH_MODE=keycloak` (FR-KC-11)
- [ ] Secrets module retrieves Keycloak configuration via updated secrets path (FR-KC-13)
