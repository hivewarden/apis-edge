-- Migration: 0030_task_templates.sql
-- Creates task_templates table for storing predefined and custom task templates.
--
-- Task templates define reusable task types that can be applied to hives.
-- System templates (tenant_id IS NULL) are available to all tenants.
-- Tenant templates are scoped to a specific tenant.
--
-- auto_effects JSONB stores:
--   - prompts[]: User inputs required when completing the task
--   - updates[]: Hive fields to update on task completion
--   - creates[]: Records to create (feeding, treatment, harvest, etc.)
--
-- Epic: 14 - Hive Task Management
-- Story: 14.1 - Database Migrations + System Template Seeding

-- Task templates table
CREATE TABLE IF NOT EXISTS task_templates (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL for system templates
    type TEXT NOT NULL CHECK (type IN (
        'requeen', 'add_frame', 'remove_frame', 'harvest_frames',
        'add_feed', 'treatment', 'add_brood_box', 'add_honey_super',
        'remove_box', 'custom'
    )),
    name TEXT NOT NULL,
    description TEXT,
    auto_effects JSONB DEFAULT '{}',
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT REFERENCES users(id)  -- NULL for system templates
);

-- Unique constraint: one template per type per tenant (for non-system templates only)
-- System templates are not restricted by this constraint since tenant_id is NULL
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_templates_tenant_type
    ON task_templates(tenant_id, type)
    WHERE tenant_id IS NOT NULL;

-- Index for fast tenant lookups
CREATE INDEX IF NOT EXISTS idx_task_templates_tenant
    ON task_templates(tenant_id);

-- Index for system template lookups
CREATE INDEX IF NOT EXISTS idx_task_templates_system
    ON task_templates(is_system)
    WHERE is_system = TRUE;

-- Enable Row-Level Security
ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;

-- RLS policy: Allow access to tenant's own templates OR system templates (tenant_id IS NULL)
DROP POLICY IF EXISTS task_templates_access ON task_templates;
CREATE POLICY task_templates_access ON task_templates
    USING (
        tenant_id IS NULL  -- System templates visible to all
        OR tenant_id = current_setting('app.tenant_id', true)  -- Tenant templates
    );

-- Comments for documentation
COMMENT ON TABLE task_templates IS 'Predefined and custom task templates for hive management. System templates (tenant_id NULL) available to all.';
COMMENT ON COLUMN task_templates.id IS 'Unique identifier (UUID as TEXT for YugabyteDB compatibility)';
COMMENT ON COLUMN task_templates.tenant_id IS 'Owning tenant. NULL for system-wide templates.';
COMMENT ON COLUMN task_templates.type IS 'Template type: requeen, add_frame, remove_frame, harvest_frames, add_feed, treatment, add_brood_box, add_honey_super, remove_box, custom';
COMMENT ON COLUMN task_templates.name IS 'Display name for the template';
COMMENT ON COLUMN task_templates.description IS 'Optional description of what this task accomplishes';
COMMENT ON COLUMN task_templates.auto_effects IS 'JSONB defining prompts[], updates[], and creates[] for task completion';
COMMENT ON COLUMN task_templates.is_system IS 'TRUE for system-provided templates, FALSE for tenant-created';
COMMENT ON COLUMN task_templates.created_at IS 'Timestamp when template was created';
COMMENT ON COLUMN task_templates.created_by IS 'User who created the template. NULL for system templates.';
