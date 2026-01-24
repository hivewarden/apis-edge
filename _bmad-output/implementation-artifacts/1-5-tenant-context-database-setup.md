# Story 1.5: Tenant Context & Database Setup

Status: done

## Story

As a **system**,
I want all data isolated by tenant,
so that each user's data is private and secure.

## Acceptance Criteria

### AC1: Database Schema Exists
**Given** the database is initialized
**When** I inspect the schema
**Then** a `tenants` table exists with columns: `id`, `name`, `created_at`
**And** a `users` table exists with columns: `id`, `tenant_id`, `zitadel_user_id`, `email`, `name`, `created_at`

### AC2: Auto-User/Tenant Creation on First Login
**Given** a user authenticates successfully
**When** they don't have a record in the `users` table
**Then** a new user record is created automatically
**And** a new tenant is created if this is their first login
**And** the tenant_id is stored in their user record

### AC3: Tenant Context Set Per Request
**Given** an authenticated API request
**When** the Go server processes it
**Then** it sets `app.tenant_id` in the database session
**And** all queries are automatically filtered by RLS policies

### AC4: RLS Fail-Safe Behavior
**Given** RLS is enabled on tenant-scoped tables
**When** a query runs without `app.tenant_id` set
**Then** the query returns no rows (fail-safe)

### AC5: Tenant Isolation Security
**Given** a malicious user tries to access another tenant's data
**When** they send a request with a different tenant_id in the body
**Then** the server ignores it and uses the tenant_id from their JWT
**And** RLS prevents any cross-tenant data access

## Tasks / Subtasks

- [x] **Task 1: Database Connection Setup** (AC: 1, 3)
  - [x] 1.1: Add `github.com/jackc/pgx/v5` to go.mod for PostgreSQL driver
  - [x] 1.2: Create `internal/storage/postgres.go` - Connection pool with YugabyteDB
  - [x] 1.3: Create environment config: `DATABASE_URL` (default: `postgres://yugabyte:yugabyte@localhost:5433/apis`)
  - [x] 1.4: Add graceful shutdown with connection pool cleanup in main.go

- [x] **Task 2: Database Schema & Migrations** (AC: 1)
  - [x] 2.1: Create `internal/storage/migrations/0001_tenants_users.sql` - Initial schema
  - [x] 2.2: Create `tenants` table: `id (TEXT PK)`, `name`, `plan`, `settings JSONB`, `created_at`
  - [x] 2.3: Create `users` table: `id (TEXT PK)`, `tenant_id (FK)`, `zitadel_user_id`, `email`, `name`, `created_at`
  - [x] 2.4: Create `internal/storage/migrations.go` - Migration runner (embed SQL files)
  - [x] 2.5: Add migration execution on server startup (auto-migrate)

- [x] **Task 3: Row-Level Security (RLS)** (AC: 3, 4, 5)
  - [x] 3.1: Create `internal/storage/migrations/0002_rls_policies.sql` - Enable RLS
  - [x] 3.2: Enable RLS on `users` table
  - [x] 3.3: Create isolation policy: `tenant_id = current_setting('app.tenant_id')::TEXT`
  - [x] 3.4: Create bypass policy for migration user (BYPASSRLS role)
  - [x] 3.5: Test fail-safe: query without tenant_id returns empty

- [x] **Task 4: Tenant Context Middleware** (AC: 3, 5)
  - [x] 4.1: Create `internal/middleware/tenant.go` - Tenant context middleware
  - [x] 4.2: Extract tenant_id from JWT claims (use existing OrgID)
  - [x] 4.3: Acquire database connection from pool
  - [x] 4.4: Execute `SET LOCAL app.tenant_id = $1` before handler
  - [x] 4.5: Pass connection via context to handlers
  - [x] 4.6: Ensure connection is released after request

- [x] **Task 5: User/Tenant Provisioning** (AC: 2)
  - [x] 5.1: Create `internal/storage/tenants.go` - Tenant CRUD operations
  - [x] 5.2: Create `internal/storage/users.go` - User CRUD operations
  - [x] 5.3: Create `internal/services/provisioning.go` - Auto-provision service
  - [x] 5.4: Implement `EnsureUserProvisioned(claims)` - Create tenant/user if not exists
  - [x] 5.5: Call provisioning from middleware after JWT validation (before RLS)
  - [x] 5.6: Use Zitadel org_id as tenant_id, sub as zitadel_user_id

- [x] **Task 6: Update Existing Endpoints** (AC: 3, 5)
  - [x] 6.1: Update `handlers/me.go` to return user data from database
  - [x] 6.2: Add `GetUser(ctx)` helper to get DB user from context
  - [x] 6.3: Ensure all protected handlers use tenant-scoped connection

- [x] **Task 7: Testing** (AC: 1, 2, 3, 4, 5)
  - [x] 7.1: Create `internal/storage/postgres_test.go` - Connection tests
  - [x] 7.2: Test migration runs successfully
  - [x] 7.3: Test auto-provisioning creates tenant and user
  - [x] 7.4: Test RLS blocks cross-tenant access
  - [x] 7.5: Test fail-safe: no tenant_id returns empty results
  - [x] 7.6: Create `tests/integration/tenant_isolation_test.go` - Full flow test

## Dev Notes

### Previous Story Intelligence (1-4 Zitadel OIDC Integration)

**Key files created that this story builds upon:**
- `internal/middleware/auth.go` - JWT validation middleware with claims extraction
- `internal/middleware/auth_test.go` - Middleware tests
- `internal/handlers/me.go` - Protected endpoint returning authenticated user info
- `cmd/server/main.go` - Server with CORS, auth middleware, route groups

**Claims already extracted from JWT (in `middleware.Claims`):**
```go
type Claims struct {
    UserID string   // from JWT "sub" claim
    OrgID  string   // from JWT "urn:zitadel:iam:org:id" claim
    Email  string   // from JWT "email" claim
    Name   string   // from JWT "name" claim (fallback: preferred_username)
    Roles  []string // from JWT "urn:zitadel:iam:user:roles" claim
}
```

**Existing patterns to follow:**
- Claims accessed via `middleware.GetClaims(ctx)`
- Error responses use `map[string]any{"error": msg, "code": statusCode}`
- Structured logging with zerolog
- Tests in separate `tests/` directory

**Review learnings applied:**
- org_id validation already enforced in `ValidateRequiredClaims()`
- `config.ts` pattern for centralized configuration
- Test wrappers use React Router v7 future flags

### Database Architecture (from Architecture Document)

**YugabyteDB Connection:**
```go
// Connection string format
DATABASE_URL=postgres://yugabyte:yugabyte@localhost:5433/apis
```

**Driver Choice:**
- Use `pgx/v5` (native Go driver, no CGO)
- Connection pooling with `pgxpool`

**Schema Design:**
```sql
-- Tenants table (synced from Zitadel Organizations)
CREATE TABLE tenants (
    id TEXT PRIMARY KEY,                    -- Zitadel org_id
    name TEXT NOT NULL,
    plan TEXT DEFAULT 'free',               -- 'free', 'hobby', 'pro'
    settings JSONB DEFAULT '{}',            -- Per-tenant configuration
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users table (synced from Zitadel Users)
CREATE TABLE users (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    zitadel_user_id TEXT NOT NULL UNIQUE,   -- Zitadel sub claim
    email TEXT NOT NULL,
    name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_zitadel ON users(zitadel_user_id);
```

**Row-Level Security:**
```sql
-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policy
CREATE POLICY tenant_isolation ON users
    USING (tenant_id = current_setting('app.tenant_id', true));

-- Force RLS even for table owner
ALTER TABLE users FORCE ROW LEVEL SECURITY;
```

### Tenant Context Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            REQUEST FLOW                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. Request with JWT arrives                                                 │
│       │                                                                      │
│       ▼                                                                      │
│  2. AuthMiddleware validates JWT, extracts claims (OrgID = tenant_id)       │
│       │                                                                      │
│       ▼                                                                      │
│  3. TenantMiddleware:                                                        │
│     a) Acquire DB connection from pool                                       │
│     b) EnsureUserProvisioned(claims) - create tenant/user if needed         │
│     c) SET LOCAL app.tenant_id = '{org_id}'                                  │
│     d) Store connection in context                                           │
│       │                                                                      │
│       ▼                                                                      │
│  4. Handler executes with tenant-scoped connection                           │
│     - All queries automatically filtered by RLS                              │
│     - Cannot see other tenants' data                                         │
│       │                                                                      │
│       ▼                                                                      │
│  5. Connection returned to pool (automatic via defer)                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Auto-Provisioning Logic

```go
// EnsureUserProvisioned creates tenant and user if they don't exist.
// Called on every authenticated request (fast path: user exists).
//
// Uses OrgID as tenant_id because:
// - Zitadel Organizations map 1:1 to APIS tenants
// - org_id is stable across user sessions
// - org_id is already validated in AuthMiddleware
func EnsureUserProvisioned(ctx context.Context, conn *pgxpool.Conn, claims *middleware.Claims) (*User, error) {
    // Fast path: user already exists
    user, err := GetUserByZitadelID(ctx, conn, claims.UserID)
    if err == nil {
        return user, nil
    }
    if !errors.Is(err, ErrNotFound) {
        return nil, fmt.Errorf("lookup user: %w", err)
    }

    // User doesn't exist - need to create tenant and/or user
    // This is a rare path (first login only)

    // Ensure tenant exists (create if needed)
    tenant, err := GetOrCreateTenant(ctx, conn, claims.OrgID, claims.Name)
    if err != nil {
        return nil, fmt.Errorf("ensure tenant: %w", err)
    }

    // Create user
    user, err = CreateUser(ctx, conn, &User{
        TenantID:      tenant.ID,
        ZitadelUserID: claims.UserID,
        Email:         claims.Email,
        Name:          claims.Name,
    })
    if err != nil {
        return nil, fmt.Errorf("create user: %w", err)
    }

    log.Info().
        Str("tenant_id", tenant.ID).
        Str("user_id", user.ID).
        Str("email", user.Email).
        Msg("New user provisioned")

    return user, nil
}
```

### Project Structure (Files to Create)

```
apis-server/
├── internal/
│   ├── storage/
│   │   ├── postgres.go         # NEW: Connection pool, context helpers
│   │   ├── postgres_test.go    # NEW: Connection tests
│   │   ├── migrations.go       # NEW: Migration runner
│   │   ├── migrations/         # NEW: SQL migration files
│   │   │   ├── 0001_tenants_users.sql
│   │   │   └── 0002_rls_policies.sql
│   │   ├── tenants.go          # NEW: Tenant CRUD
│   │   └── users.go            # NEW: User CRUD
│   ├── middleware/
│   │   ├── auth.go             # EXISTS: JWT validation
│   │   └── tenant.go           # NEW: Tenant context middleware
│   ├── services/
│   │   └── provisioning.go     # NEW: Auto-provisioning
│   └── handlers/
│       └── me.go               # MODIFY: Return user from DB
├── cmd/server/
│   └── main.go                 # MODIFY: Add DB init, new middleware
├── go.mod                      # MODIFY: Add pgx dependency
└── tests/
    └── integration/
        └── tenant_isolation_test.go  # NEW: Integration test
```

### Environment Variables

```bash
# Database connection (YugabyteDB/PostgreSQL compatible)
DATABASE_URL=postgres://yugabyte:yugabyte@localhost:5433/apis

# Existing from Story 1-4
ZITADEL_ISSUER=http://localhost:8080
ZITADEL_CLIENT_ID=<from Zitadel console>
CORS_ALLOWED_ORIGINS=http://localhost:5173
PORT=3000
```

### Architecture Compliance

**From Architecture Document:**
- AR: YugabyteDB for PostgreSQL-compatible distributed DB
- AR: `tenant_id` on all tables + RLS for data isolation
- AR: Go middleware sets tenant context before each request
- AR: Zitadel org_id maps to tenant_id

**Multi-Tenant Security:**
- tenant_id comes from JWT, never from request body
- RLS enforced at database level (defense in depth)
- Fail-safe: queries without tenant_id return empty

### Testing Strategy

**Unit Tests:**
- Migration runner parses SQL correctly
- Tenant CRUD operations
- User CRUD operations
- Provisioning logic (mock DB)

**Integration Tests (require running YugabyteDB):**
```go
// tests/integration/tenant_isolation_test.go
func TestTenantIsolation(t *testing.T) {
    // Setup: Create two tenants with users
    // Test 1: Tenant A cannot see Tenant B's users
    // Test 2: Tenant B cannot see Tenant A's users
    // Test 3: No tenant_id set returns empty results
}
```

**Test Database:**
- Use testcontainers-go for isolated test DB
- Or connect to docker-compose YugabyteDB instance

### Common Pitfalls to Avoid

1. **Don't use BYPASSRLS for application connections** - Only migration user should bypass RLS
2. **Don't forget SET LOCAL** - Must be LOCAL to scope to transaction
3. **Don't create tenant from request body** - Always use JWT org_id
4. **Don't forget to release connections** - Use defer or context cancellation
5. **Don't skip migration on startup** - Run migrations before accepting requests
6. **Don't use string concatenation for tenant_id** - Use parameterized queries

### References

- [Source: architecture.md - Data Architecture section]
- [Source: architecture.md - Row-Level Security section]
- [Source: architecture.md - Zitadel Integration section]
- [Source: epics.md - Story 1.5 requirements]
- [Source: Story 1-4 - JWT claims extraction pattern]
- [pgx v5 Documentation](https://github.com/jackc/pgx)
- [YugabyteDB PostgreSQL compatibility](https://docs.yugabyte.com/preview/api/ysql/)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Used ProvisioningClaims struct to avoid import cycle between middleware and services packages
- RLS policy uses `current_setting('app.tenant_id', true)` with second param `true` for fail-safe NULL behavior
- Tenants table intentionally does NOT have RLS - security enforced at application level during provisioning

### Completion Notes List

1. **Database Connection**: pgx/v5 pool with configurable DATABASE_URL, 25 max connections
2. **Migrations**: Embedded SQL files with automatic execution on startup
3. **Schema**: tenants (id, name, plan, settings, created_at) + users (id, tenant_id, zitadel_user_id, email, name, created_at)
4. **RLS**: Enabled on users table with FORCE, policy uses current_setting for fail-safe
5. **Tenant Middleware**: Acquires connection, provisions user, sets app.tenant_id, stores in context
6. **Auto-Provisioning**: Creates tenant (from org_id) and user (from sub) on first login
7. **GetMe Updated**: Now returns database user info with internal ID and tenant_id
8. **Tests**: Unit tests for helpers, integration tests for RLS (skip without DATABASE_URL)

### File List

**New Files:**
- `apis-server/internal/storage/postgres.go` - Connection pool and context helpers
- `apis-server/internal/storage/postgres_test.go` - Connection tests
- `apis-server/internal/storage/migrations.go` - Embedded migration runner
- `apis-server/internal/storage/migrations/0001_tenants_users.sql` - Schema migration
- `apis-server/internal/storage/migrations/0002_rls_policies.sql` - RLS policies
- `apis-server/internal/storage/tenants.go` - Tenant CRUD operations
- `apis-server/internal/storage/users.go` - User CRUD operations
- `apis-server/internal/middleware/tenant.go` - Tenant context middleware
- `apis-server/internal/services/provisioning.go` - Auto-provisioning service
- `apis-server/internal/services/provisioning_test.go` - Provisioning and RLS tests
- `apis-server/tests/integration/tenant_isolation_test.go` - E2E tenant isolation test

**Modified Files:**
- `apis-server/cmd/server/main.go` - Added DB init, migrations, tenant middleware
- `apis-server/internal/handlers/me.go` - Returns user from database
- `apis-server/internal/handlers/me_test.go` - Updated tests for user context
- `apis-server/go.mod` - Added pgx/v5 dependency
- `apis-server/go.sum` - Updated dependencies

## Senior Developer Review (AI)

**Review Date:** 2026-01-22
**Reviewer:** Claude Opus 4.5 (code-review workflow)
**Outcome:** CHANGES REQUESTED → FIXED

### Issues Found: 9 total (2 Critical, 4 Medium, 3 Low)

#### Critical Issues (Fixed)
1. **Migration tracking missing** - Added `schema_migrations` table to track applied migrations and prevent re-running
2. **BYPASSRLS not documented** - Added documentation explaining superuser bypass behavior

#### Medium Issues (Fixed)
3. **RLS bug in provisioning flow** - Moved `SET LOCAL app.tenant_id` BEFORE `EnsureUserProvisioned()` to fix potential duplicate user creation with non-superuser connections
4. **Misleading comment in users.go** - Corrected comment about RLS bypass
5. **MeResponse field naming** - Added clarifying comments to explain id vs user_id vs tenant_id
6. **Missing validation** - Added validation for required JWT claims (UserID, OrgID, Email)

#### Low Issues (Fixed)
7. **Test cleanup** - Added `t.Cleanup()` to remove test data after tests complete
8. **Tests not matching new flow** - Updated tests to set tenant context before provisioning

### Files Modified During Review
- `apis-server/internal/storage/migrations.go` - Added migration tracking
- `apis-server/internal/middleware/tenant.go` - Fixed RLS flow order
- `apis-server/internal/storage/users.go` - Fixed misleading comment
- `apis-server/internal/handlers/me.go` - Added documentation comments
- `apis-server/internal/services/provisioning.go` - Added validation
- `apis-server/internal/services/provisioning_test.go` - Added cleanup, validation tests, fixed flow

## Change Log

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-22 | Dev Agent (Claude Opus 4.5) | Initial implementation of tenant context and database setup |
| 2026-01-22 | Code Review (Claude Opus 4.5) | Fixed 9 issues: migration tracking, RLS flow, validation, test cleanup |
