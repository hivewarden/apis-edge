# AUTH-002: Authorization and Access Control Vulnerabilities

**Audit Date:** 2026-01-31
**Auditor:** Security Audit (Automated)
**Scope:** `/Users/jermodelaruelle/Projects/apis/apis-server/`

---

## Finding 1: Role Stored in JWT Without Re-validation

**Severity:** HIGH
**OWASP Category:** A01:2021 - Broken Access Control
**CWE:** CWE-269 (Improper Privilege Management)

### Location
- **File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/middleware/auth.go`
- **Lines:** 510-527 (LocalAuthMiddleware claims extraction)
- **File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/users.go`
- **Lines:** 82-104 (AdminOnly middleware)

### Vulnerable Code
```go
// auth.go - Role is extracted directly from JWT
userClaims := &Claims{
    // ...
    Role:             localClaims.Role,
    Roles:            roles,
}

// users.go - AdminOnly checks role from claims without database verification
func AdminOnly(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        claims := middleware.GetClaims(r.Context())
        if claims.Role != "admin" {  // Trusts JWT role claim
            respondError(w, "Admin access required", http.StatusForbidden)
            return
        }
        next.ServeHTTP(w, r)
    })
}
```

### Attack Vector
1. Admin demotes a user from admin to member role
2. User's existing JWT still contains `"role": "admin"`
3. User continues to access admin endpoints until token expires (7-30 days)
4. Demoted user can create more users, modify settings, etc.

### Impact
- Privilege escalation persists after role changes
- User deletion/deactivation does not immediately revoke access
- Stale permissions remain active for token lifetime

### Remediation

1. **Re-validate role from database on sensitive operations:**
```go
func AdminOnly(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        claims := middleware.GetClaims(r.Context())

        // Quick check from JWT (fail fast)
        if claims.Role != "admin" {
            respondError(w, "Admin access required", http.StatusForbidden)
            return
        }

        // Verify role from database for sensitive operations
        conn := storage.RequireConn(r.Context())
        user, err := storage.GetUserByID(r.Context(), conn, claims.UserID)
        if err != nil || user.Role != "admin" || !user.IsActive {
            respondError(w, "Admin access required", http.StatusForbidden)
            return
        }

        next.ServeHTTP(w, r)
    })
}
```

2. **Invalidate tokens on role change:**
- Track token generation time in user table (`token_valid_after`)
- Reject tokens issued before this timestamp

### Acceptance Criteria
- [ ] Role changes invalidate existing tokens immediately
- [ ] Admin operations verify role from database
- [ ] Deactivated users cannot use existing tokens

---

## Finding 2: Tenant Isolation Relies Solely on JWT Claims

**Severity:** HIGH
**OWASP Category:** A01:2021 - Broken Access Control
**CWE:** CWE-639 (Authorization Bypass Through User-Controlled Key)

### Location
- **File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/middleware/tenant.go`
- **Lines:** 46-87

### Vulnerable Code
```go
func TenantMiddleware(pool *pgxpool.Pool) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            claims := GetClaims(r.Context())
            // TenantID comes directly from JWT
            tenantID := claims.TenantID

            // Set tenant context for RLS
            _, err = conn.Exec(r.Context(),
                "SELECT set_config('app.tenant_id', $1, false)", tenantID)
            // ...
        })
    }
}
```

### Attack Vector
In local mode, if an attacker can somehow forge or modify a JWT (e.g., if JWT secret is weak or leaked):
1. Modify `tenant_id` claim to target another tenant
2. RLS will use the forged tenant_id
3. Access data from any tenant

### Analysis
The actual risk depends on:
- JWT secret strength (32+ char requirement mitigates)
- Secret storage security
- Algorithm confusion prevention (HS256 only is good)

Current mitigations observed:
- HS256-only algorithm enforcement (line 67, local_jwt.go)
- 32-character minimum secret requirement (line 29, config/auth.go)
- TenantID format validation with regex (line 72, tenant.go)

### Remediation

1. **Add tenant existence verification:**
```go
// Verify tenant exists and user belongs to it
if config.IsLocalAuth() {
    // In local mode, verify user's tenant_id matches claims
    user, err := storage.GetUserByID(ctx, conn, claims.UserID)
    if err != nil || user.TenantID != tenantID {
        respondTenantError(w, "tenant mismatch", http.StatusForbidden)
        return
    }
}
```

2. **Log suspicious tenant access attempts**

### Acceptance Criteria
- [ ] Tenant claims are verified against database
- [ ] Cross-tenant access attempts are logged
- [ ] Alert on tenant mismatch events

---

## Finding 3: Super-Admin Email Check is Case-Sensitive After Normalization

**Severity:** LOW
**OWASP Category:** A01:2021 - Broken Access Control
**CWE:** CWE-178 (Improper Handling of Case Sensitivity)

### Location
- **File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/config/auth.go`
- **Lines:** 208-219

### Code Analysis
```go
func IsSuperAdmin(email string) bool {
    // ...
    email = strings.TrimSpace(strings.ToLower(email))  // Input normalized
    for _, adminEmail := range cfg.superAdminEmails {
        if adminEmail == email {  // Comparison works because superAdminEmails are also lowercased
            return true
        }
    }
    return false
}
```

Review of email normalization at lines 100-105:
```go
for _, email := range emails {
    email = strings.TrimSpace(strings.ToLower(email))  // Stored emails also normalized
    // ...
}
```

### Analysis
This is actually **correctly implemented**. Both the input and stored emails are normalized to lowercase before comparison. No vulnerability exists.

**Status:** FALSE POSITIVE - Code is secure.

---

## Finding 4: Impersonation Session Does Not Track Origin IP

**Severity:** MEDIUM
**OWASP Category:** A09:2021 - Security Logging and Monitoring Failures
**CWE:** CWE-778 (Insufficient Logging)

### Location
- **File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/auth/local_jwt.go`
- **Lines:** 196-235 (CreateImpersonationJWT)

### Vulnerable Code
```go
type ImpersonationParams struct {
    UserID string
    TargetTenantID string
    OriginalTenantID string
    Email string
    Name string
    Role string
    // MISSING: OriginIP, UserAgent for audit trail
}
```

### Attack Vector
1. Super-admin impersonates a tenant
2. Performs malicious actions
3. Impersonation log exists but doesn't track WHERE the impersonation originated
4. Harder to detect compromised admin accounts

### Impact
- Reduced forensic capabilities
- Difficult to detect account compromise
- Compliance gaps for regulated industries

### Remediation

1. **Add origin tracking to impersonation claims:**
```go
type ImpersonationParams struct {
    // ... existing fields ...
    OriginIP    string
    UserAgent   string
}

// In CreateImpersonationJWT
claims := LocalClaims{
    // ... existing claims ...
    OriginIP:  params.OriginIP,  // Add to claim struct
}
```

2. **Log impersonation start with full context:**
```go
log.Info().
    Str("super_admin_id", claims.UserID).
    Str("target_tenant_id", tenantID).
    Str("origin_ip", r.RemoteAddr).
    Str("user_agent", r.UserAgent()).
    Msg("Impersonation session started")
```

### Acceptance Criteria
- [ ] Impersonation JWT includes origin IP
- [ ] All impersonation actions logged with origin context
- [ ] Dashboard shows impersonation history with IP/location

---

## Finding 5: AdminOnly Middleware Returns Different Error for Null vs Non-Admin

**Severity:** LOW
**OWASP Category:** A01:2021 - Broken Access Control
**CWE:** CWE-209 (Generation of Error Message Containing Sensitive Information)

### Location
- **File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/users.go`
- **Lines:** 84-104

### Vulnerable Code
```go
func AdminOnly(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        claims := middleware.GetClaims(r.Context())
        if claims == nil {
            respondError(w, "Authentication required", http.StatusUnauthorized)  // 401
            return
        }

        if claims.Role != "admin" {
            respondError(w, "Admin access required", http.StatusForbidden)  // 403
            return
        }
        // ...
    })
}
```

### Attack Vector
Error message enumeration:
- 401 = No authentication (token missing/invalid)
- 403 = Valid token but wrong role

This reveals whether a token is valid, potentially useful for targeted attacks.

### Analysis
This is a minor information disclosure. The distinction between 401 and 403 is standard HTTP semantics. However, for high-security applications, returning a uniform error may be preferred.

### Remediation (Optional - Low Priority)
```go
// Return uniform error for both cases
if claims == nil || claims.Role != "admin" {
    respondError(w, "Access denied", http.StatusForbidden)
    return
}
```

### Acceptance Criteria
- [ ] Evaluate if uniform error is needed for compliance
- [ ] Document decision in security architecture

---

## Finding 6: No Horizontal Access Control on Resource IDs

**Severity:** MEDIUM
**OWASP Category:** A01:2021 - Broken Access Control
**CWE:** CWE-639 (Authorization Bypass Through User-Controlled Key)

### Location
- **File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/users.go`
- **Lines:** 137-158 (GetUser), 276-397 (UpdateUser), 399-466 (DeleteUser)

### Analysis
User management operations rely on RLS (Row Level Security) for tenant isolation:
```go
func GetUser(w http.ResponseWriter, r *http.Request) {
    conn := storage.RequireConn(r.Context())
    userID := chi.URLParam(r, "id")  // User-controlled

    user, err := storage.GetUserByIDFull(r.Context(), conn, userID)
    // RLS ensures tenant isolation
}
```

The code correctly uses:
1. TenantMiddleware sets `app.tenant_id` in database session
2. RLS policies restrict queries to current tenant
3. User-provided IDs cannot access other tenants' data

### Verification Needed
Ensure RLS policies are correctly configured:
```sql
-- Expected policy on users table
CREATE POLICY users_tenant_isolation ON users
    USING (tenant_id = current_setting('app.tenant_id'));
```

### Status
**REQUIRES VERIFICATION** - Code appears correct if RLS is properly configured. Need to verify database migrations contain correct RLS policies.

### Acceptance Criteria
- [ ] RLS policies verified on all tables
- [ ] Integration tests confirm cross-tenant access fails
- [ ] RLS enabled on all tenant-scoped tables

---

## Finding 7: Setup Endpoint Race Condition

**Severity:** MEDIUM
**OWASP Category:** A01:2021 - Broken Access Control
**CWE:** CWE-362 (Race Condition)

### Location
- **File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/setup.go`
- **Lines:** 73-257 (Setup function)

### Vulnerable Code Pattern
```go
func Setup(pool *pgxpool.Pool, rateLimiter *SetupRateLimiter) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        // Check if setup is required (no users exist)
        userCount, err := storage.CountUsersInTenant(ctx, pool, defaultTenantID)
        // ...
        if userCount > 0 {
            respondError(w, "Setup already completed", http.StatusForbidden)
            return
        }

        // Create first admin user
        // GAP: Another request could have created a user between check and create
    }
}
```

### Attack Vector
1. Attacker sends multiple concurrent requests to `/api/auth/setup`
2. Both requests pass the "no users exist" check
3. Multiple admin users are created (or one fails with duplicate email)
4. Attacker might get admin access if their request wins the race

### Impact
- Potential for attacker to create admin account during initial setup
- Data integrity issues with multiple admins created

### Remediation

1. **Use database-level locking:**
```go
// Use advisory lock during setup
_, err := conn.Exec(ctx, "SELECT pg_advisory_lock(1)")  // Lock ID 1 for setup
defer conn.Exec(ctx, "SELECT pg_advisory_unlock(1)")

// Re-check count after acquiring lock
userCount, err := storage.CountUsersInTenant(ctx, conn, defaultTenantID)
if userCount > 0 {
    respondError(w, "Setup already completed", http.StatusForbidden)
    return
}
```

2. **Use INSERT with conflict handling:**
```go
// Use database constraint to prevent duplicates
// ON CONFLICT DO NOTHING and check affected rows
```

### Acceptance Criteria
- [ ] Setup endpoint uses database locking
- [ ] Concurrent setup requests handled correctly
- [ ] Integration test verifies race condition is prevented

---

## Summary

| Finding | Severity | Status |
|---------|----------|--------|
| F1: Role Not Re-validated | HIGH | Requires token invalidation on role change |
| F2: Tenant Isolation via JWT | HIGH | Add database verification |
| F3: Super-Admin Case Sensitivity | LOW | FALSE POSITIVE - Correctly implemented |
| F4: Impersonation IP Tracking | MEDIUM | Add forensic logging |
| F5: Error Message Enumeration | LOW | Optional improvement |
| F6: Horizontal Access Control | MEDIUM | Requires RLS verification |
| F7: Setup Race Condition | MEDIUM | Add database locking |

**Priority Recommendations:**
1. **HIGH:** Implement token invalidation when user role/status changes
2. **HIGH:** Verify RLS policies are correctly configured and tested
3. **MEDIUM:** Add database locking to setup endpoint
4. **MEDIUM:** Enhance impersonation audit logging

---

## Appendix: Files Reviewed

| File | Purpose | Risk Level |
|------|---------|------------|
| `internal/middleware/auth.go` | JWT validation, claims extraction | High |
| `internal/middleware/tenant.go` | Tenant context, RLS setup | High |
| `internal/middleware/superadmin.go` | Super-admin authorization | Medium |
| `internal/handlers/auth_local.go` | Login/logout handlers | High |
| `internal/handlers/users.go` | User management, AdminOnly | High |
| `internal/auth/local_jwt.go` | JWT creation/validation | High |
| `internal/auth/password.go` | Password hashing | Medium |
| `internal/config/auth.go` | Auth configuration | Medium |
| `cmd/server/main.go` | Route configuration | Medium |
