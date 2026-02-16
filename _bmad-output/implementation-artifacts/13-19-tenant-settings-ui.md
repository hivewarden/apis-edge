# Story 13.19: Tenant Settings UI

Status: done

## Story

As a tenant admin,
I want to see usage and limits in Settings,
so that I understand my resource consumption.

## Acceptance Criteria

1. **AC1: GET /api/settings/tenant endpoint returns tenant info with usage and limits**
   - Returns tenant name, plan, created_at
   - Returns current usage: hive_count, unit_count, user_count, storage_bytes
   - Returns limits: max_hives, max_storage_bytes, max_units, max_users
   - Returns calculated percentages for each resource
   - Uses tenant from JWT claims (no URL param needed)
   - Available in both local and SaaS modes

2. **AC2: Settings page refactored to use tabs**
   - Overview tab: Tenant info card + usage progress bars
   - Profile tab: User profile with name/email display and password change form (local mode)
   - Users tab: Existing user management (from 13-11, local mode only)
   - BeeBrain tab: Existing BeeBrain settings (from 13-18)
   - Tabs dynamically shown/hidden based on auth mode and user role

3. **AC3: Overview tab displays usage with visual progress bars**
   - Shows tenant name and plan
   - Progress bars for: Hives, Units, Users, Storage
   - Each bar shows: "X of Y used (Z%)"
   - Warning color (orange) when usage > 80%
   - Danger color (red) when usage > 95%
   - Storage displayed in human-readable format (MB/GB)

4. **AC4: Profile tab shows user info with conditional password change**
   - Display name (editable in local mode)
   - Email (readonly)
   - Password change form only shown in local mode
   - Password change requires current password + new password + confirm
   - Calls PUT /api/auth/change-password (implemented in 13-21)
   - Success notification after password change

5. **AC5: Conditional sections based on auth mode**
   - Password change form: Local mode only
   - Users tab: Local mode + admin role only
   - All other tabs: Both modes
   - Use existing `getAuthConfigSync()` for mode detection

6. **AC6: PUT /api/settings/profile endpoint for profile updates (local mode)**
   - Updates user's display name
   - Cannot change email (readonly)
   - Returns updated user info
   - Local mode only (403 in SaaS mode)

## Technical Context

### Database Access

**Existing Storage Functions (limits.go):**
```go
// GetTenantLimits - Returns TenantLimits with max_hives, max_storage_bytes, etc.
func GetTenantLimits(ctx context.Context, pool *pgxpool.Pool, tenantID string) (*TenantLimits, error)

// GetTenantUsage - Returns TenantUsage with hive_count, unit_count, user_count, storage_bytes
func GetTenantUsage(ctx context.Context, pool *pgxpool.Pool, tenantID string) (*TenantUsage, error)
```

**Existing Storage Functions (tenants.go):**
```go
// GetTenantByID - Returns Tenant with id, name, plan, status, settings, created_at
func GetTenantByID(ctx context.Context, conn *pgxpool.Conn, id string) (*Tenant, error)
```

### API Specification

**GET /api/settings/tenant**

Returns tenant info with usage statistics and limits.

Response (200):
```json
{
  "data": {
    "tenant": {
      "id": "00000000-0000-0000-0000-000000000000",
      "name": "My Apiary",
      "plan": "free",
      "created_at": "2024-01-15T10:30:00Z"
    },
    "usage": {
      "hive_count": 45,
      "unit_count": 3,
      "user_count": 5,
      "storage_bytes": 2147483648
    },
    "limits": {
      "max_hives": 100,
      "max_units": 10,
      "max_users": 20,
      "max_storage_bytes": 5368709120
    },
    "percentages": {
      "hives_percent": 45,
      "units_percent": 30,
      "users_percent": 25,
      "storage_percent": 40
    }
  }
}
```

**PUT /api/settings/profile** (Local mode only)

Update user's display name.

Request:
```json
{
  "name": "John Smith"
}
```

Response (200):
```json
{
  "data": {
    "id": "user-uuid",
    "name": "John Smith",
    "email": "john@example.com",
    "role": "admin"
  }
}
```

Errors:
- 400: Invalid request body
- 403: Not available in SaaS mode

### Existing Code Patterns

**Handler Pattern (from admin_limits.go):**
```go
func AdminGetTenantLimits(pool *pgxpool.Pool) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        claims := middleware.GetClaims(r.Context())
        tenantID := claims.TenantID  // Use from claims, not URL param

        // Get limits
        limits, err := storage.GetTenantLimits(r.Context(), pool, tenantID)
        // Get usage
        usage, err := storage.GetTenantUsage(r.Context(), pool, tenantID)
        // Combine and respond
        respondJSON(w, response, http.StatusOK)
    }
}
```

**Frontend Hook Pattern (from useUsers.ts):**
```typescript
export function useTenantSettings() {
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const response = await apiClient.get('/settings/tenant');
      setSettings(response.data.data);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return { settings, loading, error, refresh: fetchSettings };
}
```

**Existing Settings.tsx Structure:**
The current Settings page has multiple sections as Cards. This story refactors to use Ant Design Tabs:
- Tab 1 (Overview): Tenant info + Usage stats (NEW)
- Tab 2 (Profile): User profile + Password change (NEW)
- Tab 3 (Users): Existing UserManagement from 13-11 (conditional)
- Tab 4 (BeeBrain): Existing BeeBrain settings from 13-18
- Tab 5 (Preferences): Existing inspection preferences, voice input, treatment intervals

### Frontend Component Structure

**Settings.tsx Refactor:**
```typescript
import { Tabs } from 'antd';

export function Settings() {
  const { authConfig } = useAuth();
  const isLocalMode = authConfig?.mode === 'local';
  const isAdmin = currentUserRole === 'admin';

  const items = [
    { key: 'overview', label: 'Overview', children: <OverviewTab /> },
    { key: 'profile', label: 'Profile', children: <ProfileTab isLocalMode={isLocalMode} /> },
    // Conditional tabs
    ...(isLocalMode && isAdmin ? [{
      key: 'users', label: 'Users', children: <UsersTab />
    }] : []),
    { key: 'beebrain', label: 'BeeBrain', children: <BeeBrainTab /> },
    { key: 'preferences', label: 'Preferences', children: <PreferencesTab /> },
  ];

  return <Tabs items={items} />;
}
```

**UsageProgressBar Component:**
```typescript
interface UsageProgressBarProps {
  label: string;
  current: number;
  max: number;
  format?: (current: number, max: number) => string;
}

function UsageProgressBar({ label, current, max, format }: UsageProgressBarProps) {
  const percent = max > 0 ? Math.round((current / max) * 100) : 0;
  const status = percent >= 95 ? 'exception' : percent >= 80 ? 'warning' : 'normal';

  return (
    <div>
      <Text>{label}</Text>
      <Progress
        percent={percent}
        status={status}
        format={() => format ? format(current, max) : `${current} / ${max}`}
      />
    </div>
  );
}
```

### Dependencies

**Completed Stories:**
- Story 13.11: User Management UI - Users tab component exists
- Story 13.18: BeeBrain BYOK - BeeBrain settings tab exists
- Story 13.21: Security Hardening - PUT /api/auth/change-password endpoint

**Storage Layer:**
- `storage.GetTenantLimits()` - Already implemented
- `storage.GetTenantUsage()` - Already implemented
- `storage.GetTenantByID()` - Already implemented (needs pool version)

## Tasks / Subtasks

### Backend Tasks

- [x] Task 1: Create GET /api/settings/tenant endpoint (AC: #1)
  - [x] Create `apis-server/internal/handlers/settings.go`
  - [x] Implement `GetTenantSettings(pool) http.HandlerFunc`
  - [x] Combine tenant info, usage, limits, and calculated percentages
  - [x] Calculate percentages: `percent = (current * 100) / max` (handle div-by-zero)
  - [x] Return unified response with all data

- [x] Task 2: Create PUT /api/settings/profile endpoint (AC: #6)
  - [x] Add `UpdateUserProfile(pool) http.HandlerFunc` to settings.go
  - [x] Check IsLocalAuth() - return 403 if SaaS mode
  - [x] Validate name is non-empty
  - [x] Update user's name in database
  - [x] Return updated user info

- [x] Task 3: Register routes in main.go (AC: #1, #6)
  - [x] Add `GET /api/settings/tenant` in protected routes
  - [x] Add `PUT /api/settings/profile` in protected routes

- [x] Task 4: Add GetTenantByIDPool function (AC: #1)
  - [x] Add pool-based version of GetTenantByID to tenants.go
  - [x] Follow existing pattern from limits.go

### Frontend Tasks

- [x] Task 5: Create useTenantSettings hook (AC: #1, #3)
  - [x] Create `apis-dashboard/src/hooks/useTenantSettings.ts`
  - [x] Fetch tenant settings from GET /api/settings/tenant
  - [x] Handle loading, error, refresh states
  - [x] Export from hooks/index.ts

- [x] Task 6: Create useUpdateProfile hook (AC: #4, #6)
  - [x] Add to useTenantSettings.ts or create separate hook
  - [x] PUT /api/settings/profile for name update
  - [x] Handle success/error notifications

- [x] Task 7: Create UsageChart component (AC: #3)
  - [x] Create `apis-dashboard/src/components/settings/UsageChart.tsx`
  - [x] Ant Design Progress bars for each resource
  - [x] Color coding: normal < 80%, warning 80-95%, danger >= 95%
  - [x] Format storage as human-readable (MB/GB)

- [x] Task 8: Create Overview tab component (AC: #2, #3)
  - [x] Create `apis-dashboard/src/pages/settings/Overview.tsx`
  - [x] Tenant info card (name, plan, created_at)
  - [x] Usage section with UsageChart
  - [x] Handle loading state with Skeleton

- [x] Task 9: Create Profile tab component (AC: #4, #5)
  - [x] Create `apis-dashboard/src/pages/settings/Profile.tsx`
  - [x] Display name form (editable in local mode)
  - [x] Email display (readonly)
  - [x] Password change form (local mode only)
  - [x] Use Ant Design Form with validation

- [x] Task 10: Refactor Settings.tsx to tabs (AC: #2, #5)
  - [x] Import Ant Design Tabs component
  - [x] Move existing content into Preferences tab
  - [x] Add Overview, Profile, Users, BeeBrain tabs
  - [x] Conditional rendering based on auth mode and role
  - [x] Preserve all existing functionality

### Testing Tasks

- [x] Task 11: Frontend tests
  - [x] Test useTenantSettings hook
  - [x] Test UsageChart component with various percentages
  - [x] Test Overview tab rendering
  - [x] Test Profile tab with/without local mode
  - [x] Test Settings tabs visibility based on auth mode

## Dev Notes

### Implementation Strategy

1. **Backend first** - Create settings.go handler with GET /api/settings/tenant
2. **Add profile endpoint** - PUT /api/settings/profile for local mode
3. **Wire routes** - Add to main.go in protected group
4. **Build hooks** - Create useTenantSettings hook
5. **Create components** - UsageChart, Overview, Profile tabs
6. **Refactor Settings** - Convert to tabs, preserve existing functionality
7. **Test** - Manual testing in both auth modes

### Percentage Calculation

```go
func calculatePercent(current, max int) int {
    if max == 0 {
        return 0
    }
    return (current * 100) / max
}

// For storage (int64)
func calculateStoragePercent(currentBytes, maxBytes int64) int {
    if maxBytes == 0 {
        return 0
    }
    return int((currentBytes * 100) / maxBytes)
}
```

### Storage Formatting (Frontend)

```typescript
function formatStorage(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${gb.toFixed(1)} GB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}
```

### Tab Keys for Navigation

If users navigate directly via URL, support tab anchors:
- `/settings` - Default to Overview
- `/settings#profile` - Profile tab
- `/settings#users` - Users tab (if visible)
- `/settings#beebrain` - BeeBrain tab
- `/settings#preferences` - Preferences tab

### Existing Settings Page Content to Preserve

The current Settings.tsx contains:
1. Inspection Preferences (Advanced Mode toggle)
2. Voice Input settings
3. Data Management links (Export, Labels, Users, BeeBrain)
4. Treatment Intervals table
5. Milestones gallery
6. Offline Storage stats
7. Super Admin section (SaaS mode)

Plan:
- Move items 1, 2, 4 into Preferences tab
- Move items 5, 6 into Preferences tab
- Move item 7 to appear only in SaaS mode
- Data Management links (3) become the tabs themselves

### Project Structure Notes

**Files to Create:**
- `apis-server/internal/handlers/settings.go`
- `apis-dashboard/src/hooks/useTenantSettings.ts`
- `apis-dashboard/src/components/settings/UsageChart.tsx`
- `apis-dashboard/src/pages/settings/Overview.tsx`
- `apis-dashboard/src/pages/settings/Profile.tsx`
- `apis-dashboard/tests/hooks/useTenantSettings.test.ts`
- `apis-dashboard/tests/pages/settings/Overview.test.tsx`
- `apis-dashboard/tests/pages/settings/Profile.test.tsx`
- `apis-dashboard/tests/components/UsageChart.test.tsx`

**Files to Modify:**
- `apis-server/cmd/server/main.go` - Add routes
- `apis-server/internal/storage/tenants.go` - Add GetTenantByIDPool
- `apis-dashboard/src/pages/Settings.tsx` - Refactor to tabs
- `apis-dashboard/src/hooks/index.ts` - Export new hook

### References

- [Source: apis-server/internal/storage/limits.go] - GetTenantLimits, GetTenantUsage
- [Source: apis-server/internal/storage/tenants.go] - GetTenantByID
- [Source: apis-server/internal/handlers/admin_limits.go] - Handler patterns
- [Source: apis-server/internal/handlers/settings_beebrain.go] - Settings handler pattern
- [Source: apis-dashboard/src/pages/Settings.tsx] - Current Settings implementation
- [Source: apis-dashboard/src/pages/settings/Users.tsx] - User management tab
- [Source: apis-dashboard/src/pages/settings/BeeBrainConfig.tsx] - BeeBrain settings tab
- [Source: _bmad-output/implementation-artifacts/13-11-user-management-ui.md] - Users story
- [Source: _bmad-output/implementation-artifacts/13-18-beebrain-byok.md] - BeeBrain story
- [Source: _bmad-output/planning-artifacts/epic-13-dual-auth-mode.md#story-1319] - Epic requirements
- [Source: CLAUDE.md] - Project conventions and API patterns

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

### Completion Notes List

- Implementation complete with all acceptance criteria satisfied
- Remediation completed 2026-01-28: Fixed 9 code review issues

### Change Log

- [2026-01-28] Remediation: Fixed 9 issues from code review
  - H1: Fixed Overview.test.tsx mock to use importOriginal pattern
  - H2: Populated File List section
  - H3: Created Profile.test.tsx with 14 tests
  - H4: Updated Settings.test.tsx to test tabbed interface (21 tests)
  - M1: Removed stale Export Data assertion from Settings.test.tsx
  - L1: Changed "Try Again" from anchor to Button in Overview.tsx
  - L2: Verified no unused imports in Settings.tsx (all used)
  - Profile.tsx: Switched from raw fetch to apiClient for password change
  - Story status updated to "done" and all tasks checked

### File List

**Backend Files (Go):**
- apis-server/internal/handlers/settings.go
- apis-server/cmd/server/main.go (modified - routes added)
- apis-server/internal/storage/tenants.go (modified - GetTenantByIDPool added)

**Frontend Files (TypeScript/React):**
- apis-dashboard/src/hooks/useTenantSettings.ts
- apis-dashboard/src/hooks/index.ts (modified - exports)
- apis-dashboard/src/components/settings/UsageChart.tsx
- apis-dashboard/src/pages/settings/Overview.tsx
- apis-dashboard/src/pages/settings/Profile.tsx
- apis-dashboard/src/pages/Settings.tsx (modified - tabbed interface)

**Test Files:**
- apis-dashboard/tests/pages/settings/Overview.test.tsx
- apis-dashboard/tests/pages/settings/Profile.test.tsx
- apis-dashboard/tests/pages/Settings.test.tsx (modified)
