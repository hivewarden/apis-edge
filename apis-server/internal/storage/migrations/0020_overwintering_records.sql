-- Migration: 0020_overwintering_records.sql
-- Description: Creates overwintering_records table for tracking winter survival
-- Epic: 9 - Data Export & Emotional Moments
-- Story: 9.5 - Overwintering Success Report

-- Overwintering records table
CREATE TABLE IF NOT EXISTS overwintering_records (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    hive_id TEXT NOT NULL REFERENCES hives(id) ON DELETE CASCADE,
    winter_season INT NOT NULL,          -- Year of winter start (e.g., 2025 for 2025-2026)
    survived BOOLEAN NOT NULL,           -- true = survived, false = lost
    condition TEXT,                      -- 'strong', 'medium', 'weak' (only if survived)
    stores_remaining TEXT,               -- 'none', 'low', 'adequate', 'plenty' (only if survived)
    first_inspection_notes TEXT,         -- Free text notes (only if survived)
    recorded_at DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, hive_id, winter_season)  -- One record per hive per winter
);

-- Condition and stores constraints
ALTER TABLE overwintering_records ADD CONSTRAINT overwintering_condition_check
    CHECK (condition IS NULL OR condition IN ('strong', 'medium', 'weak'));
ALTER TABLE overwintering_records ADD CONSTRAINT overwintering_stores_check
    CHECK (stores_remaining IS NULL OR stores_remaining IN ('none', 'low', 'adequate', 'plenty'));

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_overwintering_tenant ON overwintering_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_overwintering_season ON overwintering_records(tenant_id, winter_season DESC);
CREATE INDEX IF NOT EXISTS idx_overwintering_hive ON overwintering_records(hive_id);

-- Enable RLS
ALTER TABLE overwintering_records ENABLE ROW LEVEL SECURITY;

-- RLS policy for tenant isolation
DROP POLICY IF EXISTS overwintering_records_tenant_isolation ON overwintering_records;
CREATE POLICY overwintering_records_tenant_isolation ON overwintering_records
    USING (tenant_id = current_setting('app.tenant_id', true));
