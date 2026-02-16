-- E15-C3: RLS policy for org_id fallback lookup.
-- Enables tenant middleware to resolve a user's stored tenant_id
-- when the Keycloak org_id claim is missing from the JWT.
-- Only active when app.org_fallback_mode is explicitly set to 'true'
-- within a transaction (SET LOCAL). Combined with existing
-- tenant_isolation_users policy via OR.
CREATE POLICY users_org_fallback_lookup ON users
  FOR SELECT
  USING (current_setting('app.org_fallback_mode', true) = 'true');
