-- Migration 0002: Row-Level Security Policies
-- Enables RLS on tenant-scoped tables for data isolation.
-- All queries are filtered by app.tenant_id set per request.

-- Enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owner (important for security)
ALTER TABLE users FORCE ROW LEVEL SECURITY;

-- Create tenant isolation policy for users
-- Uses current_setting with 'true' as second argument for fail-safe behavior:
-- - If app.tenant_id is not set, current_setting returns NULL
-- - Comparing NULL to any value using = yields NULL (not false), which SQL
--   treats as "not true" in WHERE/USING clauses, so no rows are returned.
-- This is the desired fail-safe: no tenant context = no data access
CREATE POLICY tenant_isolation_users ON users
    USING (tenant_id = current_setting('app.tenant_id', true));

-- Note: Tenants table does NOT have RLS because:
-- 1. Tenant data is needed during provisioning (before RLS context is set)
-- 2. Tenant lookups use the JWT org_id, not user input
-- 3. Only the tenant's own record is ever accessed (by id match)
-- Security is enforced at the application level for tenants table.
