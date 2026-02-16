# Story 13-12: Super-Admin Tenant List & Management

**Status:** Complete
**Epic:** 13 - Dual Authentication Mode
**Phase:** 3 - SaaS Features

## Overview

**As a** SaaS operator (super-admin),
**I want** to view and manage all tenants,
**So that** I can onboard customers and handle support.

## Functional Requirements Coverage

| Requirement | Description |
|-------------|-------------|
| FR-ADMIN-01 | Super-admin SHALL see list of all tenants with usage |
| FR-ADMIN-02 | Super-admin SHALL create tenants and send invites |
| FR-ADMIN-04 | Super-admin SHALL disable/delete tenants |
| FR-SAAS-04 | Super-admin role SHALL be determined by SUPER_ADMIN_EMAILS env var |

## Acceptance Criteria

1. [x] GET /api/admin/tenants - List all tenants with usage (hives, users, storage)
2. [x] POST /api/admin/tenants - Create new tenant
3. [x] PUT /api/admin/tenants/{id} - Update tenant (name, plan, status)
4. [x] DELETE /api/admin/tenants/{id} - Soft delete (set status=deleted)
5. [x] Super-admin determined by SUPER_ADMIN_EMAILS env var
6. [x] Only available in SaaS mode (AUTH_MODE=zitadel)
7. [x] React admin page at /admin/tenants

## Technical Design

### Backend

#### SuperAdmin Middleware (superadmin.go)
- Checks if AUTH_MODE=zitadel (SaaS mode only)
- Validates user email against SUPER_ADMIN_EMAILS env var
- Returns 404 in non-SaaS mode (feature not available)
- Returns 403 for non-super-admin users

#### Admin Storage (admin.go)
- Bypasses RLS for admin queries using system-level connection
- TenantSummary struct with usage statistics
- Functions: ListAllTenants, CreateTenant, UpdateTenant, SetTenantStatus

#### Admin Handlers (admin_tenants.go)
- ListTenants: GET /api/admin/tenants
- CreateTenant: POST /api/admin/tenants
- GetTenantDetail: GET /api/admin/tenants/{id}
- UpdateTenant: PUT /api/admin/tenants/{id}
- DeleteTenant: DELETE /api/admin/tenants/{id}

### Frontend

#### Admin Tenants Page (pages/admin/Tenants.tsx)
- Table showing all tenants with columns: Name, Plan, Status, Users, Hives, Storage, Created, Actions
- Create tenant modal
- Edit tenant modal
- Delete confirmation dialog
- Only accessible to super-admins in SaaS mode

#### Admin Tenant Hooks (hooks/useAdminTenants.ts)
- useAdminTenants: List tenants with stats
- useCreateTenant: Create new tenant
- useUpdateTenant: Update tenant details
- useDeleteTenant: Soft delete tenant

## Files Created/Modified

### Backend
- `apis-server/internal/middleware/superadmin.go` (new)
- `apis-server/internal/handlers/admin_tenants.go` (new)
- `apis-server/internal/storage/admin.go` (new)
- `apis-server/cmd/server/main.go` (modified - add admin routes)

### Frontend
- `apis-dashboard/src/pages/admin/Tenants.tsx` (new)
- `apis-dashboard/src/hooks/useAdminTenants.ts` (new)
- `apis-dashboard/src/pages/index.ts` (modified - export admin page)
- `apis-dashboard/src/App.tsx` (modified - add admin route)
- `apis-dashboard/src/hooks/index.ts` (modified - export admin hooks)

## Test Criteria

- [ ] Only super-admins can access /api/admin/*
- [ ] 404 returned in local auth mode (not SaaS)
- [ ] 403 returned for non-super-admin users in SaaS mode
- [ ] Tenant CRUD operations work correctly
- [ ] Usage stats (hives, users, storage) calculated correctly
- [ ] Soft delete sets status to 'deleted'
- [ ] Frontend displays tenant list correctly
- [ ] Create/Edit modals work correctly
- [ ] Delete confirmation prevents accidental deletion

## Implementation Notes

### Super-Admin Email Check
The SUPER_ADMIN_EMAILS environment variable is comma-separated and already parsed by config.InitAuthConfig(). The config.IsSuperAdmin(email) function handles the lookup with case-insensitive comparison.

### RLS Bypass for Admin Queries
Admin queries need to bypass Row-Level Security to see all tenants. This is done by NOT setting `app.tenant_id` before queries, allowing PostgreSQL to return all rows. Care must be taken to never use admin storage functions for tenant-scoped data.

### Soft Delete Approach
Deleting a tenant sets `status='deleted'` rather than removing data. This allows recovery and maintains referential integrity. The suspended status also prevents user login.
