-- Migration: 0009_hives.sql
-- Description: Creates hives table with queen history and box changes tracking
-- Epic: 5 - Hive Management & Inspections
-- Story: 5.1 - Create and Configure Hives

-- Hives table
CREATE TABLE IF NOT EXISTS hives (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    queen_introduced_at DATE,
    queen_source TEXT,
    brood_boxes INTEGER NOT NULL DEFAULT 1 CHECK (brood_boxes >= 1 AND brood_boxes <= 3),
    honey_supers INTEGER NOT NULL DEFAULT 0 CHECK (honey_supers >= 0 AND honey_supers <= 5),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Queen history tracking
CREATE TABLE IF NOT EXISTS queen_history (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    hive_id TEXT NOT NULL REFERENCES hives(id) ON DELETE CASCADE,
    introduced_at DATE NOT NULL,
    source TEXT,
    replaced_at DATE,
    replacement_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Box changes tracking
CREATE TABLE IF NOT EXISTS box_changes (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    hive_id TEXT NOT NULL REFERENCES hives(id) ON DELETE CASCADE,
    change_type TEXT NOT NULL CHECK (change_type IN ('added', 'removed')),
    box_type TEXT NOT NULL CHECK (box_type IN ('brood', 'super')),
    changed_at DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_hives_tenant ON hives(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hives_site ON hives(site_id);
CREATE INDEX IF NOT EXISTS idx_hives_name ON hives(tenant_id, name);
CREATE INDEX IF NOT EXISTS idx_queen_history_hive ON queen_history(hive_id);
CREATE INDEX IF NOT EXISTS idx_queen_history_date ON queen_history(hive_id, introduced_at DESC);
CREATE INDEX IF NOT EXISTS idx_box_changes_hive ON box_changes(hive_id);
CREATE INDEX IF NOT EXISTS idx_box_changes_date ON box_changes(hive_id, changed_at DESC);

-- Enable RLS on hives table
ALTER TABLE hives ENABLE ROW LEVEL SECURITY;

-- RLS policy for hives (tenant isolation)
DROP POLICY IF EXISTS hives_tenant_isolation ON hives;
CREATE POLICY hives_tenant_isolation ON hives
    USING (tenant_id = current_setting('app.tenant_id', true));

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_hives_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS hives_updated_at ON hives;
CREATE TRIGGER hives_updated_at
    BEFORE UPDATE ON hives
    FOR EACH ROW
    EXECUTE FUNCTION update_hives_updated_at();

-- Enable RLS on queen_history table (data accessed via hive lookups but adding for defense-in-depth)
-- Note: queen_history doesn't have tenant_id, but is only accessible via hive_id which is RLS-protected
ALTER TABLE queen_history ENABLE ROW LEVEL SECURITY;

-- RLS policy for queen_history - allow access only if parent hive is accessible
DROP POLICY IF EXISTS queen_history_via_hive ON queen_history;
CREATE POLICY queen_history_via_hive ON queen_history
    USING (EXISTS (
        SELECT 1 FROM hives
        WHERE hives.id = queen_history.hive_id
        AND hives.tenant_id = current_setting('app.tenant_id', true)
    ));

-- Enable RLS on box_changes table
ALTER TABLE box_changes ENABLE ROW LEVEL SECURITY;

-- RLS policy for box_changes - allow access only if parent hive is accessible
DROP POLICY IF EXISTS box_changes_via_hive ON box_changes;
CREATE POLICY box_changes_via_hive ON box_changes
    USING (EXISTS (
        SELECT 1 FROM hives
        WHERE hives.id = box_changes.hive_id
        AND hives.tenant_id = current_setting('app.tenant_id', true)
    ));
