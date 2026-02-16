-- Migration: 0010_inspections.sql
-- Description: Creates inspections table for hive inspection records
-- Epic: 5 - Hive Management & Inspections
-- Story: 5.3 - Quick-Entry Inspection Form

-- Inspections table
CREATE TABLE IF NOT EXISTS inspections (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    hive_id TEXT NOT NULL REFERENCES hives(id) ON DELETE CASCADE,
    inspected_at DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Queen observations
    queen_seen BOOLEAN,
    eggs_seen BOOLEAN,
    queen_cells BOOLEAN,

    -- Brood
    brood_frames INTEGER CHECK (brood_frames >= 0 AND brood_frames <= 20),
    brood_pattern TEXT CHECK (brood_pattern IS NULL OR brood_pattern IN ('good', 'spotty', 'poor')),

    -- Stores
    honey_level TEXT CHECK (honey_level IS NULL OR honey_level IN ('low', 'medium', 'high')),
    pollen_level TEXT CHECK (pollen_level IS NULL OR pollen_level IN ('low', 'medium', 'high')),

    -- Temperament (optional)
    temperament TEXT CHECK (temperament IS NULL OR temperament IN ('calm', 'nervous', 'aggressive')),

    -- Issues (JSON array of issue codes: dwv, chalkbrood, wax_moth, robbing, other:description)
    issues JSONB DEFAULT '[]',

    -- Notes
    notes TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_inspections_tenant ON inspections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inspections_hive ON inspections(hive_id);
CREATE INDEX IF NOT EXISTS idx_inspections_date ON inspections(hive_id, inspected_at DESC);
CREATE INDEX IF NOT EXISTS idx_inspections_hive_latest ON inspections(hive_id, created_at DESC);

-- Enable RLS on inspections table
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;

-- RLS policy for inspections (tenant isolation)
DROP POLICY IF EXISTS inspections_tenant_isolation ON inspections;
CREATE POLICY inspections_tenant_isolation ON inspections
    USING (tenant_id = current_setting('app.tenant_id', true));

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_inspections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS inspections_updated_at ON inspections;
CREATE TRIGGER inspections_updated_at
    BEFORE UPDATE ON inspections
    FOR EACH ROW
    EXECUTE FUNCTION update_inspections_updated_at();
