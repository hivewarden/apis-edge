# Story 15.7: Docker Compose & Keycloak Realm Setup

Status: ready-for-dev

## Story

As a platform operator,
I want the Docker Compose SaaS profile to start Keycloak instead of Zitadel and automatically import a pre-configured realm,
so that `docker compose --profile saas up` provides a ready-to-use identity provider with correct client settings, roles, and protocol mappers.

## Context

This is Story 7 in Epic 15 (Keycloak Migration). It is an **infrastructure story** with no dependencies on the backend or frontend code changes (Stories 15.1-15.6). It can be developed in parallel with all other stories.

The current docker-compose.yml contains these Zitadel-related services that must be removed:
- `zitadel-db` -- Postgres database dedicated to Zitadel
- `zitadel-bootstrap-init` -- Volume permission setup for bootstrap
- `zitadel` -- The Zitadel identity provider itself
- `zitadel-bootstrap` -- Node.js script that creates OIDC app via Zitadel Management API

These are replaced by a single `keycloak` service that uses Keycloak's `--import-realm` feature to set up the realm declaratively from a JSON file -- no imperative bootstrap scripts needed.

**Key design decisions:**
- Keycloak uses the existing YugabyteDB instance (via JDBC) rather than a separate Postgres instance. This eliminates the `zitadel-db` service entirely.
- Realm import is idempotent via `--import-realm` -- it creates the realm on first start and skips if it already exists.
- The `start-dev` command is used for development. Production deployments would use `start --optimized` with a custom build, but that is out of scope for this story.
- The `keycloak` service is only in the `saas` profile -- standalone mode is completely unaffected.

**Keycloak version rationale:** Keycloak 26.0 is the latest stable release that includes Organizations (GA since v25). The Organizations feature is required for the `org_id` / `org_name` custom claim mappers used by the tenant middleware (Story 15.4).

**Relationship to other stories:**
- Story 15.8 (Environment Templates & CLAUDE.md) depends on this story to update `.env.saas.example` and CLAUDE.md references
- Stories 15.1-15.6 are independent -- they update Go/React code that consumes Keycloak JWTs but do not interact with docker-compose infrastructure

## Acceptance Criteria

1. **Zitadel Services Removed:** `zitadel-db`, `zitadel-bootstrap-init`, `zitadel`, and `zitadel-bootstrap` services removed from `docker-compose.yml`
2. **Zitadel Volumes Removed:** `zitadel_db_data` and `zitadel_bootstrap` volumes removed from `docker-compose.yml`
3. **Keycloak Service Added:** New `keycloak` service added with `profiles: ["saas"]`, using `quay.io/keycloak/keycloak:26.0` image
4. **Keycloak Uses YugabyteDB:** Keycloak connects to the existing `yugabytedb` service via JDBC (port 5433), not a separate database
5. **Keycloak Database Created:** `scripts/init-yugabytedb.sh` updated to create `keycloak` database and role alongside `apis` database
6. **Realm Import Configured:** Keycloak uses `start-dev --import-realm` command with realm file mounted at `/opt/keycloak/data/import`
7. **Realm File Created:** `keycloak/realm-honeybee.json` contains the `honeybee` realm configuration
8. **Client Configuration Correct:** `apis-dashboard` client is public, with Standard Flow enabled, Direct Access Grants **disabled** (NFR-KC-04), and PKCE S256 enforced (NFR-KC-05)
9. **Roles Defined:** Realm roles `admin`, `user`, and `viewer` are defined in the realm file
10. **Client Scopes Configured:** `roles` client scope includes realm-roles mapper so `realm_access.roles` appears in JWTs
11. **Custom Mappers Defined:** `org_id` and `org_name` protocol mappers are defined for the Organization claim
12. **Token Lifetimes Configured:** Access token = 15 minutes, SSO session idle = 12 hours, SSO session max = 72 hours (per PRD Section 3.5)
13. **Admin Console Accessible:** Keycloak Admin Console accessible at `localhost:8081`
14. **Standalone Mode Unchanged:** `docker compose --profile standalone up` starts without Keycloak -- no Keycloak service, no Keycloak database
15. **Server Entrypoint Updated:** `apis-server` entrypoint no longer loads `zitadel.env` bootstrap file
16. **Dashboard Zitadel Bootstrap Removed:** `apis-dashboard` no longer mounts `zitadel_bootstrap` volume or loads `zitadel.env`
17. **Comments Updated:** All AI/LLM context comments in `docker-compose.yml` updated from Zitadel to Keycloak references
18. **Healthcheck Configured:** Keycloak service has a healthcheck for service readiness
19. **Network Correct:** Keycloak is on `apis-network` with correct depends_on for `yugabytedb`

## Tasks / Subtasks

- [ ] **Task 1: Remove Zitadel services from docker-compose.yml** (AC: #1, #2)
  - [ ] 1.1: Remove the `zitadel-db` service block (lines 263-291 approximately) -- the dedicated Postgres for Zitadel
  - [ ] 1.2: Remove the `zitadel-bootstrap-init` service block -- Alpine container that sets bootstrap volume permissions
  - [ ] 1.3: Remove the `zitadel` service block -- the Zitadel identity provider
  - [ ] 1.4: Remove the `zitadel-bootstrap` service block -- the Node.js OIDC app creator
  - [ ] 1.5: Remove `zitadel_db_data` from the `volumes:` section at bottom of file
  - [ ] 1.6: Remove `zitadel_bootstrap` from the `volumes:` section at bottom of file

- [ ] **Task 2: Update apis-server service** (AC: #15, #17)
  - [ ] 2.1: In the environment section, replace Zitadel config block with Keycloak:
    ```yaml
    # =========================================================================
    # KEYCLOAK (SaaS Mode Only)
    # AI/LLM Context: Only used when AUTH_MODE=keycloak.
    # Standalone mode ignores these even if set.
    # =========================================================================
    - KEYCLOAK_ISSUER=${KEYCLOAK_ISSUER:-http://keycloak:8080/realms/honeybee}
    - KEYCLOAK_CLIENT_ID=${KEYCLOAK_CLIENT_ID:-apis-dashboard}
    ```
  - [ ] 2.2: Remove the `ZITADEL_ISSUER`, `ZITADEL_DISCOVERY_URL`, and `ZITADEL_CLIENT_ID` environment variables
  - [ ] 2.3: Remove the `zitadel_bootstrap:/bootstrap:ro` volume mount from apis-server
  - [ ] 2.4: Replace the entrypoint that loads `zitadel.env` with a simple exec:
    ```yaml
    command: ["/app/apis-server"]
    ```
    Remove the custom entrypoint entirely since there is no bootstrap env file to load.
  - [ ] 2.5: Update the `AUTH_MODE` comment: `"local" (standalone) or "zitadel" (saas)` -> `"local" (standalone) or "keycloak" (saas)`
  - [ ] 2.6: Update top-of-file comment block: replace "Zitadel" with "Keycloak" in the SAAS MODE description (approximately line 19-20)
  - [ ] 2.7: Update inline comment on line 92: `"SaaS: Uses OpenBao for secrets, Zitadel auth"` -> `"SaaS: Uses OpenBao for secrets, Keycloak auth"`

- [ ] **Task 3: Update apis-dashboard service** (AC: #16, #17)
  - [ ] 3.1: Remove `zitadel_bootstrap:/bootstrap:ro` volume mount
  - [ ] 3.2: Replace Zitadel environment variables with Keycloak:
    ```yaml
    # Keycloak config (SaaS mode, ignored in standalone)
    - VITE_KEYCLOAK_AUTHORITY=${KEYCLOAK_ISSUER:-http://localhost:8081/realms/honeybee}
    - VITE_KEYCLOAK_CLIENT_ID=${KEYCLOAK_CLIENT_ID:-apis-dashboard}
    ```
  - [ ] 3.3: Remove `VITE_ZITADEL_ISSUER` and `VITE_ZITADEL_CLIENT_ID` environment variables
  - [ ] 3.4: Simplify dashboard command -- remove the `zitadel.env` loading block:
    ```yaml
    command: ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
    ```
  - [ ] 3.5: Update inline comment: `"Zitadel config (SaaS mode, ignored in standalone)"` -> `"Keycloak config (SaaS mode, ignored in standalone)"`

- [ ] **Task 4: Add Keycloak service to docker-compose.yml** (AC: #3, #4, #6, #13, #18, #19)
  - [ ] 4.1: Add the `keycloak` service in the SAAS-ONLY SERVICES section (replacing the Zitadel services):
    ```yaml
    # Keycloak Identity Provider (SaaS only)
    # AI/LLM Context: Keycloak provides OIDC authentication for SaaS mode.
    # Uses the honeybee realm with pre-configured client, roles, and mappers.
    # Realm is imported from keycloak/realm-honeybee.json on first start.
    keycloak:
      image: quay.io/keycloak/keycloak:26.0
      container_name: apis-keycloak
      profiles: ["saas"]
      command: start-dev --import-realm
      ports:
        - "8081:8080"
      environment:
        - KEYCLOAK_ADMIN=${KEYCLOAK_ADMIN:-admin}
        - KEYCLOAK_ADMIN_PASSWORD=${KEYCLOAK_ADMIN_PASSWORD:-admin}
        - KC_DB=postgres
        - KC_DB_URL=jdbc:postgresql://yugabytedb:5433/keycloak
        - KC_DB_USERNAME=${KEYCLOAK_DB_USER:-keycloak}
        - KC_DB_PASSWORD=${KEYCLOAK_DB_PASSWORD:-keycloak}
        - KC_HEALTH_ENABLED=true
        - KC_HOSTNAME_STRICT=false
        - KC_HTTP_ENABLED=true
      volumes:
        - ./keycloak:/opt/keycloak/data/import:ro
      healthcheck:
        test: ["CMD-SHELL", "exec 3<>/dev/tcp/127.0.0.1/8080 && echo -e 'GET /health/ready HTTP/1.1\\r\\nHost: localhost\\r\\nConnection: close\\r\\n\\r\\n' >&3 && cat <&3 | grep -q '200 OK'"]
        interval: 30s
        timeout: 10s
        retries: 5
        start_period: 60s
      depends_on:
        yugabytedb-init:
          condition: service_completed_successfully
      networks:
        - apis-network
    ```
  - [ ] 4.2: Port mapping is `8081:8080` -- Keycloak runs on 8080 internally, exposed on 8081 to avoid conflict with any other service. This is the Admin Console port.
  - [ ] 4.3: `KC_HEALTH_ENABLED=true` enables the `/health/ready` endpoint for the healthcheck
  - [ ] 4.4: `KC_HOSTNAME_STRICT=false` and `KC_HTTP_ENABLED=true` are required for development mode (no TLS). Production would use `KC_HOSTNAME` with a proper domain.
  - [ ] 4.5: `depends_on: yugabytedb-init` ensures the keycloak database exists before Keycloak tries to connect
  - [ ] 4.6: The realm import volume is mounted read-only (`:ro`)

- [ ] **Task 5: Create keycloak/realm-honeybee.json** (AC: #7, #8, #9, #10, #11, #12)
  - [ ] 5.1: Create directory `keycloak/` at the repository root
  - [ ] 5.2: Create `keycloak/realm-honeybee.json` with the following structure:

    **Realm-level settings:**
    ```json
    {
      "realm": "honeybee",
      "enabled": true,
      "registrationAllowed": false,
      "resetPasswordAllowed": true,
      "rememberMe": true,
      "loginWithEmailAllowed": true,
      "duplicateEmailsAllowed": false,
      "accessTokenLifespan": 900,
      "ssoSessionIdleTimeout": 43200,
      "ssoSessionMaxLifespan": 259200,
      "organizationsEnabled": true
    }
    ```
    - `accessTokenLifespan`: 900 seconds = 15 minutes (PRD Section 3.5)
    - `ssoSessionIdleTimeout`: 43200 seconds = 12 hours (PRD Section 3.5)
    - `ssoSessionMaxLifespan`: 259200 seconds = 72 hours (PRD Section 3.5)
    - `registrationAllowed: false` -- users are created by admins or via invite flow
    - `organizationsEnabled: true` -- enables the Organizations feature for multi-tenant `org_id` claims

  - [ ] 5.3: Define realm roles:
    ```json
    "roles": {
      "realm": [
        {
          "name": "admin",
          "description": "Full administrative access to tenant resources"
        },
        {
          "name": "user",
          "description": "Standard user with read/write access to hive data"
        },
        {
          "name": "viewer",
          "description": "Read-only access to hive data and dashboards"
        }
      ]
    }
    ```

  - [ ] 5.4: Define default roles assigned to new users:
    ```json
    "defaultRoles": ["user"]
    ```
    Or via the `defaultRole` composite in Keycloak 26:
    ```json
    "defaultDefaultClientScopes": ["roles", "profile", "email", "web-origins"]
    ```

  - [ ] 5.5: Define the `apis-dashboard` client:
    ```json
    "clients": [
      {
        "clientId": "apis-dashboard",
        "name": "APIS Dashboard",
        "description": "APIS beekeeping dashboard - public SPA client",
        "enabled": true,
        "publicClient": true,
        "standardFlowEnabled": true,
        "directAccessGrantsEnabled": false,
        "implicitFlowEnabled": false,
        "serviceAccountsEnabled": false,
        "protocol": "openid-connect",
        "rootUrl": "${DASHBOARD_ORIGIN:-http://localhost:5173}",
        "baseUrl": "/",
        "redirectUris": [
          "http://localhost:5173/callback",
          "https://app.apis.honeybeegood.be/callback"
        ],
        "webOrigins": [
          "http://localhost:5173",
          "https://app.apis.honeybeegood.be"
        ],
        "attributes": {
          "pkce.code.challenge.method": "S256",
          "post.logout.redirect.uris": "http://localhost:5173/login##https://app.apis.honeybeegood.be/login"
        },
        "fullScopeAllowed": false,
        "defaultClientScopes": [
          "profile",
          "email",
          "roles",
          "web-origins"
        ],
        "optionalClientScopes": [
          "offline_access"
        ]
      }
    ]
    ```
    - `publicClient: true` -- SPAs cannot hold a client secret (PRD Section 3.4)
    - `standardFlowEnabled: true` -- Authorization Code + PKCE flow (PRD Section 3.4)
    - `directAccessGrantsEnabled: false` -- OAuth 2.1 compliance, password grant prohibited (NFR-KC-04)
    - `pkce.code.challenge.method: "S256"` -- Enforced, not just supported (NFR-KC-05)
    - `fullScopeAllowed: false` -- Least privilege (PRD Section 3.4)
    - Both localhost (dev) and production redirect URIs included

  - [ ] 5.6: Define client scopes with realm roles mapper:
    ```json
    "clientScopes": [
      {
        "name": "roles",
        "description": "OpenID Connect scope for roles",
        "protocol": "openid-connect",
        "attributes": {
          "include.in.token.scope": "false",
          "display.on.consent.screen": "true",
          "consent.screen.text": "Your roles"
        },
        "protocolMappers": [
          {
            "name": "realm roles",
            "protocol": "openid-connect",
            "protocolMapper": "oidc-usermodel-realm-role-mapper",
            "consentRequired": false,
            "config": {
              "multivalued": "true",
              "userinfo.token.claim": "true",
              "id.token.claim": "true",
              "access.token.claim": "true",
              "claim.name": "realm_access.roles",
              "jsonType.label": "String"
            }
          },
          {
            "name": "client roles",
            "protocol": "openid-connect",
            "protocolMapper": "oidc-usermodel-client-role-mapper",
            "consentRequired": false,
            "config": {
              "multivalued": "true",
              "userinfo.token.claim": "true",
              "id.token.claim": "true",
              "access.token.claim": "true",
              "claim.name": "resource_access.${client_id}.roles",
              "jsonType.label": "String"
            }
          }
        ]
      }
    ]
    ```
    **Critical:** Without the realm roles mapper, roles will silently be absent from JWTs. This is the #1 Keycloak integration pitfall (PRD Section 3.4).

  - [ ] 5.7: Define custom protocol mappers for Organization claims (`org_id`, `org_name`):
    ```json
    "components": {
      "org.keycloak.protocol.oidc.mappers.OIDCProtocolMapper": [
        {
          "name": "org_id",
          "providerId": "oidc-organization-idp-mapper",
          "subType": "authenticated",
          "config": {
            "claim.name": "org_id",
            "id.token.claim": "true",
            "access.token.claim": "true",
            "userinfo.token.claim": "true"
          }
        },
        {
          "name": "org_name",
          "providerId": "oidc-organization-idp-mapper",
          "subType": "authenticated",
          "config": {
            "claim.name": "org_name",
            "claim.value": "name",
            "id.token.claim": "true",
            "access.token.claim": "true",
            "userinfo.token.claim": "true"
          }
        }
      ]
    }
    ```
    **Note on Organization mappers:** Keycloak 26 Organizations are relatively new. The exact mapper `providerId` may need to be validated against the running Keycloak instance. If `oidc-organization-idp-mapper` is not available, use a `oidc-usermodel-attribute-mapper` with a user attribute `org_id` as a fallback. The important thing is that `org_id` appears as a top-level claim in the JWT. See Risk 2 in the PRD addendum.

    **Fallback approach (if Organizations mapper not available in realm import):**
    Define the mapper at the client scope level instead:
    ```json
    {
      "name": "org_id",
      "protocol": "openid-connect",
      "protocolMapper": "oidc-usermodel-attribute-mapper",
      "consentRequired": false,
      "config": {
        "user.attribute": "org_id",
        "claim.name": "org_id",
        "id.token.claim": "true",
        "access.token.claim": "true",
        "userinfo.token.claim": "true",
        "jsonType.label": "String"
      }
    }
    ```

  - [ ] 5.8: Include a development test user in the realm export for easier local testing:
    ```json
    "users": [
      {
        "username": "admin@apis.local",
        "email": "admin@apis.local",
        "emailVerified": true,
        "enabled": true,
        "firstName": "Admin",
        "lastName": "User",
        "credentials": [
          {
            "type": "password",
            "value": "admin",
            "temporary": false
          }
        ],
        "realmRoles": ["admin", "user"],
        "attributes": {
          "org_id": ["dev-tenant-001"],
          "org_name": ["Development Apiary"]
        }
      }
    ]
    ```
    **Security note:** This test user is for development only. Production Keycloak instances should not use realm import for user creation. The `admin` password is intentionally weak for local dev -- production users are managed through the Keycloak Admin Console or invite flow.

- [ ] **Task 6: Update init-yugabytedb.sh to create keycloak database** (AC: #5, #14)
  - [ ] 6.1: Add environment variables to the script header:
    ```sh
    KEYCLOAK_DB_USER="${KEYCLOAK_DB_USER:-keycloak}"
    KEYCLOAK_DB_PASSWORD="${KEYCLOAK_DB_PASSWORD:-keycloak}"
    ```
  - [ ] 6.2: After the APIS database creation block, add Keycloak database creation:
    ```sh
    # Create Keycloak application role (if running in SaaS mode)
    if [ -n "${KEYCLOAK_DB_USER}" ]; then
        echo "Ensuring ${KEYCLOAK_DB_USER} role exists..."
        PGPASSWORD="$YSQL_PASSWORD" psql -h "$YSQL_HOST" -p "$YSQL_PORT" -U "$YSQL_USER" -d yugabyte -c "
            SELECT 'User ${KEYCLOAK_DB_USER} exists' WHERE EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${KEYCLOAK_DB_USER}');
        " | grep -q "exists" || {
            PGPASSWORD="$YSQL_PASSWORD" psql -h "$YSQL_HOST" -p "$YSQL_PORT" -U "$YSQL_USER" -d yugabyte -c "CREATE USER ${KEYCLOAK_DB_USER} WITH PASSWORD '${KEYCLOAK_DB_PASSWORD}';"
            echo "Created ${KEYCLOAK_DB_USER} role"
        }
        PGPASSWORD="$YSQL_PASSWORD" psql -h "$YSQL_HOST" -p "$YSQL_PORT" -U "$YSQL_USER" -d yugabyte -c "ALTER USER ${KEYCLOAK_DB_USER} WITH PASSWORD '${KEYCLOAK_DB_PASSWORD}';"

        # Create keycloak database if it doesn't exist
        echo "Creating keycloak database..."
        PGPASSWORD="$YSQL_PASSWORD" psql -h "$YSQL_HOST" -p "$YSQL_PORT" -U "$YSQL_USER" -d yugabyte -c "
            SELECT 'Database keycloak exists' WHERE EXISTS (SELECT FROM pg_database WHERE datname = 'keycloak');
        " | grep -q "exists" || {
            PGPASSWORD="$YSQL_PASSWORD" psql -h "$YSQL_HOST" -p "$YSQL_PORT" -U "$YSQL_USER" -d yugabyte -c "CREATE DATABASE keycloak OWNER ${KEYCLOAK_DB_USER};"
            echo "Created keycloak database"
        }

        # Ensure ownership + privileges
        PGPASSWORD="$YSQL_PASSWORD" psql -h "$YSQL_HOST" -p "$YSQL_PORT" -U "$YSQL_USER" -d yugabyte -c "ALTER DATABASE keycloak OWNER TO ${KEYCLOAK_DB_USER};"
        PGPASSWORD="$YSQL_PASSWORD" psql -h "$YSQL_HOST" -p "$YSQL_PORT" -U "$YSQL_USER" -d yugabyte -c "GRANT ALL PRIVILEGES ON DATABASE keycloak TO ${KEYCLOAK_DB_USER};"
        echo "Keycloak database ready"
    fi
    ```
  - [ ] 6.3: The conditional `if [ -n "${KEYCLOAK_DB_USER}" ]` ensures standalone mode (which does not set this variable) skips Keycloak database creation entirely
  - [ ] 6.4: Update the `yugabytedb-init` service in docker-compose.yml to pass the new environment variables:
    ```yaml
    - KEYCLOAK_DB_USER=${KEYCLOAK_DB_USER:-keycloak}
    - KEYCLOAK_DB_PASSWORD=${KEYCLOAK_DB_PASSWORD:-keycloak}
    ```

- [ ] **Task 7: Update docker-compose.yml comments and header** (AC: #17)
  - [ ] 7.1: Update the header comment block (lines 1-30):
    - Line 19: `"Full stack including Zitadel, OpenBao, (BunkerWeb optional)"` -> `"Full stack including Keycloak, OpenBao, (BunkerWeb optional)"`
    - Line 20: `"Auth: Zitadel OIDC (AUTH_MODE=zitadel)"` -> `"Auth: Keycloak OIDC (AUTH_MODE=keycloak)"`
    - Line 15: `"No external dependencies (no Zitadel, no OpenBao)"` -> `"No external dependencies (no Keycloak, no OpenBao)"`
  - [ ] 7.2: Update the SAAS-ONLY SERVICES section header:
    - `"Standalone mode does not need identity provider or secrets vault."` -- keep as-is (still accurate)
  - [ ] 7.3: Update `apis-server` inline comments referencing Zitadel (see Task 2.5, 2.6, 2.7)

- [ ] **Task 8: Verify standalone mode isolation** (AC: #14)
  - [ ] 8.1: Confirm `keycloak` service has `profiles: ["saas"]` -- will NOT start with `--profile standalone`
  - [ ] 8.2: Confirm `yugabytedb-init` still runs in both profiles `["standalone", "saas"]` -- the Keycloak database creation is conditional
  - [ ] 8.3: Confirm no Keycloak-specific environment variables are required for standalone mode to function
  - [ ] 8.4: Confirm standalone `.env.standalone.example` does not need modification (deferred to Story 15.8)

- [ ] **Task 9: Verify the complete docker-compose.yml** (AC: all)
  - [ ] 9.1: Run `docker compose --profile standalone config` to verify standalone mode config is valid YAML and has no Keycloak references in services
  - [ ] 9.2: Run `docker compose --profile saas config` to verify SaaS mode config is valid YAML and includes Keycloak
  - [ ] 9.3: Verify no `zitadel` references remain in docker-compose.yml (case-insensitive grep)
  - [ ] 9.4: Verify `keycloak/realm-honeybee.json` is valid JSON (`python3 -m json.tool keycloak/realm-honeybee.json`)

## Dev Notes

### Architecture Compliance

**Project Structure (from CLAUDE.md):**
- Docker Compose at repository root: `docker-compose.yml`
- Init scripts in `scripts/`: `scripts/init-yugabytedb.sh`
- New Keycloak config: `keycloak/realm-honeybee.json` (new directory)

**Dual-Mode Design (from CLAUDE.md):**
- Standalone profile: `apis-server`, `apis-dashboard`, `yugabytedb`, `yugabytedb-init`
- SaaS profile: All standalone services + `keycloak`, `openbao`, `openbao-bootstrap`
- Profile isolation is the primary mechanism -- services without the correct profile simply do not start

### Keycloak start-dev vs start

`start-dev` is used for the development Docker Compose:
- Disables caching for faster iteration
- Allows HTTP (no TLS required)
- Does not require a production build step
- Accepts `--import-realm` for declarative realm setup

Production deployments (out of scope) would use:
```
keycloak build --features=organization
keycloak start --optimized
```

### Realm Import Behavior

Keycloak's `--import-realm` flag:
- Reads all `.json` files from `/opt/keycloak/data/import/`
- Creates realm if it does not exist
- Does NOT overwrite an existing realm (safe for restarts)
- Client configuration, roles, and mappers are all included
- Users defined in the import are only created on first import

If changes are needed to the realm after initial import, they must be made via the Admin Console (localhost:8081) or by deleting the realm first. This is expected development behavior.

### PKCE Enforcement

The `pkce.code.challenge.method: "S256"` attribute on the client ensures that:
- All authorization requests MUST include a `code_challenge` parameter
- Only `S256` method is accepted (not `plain`)
- Requests without PKCE are rejected with an error

This enforces NFR-KC-05 at the Keycloak level. The `oidc-client-ts` library in the dashboard automatically generates PKCE challenges.

### Direct Access Grants

Setting `directAccessGrantsEnabled: false` ensures:
- The Resource Owner Password Credentials (ROPC) grant is disabled
- Users cannot authenticate by sending username/password directly to the token endpoint
- Only the Authorization Code flow (with PKCE) is accepted
- This enforces NFR-KC-04 and aligns with OAuth 2.1 best practices

### Token Lifetime Values

| Setting | Value | Seconds | Keycloak JSON Key |
|---------|-------|---------|--------------------|
| Access token | 15 min | 900 | `accessTokenLifespan` |
| SSO session idle | 12 hours | 43200 | `ssoSessionIdleTimeout` |
| SSO session max | 72 hours | 259200 | `ssoSessionMaxLifespan` |

These match the PRD addendum Section 3.5. Refresh token rotation is handled at the client level via `oidc-client-ts` (configured in Story 15.5).

### Organization Mappers Caveat

Keycloak Organizations (GA since v25) provide the `org_id` claim. However, the realm import JSON format for Organization-specific protocol mappers may vary between Keycloak versions. The story includes both:
1. **Primary approach:** Organization-specific protocol mapper (`oidc-organization-idp-mapper`)
2. **Fallback approach:** User attribute mapper (`oidc-usermodel-attribute-mapper` with `org_id` user attribute)

The developer should test with the running Keycloak 26.0 instance to determine which mapper type works correctly in the realm import. Both approaches produce the same result: an `org_id` claim in the JWT.

### Healthcheck Explanation

The healthcheck uses a raw TCP approach because Keycloak's Docker image does not include `curl` or `wget`:
```yaml
test: ["CMD-SHELL", "exec 3<>/dev/tcp/127.0.0.1/8080 && echo -e 'GET /health/ready HTTP/1.1\\r\\nHost: localhost\\r\\nConnection: close\\r\\n\\r\\n' >&3 && cat <&3 | grep -q '200 OK'"]
```
This checks the `/health/ready` endpoint (enabled by `KC_HEALTH_ENABLED=true`). An alternative simpler approach that may also work:
```yaml
test: ["CMD-SHELL", "cat < /dev/null > /dev/tcp/127.0.0.1/8080"]
```
The developer should test which approach is more reliable. The important thing is that `depends_on` with `condition: service_healthy` works correctly for services that need Keycloak to be ready.

### Why No Separate Bootstrap Script

Unlike Zitadel (which required a separate `zitadel-bootstrap` Node.js container to create OIDC apps via Management API), Keycloak supports declarative realm configuration via JSON import. This eliminates:
- The `zitadel-bootstrap` container
- The `zitadel-bootstrap-init` volume permissions container
- The `zitadel_bootstrap` shared volume
- The `scripts/bootstrap-zitadel.mjs` script (not deleted in this story -- that is Story 15.9 cleanup scope)
- The entrypoint hacks in `apis-server` and `apis-dashboard` that loaded `zitadel.env`

The entire OIDC setup is now a single JSON file, making it version-controllable and reviewable.

### YugabyteDB JDBC Compatibility

Keycloak connects via standard PostgreSQL JDBC driver. YugabyteDB is PostgreSQL-compatible, so the standard JDBC URL works:
```
jdbc:postgresql://yugabytedb:5433/keycloak
```
No special JDBC driver or configuration is needed. The `KC_DB=postgres` setting tells Keycloak to use the PostgreSQL dialect.

### Files Created

- `keycloak/realm-honeybee.json` (new directory and file)

### Files Modified

- `docker-compose.yml` (remove Zitadel services, add Keycloak service, update comments and env vars)
- `scripts/init-yugabytedb.sh` (add keycloak database and role creation)

### Files Deleted

None. The `scripts/bootstrap-zitadel.mjs` file is NOT deleted in this story -- it is referenced in docker-compose.yml only for the `zitadel-bootstrap` service which is being removed. The actual file cleanup is Story 15.9 scope.

### Volumes Summary After Changes

```yaml
volumes:
  yugabytedb_data:    # Kept -- database persistence
  # zitadel_db_data:  # REMOVED -- Zitadel had its own Postgres
  # zitadel_bootstrap: # REMOVED -- Zitadel bootstrap env sharing
```

Keycloak does not need any persistent volume beyond the database (which is in YugabyteDB). The realm import file is mounted read-only from the host filesystem.

### References

- [Source: docker-compose.yml - Current file with Zitadel services to replace]
- [Source: scripts/init-yugabytedb.sh - Database init script to extend]
- [Source: .env.saas.example - Current SaaS env template (update in Story 15.8)]
- [Source: _bmad-output/planning-artifacts/epic-15-keycloak-migration.md - Story 15.7 requirements]
- [Source: _bmad-output/planning-artifacts/prd-addendum-keycloak-migration.md - Section 3.1 Realm Architecture, 3.4 Client Configuration, 3.5 Token Lifetimes]
- [Source: CLAUDE.md - Deployment modes documentation]
- [Keycloak 26.0 Server Administration Guide: Realm Export/Import]
- [Keycloak 26.0 Organizations Feature Documentation]

## Test Criteria

- [ ] `docker compose --profile saas config` produces valid YAML with `keycloak` service
- [ ] `docker compose --profile standalone config` produces valid YAML without `keycloak` service
- [ ] No "zitadel" references remain in `docker-compose.yml` (case-insensitive)
- [ ] `keycloak/realm-honeybee.json` is valid JSON
- [ ] Realm name is `honeybee`
- [ ] Client `apis-dashboard` is `publicClient: true`
- [ ] Client `apis-dashboard` has `directAccessGrantsEnabled: false`
- [ ] Client `apis-dashboard` has `pkce.code.challenge.method: "S256"` in attributes
- [ ] Client `apis-dashboard` has `standardFlowEnabled: true`
- [ ] Client `apis-dashboard` has `fullScopeAllowed: false`
- [ ] Realm roles include `admin`, `user`, `viewer`
- [ ] `roles` client scope includes `realm roles` protocol mapper
- [ ] `accessTokenLifespan` is 900 (15 minutes)
- [ ] `ssoSessionIdleTimeout` is 43200 (12 hours)
- [ ] `ssoSessionMaxLifespan` is 259200 (72 hours)
- [ ] `org_id` and `org_name` protocol mappers are defined
- [ ] Keycloak service has port mapping `8081:8080`
- [ ] Keycloak service has `profiles: ["saas"]`
- [ ] Keycloak service depends on `yugabytedb-init`
- [ ] `scripts/init-yugabytedb.sh` creates `keycloak` database when `KEYCLOAK_DB_USER` is set
- [ ] `scripts/init-yugabytedb.sh` skips `keycloak` database when `KEYCLOAK_DB_USER` is empty (standalone mode)
- [ ] `apis-server` entrypoint does not reference `zitadel.env`
- [ ] `apis-server` environment includes `KEYCLOAK_ISSUER` and `KEYCLOAK_CLIENT_ID`
- [ ] `apis-dashboard` does not mount `zitadel_bootstrap` volume
- [ ] `apis-dashboard` environment includes `VITE_KEYCLOAK_AUTHORITY` and `VITE_KEYCLOAK_CLIENT_ID`
- [ ] `volumes` section at bottom of file has no `zitadel_*` entries
- [ ] `yugabytedb-init` service passes `KEYCLOAK_DB_USER` and `KEYCLOAK_DB_PASSWORD` environment variables

## Change Log

- 2026-02-08: Story created for Epic 15 Keycloak Migration
