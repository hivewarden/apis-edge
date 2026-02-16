-- Migration: 0021_custom_labels.sql
-- Create custom_labels table for user-defined categories (feeds, treatments, equipment, issues)

CREATE TABLE IF NOT EXISTS custom_labels (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    category TEXT NOT NULL,                 -- 'feed', 'treatment', 'equipment', 'issue'
    name TEXT NOT NULL,                     -- User-defined label text
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ                  -- Soft delete for historical references
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_custom_labels_tenant ON custom_labels(tenant_id);
CREATE INDEX IF NOT EXISTS idx_custom_labels_category ON custom_labels(tenant_id, category);

-- Unique constraint: no duplicate names within same category for active labels
CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_labels_unique ON custom_labels(tenant_id, category, name)
    WHERE deleted_at IS NULL;

-- Row Level Security for tenant isolation
ALTER TABLE custom_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY custom_labels_tenant_isolation ON custom_labels
    USING (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY custom_labels_tenant_insert ON custom_labels
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY custom_labels_tenant_update ON custom_labels
    FOR UPDATE USING (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY custom_labels_tenant_delete ON custom_labels
    FOR DELETE USING (tenant_id = current_setting('app.tenant_id', true));
