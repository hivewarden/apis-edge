# APIS Server Security Audit Summary

**Audit Date:** 2026-01-31
**Auditor:** Claude Opus 4.5 Security Audit
**Scope:** `/Users/jermodelaruelle/Projects/apis/apis-server/`

---

## Executive Summary

The APIS server implements a robust multi-tenant architecture with PostgreSQL Row-Level Security (RLS) as the primary data isolation mechanism. The tenant context is established via middleware that extracts tenant information from JWT claims and sets `app.tenant_id` in the database session.

**Overall Security Posture: GOOD with some recommended improvements**

### Key Strengths
1. Comprehensive RLS coverage across 29 tenant-scoped tables
2. Fail-safe RLS policy design (NULL tenant_id = no data access)
3. Defense-in-depth with tenant ID regex validation
4. Proper connection lifecycle management with tenant context
5. Good integration test coverage for tenant isolation

### Areas Requiring Attention
1. One IDOR vulnerability in `GetExportPresetByID` (HIGH)
2. Role stored in JWT without database re-validation (HIGH)
3. Setup endpoint race condition (MEDIUM)
4. Admin functions bypass RLS by design - requires handler-level auth verification

---

## Multi-Tenant Isolation Architecture

### Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      Request Flow                                │
├─────────────────────────────────────────────────────────────────┤
│  1. HTTP Request with Authorization header                      │
│                          ↓                                       │
│  2. AuthMiddleware validates JWT, extracts Claims               │
│     - LocalAuthMiddleware (HS256 JWTs)                          │
│     - ZitadelAuthMiddleware (RS256 JWTs via JWKS)               │
│                          ↓                                       │
│  3. TenantMiddleware                                            │
│     - Acquires pooled DB connection                             │
│     - Validates tenant_id format (regex: ^[a-zA-Z0-9_-]+$)      │
│     - Sets app.tenant_id via set_config()                       │
│     - Looks up/provisions user                                  │
│                          ↓                                       │
│  4. Handler executes queries                                    │
│     - RLS policies automatically filter by tenant_id            │
│     - All queries use the per-request connection                │
│                          ↓                                       │
│  5. Connection released back to pool                            │
└─────────────────────────────────────────────────────────────────┘
```

### Tenant Context Lifecycle

**File:** `/apis-server/internal/middleware/tenant.go`

1. **Connection Acquisition** (line 58-65)
   - Acquires connection from pool
   - Connection is dedicated to request for RLS context persistence

2. **Tenant ID Validation** (line 68-76)
   - Regex pattern: `^[a-zA-Z0-9_-]+$`
   - Rejects invalid characters (defense against injection)

3. **RLS Context Setting** (line 78-86)
   ```go
   _, err = conn.Exec(r.Context(), "SELECT set_config('app.tenant_id', $1, false)", tenantID)
   ```
   - Uses parameterized query (safe)
   - `false` parameter = setting persists for connection lifetime

4. **Connection Release** (line 65)
   - `defer conn.Release()` ensures cleanup on any exit path

### RLS Policy Design Pattern

**File:** `/apis-server/internal/storage/migrations/0002_rls_policies.sql`

```sql
CREATE POLICY tenant_isolation_users ON users
    USING (tenant_id = current_setting('app.tenant_id', true));
```

**Why this is fail-safe:**
- `current_setting('app.tenant_id', true)` returns NULL if not set
- `tenant_id = NULL` evaluates to NULL (not TRUE) in PostgreSQL
- NULL in WHERE/USING clauses means no rows match
- **Result:** No tenant context = no data access (fail-closed)

### Tables with RLS Enabled (29 tables)

| Migration | Table | Policy Name |
|-----------|-------|-------------|
| 0002 | users | tenant_isolation_users |
| 0004 | sites | tenant_isolation |
| 0005 | units | tenant_isolation |
| 0007 | detections | tenant_isolation_detections |
| 0008 | clips | tenant_isolation_clips |
| 0009 | hives | hives_tenant_isolation |
| 0009 | queen_history | queen_history_via_hive |
| 0009 | box_changes | box_changes_via_hive |
| 0010a | inspections | inspections_tenant_isolation |
| 0010b | inspection_frames | inspection_frames_tenant_isolation |
| 0011 | treatments | treatments_tenant_isolation |
| 0012 | feedings | feedings_tenant_isolation |
| 0013 | harvests | harvests_tenant_isolation |
| 0014 | equipment_logs | equipment_logs_tenant_isolation |
| 0015 | insights | tenant_isolation |
| 0016 | export_presets | tenant_isolation_export_presets |
| 0017 | milestone_photos | milestone_photos_tenant_isolation |
| 0018 | hive_losses | hive_losses_tenant_isolation |
| 0019 | season_recaps | season_recaps_tenant_isolation |
| 0020 | overwintering_records | overwintering_tenant_isolation |
| 0021 | custom_labels | custom_labels_tenant_isolation |
| 0022 | reminders | reminders_tenant_isolation |
| 0024 | audit_log | audit_log_tenant_isolation |
| 0025 | invite_tokens | invite_tokens_tenant_isolation |
| 0030 | task_templates | task_templates_tenant_isolation |
| 0031 | hive_tasks | hive_tasks_tenant_isolation |
| 0032 | task_suggestions | task_suggestions_tenant_isolation |
| 0034 | hive_activity_log | activity_log_tenant_isolation |

### Tables Without RLS (By Design)

| Table | Reason | Access Control |
|-------|--------|----------------|
| tenants | Needed during provisioning before RLS context | Application: JWT org_id match |
| tenant_limits | Super-admin only | Application: admin role check |
| beebrain_config | System defaults + tenant overrides | Application: role-based |
| tenant_beebrain_access | Super-admin only | Application: admin role check |
| impersonation_log | Super-admin audit trail | Application: admin role check |

---

## Finding Reference

### Critical/High Severity Findings

| ID | Title | Severity | Status | File Reference |
|----|-------|----------|--------|----------------|
| DB-002-F1 | Missing Tenant Validation in GetExportPresetByID | HIGH | REQUIRES REMEDIATION | [DB-002-rls-tenant.md](DB-002-rls-tenant.md) |
| AUTH-002-F1 | Role Stored in JWT Without Re-validation | HIGH | REQUIRES REMEDIATION | [AUTH-002-authorization.md](AUTH-002-authorization.md) |
| AUTH-002-F2 | Tenant Isolation Relies Solely on JWT Claims | HIGH | REQUIRES VERIFICATION | [AUTH-002-authorization.md](AUTH-002-authorization.md) |

### Medium Severity Findings

| ID | Title | Severity | Status | File Reference |
|----|-------|----------|--------|----------------|
| DB-002-F6 | Admin Functions Bypass RLS | MEDIUM | ACCEPTABLE RISK | [DB-002-rls-tenant.md](DB-002-rls-tenant.md) |
| AUTH-002-F4 | Impersonation Session Does Not Track Origin IP | MEDIUM | RECOMMENDED | [AUTH-002-authorization.md](AUTH-002-authorization.md) |
| AUTH-002-F6 | Horizontal Access Control Relies on RLS | MEDIUM | VERIFIED OK | [AUTH-002-authorization.md](AUTH-002-authorization.md) |
| AUTH-002-F7 | Setup Endpoint Race Condition | MEDIUM | REQUIRES REMEDIATION | [AUTH-002-authorization.md](AUTH-002-authorization.md) |

### Low/Informational Findings

| ID | Title | Severity | Status | File Reference |
|----|-------|----------|--------|----------------|
| DB-002-F2 | Tables Without RLS | INFO | ACCEPTED (By Design) | [DB-002-rls-tenant.md](DB-002-rls-tenant.md) |
| DB-002-F3 | Tenant Context Validation | INFO | MITIGATED (Good) | [DB-002-rls-tenant.md](DB-002-rls-tenant.md) |
| DB-002-F4 | RLS Policy Enforcement Pattern | INFO | MITIGATED (Good) | [DB-002-rls-tenant.md](DB-002-rls-tenant.md) |
| DB-002-F5 | RLS Set Before User Lookup | INFO | MITIGATED (Good) | [DB-002-rls-tenant.md](DB-002-rls-tenant.md) |
| DB-002-F7 | GetUnitByAPIKey No Tenant Context | INFO | ACCEPTABLE (By Design) | [DB-002-rls-tenant.md](DB-002-rls-tenant.md) |
| AUTH-002-F5 | AdminOnly Error Message Enumeration | LOW | OPTIONAL | [AUTH-002-authorization.md](AUTH-002-authorization.md) |

---

## Request Path Analysis for Tenant Context

### Path 1: Dashboard Authentication (JWT Bearer)

```
Request → AuthMiddleware → TenantMiddleware → Handler
             ↓                    ↓
        Validates JWT     Sets app.tenant_id
        Extracts claims   in DB session
```

**Files involved:**
- `/internal/middleware/auth.go` - JWT validation
- `/internal/middleware/tenant.go` - Tenant context setup

**Tenant context integrity:** STRONG
- Tenant ID from validated JWT claims
- RLS enforced on all queries

### Path 2: Unit Authentication (X-API-Key)

```
Request → UnitAuth → Handler
              ↓
         Validates API key
         Sets app.tenant_id from unit.tenant_id
```

**File:** `/internal/middleware/unitauth.go`

**Tenant context integrity:** STRONG
- API key validated via bcrypt comparison
- tenant_id derived from database unit record (trusted)

### Path 3: Admin Functions (Bypass RLS)

```
Request → AuthMiddleware → SuperAdminMiddleware → Handler → AdminStorage
              ↓                    ↓                              ↓
        Validates JWT      Checks admin role        No app.tenant_id set
```

**Files involved:**
- `/internal/handlers/admin_tenants.go`
- `/internal/storage/admin.go`

**Tenant context integrity:** ACCEPTABLE (BY DESIGN)
- Super-admin must access all tenants
- Authorization enforced at middleware layer
- **Recommendation:** Add defensive role check in storage functions

### Path 4: Setup Wizard (No Auth)

```
Request → SetupHandler
              ↓
         Creates first admin
         No tenant context (default tenant)
```

**File:** `/internal/handlers/setup.go`

**Tenant context integrity:** NEEDS ATTENTION
- Race condition vulnerability (AUTH-002-F7)
- Should use database locking

---

## Cross-Tenant Data Access Vectors

### Vector 1: IDOR via Resource ID Enumeration

**Status:** MOSTLY MITIGATED

RLS policies ensure that even if an attacker guesses a valid resource ID, queries filter by `app.tenant_id`. However:

**Exception Found:** `GetExportPresetByID` (DB-002-F1)
```go
// VULNERABLE - No tenant filter in WHERE clause
SELECT ... FROM export_presets WHERE id = $1
```

**Contrast with secure pattern:**
```go
// SECURE - Explicit tenant filter
DELETE FROM export_presets WHERE id = $1 AND tenant_id = $2
```

### Vector 2: JWT Manipulation

**Status:** MITIGATED

- HS256 algorithm enforcement prevents algorithm confusion attacks
- 32-character minimum secret requirement
- Tenant ID format validation (regex)

**Remaining Risk:** If JWT secret is compromised, attacker can forge tokens with arbitrary tenant_id.

**Mitigation:** Verify user's tenant_id matches database record on sensitive operations.

### Vector 3: Admin Function Abuse

**Status:** REQUIRES VERIFICATION

Admin functions intentionally bypass RLS:
- `AdminListAllTenants`
- `AdminGetTenantByID`
- `AdminCreateTenant`
- `AdminUpdateTenant`

**Risk:** If handler-level authorization is missing, any authenticated user could access admin functions.

**Verification needed:** Confirm all admin handlers check super-admin role.

### Vector 4: File Storage Path Traversal

**Status:** MITIGATED

**File:** `/internal/handlers/clips.go:67-80`

```go
func ValidateFilePath(filePath string, basePath string) bool {
    cleanPath := filepath.Clean(filePath)
    cleanBase := filepath.Clean(basePath)
    return strings.HasPrefix(cleanPath, cleanBase+string(filepath.Separator))
}
```

File paths are validated against base directory. Tenant isolation in file storage is enforced by:
1. Path generation includes tenant_id: `clips/{tenant_id}/{site_id}/{date}/`
2. Database lookup uses RLS to filter clip records

---

## Async Operations and Background Tasks

### Weather Cache

**File:** `/internal/services/weather.go`

Weather data is cached globally, not per-tenant. This is acceptable because:
- Weather is public data
- Cached by lat/lng coordinates
- No tenant-specific data exposed

### BeeBrain Insights

**File:** `/internal/services/beebrain.go`

Insights are generated per-tenant with proper tenant context:
- Queries use RLS-protected connection
- Results stored with tenant_id

---

## Session and Cache Isolation

### Database Connection Pool

**File:** `/internal/storage/postgres.go`

- Connections are acquired per-request
- Tenant context set via `set_config()` per connection
- No cross-request state leakage

### No Application-Level Caching

The server does not implement application-level caching for tenant data. All data fetches go through RLS-protected queries.

---

## Testing Coverage

### Integration Tests

**File:** `/tests/integration/tenant_isolation_test.go`

Tests verify:
- User A cannot see User B's data
- RLS returns empty results when no tenant context

### Unit Tests

**File:** `/internal/services/provisioning_test.go`

Tests verify:
- `TestRLSIsolation` - Cross-tenant access blocked
- `TestEnsureUserProvisioned` - Tenant/user provisioning

### Recommended Additional Tests

1. Test IDOR prevention for each resource type
2. Test admin function authorization
3. Test setup endpoint race condition
4. Test impersonation audit logging

---

## Remediation Priority

### Immediate (HIGH)

1. **DB-002-F1:** Add tenant_id parameter to `GetExportPresetByID`
   - File: `/internal/storage/export_presets.go:91-107`
   - Update handler to pass tenant_id

2. **AUTH-002-F1:** Implement token invalidation on role change
   - Add `token_valid_after` column to users table
   - Reject tokens issued before role change

### Short-term (MEDIUM)

3. **AUTH-002-F7:** Add database locking to setup endpoint
   - Use `pg_advisory_lock` or unique constraint

4. **AUTH-002-F4:** Enhance impersonation audit logging
   - Add origin IP to impersonation JWT claims
   - Log full context on impersonation start

### Verification Required

5. Confirm all admin handlers check super-admin role
6. Add integration tests for admin authorization
7. Verify RLS policies match documentation

---

## Appendix: Files Reviewed

| Category | Files |
|----------|-------|
| Middleware | `auth.go`, `tenant.go`, `unitauth.go`, `superadmin.go` |
| Storage | `postgres.go`, `sites.go`, `hives.go`, `users.go`, `clips.go`, `detections.go`, `export_presets.go`, `admin.go`, `tenants.go` |
| Handlers | `sites.go`, `hives.go`, `clips.go`, `detections.go`, `stream.go`, `admin_tenants.go`, `setup.go`, `auth_local.go` |
| Migrations | All 35 migration files in `/internal/storage/migrations/` |
| Tests | `tenant_isolation_test.go`, `provisioning_test.go` |

---

## Revision History

| Date | Change |
|------|--------|
| 2026-01-31 | Initial multi-tenant isolation audit |
