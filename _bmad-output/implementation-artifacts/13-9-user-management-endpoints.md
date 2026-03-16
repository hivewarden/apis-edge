# Story 13-9: User Management Endpoints

## Status: Complete

## Story

**As a** tenant admin in standalone mode,
**I want** to create, edit, and manage users in my tenant,
**So that** I can invite team members to collaborate.

## Acceptance Criteria

1. GET /api/users (Admin only): List all tenant users with role, status, last login
2. POST /api/users (Admin only): Create user with temp password, set must_change_password
3. PUT /api/users/{id} (Admin only): Update name, role, active status
4. DELETE /api/users/{id} (Admin only): Soft delete (cannot delete self or last admin)
5. POST /api/users/{id}/reset-password (Admin only): Set new temp password

## Test Criteria

- Admin can CRUD users in tenant
- Admin cannot demote self or delete last admin
- Non-admin receives 403
- Users scoped to tenant (RLS)

## FRs Covered

FR-LOCAL-20, FR-LOCAL-21, FR-LOCAL-22, FR-USER-02, FR-USER-03, FR-API-06, FR-API-07

## Implementation

### Files Created

- `apis-server/internal/handlers/users.go` - User CRUD handlers with AdminOnly middleware
- `apis-server/tests/handlers/users_test.go` - Comprehensive tests

### Files Modified

- `apis-server/internal/storage/users.go` - Added storage functions for user management
- `apis-server/cmd/server/main.go` - Registered /api/users routes

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/users | List all users in tenant |
| POST | /api/users | Create new user |
| PUT | /api/users/{id} | Update user |
| DELETE | /api/users/{id} | Soft delete user |
| POST | /api/users/{id}/reset-password | Reset user password |

### Key Design Decisions

1. **AdminOnly middleware**: Centralized role check, returns 403 for non-admins
2. **Self-protection**: Cannot delete self, demote self, or deactivate last admin
3. **Soft delete**: Sets is_active=false rather than hard delete
4. **Password reset**: Sets must_change_password=true for forced change at next login
5. **RLS-aware**: All queries respect tenant isolation via app.tenant_id

## Technical Notes

- Uses existing bcrypt password hashing from auth package
- Leverages middleware.GetClaims() for admin role check
- Storage functions use pgxpool.Conn for connection pooling
- All responses follow CLAUDE.md API format conventions
