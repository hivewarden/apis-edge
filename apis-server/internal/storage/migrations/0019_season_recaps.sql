-- Migration 0019: Season recaps table
-- Part of Epic 9, Story 9.4: Season Recap Summary
-- Provides caching for generated season recap data

-- Season recaps cache table
CREATE TABLE IF NOT EXISTS season_recaps (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    season_year INT NOT NULL,                    -- e.g., 2026
    hemisphere TEXT NOT NULL DEFAULT 'northern', -- 'northern' or 'southern'
    season_start DATE NOT NULL,
    season_end DATE NOT NULL,
    recap_data JSONB NOT NULL,                   -- Cached aggregated data
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, season_year)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_season_recaps_tenant ON season_recaps(tenant_id);
CREATE INDEX IF NOT EXISTS idx_season_recaps_year ON season_recaps(tenant_id, season_year DESC);

-- Enable Row Level Security
ALTER TABLE season_recaps ENABLE ROW LEVEL SECURITY;

-- RLS policy for tenant isolation
DROP POLICY IF EXISTS season_recaps_tenant_isolation ON season_recaps;
CREATE POLICY season_recaps_tenant_isolation ON season_recaps
    USING (tenant_id = current_setting('app.tenant_id', true));
