# Story 13-8: Login/Logout Endpoints

## Status: Complete

## User Story
**As a** user of a standalone APIS deployment,
**I want** to log in with my email and password,
**So that** I can access my beekeeping data securely.

## Acceptance Criteria

### AC1: POST /api/auth/login
- [x] Validate credentials against bcrypt hash
- [x] Rate limit: 5 attempts per email per 15 minutes
- [x] Return 429 with Retry-After header when rate limited
- [x] Return user data + set `apis_session` cookie with JWT on success
- [x] JWT claims: sub, tenant_id, email, name, role, iat, exp
- [x] Remember me: 7 days default, 30 days with remember_me flag
- [x] Return 401 for invalid credentials (generic message to prevent enumeration)
- [x] Return 403 if not in local auth mode

### AC2: POST /api/auth/logout
- [x] Clear `apis_session` cookie by setting MaxAge=-1
- [x] Return 200 OK on success

### AC3: GET /api/auth/me
- [x] Requires authentication (uses authMiddleware)
- [x] Return current user info from JWT claims
- [x] Return user ID, email, name, role, tenant_id

## Technical Implementation

### Files Created
1. `apis-server/internal/handlers/auth_local.go` - Login, Logout, Me handlers
2. `apis-server/internal/middleware/ratelimit_login.go` - Login-specific rate limiter
3. `apis-server/tests/handlers/auth_local_test.go` - Unit tests

### Files Modified
1. `apis-server/cmd/server/main.go` - Register new routes

### Dependencies
- `apis-server/internal/auth/password.go` - HashPassword, VerifyPassword
- `apis-server/internal/auth/local_jwt.go` - CreateLocalJWT, ValidateLocalJWT
- `apis-server/internal/storage/users.go` - GetUserByEmailWithPassword, UpdateUserLastLogin
- `apis-server/internal/handlers/setup.go` - SessionCookieName, setSessionCookie
- `apis-server/internal/config/auth.go` - IsLocalAuth, JWTSecret, DefaultTenantUUID

## Test Plan
1. Test valid login with correct credentials
2. Test invalid password returns 401
3. Test non-existent user returns 401 (same error message)
4. Test rate limiting after 5 failed attempts
5. Test rate limit reset after 15 minutes
6. Test remember_me extends session duration
7. Test logout clears cookie
8. Test /me returns authenticated user info
9. Test /me returns 401 when not authenticated
10. Test login returns 403 when not in local mode
