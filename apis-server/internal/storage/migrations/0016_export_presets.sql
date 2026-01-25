-- Migration: Create export_presets table for Story 9.1 (Configurable Data Export)
-- This table stores user-defined export configurations for reuse

CREATE TABLE IF NOT EXISTS export_presets (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    config JSONB NOT NULL,  -- Stores include fields and default format
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);

-- Index for efficient tenant-based queries
CREATE INDEX IF NOT EXISTS idx_export_presets_tenant ON export_presets(tenant_id);

-- Enable RLS for multi-tenant security
ALTER TABLE export_presets ENABLE ROW LEVEL SECURITY;

-- RLS policy: Users can only access their own tenant's presets
CREATE POLICY export_presets_tenant_isolation ON export_presets
    USING (tenant_id = current_setting('app.tenant_id', true));
