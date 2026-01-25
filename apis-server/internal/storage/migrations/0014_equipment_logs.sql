-- Migration: 0014_equipment_logs.sql
-- Create equipment_logs table for tracking equipment installed/removed from hives

CREATE TABLE IF NOT EXISTS equipment_logs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    hive_id TEXT NOT NULL REFERENCES hives(id) ON DELETE CASCADE,
    equipment_type TEXT NOT NULL,           -- 'entrance_reducer', 'mouse_guard', 'queen_excluder', etc.
    action TEXT NOT NULL,                   -- 'installed' or 'removed'
    logged_at DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_equipment_logs_tenant ON equipment_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_equipment_logs_hive ON equipment_logs(hive_id);
CREATE INDEX IF NOT EXISTS idx_equipment_logs_hive_date ON equipment_logs(hive_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_equipment_logs_currently_installed ON equipment_logs(hive_id, equipment_type, action);

-- Row Level Security for tenant isolation
ALTER TABLE equipment_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY equipment_logs_tenant_isolation ON equipment_logs
    USING (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY equipment_logs_tenant_insert ON equipment_logs
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY equipment_logs_tenant_update ON equipment_logs
    FOR UPDATE USING (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY equipment_logs_tenant_delete ON equipment_logs
    FOR DELETE USING (tenant_id = current_setting('app.tenant_id', true));
