-- Migration: 0012_feedings.sql
-- Create feedings table for logging hive feedings

CREATE TABLE IF NOT EXISTS feedings (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    hive_id TEXT NOT NULL REFERENCES hives(id) ON DELETE CASCADE,
    fed_at DATE NOT NULL,
    feed_type TEXT NOT NULL,
    amount DECIMAL(10, 2),
    unit TEXT NOT NULL DEFAULT 'kg',
    concentration TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_feedings_tenant ON feedings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_feedings_hive ON feedings(hive_id);
CREATE INDEX IF NOT EXISTS idx_feedings_date ON feedings(hive_id, fed_at DESC);

-- Row Level Security for tenant isolation
ALTER TABLE feedings ENABLE ROW LEVEL SECURITY;

CREATE POLICY feedings_tenant_isolation ON feedings
    USING (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY feedings_tenant_insert ON feedings
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY feedings_tenant_update ON feedings
    FOR UPDATE USING (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY feedings_tenant_delete ON feedings
    FOR DELETE USING (tenant_id = current_setting('app.tenant_id', true));
