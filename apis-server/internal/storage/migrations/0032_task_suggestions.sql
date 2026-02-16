-- Migration: 0032_task_suggestions.sql
-- Creates task_suggestions table for BeeBrain AI-generated task suggestions.
--
-- Task suggestions are created by BeeBrain after analyzing inspections.
-- Users can:
--   - Accept: Creates a hive_task from the suggestion
--   - Dismiss: Marks suggestion as dismissed (won't show again)
--
-- Each suggestion includes a reason explaining why BeeBrain recommends it.
--
-- Epic: 14 - Hive Task Management
-- Story: 14.1 - Database Migrations + System Template Seeding

-- Task suggestions table
CREATE TABLE IF NOT EXISTS task_suggestions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    hive_id TEXT NOT NULL REFERENCES hives(id) ON DELETE CASCADE,
    inspection_id TEXT REFERENCES inspections(id) ON DELETE SET NULL,  -- Which inspection triggered this
    suggested_template_id TEXT REFERENCES task_templates(id),  -- Template to use if accepted
    suggested_title TEXT,  -- Title if no template, or override
    reason TEXT NOT NULL,  -- Explanation of why BeeBrain suggested this
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for hive + status queries (most common: "get pending suggestions for hive")
CREATE INDEX IF NOT EXISTS idx_task_suggestions_hive_status
    ON task_suggestions(hive_id, status);

-- Index for tenant-wide queries
CREATE INDEX IF NOT EXISTS idx_task_suggestions_tenant
    ON task_suggestions(tenant_id);

-- Index for pending suggestions (dashboard/notification queries)
CREATE INDEX IF NOT EXISTS idx_task_suggestions_pending
    ON task_suggestions(tenant_id, status)
    WHERE status = 'pending';

-- Enable Row-Level Security
ALTER TABLE task_suggestions ENABLE ROW LEVEL SECURITY;

-- RLS policy: Tenant isolation
DROP POLICY IF EXISTS task_suggestions_tenant_isolation ON task_suggestions;
CREATE POLICY task_suggestions_tenant_isolation ON task_suggestions
    USING (tenant_id = current_setting('app.tenant_id', true));

-- Comments for documentation
COMMENT ON TABLE task_suggestions IS 'BeeBrain AI-generated task suggestions. Users can accept or dismiss.';
COMMENT ON COLUMN task_suggestions.id IS 'Unique identifier (UUID as TEXT)';
COMMENT ON COLUMN task_suggestions.tenant_id IS 'Owning tenant';
COMMENT ON COLUMN task_suggestions.hive_id IS 'Hive the suggestion applies to';
-- Note: inspection_id uses ON DELETE SET NULL because suggestions should remain visible
-- even if the triggering inspection is deleted. The suggestion is still valid advice
-- that the user may want to act on, and the 'reason' field captures the context.
COMMENT ON COLUMN task_suggestions.inspection_id IS 'Inspection that triggered this suggestion (NULL if inspection deleted). Uses SET NULL to preserve suggestion even after inspection removal.';
COMMENT ON COLUMN task_suggestions.suggested_template_id IS 'Recommended template for the task';
COMMENT ON COLUMN task_suggestions.suggested_title IS 'Suggested task title (used if no template or as override)';
COMMENT ON COLUMN task_suggestions.reason IS 'BeeBrain explanation for why this task is recommended';
COMMENT ON COLUMN task_suggestions.priority IS 'Suggested priority: low, medium, high, urgent';
COMMENT ON COLUMN task_suggestions.status IS 'Status: pending (awaiting user action), accepted, or dismissed';
COMMENT ON COLUMN task_suggestions.created_at IS 'Timestamp when suggestion was created';
