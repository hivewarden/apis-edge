-- Migration: 0023_dual_auth_users.sql
-- Modify users table to support dual authentication modes (local and Zitadel/SaaS).
--
-- Key changes:
-- - Add password_hash for local authentication (bcrypt hashed)
-- - Make zitadel_user_id nullable for local mode
-- - Add role column for authorization (admin/member)
-- - Add is_active for soft-disable users
-- - Add must_change_password for forced password reset
-- - Add invited_by/invited_at for invitation tracking
-- - Add last_login_at for activity tracking
-- - Add updated_at for audit trails
-- - Rename 'name' to 'display_name' for consistency
--
-- All changes are non-destructive and idempotent.

-- 1. Add password_hash column (NULL in SaaS mode, populated in local mode)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'password_hash'
    ) THEN
        ALTER TABLE users ADD COLUMN password_hash VARCHAR(255);
        COMMENT ON COLUMN users.password_hash IS 'Bcrypt hash of password for local auth mode. NULL when using Zitadel/SaaS auth.';
    END IF;
END $$;

-- 2. Make zitadel_user_id nullable (was NOT NULL UNIQUE)
-- First, drop the NOT NULL constraint if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users'
        AND column_name = 'zitadel_user_id'
        AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE users ALTER COLUMN zitadel_user_id DROP NOT NULL;
    END IF;
END $$;

-- 3. Drop the old UNIQUE constraint on zitadel_user_id and recreate it
-- The old constraint prevented multiple NULLs, but standard SQL UNIQUE allows multiple NULLs
DO $$
BEGIN
    -- First drop the UNIQUE constraint if it exists (this also drops the underlying index)
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'users'
        AND constraint_name = 'users_zitadel_user_id_key'
        AND constraint_type = 'UNIQUE'
    ) THEN
        ALTER TABLE users DROP CONSTRAINT users_zitadel_user_id_key;
    END IF;

    -- Drop the index if it exists separately (shouldn't after dropping constraint, but be safe)
    IF EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'users' AND indexname = 'users_zitadel_user_id_key'
    ) THEN
        DROP INDEX users_zitadel_user_id_key;
    END IF;

    -- Also check for idx_users_zitadel index
    IF EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'users' AND indexname = 'idx_users_zitadel'
    ) THEN
        DROP INDEX idx_users_zitadel;
    END IF;
END $$;

-- Recreate the unique index only for non-null values (allows multiple NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_zitadel_user_id_unique
    ON users(zitadel_user_id) WHERE zitadel_user_id IS NOT NULL;

-- 4. Add role column for authorization
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'role'
    ) THEN
        ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'member' NOT NULL;
        COMMENT ON COLUMN users.role IS 'User role: admin or member. Admin has full tenant access.';
    END IF;
END $$;

-- 5. Add is_active column for soft-disable
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'is_active'
    ) THEN
        ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT true NOT NULL;
        COMMENT ON COLUMN users.is_active IS 'If false, user cannot log in. Allows disabling without deletion.';
    END IF;
END $$;

-- 6. Add must_change_password column for forced password reset
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'must_change_password'
    ) THEN
        ALTER TABLE users ADD COLUMN must_change_password BOOLEAN DEFAULT false NOT NULL;
        COMMENT ON COLUMN users.must_change_password IS 'If true, user must change password at next login (local auth only).';
    END IF;
END $$;

-- 7. Add invited_by column for tracking who invited the user
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'invited_by'
    ) THEN
        ALTER TABLE users ADD COLUMN invited_by TEXT;
        COMMENT ON COLUMN users.invited_by IS 'User ID of the person who invited this user. NULL for first admin.';
    END IF;
END $$;

-- 8. Add invited_at column for tracking when user was invited
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'invited_at'
    ) THEN
        ALTER TABLE users ADD COLUMN invited_at TIMESTAMPTZ;
        COMMENT ON COLUMN users.invited_at IS 'Timestamp when user was invited. NULL for first admin or self-registration.';
    END IF;
END $$;

-- 9. Add last_login_at column for activity tracking
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'last_login_at'
    ) THEN
        ALTER TABLE users ADD COLUMN last_login_at TIMESTAMPTZ;
        COMMENT ON COLUMN users.last_login_at IS 'Timestamp of most recent successful login.';
    END IF;
END $$;

-- 10. Rename 'name' column to 'display_name' for consistency
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'name'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'display_name'
    ) THEN
        ALTER TABLE users RENAME COLUMN name TO display_name;
    END IF;
END $$;

-- 11. Add foreign key constraint for invited_by referencing users(id)
-- First check if it doesn't already exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_users_invited_by' AND table_name = 'users'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT fk_users_invited_by
            FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 12. Add unique constraint on (tenant_id, email) for login lookups in local mode
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_tenant_email_unique
    ON users(tenant_id, email);

-- 13. Add CHECK constraint for role values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name = 'chk_users_role'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT chk_users_role
            CHECK (role IN ('admin', 'member'));
    END IF;
END $$;

-- 14. Add updated_at column with auto-update trigger
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE users ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
        COMMENT ON COLUMN users.updated_at IS 'Timestamp of last modification to user record.';
    END IF;
END $$;

-- Create or replace the trigger function for auto-updating updated_at
CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists, then create (for idempotency)
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_users_updated_at();

-- Add descriptive comment to users table
COMMENT ON TABLE users IS 'User accounts supporting both local authentication (password_hash) and Zitadel/SaaS mode (zitadel_user_id). In local mode, zitadel_user_id is NULL. In SaaS mode, password_hash is NULL.';
