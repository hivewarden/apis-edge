# DB-002: Row-Level Security and Tenant Isolation Analysis

**Audit Date:** 2026-01-31
**Auditor:** Claude Opus 4.5 Security Audit
**Scope:** `/apis-server/internal/storage/`, `/apis-server/internal/middleware/tenant.go`

---

## Executive Summary

The APIS server implements PostgreSQL Row-Level Security (RLS) for multi-tenant data isolation. Most tenant-scoped tables have RLS policies enforced. However, several tables intentionally bypass RLS for system/admin functions, which is appropriate but requires careful application-level access control.

**Overall Tenant Isolation Risk: LOW-MEDIUM**

Key findings:
- 29 tables have RLS enabled
- 5 tables intentionally have no RLS (documented design decisions)
- 1 potential IDOR vulnerability in `GetExportPresetByID`
- Tenant context validation is robust with regex pattern matching

---

## Findings

### Finding 1: Missing Tenant Validation in GetExportPresetByID (HIGH)

**Severity:** HIGH
**OWASP Category:** A01:2021 - Broken Access Control (IDOR)
**Status:** REQUIRES REMEDIATION

**Location:**
- `/apis-server/internal/storage/export_presets.go:91-107`

**Vulnerable Code:**
```go
// GetExportPresetByID retrieves an export preset by its ID.
func GetExportPresetByID(ctx context.Context, conn *pgxpool.Conn, id string) (*ExportPreset, error) {
    var preset ExportPreset
    err := conn.QueryRow(ctx,
        `SELECT id, tenant_id, name, config, created_at
         FROM export_presets
         WHERE id = $1`,  // No tenant_id filter!
        id,
    ).Scan(&preset.ID, &preset.TenantID, &preset.Name, &preset.Config, &preset.CreatedAt)
    // ...
}
```

**Attack Vector:**
1. Attacker obtains or guesses a valid export preset UUID from another tenant
2. Attacker calls API endpoint using that preset ID
3. Query returns the preset because RLS policy uses `app.tenant_id` which IS set, but the query doesn't filter by it
4. Attacker gains access to another tenant's export configuration

**Note:** The export_presets table DOES have RLS enabled (migration 0016), but this assumes `app.tenant_id` is always set. If the middleware ever fails to set it, cross-tenant access occurs.

**Contrast with Correct Pattern (DeleteExportPreset):**
```go
// DeleteExportPreset correctly includes tenant_id
func DeleteExportPreset(ctx context.Context, conn *pgxpool.Conn, tenantID, id string) error {
    result, err := conn.Exec(ctx, `DELETE FROM export_presets WHERE id = $1 AND tenant_id = $2`, id, tenantID)
    // ...
}
```

**Remediation:**
```go
// Add explicit tenant filter for defense-in-depth
func GetExportPresetByID(ctx context.Context, conn *pgxpool.Conn, tenantID, id string) (*ExportPreset, error) {
    var preset ExportPreset
    err := conn.QueryRow(ctx,
        `SELECT id, tenant_id, name, config, created_at
         FROM export_presets
         WHERE id = $1 AND tenant_id = $2`,
        id, tenantID,
    ).Scan(&preset.ID, &preset.TenantID, &preset.Name, &preset.Config, &preset.CreatedAt)
    // ...
}
```

**Acceptance Criteria:**
- [ ] GetExportPresetByID includes tenant_id parameter
- [ ] All callers updated to pass tenant_id
- [ ] Unit test verifies cross-tenant access fails

---

### Finding 2: Tables Without RLS (By Design) - INFORMATIONAL

**Severity:** INFO
**OWASP Category:** A01:2021 - Broken Access Control
**Status:** ACCEPTED RISK (Documented)

**Tables Without RLS:**
| Table | Reason | Access Control |
|-------|--------|----------------|
| `tenants` | Needed for provisioning before RLS context set | Application-level: JWT org_id match |
| `tenant_limits` | Super-admin only | Application-level: admin role check |
| `beebrain_config` | System defaults + tenant overrides | Application-level: role-based |
| `tenant_beebrain_access` | Super-admin only | Application-level: admin role check |
| `impersonation_log` | Super-admin audit trail | Application-level: admin role check |

**Verification:**
Each table's migration file includes a comment explaining why RLS is not used:
```sql
-- NOTE: No RLS - this is a super-admin/system only table.
-- Access control enforced at application level.
```

**Recommendations:**
1. Document these exceptions in a security architecture document
2. Add middleware/handler checks to verify super-admin role before accessing these tables
3. Consider adding RLS policies that allow only NULL tenant_id rows for system tables

---

### Finding 3: Tenant Context Validation (GOOD)

**Severity:** INFO
**OWASP Category:** A03:2021 - Injection
**Status:** MITIGATED

**Location:**
- `/apis-server/internal/middleware/tenant.go:19-21, 70-76`

**Secure Code:**
```go
// tenantIDPattern validates tenant IDs to prevent SQL injection.
// Only allows alphanumeric characters, hyphens, and underscores.
var tenantIDPattern = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)

// Validate tenant ID format for defense in depth.
if !tenantIDPattern.MatchString(tenantID) {
    log.Error().Str("tenant_id", tenantID).Msg("Invalid tenant ID format")
    respondTenantError(w, "invalid tenant id", http.StatusBadRequest)
    return
}
```

**Why This Is Good:**
1. Input validation before setting database session variable
2. Regex restricts to safe character set
3. Rejection is logged for security monitoring
4. Defense-in-depth: even though `set_config` uses parameterized query, validation adds safety

---

### Finding 4: RLS Policy Enforcement Pattern (GOOD)

**Severity:** INFO
**OWASP Category:** A01:2021 - Broken Access Control
**Status:** MITIGATED

**Location:**
- `/apis-server/internal/storage/migrations/0002_rls_policies.sql:17-18`

**Secure Pattern:**
```sql
CREATE POLICY tenant_isolation_users ON users
    USING (tenant_id = current_setting('app.tenant_id', true));
```

**Why This Is Good:**
1. `current_setting('app.tenant_id', true)` returns NULL if not set
2. `tenant_id = NULL` evaluates to NULL (not TRUE) in PostgreSQL
3. NULL in WHERE clause means no rows returned (fail-closed)
4. `FORCE ROW LEVEL SECURITY` ensures policy applies even to table owner

**Tables with Correct RLS Pattern:**
All 29 tables with RLS use the same `current_setting('app.tenant_id', true)` pattern.

---

### Finding 5: RLS Set Before User Lookup (GOOD)

**Severity:** INFO
**OWASP Category:** A01:2021 - Broken Access Control
**Status:** MITIGATED

**Location:**
- `/apis-server/internal/middleware/tenant.go:78-86`

**Secure Code:**
```go
// Set tenant context in database session for RLS enforcement.
// Using set_config with true for local scope (transaction-only).
// This must happen BEFORE user lookup because RLS is enabled on users table.
_, err = conn.Exec(r.Context(), "SELECT set_config('app.tenant_id', $1, false)", tenantID)
```

**Why This Is Good:**
1. Explicit comment documents the ordering requirement
2. RLS context set BEFORE any tenant-scoped queries
3. Uses parameterized query for set_config
4. `false` parameter means setting persists for connection lifetime (correct for pooled connections with request affinity)

---

### Finding 6: Admin Functions Bypass RLS (ACCEPTABLE)

**Severity:** MEDIUM
**OWASP Category:** A01:2021 - Broken Access Control
**Status:** ACCEPTABLE RISK

**Location:**
- `/apis-server/internal/storage/admin.go:33-104`

**Code Pattern:**
```go
// AdminListAllTenants returns all tenants with usage statistics.
// This function bypasses RLS (Row-Level Security) by not setting app.tenant_id,
// allowing super-admins to see all tenants in the system.
func AdminListAllTenants(ctx context.Context, pool *pgxpool.Pool) ([]*TenantSummary, error) {
    conn, err := pool.Acquire(ctx)
    // Note: We intentionally DO NOT set app.tenant_id to bypass RLS
    // ...
}
```

**Concern:**
If these functions are called without proper authorization checks at the handler level, any user could access all tenants' data.

**Verification Required:**
- [ ] Verify handlers calling Admin* functions check for super-admin role
- [ ] Add unit tests verifying non-admins cannot call admin endpoints

**Recommendation:**
Add defensive checks at the storage layer:
```go
func AdminListAllTenants(ctx context.Context, pool *pgxpool.Pool, callerRole string) ([]*TenantSummary, error) {
    if callerRole != "super_admin" {
        return nil, ErrUnauthorized
    }
    // ...
}
```

---

### Finding 7: GetUnitByAPIKey - No Tenant Context (BY DESIGN)

**Severity:** INFO
**OWASP Category:** A01:2021 - Broken Access Control
**Status:** ACCEPTABLE (BY DESIGN)

**Location:**
- `/apis-server/internal/storage/units.go:202-244`

**Code:**
```go
// GetUnitByAPIKey finds a unit by its raw API key.
// Uses indexed prefix lookup to filter candidates, then bcrypt verification.
func GetUnitByAPIKey(ctx context.Context, conn *pgxpool.Conn, rawKey string) (*Unit, error) {
    // Query only units matching the prefix (indexed lookup)
    rows, err := conn.Query(ctx,
        `SELECT ... FROM units WHERE api_key_prefix = $1`,
        keyPrefix)
```

**Why This Is Acceptable:**
1. This is used for device authentication before tenant context is established
2. The API key IS the authentication credential
3. bcrypt verification ensures only the correct key matches
4. After authentication, the returned unit's tenant_id is used to set RLS context

**Recommendation:**
Add comment explaining the authentication flow:
```go
// Note: This function is called during device authentication before RLS context
// is established. The API key itself serves as the authentication credential.
// After successful auth, the returned unit's tenant_id is used to set RLS.
```

---

## Tables with RLS Enabled (Complete List)

| Migration | Table | RLS Policy |
|-----------|-------|------------|
| 0002 | users | tenant_isolation_users |
| 0004 | sites | tenant_isolation_sites |
| 0005 | units | tenant_isolation_units |
| 0007 | detections | tenant_isolation_detections |
| 0008 | clips | tenant_isolation_clips |
| 0009 | hives | tenant_isolation_hives |
| 0009 | queen_history | tenant_isolation_queen_history |
| 0009 | box_changes | tenant_isolation_box_changes |
| 0010a | inspections | tenant_isolation_inspections |
| 0010b | inspection_frames | tenant_isolation_inspection_frames |
| 0011 | treatments | tenant_isolation_treatments |
| 0012 | feedings | tenant_isolation_feedings |
| 0013 | harvests | tenant_isolation_harvests |
| 0013 | harvest_hives | tenant_isolation_harvest_hives |
| 0014 | equipment_logs | tenant_isolation_equipment_logs |
| 0015 | insights | tenant_isolation_insights |
| 0016 | export_presets | tenant_isolation_export_presets |
| 0017 | milestone_photos | tenant_isolation_milestone_photos |
| 0018 | hive_losses | tenant_isolation_hive_losses |
| 0019 | season_recaps | tenant_isolation_season_recaps |
| 0020 | overwintering_records | tenant_isolation_overwintering |
| 0021 | custom_labels | tenant_isolation_custom_labels |
| 0022 | reminders | tenant_isolation_reminders |
| 0024 | audit_log | tenant_isolation_audit_log |
| 0025 | invite_tokens | tenant_isolation_invite_tokens |
| 0030 | task_templates | tenant_isolation_task_templates |
| 0031 | hive_tasks | tenant_isolation_hive_tasks |
| 0032 | task_suggestions | tenant_isolation_task_suggestions |
| 0034 | hive_activity_log | tenant_isolation_activity_log |

---

## Acceptance Criteria for Full Remediation

### Critical (Finding 1)
- [ ] `GetExportPresetByID` updated to accept and filter by `tenantID`
- [ ] Handler updated to pass tenant ID from context
- [ ] Unit test verifies IDOR prevention

### Recommended (Finding 6)
- [ ] Verify all Admin* function handlers check super-admin role
- [ ] Add integration tests for admin authorization

---

### Finding 8: Multiple Functions Rely Solely on RLS Without Explicit Tenant Filter (INFO)

**Severity:** INFO (RLS provides protection)
**OWASP Category:** A01:2021 - Broken Access Control (Defense in Depth)
**Status:** ACCEPTABLE (RLS Mitigates)

**Location:**
Multiple storage functions query by ID without explicit tenant_id WHERE clause:

| Function | File | Line | RLS Protected |
|----------|------|------|---------------|
| `GetDetection` | detections.go | 62-81 | YES |
| `GetSiteByID` | sites.go | 99-118 | YES |
| `GetHiveByID` | hives.go | 231-248 | YES |
| `GetClip` | clips.go | varies | YES |
| `GetExportPresetByID` | export_presets.go | 91-107 | YES |

**Analysis:**
All these tables have RLS policies that filter by `app.tenant_id`. As long as RLS is properly set (which TenantMiddleware ensures), cross-tenant access is prevented.

However, `GetExportPresetByID` stands out because:
1. The DELETE function for the same table uses explicit tenant_id
2. Inconsistent patterns create maintenance risk

**Recommendation:**
For defense-in-depth, consider adding explicit tenant_id parameters to all GetByID functions, especially those that:
- Are used in handlers processing user-provided IDs
- Have corresponding write operations with explicit tenant checks

This is a **LOW priority** enhancement since RLS already provides protection.

---

### Finding 9: Audit Complete - Tables and RLS Policy Verification

**Severity:** INFO
**Status:** VERIFIED

**Verification Method:**
1. Reviewed all 35 migration files in `/internal/storage/migrations/`
2. Cross-referenced with storage layer functions
3. Confirmed RLS policy patterns

**Results:**
- All tenant-scoped tables have RLS enabled
- All RLS policies use the fail-safe `current_setting('app.tenant_id', true)` pattern
- Child tables (queen_history, box_changes) use join-based policies for proper isolation
- Tables intentionally without RLS are documented with justification

**Verified RLS Configuration:**
```sql
-- All tables use this pattern (or equivalent join-based for child tables):
ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;
ALTER TABLE {table_name} FORCE ROW LEVEL SECURITY;  -- Some tables have this for extra safety
CREATE POLICY tenant_isolation ON {table_name}
    USING (tenant_id = current_setting('app.tenant_id', true));
```

---

## Appendix: Search Commands Used

```bash
# Find tables with RLS enabled
grep -rn "ENABLE ROW LEVEL SECURITY" apis-server/internal/storage/migrations/

# Find tables without RLS
grep -rn "CREATE TABLE" apis-server/internal/storage/migrations/ | grep -v "tenant_id"

# Find functions not filtering by tenant_id
grep -rn "WHERE id = \$1" apis-server/internal/storage/*.go
```

---

## Appendix: Comprehensive Multi-Tenant Architecture Review

### Tenant ID Sources

| Authentication Mode | Tenant ID Source | Validation |
|---------------------|------------------|------------|
| Local (HS256 JWT) | `claims.TenantID` from local JWT | Regex pattern |
| SaaS (Zitadel) | `claims.OrgID` from Zitadel token | JWKS signature + regex |
| Unit API Key | `unit.TenantID` from database lookup | bcrypt key verification |

### Connection Lifecycle

```go
// TenantMiddleware (tenant.go:46-147)
1. conn, err := pool.Acquire(r.Context())  // Get dedicated connection
2. defer conn.Release()                     // Ensure release on any exit
3. set_config('app.tenant_id', $1, false)   // Set RLS context
4. ctx = storage.WithConn(r.Context(), conn) // Store in context for handlers
5. next.ServeHTTP(w, r.WithContext(ctx))   // Handler uses this connection
```

### Cross-Request Isolation Verification

The `false` parameter to `set_config` means the setting persists for the connection's lifetime, not just the transaction. This is correct because:
1. Each request gets a dedicated connection via `pool.Acquire()`
2. The connection is released at the end of the request via `defer`
3. No connection reuse occurs within a request
4. Pool manages connection cleanup between requests
