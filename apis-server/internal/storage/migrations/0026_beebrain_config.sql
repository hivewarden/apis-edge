-- Migration: 0026_beebrain_config.sql
-- Create beebrain_config table for AI backend configuration.
--
-- BeeBrain supports three backend modes:
-- 1. 'rules': Built-in rule engine (no AI, fully deterministic)
-- 2. 'local': Local LLM (Ollama, vLLM, etc.) at specified endpoint
-- 3. 'external': External API (OpenAI, Anthropic, etc.) requiring API key
--
-- Configuration hierarchy:
-- - System default: tenant_id IS NULL (one row max)
-- - Tenant override: tenant_id is set (requires is_tenant_override=true in SaaS mode)

CREATE TABLE IF NOT EXISTS beebrain_config (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = system default
    backend TEXT NOT NULL,                   -- 'rules', 'local', 'external'
    provider TEXT,                           -- 'openai', 'anthropic', 'ollama', etc. (NULL for rules)
    endpoint TEXT,                           -- Local model endpoint URL (NULL for rules/external)
    api_key_encrypted TEXT,                  -- Encrypted API key for external providers
    model TEXT,                              -- Model name (e.g., 'gpt-4', 'claude-3-opus')
    is_tenant_override BOOLEAN DEFAULT false, -- True if tenant has BYOK enabled
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure only one config per tenant (including NULL for system default)
-- COALESCE trick: convert NULL to a placeholder for uniqueness check
CREATE UNIQUE INDEX IF NOT EXISTS idx_beebrain_config_tenant_unique
    ON beebrain_config(COALESCE(tenant_id, '__SYSTEM_DEFAULT__'));

-- Index for tenant lookups
CREATE INDEX IF NOT EXISTS idx_beebrain_config_tenant
    ON beebrain_config(tenant_id) WHERE tenant_id IS NOT NULL;

-- Check constraint for valid backend values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name = 'chk_beebrain_config_backend'
    ) THEN
        ALTER TABLE beebrain_config ADD CONSTRAINT chk_beebrain_config_backend
            CHECK (backend IN ('rules', 'local', 'external'));
    END IF;
END $$;

-- NOTE: No RLS on this table
-- Reason: This table contains both system-wide config (tenant_id=NULL) and tenant overrides.
-- Access control is enforced at the application level:
-- - Super-admin can read/write all configs
-- - Tenant admins can only read/write their own config if BYOK is enabled
-- - Regular users cannot access this table

-- Create or replace the trigger function for auto-updating updated_at
CREATE OR REPLACE FUNCTION update_beebrain_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists, then create (for idempotency)
DROP TRIGGER IF EXISTS trg_beebrain_config_updated_at ON beebrain_config;

CREATE TRIGGER trg_beebrain_config_updated_at
    BEFORE UPDATE ON beebrain_config
    FOR EACH ROW
    EXECUTE FUNCTION update_beebrain_config_updated_at();

-- Insert system default configuration (rules backend, no AI)
-- Only insert if no system default exists
INSERT INTO beebrain_config (tenant_id, backend, provider, endpoint, api_key_encrypted, model, is_tenant_override)
SELECT NULL, 'rules', NULL, NULL, NULL, NULL, false
WHERE NOT EXISTS (
    SELECT 1 FROM beebrain_config WHERE tenant_id IS NULL
);

COMMENT ON TABLE beebrain_config IS 'BeeBrain AI backend configuration. Supports rule-based, local LLM, and external API backends.';
COMMENT ON COLUMN beebrain_config.tenant_id IS 'Tenant this config belongs to. NULL for system-wide default.';
COMMENT ON COLUMN beebrain_config.backend IS 'Backend type: rules (deterministic), local (self-hosted LLM), external (API-based).';
COMMENT ON COLUMN beebrain_config.provider IS 'Provider name for external/local: openai, anthropic, ollama, vllm, etc.';
COMMENT ON COLUMN beebrain_config.endpoint IS 'Endpoint URL for local LLM. NULL for external providers (use their default endpoints).';
COMMENT ON COLUMN beebrain_config.api_key_encrypted IS 'Encrypted API key for external providers. Encryption handled at application level.';
COMMENT ON COLUMN beebrain_config.model IS 'Model identifier (e.g., gpt-4, claude-3-opus, llama-3-70b).';
COMMENT ON COLUMN beebrain_config.is_tenant_override IS 'True if tenant has Bring-Your-Own-Key enabled and this is their custom config.';
