-- Migration: 0024_audit_log.sql
-- Create audit_log table for tracking all data changes within a tenant.
--
-- The audit_log provides:
-- - Complete change history for compliance and debugging
-- - Who made what changes and when
-- - Old and new values in JSONB for easy comparison
-- - Tenant isolation via RLS

CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,  -- NULL if user deleted or system action
    action TEXT NOT NULL,                   -- 'create', 'update', 'delete'
    entity_type TEXT NOT NULL,              -- 'inspection', 'hive', 'treatment', etc.
    entity_id TEXT NOT NULL,                -- ID of the affected entity
    old_values JSONB,                       -- Previous state (NULL for create)
    new_values JSONB,                       -- New state (NULL for delete)
    ip_address INET,                        -- Client IP address if available
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Primary performance index: queries by tenant filtered by time
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_created
    ON audit_log(tenant_id, created_at DESC);

-- Secondary index: queries by entity type/id within tenant
CREATE INDEX IF NOT EXISTS idx_audit_log_entity
    ON audit_log(tenant_id, entity_type, entity_id);

-- Index for user activity queries
CREATE INDEX IF NOT EXISTS idx_audit_log_user
    ON audit_log(tenant_id, user_id) WHERE user_id IS NOT NULL;

-- Row Level Security for tenant isolation
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- RLS policies - standard tenant isolation pattern
CREATE POLICY audit_log_tenant_isolation ON audit_log
    USING (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY audit_log_tenant_insert ON audit_log
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- Note: No UPDATE policy - audit logs should be immutable
-- Note: DELETE policy intentionally omitted - audit logs should never be deleted by users
-- Super-admin access for compliance/legal requirements handled at application level

-- Check constraint for valid action values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name = 'chk_audit_log_action'
    ) THEN
        ALTER TABLE audit_log ADD CONSTRAINT chk_audit_log_action
            CHECK (action IN ('create', 'update', 'delete'));
    END IF;
END $$;

COMMENT ON TABLE audit_log IS 'Immutable audit trail of all data changes within a tenant. Used for compliance, debugging, and activity tracking.';
COMMENT ON COLUMN audit_log.old_values IS 'Previous state of entity before change. NULL for create actions.';
COMMENT ON COLUMN audit_log.new_values IS 'New state of entity after change. NULL for delete actions.';
COMMENT ON COLUMN audit_log.ip_address IS 'Client IP address captured at request time. May be NULL for background/system actions.';
