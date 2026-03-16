# Story 13-11: User Management UI

## Status: Complete

## Story

**As a** tenant admin in standalone mode,
**I want** a user management interface in Settings,
**So that** I can manage team members without CLI.

## Acceptance Criteria

1. [x] Route `/settings/users` (Admin only, local mode only)
2. [x] Hidden in SaaS mode navigation
3. [x] User list with name, email, role, status, last login, actions
4. [x] Invite modal with method selector (temp_password/email/link)
5. [x] Edit modal for name, role, active status
6. [x] Delete confirmation dialog
7. [x] Cannot demote self or delete last admin

## Technical Implementation

### Files Created

1. **`apis-dashboard/src/hooks/useUsers.ts`** - User CRUD hook
   - `useUsers()` - List all users with refresh capability
   - `useCreateUser()` - Create user with temp password
   - `useUpdateUser()` - Update user details
   - `useDeleteUser()` - Soft delete user
   - `useInviteUser()` - Create invitation (all methods)
   - `useResetPassword()` - Reset user password

2. **`apis-dashboard/src/components/users/UserList.tsx`** - User table component
   - Ant Design Table with columns: Name, Email, Role, Status, Last Login, Actions
   - Actions: Edit, Reset Password, Delete (with confirmation)
   - "Invite User" button in header
   - Loading and empty states

3. **`apis-dashboard/src/components/users/InviteUserModal.tsx`** - Invite modal
   - Method selector: "Create with Password" / "Send Email Invite" / "Generate Link"
   - Fields based on method
   - Show shareable link for link method

4. **`apis-dashboard/src/components/users/EditUserModal.tsx`** - Edit modal
   - Display name (editable)
   - Role dropdown (admin/member)
   - Active status toggle
   - Warnings for self-demotion and last admin

5. **`apis-dashboard/src/pages/settings/Users.tsx`** - Main users page
   - Check isAdmin and isLocalMode
   - Show forbidden/redirect if not authorized
   - Render UserList with modals

### API Endpoints Used

- `GET /api/users` - List all users in tenant
- `POST /api/users` - Create user (temp password method)
- `PUT /api/users/{id}` - Update user
- `DELETE /api/users/{id}` - Soft delete user
- `POST /api/users/invite` - Create invitation
- `POST /api/users/{id}/reset-password` - Reset password

### Navigation Integration

- Added to `navItems.tsx` conditionally (local mode + admin only)
- Route added in `App.tsx`

## Dependencies

- Epic 13 Story 13-9: User Management Backend (provides API endpoints)
- Epic 13 Story 13-10: Invite System Backend (provides invite endpoint)

## Testing Notes

- Test admin-only access
- Test hiding in SaaS mode
- Test self-demotion prevention
- Test last admin protection
- Test all invite methods
