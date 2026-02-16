-- Migration: 0031_hive_tasks.sql
-- Creates hive_tasks table for storing tasks assigned to hives.
--
-- Tasks can be:
--   - Created from templates (template_id set, uses template's auto_effects)
--   - Custom tasks (custom_title set, no template)
--
-- Source indicates origin:
--   - manual: User-created task
--   - beebrain: AI-suggested task that was accepted
--
-- On completion, completion_data stores user inputs from prompts,
-- and auto_applied_changes records what was updated on the hive.
--
-- Epic: 14 - Hive Task Management
-- Story: 14.1 - Database Migrations + System Template Seeding

-- Hive tasks table
CREATE TABLE IF NOT EXISTS hive_tasks (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    hive_id TEXT NOT NULL REFERENCES hives(id) ON DELETE CASCADE,
    template_id TEXT REFERENCES task_templates(id),  -- NULL for custom tasks
    custom_title TEXT,  -- Used when no template
    description TEXT,
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    due_date DATE,  -- Optional due date
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'beebrain')),
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_by TEXT REFERENCES users(id),
    completed_at TIMESTAMPTZ,
    completion_data JSONB,  -- Stores prompted values from auto-effects
    auto_applied_changes JSONB  -- Records what was auto-updated on hive
);

-- Index for hive + status queries (most common: "get pending tasks for hive")
CREATE INDEX IF NOT EXISTS idx_hive_tasks_hive_status
    ON hive_tasks(hive_id, status);

-- Partial index for pending tasks with due dates (for due/overdue queries)
CREATE INDEX IF NOT EXISTS idx_hive_tasks_due_date
    ON hive_tasks(due_date)
    WHERE status = 'pending';

-- Index for tenant-wide queries
CREATE INDEX IF NOT EXISTS idx_hive_tasks_tenant
    ON hive_tasks(tenant_id);

-- Index for tenant + status (dashboard queries)
CREATE INDEX IF NOT EXISTS idx_hive_tasks_tenant_status
    ON hive_tasks(tenant_id, status);

-- Index for priority-based queries
CREATE INDEX IF NOT EXISTS idx_hive_tasks_priority
    ON hive_tasks(tenant_id, priority)
    WHERE status = 'pending';

-- Enable Row-Level Security
ALTER TABLE hive_tasks ENABLE ROW LEVEL SECURITY;

-- RLS policy: Tenant isolation
DROP POLICY IF EXISTS hive_tasks_tenant_isolation ON hive_tasks;
CREATE POLICY hive_tasks_tenant_isolation ON hive_tasks
    USING (tenant_id = current_setting('app.tenant_id', true));

-- Comments for documentation
COMMENT ON TABLE hive_tasks IS 'Tasks assigned to hives. Can be template-based or custom.';
COMMENT ON COLUMN hive_tasks.id IS 'Unique identifier (UUID as TEXT)';
COMMENT ON COLUMN hive_tasks.tenant_id IS 'Owning tenant';
COMMENT ON COLUMN hive_tasks.hive_id IS 'Target hive for the task';
COMMENT ON COLUMN hive_tasks.template_id IS 'Optional reference to task_templates. NULL for custom tasks.';
COMMENT ON COLUMN hive_tasks.custom_title IS 'Title for custom tasks without a template';
COMMENT ON COLUMN hive_tasks.description IS 'Optional additional description or notes';
COMMENT ON COLUMN hive_tasks.priority IS 'Task priority: low, medium, high, urgent';
COMMENT ON COLUMN hive_tasks.due_date IS 'Optional due date for the task';
COMMENT ON COLUMN hive_tasks.status IS 'Task status: pending or completed';
COMMENT ON COLUMN hive_tasks.source IS 'Origin of task: manual (user-created) or beebrain (AI-suggested)';
COMMENT ON COLUMN hive_tasks.created_by IS 'User who created the task';
COMMENT ON COLUMN hive_tasks.created_at IS 'Timestamp when task was created';
COMMENT ON COLUMN hive_tasks.completed_by IS 'User who completed the task';
COMMENT ON COLUMN hive_tasks.completed_at IS 'Timestamp when task was completed';
COMMENT ON COLUMN hive_tasks.completion_data IS 'JSONB storing user inputs from template prompts on completion';
COMMENT ON COLUMN hive_tasks.auto_applied_changes IS 'JSONB recording what was auto-updated on hive from template effects';
