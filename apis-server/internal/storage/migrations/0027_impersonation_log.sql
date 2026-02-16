-- Migration: 0027_impersonation_log.sql
-- Create impersonation_log table for tracking super-admin tenant access.
--
-- This table provides audit trail for super-admin impersonation of tenants.
-- Essential for security compliance and accountability.
--
-- NOTE: No RLS - this is a super-admin only table.
-- Access control enforced at application level.

CREATE TABLE IF NOT EXISTS impersonation_log (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    super_admin_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,                    -- NULL while session is active
    actions_taken INTEGER DEFAULT 0          -- Count of actions during session
);

-- Index for finding active/recent sessions by tenant
CREATE INDEX IF NOT EXISTS idx_impersonation_tenant
    ON impersonation_log(tenant_id);

-- Index for finding sessions by super-admin
CREATE INDEX IF NOT EXISTS idx_impersonation_admin
    ON impersonation_log(super_admin_id);

-- Index for finding active sessions (ended_at IS NULL)
CREATE INDEX IF NOT EXISTS idx_impersonation_active
    ON impersonation_log(super_admin_id, started_at DESC) WHERE ended_at IS NULL;

-- NOTE: No RLS policies
-- Reason: This table is accessible only to super-admins.
-- Access control is strictly enforced at the application level.
-- Super-admins need to see all impersonation records for audit purposes.

COMMENT ON TABLE impersonation_log IS 'Audit trail of super-admin tenant impersonation sessions. No RLS - super-admin only access.';
COMMENT ON COLUMN impersonation_log.super_admin_id IS 'The super-admin user who initiated the impersonation.';
COMMENT ON COLUMN impersonation_log.tenant_id IS 'The tenant being impersonated/accessed.';
COMMENT ON COLUMN impersonation_log.started_at IS 'When the impersonation session began.';
COMMENT ON COLUMN impersonation_log.ended_at IS 'When the session ended. NULL means session is still active.';
COMMENT ON COLUMN impersonation_log.actions_taken IS 'Count of create/update/delete actions performed during session.';
