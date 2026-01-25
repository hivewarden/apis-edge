-- 0010_inspection_frames.sql
-- Frame-level data tracking for inspections
-- Part of Epic 5, Story 5.5

-- Create inspection_frames table
CREATE TABLE IF NOT EXISTS inspection_frames (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    box_position INT NOT NULL,  -- 1 = bottom, increasing upward
    box_type VARCHAR(10) NOT NULL CHECK (box_type IN ('brood', 'super')),
    total_frames INT NOT NULL DEFAULT 10,
    drawn_frames INT NOT NULL DEFAULT 0,
    brood_frames INT NOT NULL DEFAULT 0,
    honey_frames INT NOT NULL DEFAULT 0,
    pollen_frames INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (inspection_id, box_position),
    CHECK (drawn_frames >= 0 AND drawn_frames <= total_frames),
    CHECK (brood_frames >= 0),
    CHECK (honey_frames >= 0),
    CHECK (pollen_frames >= 0),
    CHECK (brood_frames + honey_frames + pollen_frames <= drawn_frames)
);

-- Index for fast lookups by inspection
CREATE INDEX IF NOT EXISTS idx_inspection_frames_inspection_id
ON inspection_frames(inspection_id);

-- Enable Row Level Security
ALTER TABLE inspection_frames ENABLE ROW LEVEL SECURITY;

-- RLS policy: Users can only access frames for inspections in their tenant's hives
CREATE POLICY inspection_frames_tenant_isolation ON inspection_frames
    FOR ALL
    USING (
        inspection_id IN (
            SELECT i.id FROM inspections i
            JOIN hives h ON i.hive_id = h.id
            WHERE h.tenant_id = current_setting('app.tenant_id', true)
        )
    );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON inspection_frames TO apis_app;
