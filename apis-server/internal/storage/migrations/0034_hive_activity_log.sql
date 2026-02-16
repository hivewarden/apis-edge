-- Migration 0034: Hive Activity Log
-- Story 14.13: Task Completion Inspection Note Logging
-- Creates hive_activity_log table for recording task completions and other hive activity

-- Create hive_activity_log table
CREATE TABLE IF NOT EXISTS hive_activity_log (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    hive_id TEXT NOT NULL REFERENCES hives(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB,
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying activity by hive (most common query pattern)
-- Sorted by created_at DESC for newest-first pagination
CREATE INDEX IF NOT EXISTS idx_hive_activity_log_hive ON hive_activity_log(hive_id, created_at DESC);

-- Index for tenant-level queries
CREATE INDEX IF NOT EXISTS idx_hive_activity_log_tenant ON hive_activity_log(tenant_id);

-- Index for filtering by activity type
CREATE INDEX IF NOT EXISTS idx_hive_activity_log_type ON hive_activity_log(hive_id, type, created_at DESC);

-- Enable Row Level Security
ALTER TABLE hive_activity_log ENABLE ROW LEVEL SECURITY;

-- Create tenant isolation policy
-- Ensures users can only access activity logs for their own tenant
CREATE POLICY tenant_isolation ON hive_activity_log
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true));

-- Add comment for documentation
COMMENT ON TABLE hive_activity_log IS 'Records hive activity events including task completions, notes, and automated changes. Part of Epic 14, Story 14.13.';
COMMENT ON COLUMN hive_activity_log.type IS 'Activity type: task_completion, note, etc.';
COMMENT ON COLUMN hive_activity_log.content IS 'Human-readable summary of the activity';
COMMENT ON COLUMN hive_activity_log.metadata IS 'Structured data: task_id, task_name, completion_data, auto_applied, changes';
