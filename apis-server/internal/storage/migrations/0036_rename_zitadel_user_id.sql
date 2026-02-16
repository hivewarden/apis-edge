-- Migration: 0036_rename_zitadel_user_id.sql
-- Rename zitadel_user_id column to external_user_id.
-- This is a non-destructive rename as part of the Keycloak migration (Epic 15).
-- The column stores the OIDC "sub" claim from whichever external IdP is configured.

-- 1. Rename the column
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'zitadel_user_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'external_user_id'
    ) THEN
        ALTER TABLE users RENAME COLUMN zitadel_user_id TO external_user_id;
    END IF;
END $$;

-- 2. Drop old partial unique index and recreate with new column name
DROP INDEX IF EXISTS idx_users_zitadel_user_id_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_external_user_id_unique
    ON users(external_user_id) WHERE external_user_id IS NOT NULL;

-- 3. Update table comment
COMMENT ON TABLE users IS 'User accounts supporting both local authentication (password_hash) and external OIDC mode (external_user_id). In local mode, external_user_id is NULL. In SaaS/Keycloak mode, password_hash is NULL.';

-- 4. Update column comment
COMMENT ON COLUMN users.external_user_id IS 'OIDC sub claim from external identity provider (Keycloak). NULL for local auth users.';
