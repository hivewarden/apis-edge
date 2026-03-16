# Code Review: Story 1-5 Tenant Context & Database Setup

**Review Date:** 2026-01-25
**Reviewer:** Claude Opus 4.5 (code-review workflow)
**Story File:** `_bmad-output/implementation-artifacts/1-5-tenant-context-database-setup.md`

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Database Schema Exists | IMPLEMENTED | `0001_tenants_users.sql` creates tenants (id, name, plan, settings, created_at) and users (id, tenant_id, zitadel_user_id, email, name, created_at) tables |
| AC2 | Auto-User/Tenant Creation on First Login | IMPLEMENTED | `services/provisioning.go:EnsureUserProvisioned()` creates tenant and user on first login |
| AC3 | Tenant Context Set Per Request | IMPLEMENTED | `middleware/tenant.go:48` executes `SET LOCAL app.tenant_id` before handlers |
| AC4 | RLS Fail-Safe Behavior | IMPLEMENTED | `0002_rls_policies.sql` uses `current_setting('app.tenant_id', true)` - second param enables fail-safe NULL return |
| AC5 | Tenant Isolation Security | IMPLEMENTED | JWT org_id is used (line 48 tenant.go), RLS enforced at database level |

---

## Issues Found

### I1: Race Condition in GetOrCreateTenant

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/storage/tenants.go`
**Line:** 63-84
**Severity:** MEDIUM
**Category:** Concurrency

**Description:**
The `GetOrCreateTenant` function has a TOCTOU (time-of-check-to-time-of-use) race condition. Between checking if the tenant exists and creating it, another concurrent request could create the same tenant, causing a unique constraint violation.

**Current Code:**
```go
func GetOrCreateTenant(ctx context.Context, conn *pgxpool.Conn, id, name string) (*Tenant, error) {
    tenant, err := GetTenantByID(ctx, conn, id)
    if err == nil {
        return tenant, nil
    }
    // Race window here - another request could create tenant between check and create
    return CreateTenant(ctx, conn, &Tenant{ID: id, Name: name, Plan: "free"})
}
```

**Recommendation:**
Use PostgreSQL's `INSERT ... ON CONFLICT DO UPDATE` (upsert) pattern or wrap in a transaction with `FOR UPDATE` lock.

---

### I2: Missing Transaction for User Provisioning

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/services/provisioning.go`
**Line:** 71-87
**Severity:** MEDIUM
**Category:** Data Integrity

**Description:**
The `EnsureUserProvisioned` function creates a tenant and then a user in separate operations without a transaction. If user creation fails after tenant creation, the database will have an orphan tenant with no users.

**Current Code:**
```go
tenant, err := storage.GetOrCreateTenant(ctx, conn, claims.OrgID, claims.Name)
if err != nil {
    return nil, fmt.Errorf("ensure tenant: %w", err)
}
user, err = storage.CreateUser(ctx, conn, &storage.User{...})
// If this fails, tenant was already created
```

**Recommendation:**
Wrap tenant and user creation in a database transaction to ensure atomicity.

---

### I3: Global DB Variable Anti-Pattern

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/storage/postgres.go`
**Line:** 18
**Severity:** LOW
**Category:** Code Quality

**Description:**
Using a global `var DB *pgxpool.Pool` is an anti-pattern that makes testing harder and introduces hidden dependencies. The codebase does mitigate this somewhat by passing connections via context, but the global is still used in migrations and some test code.

**Current Code:**
```go
var DB *pgxpool.Pool
```

**Recommendation:**
Consider refactoring to pass the pool explicitly through a constructor/dependency injection pattern. This would improve testability.

---

### I4: No Index on Email Column

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/storage/migrations/0001_tenants_users.sql`
**Line:** 28-29
**Severity:** LOW
**Category:** Performance

**Description:**
The `users` table has indexes on `tenant_id` and `zitadel_user_id`, but not on `email`. While email lookups aren't currently used, the field is marked NOT NULL suggesting it's important, and future features may need email-based queries.

**Current Code:**
```sql
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_zitadel ON users(zitadel_user_id);
-- No email index
```

**Recommendation:**
Add `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);` if email lookups are anticipated.

---

### I5: Missing Error Type for Duplicate User

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/storage/users.go`
**Line:** 67-80
**Severity:** MEDIUM
**Category:** Error Handling

**Description:**
The `CreateUser` function doesn't distinguish between a duplicate key error (user already exists with same zitadel_user_id) and other database errors. This could lead to confusing error messages to users.

**Current Code:**
```go
func CreateUser(ctx context.Context, conn *pgxpool.Conn, u *User) (*User, error) {
    // ...
    if err != nil {
        return nil, fmt.Errorf("insert user: %w", err)
    }
}
```

**Recommendation:**
Check for PostgreSQL error code `23505` (unique_violation) and return a specific `ErrDuplicateUser` error.

---

### I6: Tenant Name Truncation Without Validation

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/storage/tenants.go`
**Line:** 76-77
**Severity:** LOW
**Category:** Input Validation

**Description:**
When no name is provided, the code uses `"Tenant " + id[:8]` which assumes the ID is at least 8 characters. If a shorter org_id is ever provided (edge case), this would panic.

**Current Code:**
```go
if name == "" {
    name = "Tenant " + id[:8]
}
```

**Recommendation:**
Add a bounds check: `name = "Tenant " + id[:min(8, len(id))]` or validate org_id minimum length.

---

### I7: Integration Test Cleanup Not Isolated

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/tests/integration/tenant_isolation_test.go`
**Line:** 112-148
**Severity:** LOW
**Category:** Test Quality

**Description:**
The test provisions users but doesn't clean them up, and the test subtests share state. The provisioning calls in "users cannot access each other's data" may be using cached users from previous test runs.

**Current Code:**
```go
t.Run("users cannot access each other's data", func(t *testing.T) {
    // ...
    userA, err := services.EnsureUserProvisioned(ctx, conn, provA)
    // No cleanup
```

**Recommendation:**
Add `t.Cleanup()` to delete test users after the test completes, similar to what's done in `provisioning_test.go`.

---

### I8: SET LOCAL Scope Not Documented for Developers

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/middleware/tenant.go`
**Line:** 44-48
**Severity:** LOW
**Category:** Documentation

**Description:**
The comment mentions SET LOCAL scopes to the connection's session, but this is incorrect. `SET LOCAL` scopes to the current *transaction*, not session. Since there's no explicit transaction started, the setting persists for the connection session duration (until connection is returned to pool).

**Current Code:**
```go
// Using SET LOCAL so it only applies to this connection's session.
_, err = conn.Exec(r.Context(), "SET LOCAL app.tenant_id = $1", claims.OrgID)
```

**Recommendation:**
Update comment to clarify: "SET LOCAL scopes to the current transaction. Since we're not in an explicit transaction, this effectively lasts until the connection is released back to the pool. The connection is released after each request via defer."

---

### I9: Missing Metrics/Observability for Provisioning

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/services/provisioning.go`
**Line:** 37-96
**Severity:** LOW
**Category:** Observability

**Description:**
The provisioning service only logs when a new user is provisioned. There's no tracking of:
- Total provisioning attempts
- Provisioning failures
- Time taken for provisioning (first login latency)

This makes it hard to monitor production behavior.

**Recommendation:**
Add Prometheus metrics for `apis_user_provisioned_total`, `apis_provisioning_failures_total`, and `apis_provisioning_duration_seconds` histogram.

---

### I10: Connection Leak Risk on Panic

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/middleware/tenant.go`
**Line:** 41-42
**Severity:** LOW
**Category:** Resource Management

**Description:**
If a panic occurs after connection acquisition but before the handler completes, the `defer conn.Release()` should still execute. However, the recoverer middleware in main.go runs before tenant middleware, so panics are caught at a higher level. This is actually fine, but worth verifying the middleware order is correct.

**Current Code:**
```go
conn, err := pool.Acquire(r.Context())
// ...
defer conn.Release()
```

**Verification Needed:**
Confirm that `middleware.Recoverer` is applied globally (it is, in main.go line 68) and that connection release still happens.

---

## Verdict

**Status:** PASS

**Summary:**
The implementation correctly satisfies all 5 Acceptance Criteria. The tenant context and database setup is properly implemented with:
- Correct schema with tenants and users tables
- Auto-provisioning on first login
- RLS policies with fail-safe behavior
- Tenant context set via middleware before handlers

**Issues Breakdown:**
- MEDIUM: 3 (I1, I2, I5)
- LOW: 7 (I3, I4, I6, I7, I8, I9, I10)

The MEDIUM issues (race condition, missing transaction, error type handling) are valid concerns but unlikely to cause immediate problems in a single-user-per-org scenario typical at launch. They should be addressed before scaling to high-concurrency scenarios.

This story has already been reviewed once (2026-01-22) with 9 issues fixed. The current 10 issues are secondary concerns or refinements that don't block the story from being marked complete.

**Recommendation:** Keep status as `done`. Log I1, I2, and I5 as technical debt for future sprint.

---

## Change Log

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-25 | Code Review (Claude Opus 4.5) | Second review pass - found 10 additional refinement issues, verdict PASS |
