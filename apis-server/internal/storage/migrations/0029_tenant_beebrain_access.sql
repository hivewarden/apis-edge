-- Migration: 0029_tenant_beebrain_access.sql
-- Create tenant_beebrain_access table for per-tenant BeeBrain feature toggles.
--
-- This table controls whether a tenant can use BeeBrain features.
-- Super-admins can enable/disable BeeBrain per tenant.
-- If no row exists for a tenant, default is enabled (true).

CREATE TABLE IF NOT EXISTS tenant_beebrain_access (
    tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_tenant_beebrain_access_enabled
    ON tenant_beebrain_access(enabled) WHERE enabled = false;

-- Trigger for auto-updating updated_at
CREATE OR REPLACE FUNCTION update_tenant_beebrain_access_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tenant_beebrain_access_updated_at ON tenant_beebrain_access;

CREATE TRIGGER trg_tenant_beebrain_access_updated_at
    BEFORE UPDATE ON tenant_beebrain_access
    FOR EACH ROW
    EXECUTE FUNCTION update_tenant_beebrain_access_updated_at();

COMMENT ON TABLE tenant_beebrain_access IS 'Per-tenant BeeBrain feature access control. Super-admins can toggle access per tenant.';
COMMENT ON COLUMN tenant_beebrain_access.enabled IS 'Whether tenant can use BeeBrain features. Default true if no row exists.';
