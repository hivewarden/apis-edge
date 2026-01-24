-- Migration: Create units table for APIS device registration
-- Epic 2, Story 2.2: Register APIS Units

-- Units represent APIS hardware devices (Pi5, ESP32-CAM, etc.)
CREATE TABLE units (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    site_id TEXT REFERENCES sites(id),
    serial TEXT NOT NULL,
    name TEXT,
    api_key_hash TEXT NOT NULL,             -- bcrypt hash of API key, never store raw
    api_key_prefix TEXT NOT NULL,           -- First 16 chars of key for indexed lookup (apis_ + 11 hex)
    firmware_version TEXT,
    ip_address TEXT,
    last_seen TIMESTAMPTZ,
    status TEXT DEFAULT 'offline',          -- 'online', 'offline', 'error'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint: serial number must be unique within a tenant
ALTER TABLE units ADD CONSTRAINT units_tenant_serial_unique
    UNIQUE (tenant_id, serial);

-- Enable Row-Level Security for tenant isolation
ALTER TABLE units ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can only access units belonging to their tenant
-- USING controls SELECT; WITH CHECK controls INSERT/UPDATE/DELETE
CREATE POLICY tenant_isolation ON units
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- Performance indexes
CREATE INDEX idx_units_tenant ON units(tenant_id);
CREATE INDEX idx_units_site ON units(site_id);
CREATE INDEX idx_units_status ON units(tenant_id, status);
CREATE INDEX idx_units_api_key_prefix ON units(api_key_prefix);

-- The api_key_prefix index allows quick filtering before bcrypt comparison.
-- Security note: The prefix alone doesn't reveal the full key and still requires
-- bcrypt verification to authenticate.

-- Trigger to update updated_at on modification
CREATE OR REPLACE FUNCTION update_units_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER units_updated_at
    BEFORE UPDATE ON units
    FOR EACH ROW
    EXECUTE FUNCTION update_units_updated_at();
