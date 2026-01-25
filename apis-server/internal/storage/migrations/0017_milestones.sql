-- Migration 0017: Milestones
-- Creates tables and RLS policies for milestone photos and flags.
-- Part of Epic 9, Story 9.2: First Harvest Celebration

-- Milestone photos table
-- Stores photos associated with significant milestones (first harvest, first hive harvest, etc.)
CREATE TABLE IF NOT EXISTS milestone_photos (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    milestone_type TEXT NOT NULL,  -- 'first_harvest', 'first_hive_harvest'
    reference_id TEXT,             -- harvest_id or hive_id depending on type
    file_path TEXT NOT NULL,
    thumbnail_path TEXT,
    caption TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_milestone_photos_tenant ON milestone_photos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_milestone_photos_type ON milestone_photos(milestone_type);
CREATE INDEX IF NOT EXISTS idx_milestone_photos_reference ON milestone_photos(reference_id);

-- RLS policy for milestone_photos (tenant isolation)
ALTER TABLE milestone_photos ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for re-runnable migrations)
DROP POLICY IF EXISTS milestone_photos_tenant_isolation ON milestone_photos;

-- Create RLS policy: tenants can only see their own milestone photos
CREATE POLICY milestone_photos_tenant_isolation ON milestone_photos
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- Add milestones field to tenants.settings JSONB
-- This stores flags like {"first_harvest_seen": true, "hive_first_harvests": ["hive-id-1"]}
-- The settings column already exists and defaults to '{}', so we just use it
-- No schema change needed - we store milestone flags in the existing settings JSONB
