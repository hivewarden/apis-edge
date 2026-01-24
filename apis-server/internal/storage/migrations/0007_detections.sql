-- Migration: Create detections table for hornet detection events
-- Epic 3, Story 3.1: Detection Events Table & API

-- Detections represent hornet detection events from APIS units
CREATE TABLE detections (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    unit_id TEXT NOT NULL REFERENCES units(id),
    site_id TEXT NOT NULL REFERENCES sites(id),
    detected_at TIMESTAMPTZ NOT NULL,           -- When the hornet was detected
    confidence REAL,                            -- Detection confidence (0.0 - 1.0)
    size_pixels INTEGER,                        -- Estimated size in pixels
    hover_duration_ms INTEGER,                  -- How long the hornet hovered (ms)
    laser_activated BOOLEAN DEFAULT FALSE,      -- Whether laser was triggered
    clip_id TEXT,                               -- Optional reference to clip (FK added later in Epic 4)
    temperature_c REAL,                         -- Temperature at detection time (from weather cache)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row-Level Security for tenant isolation
ALTER TABLE detections ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can only access detections belonging to their tenant
CREATE POLICY tenant_isolation ON detections
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- Performance indexes
-- Primary query pattern: filter by site and date range
CREATE INDEX idx_detections_site_time ON detections(tenant_id, site_id, detected_at DESC);

-- Secondary: filter by unit
CREATE INDEX idx_detections_unit ON detections(unit_id, detected_at DESC);

-- Aggregation support: hourly breakdown queries
CREATE INDEX idx_detections_hourly ON detections(tenant_id, site_id, date_trunc('hour', detected_at));
