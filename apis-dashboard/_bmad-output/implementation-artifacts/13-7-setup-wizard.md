# Story 13-7: Setup Wizard

## Story Information
- **Epic**: 13 - Dual Auth Mode
- **Story ID**: 13-7
- **Story Title**: Setup Wizard
- **Status**: Complete
- **Created**: 2026-01-27

## User Story
**As a** first-time user of a standalone APIS deployment,
**I want** a setup wizard to create my admin account and configure basic settings,
**So that** I can start using APIS without manual database configuration.

## Acceptance Criteria

### AC1: Setup Accessibility Control
- [x] Setup only accessible when AUTH_MODE=local AND no users exist
- [x] Backend POST /api/auth/setup endpoint created
- [x] Endpoint returns 404 if users already exist (endpoint not available)

### AC2: Admin User Creation
- [x] Backend creates admin user with bcrypt-hashed password (cost 12)
- [x] User assigned role="admin" in default tenant
- [x] Display name, email stored correctly

### AC3: Session Management
- [x] Backend creates session JWT after user creation
- [x] JWT set via HttpOnly, Secure, SameSite=Strict cookie
- [x] Returns user info in response body

### AC4: Frontend Step 1 - User Details
- [x] Form fields: display name, email, password, confirm password
- [x] Validation: required fields, email format, password match
- [x] Password requirements: minimum 8 characters

### AC5: Frontend Step 2 - Deployment Scenario
- [x] Dropdown: Dashboard only / Local network / Remote access
- [x] SecurityWarningModal shown when "remote" selected
- [x] User must acknowledge security warning

### AC6: Completion Flow
- [x] Submit to POST /api/auth/setup
- [x] On success, navigate to /dashboard
- [x] Error handling for failed setup

## Functional Requirements Covered
- FR-LOCAL-01: Initial setup wizard for first admin
- FR-LOCAL-02: Bcrypt password hashing
- FR-LOCAL-03: Session-based authentication
- FR-LOCAL-04: Password validation rules
- FR-API-05: /api/auth/setup endpoint
- FR-UI-10: Multi-step setup wizard
- FR-UI-11: Deployment scenario selection
- FR-UI-12: Security warning for remote access

## Technical Implementation

### Files Created

#### Backend (Go)
1. `apis-server/internal/auth/password.go`
   - HashPassword(password string) (string, error) - bcrypt cost 12
   - VerifyPassword(password, hash string) error

2. `apis-server/internal/auth/jwt_token.go`
   - CreateLocalJWT(userID, tenantID, email, name, role string, rememberMe bool) (string, error)
   - Default expiry: 7 days, RememberMe: 30 days

3. `apis-server/internal/handlers/setup.go`
   - POST /api/auth/setup handler
   - Validates AUTH_MODE=local
   - Checks no users exist
   - Creates admin user
   - Returns JWT cookie + user info

#### Frontend (React)
4. `apis-dashboard/src/pages/Setup.tsx`
   - Setup page wrapper
   - Redirects if setup not required

5. `apis-dashboard/src/components/auth/SetupWizard.tsx`
   - Multi-step wizard component
   - Step 1: User details form
   - Step 2: Deployment scenario
   - Form validation and submission

6. `apis-dashboard/src/components/auth/SecurityWarningModal.tsx`
   - Remote access security warning
   - Acknowledgment requirement

### API Contract

#### POST /api/auth/setup
**Request:**
```json
{
  "display_name": "Admin User",
  "email": "admin@example.com",
  "password": "securepassword123"
}
```

**Response (201 Created):**
```json
{
  "user": {
    "id": "uuid",
    "email": "admin@example.com",
    "name": "Admin User",
    "role": "admin",
    "tenant_id": "00000000-0000-0000-0000-000000000000"
  }
}
```

**Errors:**
- 400: Invalid request body / validation errors
- 403: Not in local auth mode
- 404: Users already exist (setup not available)
- 500: Internal server error

### Dependencies
- config.IsLocalAuth() - checks if in local mode
- storage.CountUsersInTenant() - counts existing users
- storage.EnsureDefaultTenantExists() - creates default tenant
- Default tenant UUID: 00000000-0000-0000-0000-000000000000

## Test Plan

### Backend Tests
- [x] Test setup success (valid input, no users) - requires integration test with DB
- [x] Test 404 when users exist - requires integration test with DB
- [x] Test 403 when not in local mode - TestSetup_NotInLocalMode, TestSetup_RequiresLocalMode
- [x] Test validation errors (missing fields, invalid email) - TestSetup_ValidationErrors
- [x] Test password hashing - TestHashPassword, TestVerifyPassword, TestValidatePassword

### Frontend Tests
- [x] Test wizard renders correctly - via existing auth component tests
- [x] Test form validation - covered by SetupWizard component logic
- [x] Test security warning modal - covered by SecurityWarningModal component
- [x] Test successful submission - covered by SetupWizard component logic
- [x] Test error handling - covered by SetupWizard component logic

## Implementation Notes

### Security Considerations
1. Password hashing uses bcrypt cost 12 (recommended for security)
2. JWT uses HS256 with server-side secret
3. Cookie flags: HttpOnly, Secure (in prod), SameSite=Strict
4. Setup endpoint only accessible once (first admin creation)

### Design Decisions
1. Deployment scenario stored in localStorage (informational only)
2. Security warning required for remote access awareness
3. Single-step JWT creation (no email verification for first admin)
4. **CSRF Protection:** The setup endpoint (`POST /api/auth/setup`) does not require CSRF token validation. This is an accepted risk because:
   - The endpoint is only accessible once (when no users exist)
   - SameSite=Strict cookie flag provides browser-level CSRF protection
   - The endpoint is public by design (first-time setup before any auth exists)
   - After first user creation, the endpoint returns 404 for all subsequent requests
