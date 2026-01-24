-- Migration: Create sites table for apiary management
-- Epic 2, Story 2.1: Create and Manage Sites

-- Sites represent physical apiary locations
CREATE TABLE sites (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    gps_lat DECIMAL(10, 7),
    gps_lng DECIMAL(10, 7),
    timezone TEXT DEFAULT 'UTC',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row-Level Security for tenant isolation
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can only access sites belonging to their tenant
-- Uses current_setting with second param true to avoid error when not set
-- USING clause controls SELECT; WITH CHECK controls INSERT/UPDATE/DELETE
CREATE POLICY tenant_isolation ON sites
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- Performance indexes
CREATE INDEX idx_sites_tenant ON sites(tenant_id);
CREATE INDEX idx_sites_name ON sites(tenant_id, name);

-- Trigger to update updated_at on modification
CREATE OR REPLACE FUNCTION update_sites_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sites_updated_at
    BEFORE UPDATE ON sites
    FOR EACH ROW
    EXECUTE FUNCTION update_sites_updated_at();
