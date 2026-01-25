-- Migration: 0011_treatments.sql
-- Create treatments table for logging varroa treatments

CREATE TABLE IF NOT EXISTS treatments (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    hive_id TEXT NOT NULL REFERENCES hives(id) ON DELETE CASCADE,
    treated_at DATE NOT NULL,
    treatment_type TEXT NOT NULL,
    method TEXT,
    dose TEXT,
    mite_count_before INTEGER,
    mite_count_after INTEGER,
    weather TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_treatments_tenant ON treatments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_treatments_hive ON treatments(hive_id);
CREATE INDEX IF NOT EXISTS idx_treatments_date ON treatments(hive_id, treated_at DESC);

-- Row Level Security for tenant isolation
ALTER TABLE treatments ENABLE ROW LEVEL SECURITY;

CREATE POLICY treatments_tenant_isolation ON treatments
    USING (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY treatments_tenant_insert ON treatments
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY treatments_tenant_update ON treatments
    FOR UPDATE USING (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY treatments_tenant_delete ON treatments
    FOR DELETE USING (tenant_id = current_setting('app.tenant_id', true));
