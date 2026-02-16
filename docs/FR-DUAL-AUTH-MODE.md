# Functional Requirements: Dual Authentication Mode Architecture

**Document Version:** 1.0
**Date:** 2026-01-26
**Status:** Draft / Recommendation
**Author:** Architecture Review

---

## 1. Executive Summary

APIS must support two deployment modes with a single codebase:

1. **Standalone Mode** (`AUTH_MODE=local`): Self-hosted installations with local user management, suitable for individual beekeepers, families, or local beekeeping clubs running their own server.

2. **SaaS Mode** (`AUTH_MODE=zitadel`): Multi-tenant deployment with Zitadel identity provider, suitable for offering APIS as a hosted service to multiple organizations.

This document defines the functional requirements to ensure both modes are fully supported without code divergence, following industry best practices observed in GitLab, Sentry, Mattermost, and similar dual-mode open source projects.

---

## 2. Goals and Non-Goals

### 2.1 Goals

- **Single Codebase**: One codebase serves both deployment modes with zero forking
- **Feature Parity**: All beekeeping features work identically in both modes
- **Simple Standalone Setup**: Self-hosted users can run APIS with minimal dependencies (database only)
- **Seamless SaaS Scaling**: Multi-tenant mode supports unlimited organizations with proper data isolation
- **Development Confidence**: All changes are automatically tested against both modes
- **Migration Path**: Self-hosted installations can upgrade to SaaS-connected mode if desired

### 2.2 Non-Goals

- Mixing modes in a single deployment (it's one or the other)
- Supporting other identity providers beyond Zitadel in SaaS mode (for now)
- Federated authentication in standalone mode (keep it simple)

---

## 3. Architecture Overview

### 3.1 The Default Tenant Pattern

Both modes use the identical database schema with `tenant_id` on all tables. The difference is the source of the tenant identifier:

```
┌─────────────────────────────────────────────────────────────────────┐
│                     STANDALONE MODE                                  │
│                     AUTH_MODE=local                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   tenant_id = "00000000-0000-0000-0000-000000000000" (always)       │
│                                                                      │
│   • Created automatically on first startup                          │
│   • All users belong to this single tenant                          │
│   • RLS policies work unchanged (just one tenant)                   │
│   • No organization concept exposed in UI                           │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                       SAAS MODE                                      │
│                    AUTH_MODE=zitadel                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   tenant_id = <Zitadel org_id from JWT claims>                      │
│                                                                      │
│   • Created when first user from an org logs in                     │
│   • Each Zitadel organization = one APIS tenant                     │
│   • RLS policies isolate data between tenants                       │
│   • Organization name shown in UI                                   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Component Differences by Mode

| Component | Standalone (local) | SaaS (zitadel) |
|-----------|-------------------|----------------|
| **Identity Provider** | Built-in (bcrypt passwords) | Zitadel OIDC |
| **JWT Signing** | Local secret (HS256) | Zitadel keys (RS256) |
| **Tenant Source** | Hardcoded default UUID | From `org_id` claim |
| **User Provisioning** | Manual (admin creates) | Auto on first login |
| **Password Management** | Local (reset by admin) | Zitadel (self-service) |
| **Multi-Factor Auth** | Not supported (v1) | Zitadel handles |
| **Session Duration** | Configurable locally | Zitadel policy |
| **User Management UI** | Full CRUD in Settings | Hidden (use Zitadel) |

### 3.3 Shared Components (No Differences)

- Database schema (all tables, all columns)
- Row-Level Security policies
- All API endpoints (sites, hives, inspections, clips, etc.)
- BeeBrain analytics engine
- Edge device communication
- Dashboard UI (except auth-related pages)
- Export functionality
- PWA/offline support

---

## 4. Functional Requirements: Standalone Mode

### 4.1 First-Run Setup

**FR-LOCAL-001**: On first startup with empty database, the system SHALL automatically create the default tenant with UUID `00000000-0000-0000-0000-000000000000`.

**FR-LOCAL-002**: When no users exist in the database, accessing any dashboard route SHALL redirect to `/setup`.

**FR-LOCAL-003**: The setup page SHALL collect:
- Admin email address
- Admin display name
- Password (with confirmation)
- Password requirements: minimum 8 characters

**FR-LOCAL-004**: Upon setup completion, the system SHALL:
- Create the admin user with role `admin`
- Create a session and redirect to dashboard
- Never show the setup page again (users exist)

### 4.2 Authentication Flow

**FR-LOCAL-010**: The login page SHALL display a username/password form (not OIDC redirect).

**FR-LOCAL-011**: Login SHALL accept email address as the username.

**FR-LOCAL-012**: Failed login attempts SHALL:
- Return generic "Invalid credentials" error (no user enumeration)
- Log the attempt with IP address
- Implement rate limiting: max 5 attempts per email per 15 minutes

**FR-LOCAL-013**: Successful login SHALL:
- Generate a JWT token signed with `JWT_SECRET` environment variable
- Set token in HttpOnly secure cookie named `apis_session`
- Include claims: `sub` (user_id), `tenant_id`, `email`, `name`, `role`
- Default expiration: 7 days (configurable via `SESSION_DURATION`)

**FR-LOCAL-014**: The system SHALL support "Remember Me" option:
- Unchecked: session expires when browser closes
- Checked: session persists for configured duration

**FR-LOCAL-015**: Logout SHALL invalidate the session cookie and optionally add the token to a revocation list.

### 4.3 User Management

**FR-LOCAL-020**: Admin users SHALL access user management at `/settings/users`.

**FR-LOCAL-021**: User management SHALL support:
- List all users with name, email, role, last login, status
- Create new user (email, name, temporary password, role)
- Edit user (name, role, active status)
- Reset user password (generates temporary password)
- Delete user (soft delete, preserves audit trail)

**FR-LOCAL-022**: Available roles SHALL be:
- `admin`: Full access, can manage users
- `user`: Standard access, cannot manage users

**FR-LOCAL-023**: New users created by admin SHALL:
- Receive a temporary password
- Be required to change password on first login
- Optionally receive email notification (if SMTP configured)

**FR-LOCAL-024**: Users SHALL be able to change their own password at `/settings/profile`.

**FR-LOCAL-025**: Password changes SHALL require current password confirmation.

### 4.4 Session Management

**FR-LOCAL-030**: Each API request SHALL validate the JWT from the `apis_session` cookie.

**FR-LOCAL-031**: Invalid or expired tokens SHALL return `401 Unauthorized`.

**FR-LOCAL-032**: The middleware SHALL set `app.tenant_id` to the default tenant UUID for all requests.

**FR-LOCAL-033**: Token refresh SHALL occur automatically when token is within 1 hour of expiration.

### 4.5 Configuration

**FR-LOCAL-040**: Standalone mode SHALL require these environment variables:
```
AUTH_MODE=local                    # Required: enables local auth
JWT_SECRET=<random-32+-chars>      # Required: for signing tokens
DATABASE_URL=<connection-string>   # Required: database connection
```

**FR-LOCAL-041**: Standalone mode SHALL support these optional environment variables:
```
SESSION_DURATION=168h              # Default: 7 days
PASSWORD_MIN_LENGTH=8              # Default: 8 characters
SMTP_HOST=                         # For email notifications
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=noreply@example.com
```

**FR-LOCAL-042**: Missing `JWT_SECRET` in local mode SHALL cause startup failure with clear error message.

---

## 5. Functional Requirements: SaaS Mode

### 5.1 Authentication Flow

**FR-SAAS-001**: The login page SHALL display "Sign in with Zitadel" button (OIDC redirect).

**FR-SAAS-002**: Authentication SHALL use Authorization Code Flow with PKCE.

**FR-SAAS-003**: Required OIDC scopes: `openid`, `profile`, `email`, `offline_access`.

**FR-SAAS-004**: The system SHALL extract tenant_id from the `urn:zitadel:iam:org:id` claim.

**FR-SAAS-005**: JWT validation SHALL verify:
- Signature against Zitadel JWKS (cached, refreshed hourly)
- Issuer matches configured `ZITADEL_ISSUER`
- Audience includes `ZITADEL_CLIENT_ID`
- Token is not expired
- Required claims are present (`sub`, `org_id`)

### 5.2 Tenant Provisioning

**FR-SAAS-010**: On first login from a new Zitadel organization, the system SHALL automatically create a tenant record.

**FR-SAAS-011**: Tenant name SHALL be populated from `urn:zitadel:iam:org:name` claim.

**FR-SAAS-012**: On first login of any user, the system SHALL create/update the user record with:
- `zitadel_user_id` = `sub` claim
- `email` = `email` claim
- `name` = `name` or `preferred_username` claim
- `tenant_id` = derived from `org_id` claim

### 5.3 User Management

**FR-SAAS-020**: User management UI SHALL be hidden in SaaS mode (users managed in Zitadel).

**FR-SAAS-021**: The Settings page SHALL show "Manage users in Zitadel" link instead of user list.

**FR-SAAS-022**: User roles in SaaS mode SHALL be derived from Zitadel role claims (future enhancement).

### 5.4 Configuration

**FR-SAAS-030**: SaaS mode SHALL require these environment variables:
```
AUTH_MODE=zitadel                  # Required: enables Zitadel auth
ZITADEL_ISSUER=https://...         # Required: Zitadel instance URL
ZITADEL_CLIENT_ID=<client-id>      # Required: OIDC client ID
DATABASE_URL=<connection-string>   # Required: database connection
```

**FR-SAAS-031**: SaaS mode SHALL support these optional environment variables:
```
ZITADEL_DISCOVERY_URL=             # If different from issuer (Docker networking)
```

---

## 6. Functional Requirements: Shared Behavior

### 6.1 Feature Detection Pattern

**FR-SHARED-001**: Code SHALL use feature detection, not deployment detection:
```go
// Correct - describes capability
if features.Enabled("local_user_management") { ... }

// Incorrect - describes deployment
if os.Getenv("AUTH_MODE") == "local" { ... }
```

**FR-SHARED-002**: Feature flags SHALL be defined centrally:
```go
var Features = map[string]func() bool{
    "local_user_management": func() bool { return AuthMode() == "local" },
    "multi_tenant":          func() bool { return AuthMode() == "zitadel" },
    "zitadel_integration":   func() bool { return AuthMode() == "zitadel" },
    // All other features default to enabled in both modes
}
```

### 6.2 API Consistency

**FR-SHARED-010**: All API endpoints SHALL work identically in both modes after authentication.

**FR-SHARED-011**: The `/api/me` endpoint SHALL return consistent structure:
```json
{
  "id": "user-uuid",
  "email": "user@example.com",
  "name": "Display Name",
  "role": "admin|user",
  "tenant_id": "tenant-uuid",
  "tenant_name": "Tenant Name"
}
```

**FR-SHARED-012**: API errors SHALL use consistent format regardless of mode:
```json
{
  "error": "Human readable message",
  "code": 401
}
```

### 6.3 Dashboard Consistency

**FR-SHARED-020**: The main navigation SHALL be identical in both modes.

**FR-SHARED-021**: The Settings page SHALL conditionally show:
- "Users" menu item: only in local mode
- "Manage in Zitadel" link: only in SaaS mode

**FR-SHARED-022**: The user profile dropdown SHALL show:
- User name and email (both modes)
- "Profile" link (both modes)
- "Logout" button (both modes)

### 6.4 Database Schema

**FR-SHARED-030**: All tables SHALL include `tenant_id` column regardless of mode.

**FR-SHARED-031**: RLS policies SHALL use `current_setting('app.tenant_id')` for all tables.

**FR-SHARED-032**: The `users` table SHALL include columns for both modes:
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),

    -- Used in both modes
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Used only in local mode (NULL in SaaS mode)
    password_hash VARCHAR(255),
    password_changed_at TIMESTAMPTZ,
    must_change_password BOOLEAN DEFAULT false,

    -- Used only in SaaS mode (NULL in local mode)
    zitadel_user_id VARCHAR(255),

    UNIQUE (tenant_id, email)
);
```

---

## 7. Functional Requirements: Auth Mode API Endpoints

### 7.1 Local Mode Endpoints

**FR-API-LOCAL-001**: `POST /api/auth/login`
```
Request:
{
  "email": "user@example.com",
  "password": "secret",
  "remember_me": true
}

Success Response (200):
{
  "user": { "id": "...", "email": "...", "name": "...", "role": "..." }
}
+ Set-Cookie: apis_session=<jwt>; HttpOnly; Secure; SameSite=Strict

Error Response (401):
{
  "error": "Invalid credentials",
  "code": 401
}
```

**FR-API-LOCAL-002**: `POST /api/auth/logout`
```
Request: (empty, uses cookie)

Response (200):
{
  "success": true
}
+ Set-Cookie: apis_session=; Max-Age=0
```

**FR-API-LOCAL-003**: `POST /api/auth/change-password`
```
Request:
{
  "current_password": "old",
  "new_password": "new"
}

Success Response (200):
{
  "success": true
}

Error Response (400):
{
  "error": "Current password is incorrect",
  "code": 400
}
```

**FR-API-LOCAL-004**: `GET /api/users` (admin only)
```
Response (200):
{
  "data": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "name": "User Name",
      "role": "user",
      "is_active": true,
      "last_login_at": "2026-01-26T12:00:00Z",
      "created_at": "2026-01-01T00:00:00Z"
    }
  ],
  "meta": { "total": 1 }
}
```

**FR-API-LOCAL-005**: `POST /api/users` (admin only)
```
Request:
{
  "email": "newuser@example.com",
  "name": "New User",
  "role": "user",
  "password": "temporary123"
}

Response (201):
{
  "data": {
    "id": "uuid",
    "email": "newuser@example.com",
    "name": "New User",
    "role": "user",
    "must_change_password": true
  }
}
```

**FR-API-LOCAL-006**: `POST /api/setup` (only when no users exist)
```
Request:
{
  "email": "admin@example.com",
  "name": "Admin User",
  "password": "securepassword"
}

Response (201):
{
  "user": { "id": "...", "email": "...", "name": "...", "role": "admin" }
}
+ Set-Cookie: apis_session=<jwt>
```

### 7.2 Shared Endpoints (Both Modes)

**FR-API-SHARED-001**: `GET /api/auth/config`
```
Response (200):
{
  "mode": "local|zitadel",
  "setup_required": false,          // true if no users exist (local mode)
  "zitadel_authority": "https://...",  // only in zitadel mode
  "zitadel_client_id": "..."           // only in zitadel mode
}
```

This endpoint is public (no auth required) and used by the dashboard to determine which login flow to show.

---

## 8. Dashboard Requirements

### 8.1 Login Page Behavior

**FR-UI-001**: The Login page SHALL check `/api/auth/config` on load.

**FR-UI-002**: If `mode === "local"` AND `setup_required === true`, redirect to `/setup`.

**FR-UI-003**: If `mode === "local"`, display email/password form.

**FR-UI-004**: If `mode === "zitadel"`, display "Sign in with Zitadel" button.

### 8.2 Setup Page (Local Mode Only)

**FR-UI-010**: The Setup page SHALL only be accessible when no users exist.

**FR-UI-011**: The Setup page SHALL validate:
- Email format
- Password minimum length
- Password confirmation match

**FR-UI-012**: After successful setup, redirect to dashboard.

### 8.3 User Management Page (Local Mode Only)

**FR-UI-020**: Route: `/settings/users`

**FR-UI-021**: Access: Admin role required

**FR-UI-022**: Features:
- Table listing all users
- "Add User" button opening modal form
- Edit button per row
- Disable/Enable toggle per row
- Reset Password action
- Delete action with confirmation

### 8.4 Profile Page (Both Modes)

**FR-UI-030**: Route: `/settings/profile`

**FR-UI-031**: Display: Name, email, role (read-only in SaaS mode)

**FR-UI-032**: Local mode additional features:
- Change password form
- Edit name

---

## 9. Security Requirements

### 9.1 Password Security (Local Mode)

**FR-SEC-001**: Passwords SHALL be hashed using bcrypt with cost factor 12.

**FR-SEC-002**: Password requirements (configurable):
- Minimum 8 characters (default)
- No maximum length limit
- All UTF-8 characters allowed

**FR-SEC-003**: Password reset tokens SHALL:
- Be cryptographically random (32 bytes)
- Expire after 24 hours
- Be single-use

### 9.2 Session Security

**FR-SEC-010**: JWT tokens in local mode SHALL:
- Use HS256 algorithm with `JWT_SECRET`
- Include `iat`, `exp`, `sub`, `tenant_id` claims
- Be transmitted only via HttpOnly cookies

**FR-SEC-011**: `JWT_SECRET` SHALL be minimum 32 characters.

**FR-SEC-012**: Session cookies SHALL set:
- `HttpOnly`: true
- `Secure`: true (in production)
- `SameSite`: Strict

### 9.3 Rate Limiting

**FR-SEC-020**: Login endpoint SHALL be rate limited:
- 5 attempts per email per 15-minute window
- 20 attempts per IP per 15-minute window

**FR-SEC-021**: Rate limit exceeded SHALL return `429 Too Many Requests`.

---

## 10. Testing Requirements

### 10.1 Dual-Mode Test Execution

**FR-TEST-001**: CI pipeline SHALL run all tests in both modes:
```bash
AUTH_MODE=local go test ./...
AUTH_MODE=zitadel go test ./...
```

**FR-TEST-002**: Tests specific to one mode SHALL use build tags or skip logic:
```go
func TestLocalUserCreation(t *testing.T) {
    if features.AuthMode() != "local" {
        t.Skip("Test only applies to local auth mode")
    }
    // ...
}
```

### 10.2 Integration Tests

**FR-TEST-010**: Integration tests SHALL cover:
- Local mode: full login/logout flow
- Local mode: user CRUD operations
- Local mode: password change flow
- SaaS mode: OIDC callback handling
- SaaS mode: tenant provisioning
- Both modes: all API endpoints with valid auth

---

## 11. Migration and Upgrade Path

### 11.1 Standalone to SaaS Migration

**FR-MIGRATE-001**: Documentation SHALL describe the migration path:
1. Export users from standalone instance
2. Create Zitadel organization
3. Import users to Zitadel
4. Update environment to `AUTH_MODE=zitadel`
5. Users login with Zitadel, existing data preserved (same tenant_id)

**FR-MIGRATE-002**: A migration script SHALL be provided to:
- Map local user IDs to Zitadel user IDs
- Update user records with `zitadel_user_id`

### 11.2 Version Compatibility

**FR-MIGRATE-010**: Database schema SHALL be identical for both modes.

**FR-MIGRATE-011**: Switching `AUTH_MODE` SHALL NOT require database migration.

---

## 12. Documentation Requirements

**FR-DOC-001**: README SHALL document both deployment modes.

**FR-DOC-002**: Separate quick-start guides SHALL exist for:
- Standalone deployment (single docker-compose)
- SaaS deployment (with Zitadel)

**FR-DOC-003**: API documentation SHALL indicate which endpoints are mode-specific.

---

## 13. Implementation Priority

### Phase 1: Core Local Auth (MVP)
1. `AUTH_MODE` environment variable and feature detection
2. Local JWT signing and validation
3. Login/logout endpoints
4. Basic user management (admin creates users)
5. Dashboard login form
6. Setup flow for first user

### Phase 2: Enhanced Local Auth
1. Password reset flow (with optional email)
2. Rate limiting
3. Session management improvements
4. User self-service (change password, edit profile)

### Phase 3: Polish and Migration
1. Migration tooling (local to Zitadel)
2. Comprehensive test coverage for both modes
3. Documentation updates

---

## 14. Appendix: Environment Variable Reference

### Standalone Mode (AUTH_MODE=local)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AUTH_MODE` | Yes | - | Must be `local` |
| `JWT_SECRET` | Yes | - | Secret for signing JWTs (min 32 chars) |
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `SESSION_DURATION` | No | `168h` | Session token lifetime |
| `PASSWORD_MIN_LENGTH` | No | `8` | Minimum password length |
| `SMTP_HOST` | No | - | SMTP server for emails |
| `SMTP_PORT` | No | `587` | SMTP port |
| `SMTP_USER` | No | - | SMTP username |
| `SMTP_PASSWORD` | No | - | SMTP password |
| `SMTP_FROM` | No | - | From address for emails |

### SaaS Mode (AUTH_MODE=zitadel)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AUTH_MODE` | Yes | - | Must be `zitadel` |
| `ZITADEL_ISSUER` | Yes | - | Zitadel instance URL |
| `ZITADEL_CLIENT_ID` | Yes | - | OIDC client ID |
| `ZITADEL_DISCOVERY_URL` | No | Same as issuer | OIDC discovery URL (for Docker) |
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |

---

## 15. Appendix: Example docker-compose Files

### Standalone Deployment

```yaml
# docker-compose.standalone.yml
version: '3.8'

services:
  database:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: apis
      POSTGRES_PASSWORD: apis
      POSTGRES_DB: apis
    volumes:
      - postgres_data:/var/lib/postgresql/data

  apis-server:
    image: apis-server:latest
    environment:
      - AUTH_MODE=local
      - JWT_SECRET=${JWT_SECRET}
      - DATABASE_URL=postgres://apis:apis@database:5432/apis
    ports:
      - "3000:3000"
    depends_on:
      - database

  apis-dashboard:
    image: apis-dashboard:latest
    environment:
      - VITE_API_URL=http://localhost:3000/api
      - VITE_AUTH_MODE=local
    ports:
      - "5173:80"

volumes:
  postgres_data:
```

### SaaS Deployment

```yaml
# docker-compose.saas.yml
version: '3.8'

services:
  database:
    image: yugabytedb/yugabyte:latest
    # ... full config

  zitadel:
    image: ghcr.io/zitadel/zitadel:latest
    # ... full config

  apis-server:
    image: apis-server:latest
    environment:
      - AUTH_MODE=zitadel
      - ZITADEL_ISSUER=http://localhost:8080
      - ZITADEL_CLIENT_ID=${ZITADEL_CLIENT_ID}
      - DATABASE_URL=postgres://...
    depends_on:
      - database
      - zitadel

  apis-dashboard:
    image: apis-dashboard:latest
    environment:
      - VITE_API_URL=http://localhost:3000/api
      - VITE_AUTH_MODE=zitadel
      - VITE_ZITADEL_AUTHORITY=http://localhost:8080
      - VITE_ZITADEL_CLIENT_ID=${ZITADEL_CLIENT_ID}

volumes:
  # ...
```

---

**End of Document**
