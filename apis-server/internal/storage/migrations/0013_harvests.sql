-- Migration: 0013_harvests.sql
-- Story 6.3: Harvest Tracking
-- Creates harvests and harvest_hives tables for tracking honey harvests with per-hive breakdown

-- Harvests (main record, one per harvest event)
CREATE TABLE IF NOT EXISTS harvests (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    harvested_at DATE NOT NULL,
    total_kg DECIMAL(10, 2),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Harvest-to-Hive breakdown (per-hive amounts and frames)
CREATE TABLE IF NOT EXISTS harvest_hives (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    harvest_id TEXT NOT NULL REFERENCES harvests(id) ON DELETE CASCADE,
    hive_id TEXT NOT NULL REFERENCES hives(id) ON DELETE CASCADE,
    frames INTEGER,
    amount_kg DECIMAL(10, 2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies for tenant isolation
ALTER TABLE harvests ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON harvests
    USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE harvest_hives ENABLE ROW LEVEL SECURITY;
CREATE POLICY harvest_access ON harvest_hives
    USING (harvest_id IN (SELECT id FROM harvests WHERE tenant_id = current_setting('app.tenant_id', true)));

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_harvests_tenant ON harvests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_harvests_site ON harvests(site_id);
CREATE INDEX IF NOT EXISTS idx_harvests_date ON harvests(site_id, harvested_at DESC);
CREATE INDEX IF NOT EXISTS idx_harvest_hives_harvest ON harvest_hives(harvest_id);
CREATE INDEX IF NOT EXISTS idx_harvest_hives_hive ON harvest_hives(hive_id);
