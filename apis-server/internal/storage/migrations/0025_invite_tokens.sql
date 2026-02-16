-- Migration: 0025_invite_tokens.sql
-- Create invite_tokens table for user invitation management.
--
-- Supports two invitation modes:
-- 1. Direct invite: email is set, token sent to specific user
-- 2. Shareable link: email is NULL, anyone with link can join
--
-- Tokens expire after a configurable period and can only be used once.

CREATE TABLE IF NOT EXISTS invite_tokens (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email TEXT,                              -- NULL for shareable links, set for direct invites
    role TEXT DEFAULT 'member' NOT NULL,     -- Role assigned when invite is accepted
    token TEXT UNIQUE NOT NULL,              -- Cryptographically secure random token
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,  -- Who created the invite
    expires_at TIMESTAMPTZ NOT NULL,         -- Token expiration time
    used_at TIMESTAMPTZ,                     -- When token was used (NULL if unused)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fast token lookups for validation during registration
CREATE INDEX IF NOT EXISTS idx_invite_tokens_token
    ON invite_tokens(token);

-- List invites for a tenant
CREATE INDEX IF NOT EXISTS idx_invite_tokens_tenant
    ON invite_tokens(tenant_id);

-- Find pending invites by email within tenant
CREATE INDEX IF NOT EXISTS idx_invite_tokens_tenant_email
    ON invite_tokens(tenant_id, email) WHERE email IS NOT NULL AND used_at IS NULL;

-- Row Level Security for tenant isolation
ALTER TABLE invite_tokens ENABLE ROW LEVEL SECURITY;

-- RLS policies - standard tenant isolation pattern
CREATE POLICY invite_tokens_tenant_isolation ON invite_tokens
    USING (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY invite_tokens_tenant_insert ON invite_tokens
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY invite_tokens_tenant_update ON invite_tokens
    FOR UPDATE USING (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY invite_tokens_tenant_delete ON invite_tokens
    FOR DELETE USING (tenant_id = current_setting('app.tenant_id', true));

-- Check constraint for valid role values (same as users.role)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name = 'chk_invite_tokens_role'
    ) THEN
        ALTER TABLE invite_tokens ADD CONSTRAINT chk_invite_tokens_role
            CHECK (role IN ('admin', 'member'));
    END IF;
END $$;

COMMENT ON TABLE invite_tokens IS 'Invitation tokens for adding users to a tenant. Supports both direct email invites and shareable links.';
COMMENT ON COLUMN invite_tokens.email IS 'Target email for direct invites. NULL for shareable links that anyone can use.';
COMMENT ON COLUMN invite_tokens.token IS 'Cryptographically secure random token (URL-safe, e.g., 32 random bytes base64-encoded).';
COMMENT ON COLUMN invite_tokens.used_at IS 'Timestamp when token was consumed. NULL means token is still valid (if not expired).';
