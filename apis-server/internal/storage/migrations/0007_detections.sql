-- Migration: 0007_detections.sql
-- Create detections table for hornet detection events from units

CREATE TABLE IF NOT EXISTS detections (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    unit_id TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    detected_at TIMESTAMPTZ NOT NULL,
    confidence DECIMAL(5, 4),           -- e.g., 0.8500
    size_pixels INTEGER,                 -- Detected object size
    hover_duration_ms INTEGER,           -- How long object hovered
    laser_activated BOOLEAN DEFAULT FALSE,
    clip_id TEXT,                        -- Reference to clip (future)
    clip_filename TEXT,                  -- Original filename from unit
    temperature_c DECIMAL(5, 2),         -- Temperature at detection time (cached)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient range queries by site and time
CREATE INDEX idx_detections_site_time ON detections(tenant_id, site_id, detected_at DESC);

-- Index for unit-specific queries
CREATE INDEX idx_detections_unit ON detections(unit_id, detected_at DESC);

-- Enable RLS
ALTER TABLE detections ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policy
CREATE POLICY tenant_isolation_detections ON detections
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true));
