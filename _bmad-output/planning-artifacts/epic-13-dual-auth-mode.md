---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - docs/PRD-ADDENDUM-DUAL-AUTH-MODE.md
  - docs/FR-DUAL-AUTH-MODE.md
  - _bmad-output/planning-artifacts/architecture.md
epicNumber: 13
epicTitle: "Dual Authentication Mode"
status: "ready"
totalStories: 22
phases: 5
validatedAt: "2026-01-27"
---

# Epic 13: Dual Authentication Mode

## Overview

This document provides the epic and story breakdown for Epic 13 - Dual Authentication Mode, enabling APIS to support both standalone (local bcrypt auth) and SaaS (Zitadel OIDC) deployment modes from a single codebase.

**Epic Goal:** Enable APIS to deploy in two modes — standalone (local bcrypt auth for self-hosted) and SaaS (Zitadel OIDC for multi-tenant) — from a single codebase, with feature parity except for super-admin capabilities.

## Requirements Inventory

### Functional Requirements

**FR-AUTH: Core Authentication**
| ID | Requirement |
|----|-------------|
| FR-AUTH-01 | System SHALL support two deployment modes via AUTH_MODE env var (local/zitadel) |
| FR-AUTH-02 | Mode SHALL be determined at startup and cannot change at runtime |
| FR-AUTH-03 | All features except super-admin SHALL be available in both modes |

**FR-LOCAL: Standalone Mode**
| ID | Requirement |
|----|-------------|
| FR-LOCAL-01 | First access with no users SHALL redirect to /setup |
| FR-LOCAL-02 | Setup wizard SHALL create admin account with name and password |
| FR-LOCAL-03 | Setup wizard SHALL ask deployment scenario and show security warning for remote access |
| FR-LOCAL-04 | Setup page SHALL never appear after first user exists |
| FR-LOCAL-05 | System SHALL use bcrypt for password hashing (cost factor 12) |
| FR-LOCAL-06 | System SHALL issue local JWT tokens signed with JWT_SECRET |
| FR-LOCAL-07 | Default tenant SHALL be auto-created on first boot with fixed UUID |
| FR-LOCAL-10 | Login page SHALL display email/password form (not OIDC redirect) |
| FR-LOCAL-11 | Login SHALL accept email address as the username |
| FR-LOCAL-12 | Failed login SHALL return generic error, log attempt, rate limit (5/email/15min) |
| FR-LOCAL-13 | Successful login SHALL generate JWT with sub, tenant_id, email, name, role claims |
| FR-LOCAL-14 | System SHALL support "Remember Me" option for session persistence |
| FR-LOCAL-15 | Logout SHALL invalidate the session cookie |
| FR-LOCAL-20 | Admin users SHALL access user management at /settings/users |
| FR-LOCAL-21 | User management SHALL support: list, create, edit, reset password, delete |
| FR-LOCAL-22 | Available roles SHALL be: admin (full access), member (standard access) |
| FR-LOCAL-23 | New users created by admin SHALL have temp password and must_change_password flag |
| FR-LOCAL-24 | Users SHALL change their own password at /settings/profile |
| FR-LOCAL-25 | Password changes SHALL require current password confirmation |

**FR-SAAS: SaaS Mode**
| ID | Requirement |
|----|-------------|
| FR-SAAS-01 | System SHALL authenticate via Zitadel OIDC |
| FR-SAAS-02 | Tenant SHALL be determined from Zitadel org_id claim |
| FR-SAAS-03 | New tenant SHALL be auto-provisioned on first login |
| FR-SAAS-04 | Super-admin role SHALL be determined by SUPER_ADMIN_EMAILS env var |
| FR-SAAS-05 | JWT validation SHALL verify signature, issuer, audience, expiry, required claims |
| FR-SAAS-20 | User management UI SHALL be hidden in SaaS mode (managed in Zitadel) |

**FR-USER: User Management**
| ID | Requirement |
|----|-------------|
| FR-USER-01 | Each tenant SHALL support multiple users |
| FR-USER-02 | Roles SHALL be: Full Admin, Member |
| FR-USER-03 | Multiple admins SHALL be allowed per tenant |
| FR-USER-04 | Standalone SHALL support 3 invite methods: temp password, email, shareable link |
| FR-USER-05 | Invite links SHALL expire after configurable duration (default 7 days) |
| FR-USER-06 | User activity SHALL be tracked via created_by/updated_by fields |

**FR-AUDIT: Audit & Activity**
| ID | Requirement |
|----|-------------|
| FR-AUDIT-01 | All create/update/delete operations SHALL be logged to audit_log |
| FR-AUDIT-02 | Audit log SHALL include old and new values (JSONB) |
| FR-AUDIT-03 | Activity feed SHALL show human-readable recent activity |
| FR-AUDIT-04 | Admins SHALL be able to query audit log |

**FR-ADMIN: Super-Admin (SaaS)**
| ID | Requirement |
|----|-------------|
| FR-ADMIN-01 | Super-admin SHALL see list of all tenants with usage |
| FR-ADMIN-02 | Super-admin SHALL create tenants and send invites |
| FR-ADMIN-03 | Super-admin SHALL configure tenant limits |
| FR-ADMIN-04 | Super-admin SHALL disable/delete tenants |
| FR-ADMIN-05 | Super-admin SHALL impersonate tenants with visual indicator |
| FR-ADMIN-06 | All impersonation sessions SHALL be logged |

**FR-LIMITS: Tenant Limits**
| ID | Requirement |
|----|-------------|
| FR-LIMITS-01 | Default limits SHALL be: 100 hives, 5GB storage, 10 units, 20 users |
| FR-LIMITS-02 | Super-admin SHALL override limits per tenant |
| FR-LIMITS-03 | Tenant admins SHALL see current usage vs limits in settings |
| FR-LIMITS-04 | System SHALL enforce limits and show clear error when exceeded |

**FR-BRAIN: BeeBrain Configuration**
| ID | Requirement |
|----|-------------|
| FR-BRAIN-01 | BeeBrain SHALL support 3 backends: rules-only, local model, external API |
| FR-BRAIN-02 | Super-admin SHALL configure system-wide BeeBrain backend |
| FR-BRAIN-03 | Super-admin SHALL enable/disable BeeBrain per tenant |
| FR-BRAIN-04 | Tenant admin SHALL optionally override with own API key (BYOK) |
| FR-BRAIN-05 | API keys SHALL be stored encrypted |

**FR-API: API Endpoints**
| ID | Requirement |
|----|-------------|
| FR-API-01 | GET /api/auth/config SHALL return mode + setup_required + zitadel config (public) |
| FR-API-02 | POST /api/auth/login SHALL authenticate email/password → JWT (local mode) |
| FR-API-03 | POST /api/auth/logout SHALL invalidate session (both modes) |
| FR-API-04 | POST /api/auth/change-password SHALL update password (local mode) |
| FR-API-05 | POST /api/auth/setup SHALL create first admin user (local mode, once only) |
| FR-API-06 | GET /api/users SHALL list tenant users (admin only) |
| FR-API-07 | POST /api/users SHALL create user (admin only) |
| FR-API-08 | POST /api/users/invite SHALL generate invite token |
| FR-API-09 | GET /api/invite/{token} SHALL validate invite |
| FR-API-10 | POST /api/invite/{token}/accept SHALL accept invite and create account |

**FR-UI: Dashboard UI**
| ID | Requirement |
|----|-------------|
| FR-UI-01 | Login page SHALL check /api/auth/config on load to determine mode |
| FR-UI-02 | If setup_required, redirect to /setup |
| FR-UI-03 | If mode=local, display email/password form |
| FR-UI-04 | If mode=zitadel, display "Sign in with Zitadel" button |
| FR-UI-10 | Setup page SHALL only be accessible when no users exist |
| FR-UI-11 | Setup page SHALL collect: email, display name, password, deployment scenario |
| FR-UI-12 | After setup, redirect to dashboard |
| FR-UI-20 | Route /settings/users SHALL show user management (local mode only) |
| FR-UI-21 | User management SHALL require admin role |
| FR-UI-30 | Route /settings/profile SHALL show profile (both modes) |
| FR-UI-31 | Profile in local mode SHALL include change password form |

### Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-SEC-01 | Passwords SHALL be hashed with bcrypt cost factor >= 12 |
| NFR-SEC-02 | JWT tokens SHALL expire after configurable duration (default 7 days) |
| NFR-SEC-03 | API keys SHALL be stored encrypted at rest |
| NFR-SEC-04 | Rate limiting SHALL apply to login endpoint (5/email, 20/IP per 15 min) |
| NFR-SEC-05 | Session cookies SHALL be HttpOnly, Secure, SameSite=Strict |
| NFR-SEC-06 | JWT_SECRET SHALL be minimum 32 characters |
| NFR-PERF-01 | Auth endpoints SHALL respond in < 200ms p95 |
| NFR-COMPAT-01 | Both modes SHALL use identical API response formats |
| NFR-TEST-01 | CI SHALL run all tests in both AUTH_MODE=local and AUTH_MODE=zitadel |
| NFR-TEST-02 | Mode-specific tests SHALL use skip logic or build tags |

### Additional Requirements (from Architecture)

**Database Schema:**
- Users table modified with: password_hash, role, is_active, must_change_password, invited_by, invited_at, last_login_at, zitadel_user_id
- New tables: tenant_limits, audit_log, invite_tokens, beebrain_config, impersonation_log
- All tables already have tenant_id (RLS enforced)

**Infrastructure:**
- AUTH_MODE env var determines mode at startup
- Default tenant UUID: `00000000-0000-0000-0000-000000000000` for standalone
- SUPER_ADMIN_EMAILS env var for SaaS super-admin role
- Feature detection pattern (not deployment detection)

**Files Requiring Retrofit:**
| File | Current State | Change Needed |
|------|---------------|---------------|
| `apis-server/internal/middleware/auth.go` | Zitadel JWT only | Add local JWT validation path |
| `apis-server/internal/middleware/tenant.go` | org_id from Zitadel | Default tenant for local mode |
| `apis-server/cmd/server/main.go` | Hardcoded Zitadel | AUTH_MODE switch |
| `apis-dashboard/src/providers/refineAuthProvider.ts` | Zitadel calls | Mode-aware abstraction |
| `apis-dashboard/src/pages/Login.tsx` | OIDC redirect | Conditional form vs redirect |
| `apis-dashboard/src/config.ts` | Zitadel vars only | Add AUTH_MODE |

## FR Coverage Map

```
FR-AUTH-01 → 13.1, 13.2 (AUTH_MODE support)
FR-AUTH-02 → 13.2 (Runtime mode lock)
FR-AUTH-03 → 13.1-13.19 (Feature parity)
FR-LOCAL-01 → 13.7 (Redirect to /setup)
FR-LOCAL-02 → 13.7 (Setup creates admin)
FR-LOCAL-03 → 13.7 (Deployment scenario)
FR-LOCAL-04 → 13.7 (Setup once only)
FR-LOCAL-05 → 13.21 (bcrypt cost 12)
FR-LOCAL-06 → 13.3 (Local JWT)
FR-LOCAL-07 → 13.2, 13.4 (Default tenant)
FR-LOCAL-10 → 13.6 (Login form)
FR-LOCAL-11 → 13.8 (Email as username)
FR-LOCAL-12 → 13.8, 13.20 (Failed login handling)
FR-LOCAL-13 → 13.3, 13.8 (JWT claims)
FR-LOCAL-14 → 13.8 (Remember me)
FR-LOCAL-15 → 13.8 (Logout)
FR-LOCAL-20 → 13.9, 13.11 (User management)
FR-LOCAL-21 → 13.9, 13.11 (CRUD operations)
FR-LOCAL-22 → 13.9 (Roles)
FR-LOCAL-23 → 13.10 (Temp password)
FR-LOCAL-24 → 13.21 (Change password)
FR-LOCAL-25 → 13.21 (Password confirmation)
FR-SAAS-01 → 13.3 (Zitadel OIDC)
FR-SAAS-02 → 13.4 (org_id claim)
FR-SAAS-03 → 13.4 (Auto-provision)
FR-SAAS-04 → 13.12 (SUPER_ADMIN_EMAILS)
FR-SAAS-05 → 13.3 (JWT validation)
FR-SAAS-20 → 13.11 (Hidden in SaaS)
FR-USER-01 → 13.1 (Multi-user)
FR-USER-02 → 13.9 (Roles)
FR-USER-03 → 13.9 (Multiple admins)
FR-USER-04 → 13.10 (3 invite methods)
FR-USER-05 → 13.10 (Invite expiry)
FR-USER-06 → 13.16 (Activity tracking)
FR-AUDIT-01 → 13.16 (Audit log)
FR-AUDIT-02 → 13.16 (Old/new values)
FR-AUDIT-03 → 13.17 (Activity feed)
FR-AUDIT-04 → 13.16 (Query audit)
FR-ADMIN-01 → 13.12 (Tenant list)
FR-ADMIN-02 → 13.12 (Create tenant)
FR-ADMIN-03 → 13.13 (Configure limits)
FR-ADMIN-04 → 13.12 (Disable/delete)
FR-ADMIN-05 → 13.14 (Impersonate)
FR-ADMIN-06 → 13.14 (Log sessions)
FR-LIMITS-01 → 13.13 (Default limits)
FR-LIMITS-02 → 13.13 (Override)
FR-LIMITS-03 → 13.19 (Show in settings)
FR-LIMITS-04 → 13.13 (Enforce)
FR-BRAIN-01 → 13.18 (3 backends)
FR-BRAIN-02 → 13.15 (System config)
FR-BRAIN-03 → 13.15 (Per-tenant access)
FR-BRAIN-04 → 13.18 (BYOK)
FR-BRAIN-05 → 13.18 (Encrypted keys)
FR-API-01 → 13.2 (Auth config endpoint)
FR-API-02 → 13.8 (Login endpoint)
FR-API-03 → 13.8 (Logout endpoint)
FR-API-04 → 13.21 (Change password)
FR-API-05 → 13.7 (Setup endpoint)
FR-API-06 → 13.9 (List users)
FR-API-07 → 13.9 (Create user)
FR-API-08 → 13.10 (Generate invite)
FR-API-09 → 13.10 (Validate invite)
FR-API-10 → 13.10 (Accept invite)
FR-UI-01 → 13.5, 13.6 (Check config)
FR-UI-02 → 13.6 (Redirect to setup)
FR-UI-03 → 13.6 (Local form)
FR-UI-04 → 13.6 (Zitadel button)
FR-UI-10 → 13.7 (Setup accessible)
FR-UI-11 → 13.7 (Setup fields)
FR-UI-12 → 13.7 (Redirect after)
FR-UI-20 → 13.11 (User management route)
FR-UI-21 → 13.11 (Admin required)
FR-UI-30 → 13.19 (Profile route)
FR-UI-31 → 13.21 (Change password UI)
NFR-SEC-01 → 13.21 (bcrypt)
NFR-SEC-02 → 13.21 (JWT expiry)
NFR-SEC-03 → 13.18 (Encrypted keys)
NFR-SEC-04 → 13.20 (Rate limiting)
NFR-SEC-05 → 13.21 (Secure cookies)
NFR-SEC-06 → 13.21 (JWT_SECRET length)
NFR-PERF-01 → 13.8 (Auth performance)
NFR-COMPAT-01 → 13.3 (Response formats)
NFR-TEST-01 → 13.22 (Dual-mode CI)
NFR-TEST-02 → 13.22 (Skip logic)
```

## Epic List

### Phase 1: Foundation & Retrofit (Stories 13.1 - 13.6)
Make the existing codebase dual-mode aware. After this phase, the app works in both modes with mode-switching infrastructure complete.

| Story | Title | FRs Covered |
|-------|-------|-------------|
| 13.1 | Database migrations | FR-AUTH-01, FR-USER-01 |
| 13.2 | AUTH_MODE infrastructure | FR-AUTH-01, FR-AUTH-02, FR-LOCAL-07, FR-API-01 |
| 13.3 | Retrofit auth middleware | FR-LOCAL-06, FR-LOCAL-13, FR-SAAS-01, FR-SAAS-05, NFR-COMPAT-01 |
| 13.4 | Retrofit tenant middleware | FR-LOCAL-07, FR-SAAS-02, FR-SAAS-03 |
| 13.5 | Retrofit auth provider (React) | FR-UI-01 |
| 13.6 | Retrofit Login page | FR-UI-01, FR-UI-02, FR-UI-03, FR-UI-04, FR-LOCAL-10 |

### Phase 2: Local Mode Features (Stories 13.7 - 13.11)
Build standalone-specific features. After this phase, standalone mode is fully functional.

| Story | Title | FRs Covered |
|-------|-------|-------------|
| 13.7 | Setup wizard | FR-LOCAL-01, FR-LOCAL-02, FR-LOCAL-03, FR-LOCAL-04, FR-API-05, FR-UI-10, FR-UI-11, FR-UI-12 |
| 13.8 | Login/logout endpoints | FR-LOCAL-11, FR-LOCAL-12, FR-LOCAL-13, FR-LOCAL-14, FR-LOCAL-15, FR-API-02, FR-API-03, NFR-PERF-01 |
| 13.9 | User management endpoints | FR-LOCAL-20, FR-LOCAL-21, FR-LOCAL-22, FR-USER-02, FR-USER-03, FR-API-06, FR-API-07 |
| 13.10 | Invite flow | FR-USER-04, FR-USER-05, FR-LOCAL-23, FR-API-08, FR-API-09, FR-API-10 |
| 13.11 | User management UI | FR-LOCAL-20, FR-LOCAL-21, FR-SAAS-20, FR-UI-20, FR-UI-21 |

### Phase 3: SaaS Features (Stories 13.12 - 13.15)
Build multi-tenant management features. After this phase, SaaS operators can manage tenants.

| Story | Title | FRs Covered |
|-------|-------|-------------|
| 13.12 | Super-admin: Tenant list & management | FR-ADMIN-01, FR-ADMIN-02, FR-ADMIN-04, FR-SAAS-04 |
| 13.13 | Super-admin: Tenant limits | FR-LIMITS-01, FR-LIMITS-02, FR-LIMITS-04, FR-ADMIN-03 |
| 13.14 | Super-admin: Impersonation | FR-ADMIN-05, FR-ADMIN-06 |
| 13.15 | Super-admin: BeeBrain config | FR-BRAIN-02, FR-BRAIN-03 |

### Phase 4: Shared Features (Stories 13.16 - 13.19)
Features that work identically in both modes. After this phase, audit and settings available everywhere.

| Story | Title | FRs Covered |
|-------|-------|-------------|
| 13.16 | Audit log infrastructure | FR-AUDIT-01, FR-AUDIT-02, FR-AUDIT-04, FR-USER-06 |
| 13.17 | Activity feed | FR-AUDIT-03 |
| 13.18 | BeeBrain BYOK | FR-BRAIN-01, FR-BRAIN-04, FR-BRAIN-05, NFR-SEC-03 |
| 13.19 | Tenant settings UI | FR-LIMITS-03, FR-UI-30 |

### Phase 5: Security & Testing (Stories 13.20 - 13.22)
Harden and validate. After this phase, production-ready and tested in both modes.

| Story | Title | FRs Covered |
|-------|-------|-------------|
| 13.20 | Rate limiting | NFR-SEC-04, FR-LOCAL-12 |
| 13.21 | Security hardening | NFR-SEC-01, NFR-SEC-02, NFR-SEC-05, NFR-SEC-06, FR-LOCAL-05, FR-LOCAL-24, FR-LOCAL-25, FR-API-04, FR-UI-31 |
| 13.22 | Dual-mode CI testing | NFR-TEST-01, NFR-TEST-02 |

---

## Stories

### Phase 1: Foundation & Retrofit

---

### Story 13.1: Database Migrations

**As a** system administrator,
**I want** the database schema to support dual authentication modes,
**So that** user data can be stored and managed in both standalone and SaaS deployments.

**Acceptance Criteria:**

**Given** a fresh database or existing APIS deployment
**When** migrations run
**Then** the following schema changes are applied:

1. **Users table modifications:**
   - `password_hash VARCHAR(255)` — bcrypt hash (NULL in SaaS mode)
   - `zitadel_user_id TEXT` — Zitadel sub claim (NULL in local mode)
   - `role TEXT DEFAULT 'member'` — 'admin' or 'member'
   - `is_active BOOLEAN DEFAULT true`
   - `must_change_password BOOLEAN DEFAULT false`
   - `invited_by TEXT REFERENCES users(id)`
   - `invited_at TIMESTAMPTZ`
   - `last_login_at TIMESTAMPTZ`

2. **New tables created:**
   - tenant_limits (tenant_id PK, max_hives, max_storage_bytes, max_units, max_users)
   - audit_log (id, tenant_id, user_id, action, entity_type, entity_id, old_values, new_values, ip_address, created_at)
   - invite_tokens (id, tenant_id, email, role, token, created_by, expires_at, used_at)
   - beebrain_config (id, tenant_id, backend, provider, endpoint, api_key_encrypted, is_tenant_override)
   - impersonation_log (id, super_admin_id, tenant_id, started_at, ended_at, actions_taken)

3. **Indexes created** for audit_log (tenant_id, created_at DESC)

**And** existing data is preserved (non-destructive migration)
**And** migrations are idempotent (can run multiple times safely)

**Files to Create/Modify:**
- `apis-server/internal/storage/migrations/0023_dual_auth_users.sql`
- `apis-server/internal/storage/migrations/0024_audit_log.sql`
- `apis-server/internal/storage/migrations/0025_invite_tokens.sql`
- `apis-server/internal/storage/migrations/0026_beebrain_config.sql`
- `apis-server/internal/storage/migrations/0027_impersonation_log.sql`
- `apis-server/internal/storage/migrations/0028_tenant_limits.sql`

**Test Criteria:**
- [ ] Migrations run successfully on empty database
- [ ] Migrations run successfully on existing database with data
- [ ] All new columns have correct types and constraints
- [ ] Indexes created and functional

---

### Story 13.2: AUTH_MODE Infrastructure

**As a** system administrator,
**I want** the server to detect and configure authentication mode at startup,
**So that** the same codebase can run in standalone or SaaS mode based on environment configuration.

**Acceptance Criteria:**

**Given** the server starts
**When** `AUTH_MODE` environment variable is set
**Then** the server configures itself for that mode

1. **Mode Detection:**
   - `AUTH_MODE=local` → Standalone mode
   - `AUTH_MODE=zitadel` → SaaS mode
   - Missing/invalid → Fail startup with clear error

2. **Local Mode Requirements:**
   - `JWT_SECRET` must be set (min 32 chars) or fail startup
   - Default tenant auto-created with UUID `00000000-0000-0000-0000-000000000000`
   - Zitadel configuration ignored

3. **SaaS Mode Requirements:**
   - `ZITADEL_ISSUER` and `ZITADEL_CLIENT_ID` must be set or fail startup
   - `JWT_SECRET` still required (for device tokens)
   - `SUPER_ADMIN_EMAILS` parsed into list

4. **GET /api/auth/config Endpoint (public):**
   - Local mode: `{"mode": "local", "setup_required": true|false}`
   - SaaS mode: `{"mode": "zitadel", "zitadel_authority": "...", "zitadel_client_id": "..."}`

5. **Feature Detection Pattern:**
   - `AuthMode()` returns "local" or "zitadel"
   - `IsLocalAuth()` and `IsSaaSMode()` helper functions
   - `DefaultTenantID()` returns fixed UUID for local mode

**Files to Create/Modify:**
- `apis-server/internal/config/auth.go` (new)
- `apis-server/internal/config/features.go` (new)
- `apis-server/internal/handlers/auth_config.go` (new)
- `apis-server/cmd/server/main.go` (modify startup)

**Test Criteria:**
- [ ] Server fails to start without AUTH_MODE
- [ ] Server fails to start without JWT_SECRET in local mode
- [ ] Server fails to start without ZITADEL_ISSUER in zitadel mode
- [ ] GET /api/auth/config returns correct structure for each mode
- [ ] Default tenant created on first local mode startup

---

### Story 13.3: Retrofit Auth Middleware

**As a** developer,
**I want** the auth middleware to validate tokens from both local JWT and Zitadel,
**So that** authenticated requests work in both deployment modes.

**Acceptance Criteria:**

**Given** a request with an Authorization header or session cookie
**When** the auth middleware processes it
**Then** it validates the token based on current AUTH_MODE

1. **Local Mode Validation:**
   - Extract JWT from `apis_session` cookie or `Authorization: Bearer` header
   - Validate signature using `JWT_SECRET` (HS256)
   - Verify `exp` claim (not expired)
   - Extract claims: `sub`, `tenant_id`, `email`, `name`, `role`
   - Set context values: `user_id`, `tenant_id`, `role`

2. **SaaS Mode Validation (existing, preserve):**
   - Validate against Zitadel JWKS (RS256)
   - Extract `sub`, `urn:zitadel:iam:org:id`, roles from claims
   - Auto-provision user/tenant on first login

3. **Unified Context Output:**
   - `ctx.Value("user_id")`, `ctx.Value("tenant_id")`, `ctx.Value("role")`, `ctx.Value("email")`

4. **Error Responses:**
   - Missing token → 401 "Authentication required"
   - Invalid token → 401 "Invalid token"
   - Expired token → 401 "Token expired"

**Files to Modify:**
- `apis-server/internal/middleware/auth.go`
- `apis-server/internal/auth/local_jwt.go` (new)
- `apis-server/internal/auth/claims.go` (new)

**Test Criteria:**
- [ ] Valid token → request proceeds with context set
- [ ] Invalid signature → 401
- [ ] Expired token → 401
- [ ] Local mode accepts HS256 tokens
- [ ] SaaS mode accepts RS256 Zitadel tokens

---

### Story 13.4: Retrofit Tenant Middleware

**As a** developer,
**I want** the tenant middleware to set the correct tenant context regardless of auth mode,
**So that** RLS policies work correctly in both deployment modes.

**Acceptance Criteria:**

**Given** an authenticated request
**When** the tenant middleware processes it
**Then** it sets `app.tenant_id` for RLS

1. **Local Mode:** Always use `tenant_id` from JWT claims (default: `00000000-0000-0000-0000-000000000000`)
2. **SaaS Mode:** Extract from Zitadel `org_id` claim, auto-provision if not exists
3. **Database Context:** `conn.Exec(ctx, "SET app.tenant_id = $1", tenantID)`
4. **Error Handling:** Invalid/disabled tenant → 403 Forbidden

**Files to Modify:**
- `apis-server/internal/middleware/tenant.go`
- `apis-server/internal/storage/tenants.go` (add GetOrCreate)

**Test Criteria:**
- [ ] Local mode sets default tenant UUID
- [ ] SaaS mode extracts org_id from claims
- [ ] RLS queries only return tenant's data
- [ ] Disabled tenant returns 403

---

### Story 13.5: Retrofit Auth Provider (React)

**As a** frontend developer,
**I want** the auth provider to support both local and Zitadel authentication,
**So that** the dashboard works correctly in both deployment modes.

**Acceptance Criteria:**

**Given** the dashboard loads
**When** it initializes authentication
**Then** it configures based on the auth mode from `/api/auth/config`

1. **Mode Detection:** Fetch `/api/auth/config` on app init
2. **Auth Provider Abstraction:** Interface with `login()`, `logout()`, `getIdentity()`, `checkAuth()`
3. **Local Mode Provider:** POST /api/auth/login with credentials, session cookie
4. **SaaS Mode Provider:** Zitadel OIDC redirect flow
5. **Refine Integration:** Export provider compatible with Refine's authProvider interface

**Files to Create/Modify:**
- `apis-dashboard/src/providers/authProvider.ts` (new - abstraction)
- `apis-dashboard/src/providers/localAuthProvider.ts` (new)
- `apis-dashboard/src/providers/zitadelAuthProvider.ts` (refactor existing)
- `apis-dashboard/src/providers/refineAuthProvider.ts` (modify to use abstraction)
- `apis-dashboard/src/config.ts` (add AUTH_MODE)

**Test Criteria:**
- [ ] Local mode uses email/password flow
- [ ] SaaS mode uses OIDC redirect
- [ ] getIdentity returns user in both modes
- [ ] logout clears session in both modes

---

### Story 13.6: Retrofit Login Page

**As a** user,
**I want** the login page to show the appropriate authentication method,
**So that** I can sign in using the method configured for my deployment.

**Acceptance Criteria:**

**Given** user navigates to /login
**When** the page loads
**Then** it displays the correct authentication UI

1. **Mode Detection:** Fetch `/api/auth/config`, redirect to `/setup` if `setup_required`
2. **Local Mode UI:** Email/password form with "Remember me" checkbox
3. **SaaS Mode UI:** "Sign in with Zitadel" button
4. **Form Validation:** Email format, password required
5. **Error Handling:** Invalid credentials, rate limited, network error messages
6. **Success Flow:** Redirect to dashboard

**Files to Modify:**
- `apis-dashboard/src/pages/Login.tsx`
- `apis-dashboard/src/components/auth/LoginForm.tsx` (new)
- `apis-dashboard/src/components/auth/ZitadelLoginButton.tsx` (new)

**Test Criteria:**
- [ ] Local mode shows email/password form
- [ ] SaaS mode shows Zitadel button
- [ ] Setup redirect works when no users exist
- [ ] Successful login redirects to dashboard

---

### Phase 2: Local Mode Features

---

### Story 13.7: Setup Wizard

**As a** first-time user of a standalone APIS deployment,
**I want** a setup wizard to create my admin account and configure basic settings,
**So that** I can start using APIS without manual database configuration.

**Acceptance Criteria:**

**Given** a fresh APIS deployment with no users
**When** user accesses any dashboard route
**Then** they are redirected to `/setup`

**Backend - POST /api/auth/setup:**
- Only available when `AUTH_MODE=local` AND no users exist
- Creates admin user with bcrypt-hashed password
- Creates session JWT and sets cookie
- Returns 404 if users already exist

**Frontend - /setup Page:**
1. Step 1: Display name, email, password, confirm password
2. Step 2: Deployment scenario (dashboard only / local network / remote access)
3. Security warning for remote scenario
4. Redirect to dashboard on completion

**Files to Create:**
- `apis-server/internal/handlers/setup.go`
- `apis-dashboard/src/pages/Setup.tsx`
- `apis-dashboard/src/components/auth/SetupWizard.tsx`
- `apis-dashboard/src/components/auth/SecurityWarningModal.tsx`

**Test Criteria:**
- [ ] Setup only accessible when no users exist
- [ ] Setup creates admin user with correct role
- [ ] Security warning shown for remote scenario
- [ ] Setup page returns 404 after first user created

---

### Story 13.8: Login/Logout Endpoints

**As a** user of a standalone APIS deployment,
**I want** to log in with my email and password,
**So that** I can access my beekeeping data securely.

**Acceptance Criteria:**

**POST /api/auth/login:**
- Validate credentials, verify bcrypt hash
- Rate limit: 5 attempts per email per 15 min
- Return user data + set `apis_session` cookie with JWT
- JWT claims: sub, tenant_id, email, name, role, iat, exp
- Remember me: configurable session duration

**POST /api/auth/logout:**
- Clear `apis_session` cookie

**GET /api/auth/me:**
- Return current user info from session

**Files to Create/Modify:**
- `apis-server/internal/handlers/auth_local.go` (new)
- `apis-server/internal/auth/jwt.go` (new)
- `apis-server/internal/auth/password.go` (new)
- `apis-server/internal/storage/users.go` (add GetByEmail, UpdateLastLogin)

**Test Criteria:**
- [ ] Valid credentials return user and set cookie
- [ ] Invalid password returns 401 (no user enumeration)
- [ ] Rate limiting kicks in after 5 failed attempts
- [ ] JWT contains correct claims

---

### Story 13.9: User Management Endpoints

**As a** tenant admin in standalone mode,
**I want** to create, edit, and manage users in my tenant,
**So that** I can invite team members to collaborate.

**Acceptance Criteria:**

**GET /api/users** (Admin only): List all tenant users with role, status, last login
**POST /api/users** (Admin only): Create user with temp password, set must_change_password
**PUT /api/users/{id}** (Admin only): Update name, role, active status
**DELETE /api/users/{id}** (Admin only): Soft delete (cannot delete self or last admin)
**POST /api/users/{id}/reset-password** (Admin only): Set new temp password

**Files to Create:**
- `apis-server/internal/handlers/users.go`
- `apis-server/internal/storage/users.go` (extend with CRUD)

**Test Criteria:**
- [ ] Admin can CRUD users in tenant
- [ ] Admin cannot demote self or delete last admin
- [ ] Non-admin receives 403
- [ ] Users scoped to tenant (RLS)

---

### Story 13.10: Invite Flow

**As a** tenant admin,
**I want** to invite users via multiple methods,
**So that** I can onboard team members flexibly.

**Acceptance Criteria:**

**POST /api/users/invite:**
- Method 1: Temp password (creates user immediately)
- Method 2: Email invite (creates token, sends email if SMTP configured)
- Method 3: Shareable link (reusable token without email)

**GET /api/invite/{token}:** Validate token, return role and tenant info
**POST /api/invite/{token}/accept:** Create user account, start session

**Invite tokens:** Cryptographically random, configurable expiry (default 7 days)

**Files to Create:**
- `apis-server/internal/handlers/invite.go`
- `apis-server/internal/storage/invite_tokens.go`
- `apis-server/internal/services/email.go` (optional SMTP)
- `apis-dashboard/src/pages/InviteAccept.tsx`

**Test Criteria:**
- [ ] All 3 invite methods work
- [ ] Expired tokens rejected
- [ ] Email invite tokens are single-use
- [ ] Link tokens are reusable

---

### Story 13.11: User Management UI

**As a** tenant admin in standalone mode,
**I want** a user management interface in Settings,
**So that** I can manage team members without CLI.

**Acceptance Criteria:**

**Route:** `/settings/users` (Admin only, local mode only)
- Hidden in SaaS mode navigation
- User list with name, email, role, status, actions
- Invite modal with method selector (password/email/link)
- Edit modal for name, role, active status
- Delete confirmation dialog
- Cannot demote self or delete last admin

**Files to Create:**
- `apis-dashboard/src/pages/settings/Users.tsx`
- `apis-dashboard/src/components/users/UserList.tsx`
- `apis-dashboard/src/components/users/InviteUserModal.tsx`
- `apis-dashboard/src/components/users/EditUserModal.tsx`
- `apis-dashboard/src/hooks/useUsers.ts`

**Test Criteria:**
- [ ] Page only accessible to admins in local mode
- [ ] All CRUD operations work
- [ ] Cannot demote self from admin

---

### Phase 3: SaaS Features

---

### Story 13.12: Super-Admin Tenant List & Management

**As a** SaaS operator (super-admin),
**I want** to view and manage all tenants,
**So that** I can onboard customers and handle support.

**Acceptance Criteria:**

**Authorization:** Super-admin determined by `SUPER_ADMIN_EMAILS` env var

**GET /api/admin/tenants:** List all tenants with usage stats, filtering, pagination
**POST /api/admin/tenants:** Create tenant + send admin invite
**GET /api/admin/tenants/{id}:** Tenant details with users and activity
**PUT /api/admin/tenants/{id}:** Update name, plan, status (active/suspended/deleted)
**DELETE /api/admin/tenants/{id}:** Soft delete with confirmation

**Frontend - /admin/tenants:** Tenant table, create modal, detail page

**Files to Create:**
- `apis-server/internal/middleware/superadmin.go`
- `apis-server/internal/handlers/admin_tenants.go`
- `apis-dashboard/src/pages/admin/Tenants.tsx`
- `apis-dashboard/src/pages/admin/TenantDetail.tsx`

**Test Criteria:**
- [ ] Only super-admins can access /api/admin/*
- [ ] Tenant CRUD works
- [ ] Suspended tenant blocks user login

---

### Story 13.13: Super-Admin Tenant Limits

**As a** SaaS operator,
**I want** to configure resource limits per tenant,
**So that** I can manage capacity and offer service tiers.

**Acceptance Criteria:**

**Default Limits by Plan:** Free (10/1GB/2/5), Hobby (100/5GB/10/20), Pro (500/50GB/50/50)

**GET /api/admin/tenants/{id}/limits:** Current limits and usage
**PUT /api/admin/tenants/{id}/limits:** Override limits

**Limit Enforcement:** Check before creating hives, users, units, uploading clips
**Error Response:** 403 with current/limit values and upgrade suggestion

**Files to Create/Modify:**
- `apis-server/internal/handlers/admin_limits.go`
- `apis-server/internal/storage/tenant_limits.go`
- `apis-server/internal/services/limits.go`
- Modify: hives.go, clips.go, users.go, units.go handlers

**Test Criteria:**
- [ ] Default limits applied based on plan
- [ ] Limits enforced on resource creation
- [ ] Clear error messages when limit reached

---

### Story 13.14: Super-Admin Impersonation

**As a** SaaS operator,
**I want** to impersonate a tenant for support,
**So that** I can see exactly what the customer sees.

**Acceptance Criteria:**

**POST /api/admin/tenants/{id}/impersonate:** Start impersonation session, log to impersonation_log
**DELETE /api/admin/impersonate:** End session, restore original identity

**Impersonation JWT:** Includes `impersonating: true` flag, original identity preserved
**Frontend Banner:** Fixed warning banner with tenant name and exit button
**Action Tracking:** Count actions taken during session

**Files to Create:**
- `apis-server/internal/handlers/admin_impersonate.go`
- `apis-server/internal/storage/impersonation_log.go`
- `apis-dashboard/src/components/admin/ImpersonationBanner.tsx`
- `apis-dashboard/src/context/ImpersonationContext.tsx`

**Test Criteria:**
- [ ] Impersonation sets correct tenant context
- [ ] Banner displays during impersonation
- [ ] Exit restores original session
- [ ] Sessions logged to audit

---

### Story 13.15: Super-Admin BeeBrain Config

**As a** SaaS operator,
**I want** to configure system-wide BeeBrain and per-tenant access,
**So that** I can manage AI costs and service levels.

**Acceptance Criteria:**

**GET /api/admin/beebrain:** System config + per-tenant access list
**PUT /api/admin/beebrain:** Update system backend (rules/local/external), encrypted API key
**PUT /api/admin/tenants/{id}/beebrain:** Enable/disable BeeBrain for specific tenant

**Backend Options:** rules (no AI), local (Ollama), external (OpenAI/Anthropic)
**API Key Security:** Encrypted at rest, never returned in responses

**Files to Create:**
- `apis-server/internal/handlers/admin_beebrain.go`
- `apis-server/internal/storage/beebrain_config.go`
- `apis-server/internal/services/encryption.go`
- `apis-dashboard/src/pages/admin/BeeBrainConfig.tsx`

**Test Criteria:**
- [ ] System config stored with tenant_id NULL
- [ ] API keys encrypted
- [ ] Per-tenant access toggles work

---

### Phase 4: Shared Features

---

### Story 13.16: Audit Log Infrastructure

**As a** tenant admin,
**I want** all data modifications logged,
**So that** I can track changes and investigate issues.

**Acceptance Criteria:**

**Audit Middleware:** Wrap POST/PUT/PATCH/DELETE handlers, capture before/after state
**Entities to Audit:** hives, inspections, treatments, feedings, harvests, sites, units, users, clips (delete only)
**Sensitive Data:** Never log passwords, mask API keys

**GET /api/audit** (Admin only): Query with filters (entity_type, user_id, action, date range)
**GET /api/audit/entity/{type}/{id}:** History for specific entity

**Files to Create/Modify:**
- `apis-server/internal/middleware/audit.go`
- `apis-server/internal/storage/audit_log.go`
- `apis-server/internal/handlers/audit.go`
- Modify all CRUD handlers to add audit calls

**Test Criteria:**
- [ ] Create/update/delete operations logged
- [ ] Passwords never appear in logs
- [ ] Query filters work correctly
- [ ] Results scoped to tenant

---

### Story 13.17: Activity Feed

**As a** tenant user,
**I want** a human-readable activity feed,
**So that** I can see what's been happening in my apiary.

**Acceptance Criteria:**

**GET /api/activity:** Recent activity with icons, messages, relative times, cursor pagination

**Activity Types:** inspection_created, treatment_recorded, feeding_recorded, harvest_recorded, hive_created, clip_uploaded, user_joined

**Placement:** Dashboard home (condensed), /activity page (full), site/hive detail pages (filtered)

**Files to Create:**
- `apis-server/internal/handlers/activity.go`
- `apis-server/internal/services/activity.go`
- `apis-dashboard/src/pages/Activity.tsx`
- `apis-dashboard/src/hooks/useActivityFeed.ts`

**Test Criteria:**
- [ ] Human-readable messages with icons
- [ ] Relative times calculated correctly
- [ ] Cursor pagination works
- [ ] Entity links navigate correctly

---

### Story 13.18: BeeBrain BYOK

**As a** tenant admin,
**I want** to use my own API key for BeeBrain,
**So that** I can access AI even if system default is limited.

**Acceptance Criteria:**

**Resolution Logic:** Tenant override → Tenant access check → System default

**GET /api/settings/beebrain:** Current mode, effective backend, custom config status
**PUT /api/settings/beebrain:** Switch between system/custom/rules_only, set provider and API key

**Supported Providers:** OpenAI, Anthropic, Local/Ollama

**Files to Create/Modify:**
- `apis-server/internal/handlers/settings_beebrain.go`
- `apis-server/internal/services/beebrain.go` (modify config resolution)
- `apis-dashboard/src/pages/settings/BeeBrain.tsx`

**Test Criteria:**
- [ ] Tenant can switch to custom API key
- [ ] Config resolution follows hierarchy
- [ ] API keys encrypted

---

### Story 13.19: Tenant Settings UI

**As a** tenant admin,
**I want** to see usage and limits in Settings,
**So that** I understand my resource consumption.

**Acceptance Criteria:**

**GET /api/settings/tenant:** Tenant info, usage stats, limits, percentages

**Settings Page Tabs:**
- Overview: Tenant info, usage progress bars
- Profile: Name (editable), email (readonly), change password (local mode)
- Users: (Story 13.11, local mode only)
- BeeBrain: (Story 13.18)

**Conditional Sections:** Password change only in local mode, Users tab only in local mode

**Files to Create/Modify:**
- `apis-server/internal/handlers/settings.go`
- `apis-dashboard/src/pages/Settings.tsx` (refactor to tabs)
- `apis-dashboard/src/pages/settings/Overview.tsx`
- `apis-dashboard/src/pages/settings/Profile.tsx`
- `apis-dashboard/src/components/settings/UsageChart.tsx`

**Test Criteria:**
- [ ] Overview shows usage and limits
- [ ] Password change works (local mode)
- [ ] Users tab hidden in SaaS mode

---

### Phase 5: Security & Testing

---

### Story 13.20: Rate Limiting

**As a** system administrator,
**I want** rate limiting on auth endpoints,
**So that** brute force attacks are prevented.

**Acceptance Criteria:**

**Rate Limits:**
- POST /api/auth/login: 5/email/15min, 20/IP/15min
- POST /api/auth/setup: 3/IP/15min
- POST /api/invite/{token}/accept: 5/IP/15min
- POST /api/auth/change-password: 5/user_id/15min

**Implementation:** In-memory (standalone) or Redis (SaaS)
**Response Headers:** X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
**429 Response:** Error message with retry time

**Files to Create/Modify:**
- `apis-server/internal/middleware/ratelimit.go` (extend)
- `apis-server/internal/ratelimit/memory.go`
- `apis-server/internal/ratelimit/redis.go`

**Test Criteria:**
- [ ] Rate limits enforced per key
- [ ] Headers present in responses
- [ ] Limits reset after window expires

---

### Story 13.21: Security Hardening

**As a** system administrator,
**I want** authentication to follow security best practices,
**So that** accounts and data are protected.

**Acceptance Criteria:**

**Password Security:**
- bcrypt cost factor 12
- Minimum 8 chars, max 72
- Common password check (top 10,000)

**JWT Security:**
- HS256 with 32+ char secret
- Configurable expiry (default 7 days)
- Startup validation of JWT_SECRET length

**Cookie Security:** HttpOnly, Secure (production), SameSite=Strict

**POST /api/auth/change-password:**
- Verify current password
- Validate new password
- Clear must_change_password flag
- Optional: invalidate other sessions

**Security Headers:** X-Content-Type-Options, X-Frame-Options, X-XSS-Protection

**Files to Create/Modify:**
- `apis-server/internal/auth/password.go` (extend validation)
- `apis-server/internal/auth/common_passwords.go`
- `apis-server/internal/handlers/auth_local.go` (change password)
- `apis-server/internal/middleware/security.go`
- `apis-dashboard/src/pages/ChangePassword.tsx`

**Test Criteria:**
- [ ] bcrypt cost 12 enforced
- [ ] JWT_SECRET < 32 chars fails startup
- [ ] Common passwords rejected
- [ ] Cookies are HttpOnly and SameSite=Strict

---

### Story 13.22: Dual-Mode CI Testing

**As a** developer,
**I want** CI to run tests in both auth modes,
**So that** changes work correctly in both deployments.

**Acceptance Criteria:**

**CI Workflow:**
- Matrix strategy: `auth_mode: [local, zitadel]`
- Server tests with AUTH_MODE env var
- Dashboard tests with VITE_AUTH_MODE env var
- Coverage reported separately per mode

**Test Patterns:**
- Mode-specific tests use skip logic: `if AuthMode() != "local" { t.Skip() }`
- Shared tests run in both modes
- Test utilities: `SetupLocalMode(t)`, `SetupZitadelMode(t)`, `CreateTestUser(t, ...)`

**Integration Test Matrix:**
| Test | Local | Zitadel |
|------|-------|---------|
| Login flow | ✓ | ✓ (mocked) |
| Setup wizard | ✓ | Skip |
| User management | ✓ | Skip |
| Super-admin | Skip | ✓ |
| All CRUD | ✓ | ✓ |

**Files to Create/Modify:**
- `.github/workflows/test.yml`
- `apis-server/tests/testutil/auth.go`
- `apis-server/tests/auth_local_test.go`
- `apis-server/tests/auth_zitadel_test.go`
- `apis-dashboard/tests/auth/login.test.tsx`

**Test Criteria:**
- [ ] CI runs both modes
- [ ] Mode-specific tests skip appropriately
- [ ] All tests pass before merge
