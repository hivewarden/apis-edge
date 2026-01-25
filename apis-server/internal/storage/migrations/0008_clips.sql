-- Migration: 0008_clips.sql
-- Create clips table for video clip storage from APIS units
-- Epic 4, Story 4.1: Clip Upload & Storage

CREATE TABLE IF NOT EXISTS clips (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    unit_id TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    detection_id TEXT REFERENCES detections(id) ON DELETE SET NULL,
    file_path TEXT NOT NULL,               -- e.g., clips/tenant123/site456/2026-01/clip_abc.mp4
    thumbnail_path TEXT,                   -- e.g., clips/tenant123/site456/2026-01/clip_abc.jpg
    duration_seconds DECIMAL(10, 2),       -- Video duration (optional, extracted from metadata)
    file_size_bytes BIGINT NOT NULL,       -- File size for storage tracking
    recorded_at TIMESTAMPTZ NOT NULL,      -- When the unit recorded it
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ                 -- Soft delete for retention policy
);

-- Indexes for efficient queries
CREATE INDEX idx_clips_tenant ON clips(tenant_id);
CREATE INDEX idx_clips_site ON clips(site_id);
CREATE INDEX idx_clips_unit ON clips(unit_id);
CREATE INDEX idx_clips_detection ON clips(detection_id);
CREATE INDEX idx_clips_recorded_at ON clips(tenant_id, site_id, recorded_at DESC);
CREATE INDEX idx_clips_not_deleted ON clips(tenant_id, site_id, recorded_at DESC) WHERE deleted_at IS NULL;

-- Enable RLS
ALTER TABLE clips ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policy
CREATE POLICY tenant_isolation_clips ON clips
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- Update detections table to add clip_id reference
-- This is an ALTER since detections table already exists
ALTER TABLE detections
    ADD CONSTRAINT fk_detections_clip
    FOREIGN KEY (clip_id) REFERENCES clips(id) ON DELETE SET NULL;
