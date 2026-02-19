-- E15-C3: RLS policy for org_id fallback lookup.
-- Enables tenant middleware to resolve a user's stored tenant_id
-- when the Keycloak org_id claim is missing from the JWT.
-- Only active when app.org_fallback_mode is explicitly set to 'true'
-- within a transaction (SET LOCAL). Combined with existing
-- tenant_isolation_users policy via OR.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'users' AND policyname = 'users_org_fallback_lookup'
    ) THEN
        CREATE POLICY users_org_fallback_lookup ON users
          FOR SELECT
          USING (current_setting('app.org_fallback_mode', true) = 'true');
    END IF;
END $$;
