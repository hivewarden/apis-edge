-- Migration: 0028_tenant_limits.sql
-- Create tenant_limits table for per-tenant resource quotas.
--
-- This table defines usage limits for each tenant:
-- - Maximum hives
-- - Maximum storage (for clips and attachments)
-- - Maximum APIS units
-- - Maximum users
--
-- NOTE: No RLS - this is a super-admin/system only table.
-- Tenants can read their own limits via application code, but cannot modify.

CREATE TABLE IF NOT EXISTS tenant_limits (
    tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    max_hives INTEGER DEFAULT 100,                -- Maximum hives in tenant
    max_storage_bytes BIGINT DEFAULT 5368709120,  -- 5 GB default (5 * 1024^3)
    max_units INTEGER DEFAULT 10,                 -- Maximum APIS edge units
    max_users INTEGER DEFAULT 20,                 -- Maximum user accounts
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- NOTE: No additional indexes needed - primary key is sufficient
-- All queries will be by tenant_id

-- NOTE: No RLS policies
-- Reason: This table is managed by super-admins and system processes.
-- Tenants can view their limits via the application API but cannot modify.
-- Access control enforced at application level.

-- Create or replace the trigger function for auto-updating updated_at
CREATE OR REPLACE FUNCTION update_tenant_limits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists, then create (for idempotency)
DROP TRIGGER IF EXISTS trg_tenant_limits_updated_at ON tenant_limits;

CREATE TRIGGER trg_tenant_limits_updated_at
    BEFORE UPDATE ON tenant_limits
    FOR EACH ROW
    EXECUTE FUNCTION update_tenant_limits_updated_at();

COMMENT ON TABLE tenant_limits IS 'Resource quotas per tenant. No RLS - managed by super-admin/system only.';
COMMENT ON COLUMN tenant_limits.max_hives IS 'Maximum number of hives allowed for tenant. Default 100.';
COMMENT ON COLUMN tenant_limits.max_storage_bytes IS 'Maximum storage in bytes for clips and attachments. Default 5 GB.';
COMMENT ON COLUMN tenant_limits.max_units IS 'Maximum APIS edge units (cameras) allowed. Default 10.';
COMMENT ON COLUMN tenant_limits.max_users IS 'Maximum user accounts in tenant. Default 20.';
