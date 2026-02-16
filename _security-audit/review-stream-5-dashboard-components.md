# Stream 5: Dashboard Components, Pages & Hooks Review

**Reviewer:** Claude Opus 4.6 (automated)
**Date:** 2026-02-06
**Scope:** `apis-dashboard/src/hooks/`, `apis-dashboard/src/pages/`, `apis-dashboard/src/components/` (excluding `auth/` and `layout/` subdirs which are in Stream 4)
**Files Reviewed:** 54 hooks, 35+ pages, 100+ components (sampled key files)

---

## Executive Summary

The APIS React dashboard has a well-structured architecture with proper separation of concerns through the layered hooks pattern. However, **approximately 60% of hooks do not follow the mandatory `isMountedRef` cleanup pattern** defined in CLAUDE.md, creating potential memory leak risks. There are also several instances of hardcoded placeholder data shipped to production, significant code duplication between related hooks, and a few architectural violations worth addressing. No XSS vulnerabilities or critical security issues were found -- the codebase avoids `dangerouslySetInnerHTML` and raw `innerHTML` assignment entirely.

**Finding Summary:**
- CRITICAL: 0
- HIGH: 4
- MEDIUM: 8
- LOW: 7
- INFO: 3

---

## HIGH Severity Findings

### H-1: ~30 Hooks Missing Mandatory `isMountedRef` Cleanup Pattern

**Files:** Multiple hooks in `apis-dashboard/src/hooks/`
**CLAUDE.md Requirement:** "Hook Pattern (required for all new hooks)" specifies `isMountedRef` with cleanup in `useEffect` return.

The CLAUDE.md prescribes a specific hook pattern with `isMountedRef` to prevent state updates after unmount. Only ~40% of hooks implement this pattern. The following hooks are **compliant** (have `isMountedRef`):

- `useDetection`, `useHiveActivity`, `useHiveDetail`, `useHivesList`, `useHiveTasks`, `useInspectionsList`, `useNestEstimate`, `useOfflineTasks`, `useSiteDetail`, `useSites`, `useTaskStats`, `useTaskSuggestions`, `useUnitDetail`, `useUnits`

The following hooks are **non-compliant** (missing `isMountedRef`):

- `useActivityFeed`, `useAdminBeeBrain`, `useAdminTenants`, `useBeeBrainSettings`, `useCalendar`, `useClips`, `useCustomLabels`, `useDetectionStats`, `useEquipment`, `useExport`, `useFeedings`, `useFrameHistory`, `useHarvests` (all 3 sub-hooks), `useHiveLoss` (all 3 sub-hooks), `useImpersonation`, `useMaintenanceItems`, `useMilestones` (both sub-hooks), `useOverwintering` (all 5 sub-hooks), `useProactiveInsights`, `useSeasonRecap` (all 3 sub-hooks), `useTemperatureCorrelation`, `useTenantSettings`, `useTreatments`, `useTrendData`, `useUsers` (useUsers fetcher), `useWeather`, `useFetchTasks`

**Impact:** When a component using a non-compliant hook unmounts during an in-flight API request, React will attempt to call `setState` on an unmounted component. While React 18 handles this more gracefully than earlier versions, it can still cause warnings and unexpected behavior in concurrent mode or with StrictMode double-rendering.

**Recommendation:** Create a `useIsMounted()` utility hook and systematically retrofit all data-fetching hooks.

---

### H-2: `useImpersonation` Bypasses `apiClient` Transport Layer

**File:** `apis-dashboard/src/hooks/useImpersonation.ts`, lines 80, 120, 142
**CLAUDE.md Rule:** "All GET requests go through hooks" and the transport layer is `apiClient`

```typescript
// Line 80
const response = await fetch(`${API_URL}/admin/impersonate/status`, {
// Line 120
const response = await fetch(`${API_URL}/admin/impersonate/${targetTenantId}`, {
// Line 142
const response = await fetch(`${API_URL}/admin/impersonate/stop`, {
```

The `useImpersonation` hook uses raw `fetch()` instead of the `apiClient` Axios instance. This bypasses:
- Auth token/cookie attachment handled by interceptors
- Error response formatting
- Base URL configuration
- Any future middleware (rate limiting, logging, etc.)

**Impact:** If `apiClient` interceptors are updated (e.g., to add security headers or change auth handling), this hook will not benefit from those changes. The impersonation feature is a privileged admin action, making this more concerning.

**Recommendation:** Refactor to use `apiClient` like all other hooks.

---

### H-3: `Settings.tsx` Uses CommonJS `require()` for Dynamic Imports

**File:** `apis-dashboard/src/pages/Settings.tsx`, lines 538-545, 587-593

```typescript
// Line 538-545 (UsersTab)
const {
  useUsers,
  useUpdateUser,
  useDeleteUser,
  useInviteUser,
  useResetPassword,
} = require('../hooks/useUsers');
const { UserList } = require('../components/users');

// Line 587-593 (BeeBrainTab)
const {
  useBeeBrainSettings,
  useUpdateBeeBrainSettings,
  getModeDisplayName,
  getProviderDisplayName,
  getBYOKProviderOptions,
} = require('../hooks/useBeeBrainSettings');
```

Using `require()` in a Vite/ESM project:
1. Loses TypeScript type checking at the call sites (all returns are `any`)
2. Breaks tree-shaking (these modules will always be bundled)
3. May fail in strict ESM environments
4. The stated reason ("to avoid circular dependencies") suggests an architectural issue that should be solved differently

**Impact:** Type safety is completely lost for all hook return values and component props in these two tab components. Bugs introduced here would not be caught by `tsc --noEmit`.

**Recommendation:** Use `React.lazy()` with dynamic `import()` for code splitting, or restructure imports to break the circular dependency.

---

### H-4: Settings Page Uses Raw `fetch()` for Auth Endpoint

**File:** `apis-dashboard/src/pages/Settings.tsx`, lines 896-909

```typescript
const fetchRole = async () => {
  try {
    const response = await fetch(`${API_URL}/auth/me`, {
      credentials: 'include',
    });
    if (response.ok) {
      const data: MeResponse = await response.json();
      setCurrentUserRole(data.user.role);
      setCurrentUserId(data.user.id);
    }
  } catch (err) {
    console.error('Failed to fetch user role:', err);
  }
};
```

Same issue as H-2 -- raw `fetch()` bypasses `apiClient` interceptors. This is in a page file rather than a hook, which additionally violates the layered architecture rule: "NO `apiClient.get()` in pages" (and by extension, no raw `fetch()` for GET operations in pages).

**Recommendation:** Create a `useCurrentUser` hook or extend `useAuth` to provide role information.

---

## MEDIUM Severity Findings

### M-1: Massive Code Duplication Between `useHiveTasks` and `useOfflineTasks`

**Files:**
- `apis-dashboard/src/hooks/useHiveTasks.ts`
- `apis-dashboard/src/hooks/useOfflineTasks.ts`

Both files contain identical implementations of:
- `cachedToTask()` converter function
- `isCacheStale()` with same 5-minute threshold
- `isOverdue()` check
- `sortByPriority()` and `sortByPriorityThenDueDate()` sorters
- `priorityOrder` mapping
- `CACHE_STALENESS_MINUTES` constant

**Impact:** Bug fixes or logic changes to task sorting/caching must be applied in two places. Divergence will cause inconsistent behavior between the hive detail tasks view and the global offline tasks view.

**Recommendation:** Extract shared utilities into `apis-dashboard/src/utils/taskUtils.ts`.

---

### M-2: Near-Identical `useHarvestsByHive` and `useHarvestsBySite` Hooks

**File:** `apis-dashboard/src/hooks/useHarvests.ts`

These two hooks differ only in:
1. The API endpoint (`/hives/${id}/harvests` vs `/sites/${id}/harvests`)
2. The dependency parameter name

The entire hook body (state management, error handling, return shape) is duplicated.

**Recommendation:** Create a single `useHarvests(entityType: 'hive' | 'site', entityId: string)` hook.

---

### M-3: `HiveDetail.tsx` is a 756-line God Component

**File:** `apis-dashboard/src/pages/HiveDetail.tsx` (756 lines)

This page contains:
- 8+ modal state variables
- Handlers for treatments, feedings, harvests, equipment, hive loss, queen replacement, box changes
- Inline `useIsMobile()` hook definition
- Responsive layout split (desktop/mobile)
- Direct API calls for mutations

While it delegates rendering to `HiveDetailDesktop` and `HiveDetailMobile`, it still manages all state and handlers, making it hard to reason about and test.

**Recommendation:** Extract domain-specific handlers into custom hooks (e.g., `useHiveManagement(hiveId)`).

---

### M-4: `Settings.tsx` is a 1040-line Monolith

**File:** `apis-dashboard/src/pages/Settings.tsx` (1040 lines)

Contains 5 inline tab components: `PreferencesTab`, `UsersTab`, `BeeBrainTab`, `SuperAdminTab`, plus the main `Settings` component. Each tab has its own state management, effects, and handlers.

While the sub-pages `Overview` and `Profile` are properly extracted to `pages/settings/`, the remaining tabs are not.

**Recommendation:** Extract `PreferencesTab`, `UsersTab`, `BeeBrainTab`, `SuperAdminTab` into their own files under `pages/settings/`.

---

### M-5: `Sites.tsx` Renders Hardcoded Placeholder Data as Real Data

**File:** `apis-dashboard/src/pages/Sites.tsx`, lines 195, 232, 246

```typescript
// Line 195
Last inspected 2 days ago

// Line 232
<span style={{ fontSize: 14, fontWeight: 700 }}>2 Units</span>

// Line 246
<span style={{ fontSize: 14, fontWeight: 700 }}>8 Hives</span>
```

These are static mockup values that appear as real data to users. The site cards show "2 Units", "8 Hives", and "Last inspected 2 days ago" regardless of actual site data. The site data model (from `useSites`) likely includes `hive_count` or similar fields, but they are not being used.

**Impact:** Users will see incorrect counts for every site, undermining trust in the dashboard.

**Recommendation:** Replace with actual data from the `site` object. If the API doesn't provide these fields yet, show "N/A" or omit the section.

---

### M-6: `useDetectionStats` Has Unreliable Mounted Check

**File:** `apis-dashboard/src/hooks/useDetectionStats.ts`

Uses a local `let isMounted = true` variable instead of `useRef(true)`. In `useEffect` closures with polling intervals, the local variable can become stale in certain React concurrent mode scenarios, whereas `useRef` provides a stable reference.

**Recommendation:** Replace local `isMounted` variable with `useRef(true)` pattern per CLAUDE.md.

---

### M-7: `useProactiveInsights` Sorts on Every Render Without `useMemo`

**File:** `apis-dashboard/src/hooks/useProactiveInsights.ts`

The hook sorts the insights array during rendering but does not wrap the sort in `useMemo`. This means every parent re-render triggers a re-sort even if the data hasn't changed.

**Recommendation:** Wrap the sort result in `useMemo` with `[insights]` dependency.

---

### M-8: `admin/Tenants.tsx` is 997 Lines With Inline Modals and Style Objects

**File:** `apis-dashboard/src/pages/admin/Tenants.tsx` (997 lines)

Contains inline modal components (`CreateTenantModal`, `EditTenantModal`), helper components (`TenantAvatar`, `PlanBadge`, `StatusIndicator`, `ActionButton`), extensive inline styles, and CSS injection via `<style>` tag.

**Impact:** This makes the file hard to maintain and test. The inline CSS (`<style>` tag) uses global selectors that override Ant Design styles site-wide, which can cause unintended side effects on other pages.

**Recommendation:** Extract modals and helper components into separate files. Use CSS modules or styled-components for scoped styles.

---

## LOW Severity Findings

### L-1: Dashboard Hardcoded Username

**File:** `apis-dashboard/src/pages/Dashboard.tsx`, line 152

```typescript
const userName = 'Sam'; // TODO: Get from auth context
```

The `useAuth` hook provides `user.name` but is not imported on this page. The TODO has been left unresolved.

---

### L-2: `Tasks.tsx` Unused Variable

**File:** `apis-dashboard/src/pages/Tasks.tsx`, line 49

```typescript
const { stats: _taskStats } = useTaskStats();
```

The task stats hook is called but its data is never used (prefixed with `_` to suppress linting). This triggers an unnecessary API request on every page load.

**Recommendation:** Remove the hook call or use the data (e.g., for the overdue alert banner mentioned in the comment).

---

### L-3: `useCalendar` Has Suppressed ESLint exhaustive-deps Warning

**File:** `apis-dashboard/src/hooks/useCalendar.ts`, line 168

```typescript
}, []); // eslint-disable-line react-hooks/exhaustive-deps
```

The `fetchEvents` callback is intentionally excluded from the dependency array. While the comment explains this is intentional, the pattern risks stale closures if dependencies change.

**Recommendation:** Use `useCallback` with proper dependencies instead of suppressing the warning.

---

### L-4: Global CSS Injected via Inline `<style>` Tags in Multiple Components

**Files:**
- `apis-dashboard/src/components/ActiveTasksList.tsx` (lines 690-719)
- `apis-dashboard/src/pages/admin/Tenants.tsx` (lines 946-991)
- `apis-dashboard/src/pages/InspectionCreate.tsx` (lines 853-863)
- `apis-dashboard/src/pages/SeasonRecap.tsx` (lines 273-290)

These `<style>` tags inject CSS with global selectors like `.ant-table-thead > tr > th` that affect the entire application, not just the component where they're defined.

**Impact:** Style collisions when multiple pages are rendered (e.g., in tabs or when navigating), and overrides persist in the DOM even after the component unmounts.

**Recommendation:** Use CSS modules, scoped class names, or Ant Design's `styles` prop for component-level customization.

---

### L-5: `InspectionCreate.tsx` Fetches Hive Data Without a Hook

**File:** `apis-dashboard/src/pages/InspectionCreate.tsx`, lines 303-317

```typescript
const fetchHive = useCallback(async () => {
  try {
    setLoading(true);
    const response = await apiClient.get<HiveResponse>(`/hives/${hiveId}`);
    setHive(response.data.data);
  } catch (error) { ... }
}, [hiveId, navigate]);
```

This violates the layered architecture rule: "NO `apiClient.get()` in pages." The existing `useHiveDetail` hook could be used instead.

**Recommendation:** Replace with `useHiveDetail(hiveId)` hook.

---

### L-6: Hives List Page Filter Tabs Show Hardcoded Zero Counts

**File:** `apis-dashboard/src/pages/Hives.tsx`, lines 127-149

```typescript
{ key: 'healthy', label: 'Healthy (0)' },
{ key: 'needs-inspection', label: 'Needs Inspection (0)' },
{ key: 'critical', label: 'Critical (0)' },
```

Filter tabs display hardcoded `(0)` counts and are not functional (no click handlers, no active state management).

**Recommendation:** Either implement the filtering or remove the non-functional tabs to avoid confusing users.

---

### L-7: `ClipPlayerModal` Video Autoplay May Fail on Mobile Browsers

**File:** `apis-dashboard/src/components/ClipPlayerModal.tsx`, line 349

```typescript
<video ... autoPlay ... />
```

Mobile browsers (especially iOS Safari) block autoplay unless the user has interacted with the page. The video may fail to start silently.

**Recommendation:** Add an `onPlay` error handler that shows a "tap to play" overlay if autoplay is blocked.

---

## INFO Findings

### I-1: ErrorBoundary Implementation is Solid

**File:** `apis-dashboard/src/components/ErrorBoundary.tsx`

Well-implemented error boundary with:
- Chunk loading error detection (deployment-safe)
- Custom fallback support
- Retry and reload options
- Proper `componentDidCatch` logging

Used appropriately in `Units.tsx`, `Tasks.tsx`, and `Maintenance.tsx`.

---

### I-2: LiveStream WebSocket Handling is Well-Engineered

**File:** `apis-dashboard/src/components/LiveStream.tsx`

Good practices observed:
- URL injection prevention via regex validation of `unitId` (line 52)
- Proper Blob URL revocation to prevent memory leaks (lines 77-79, 122-124)
- Exponential backoff reconnection with max retries
- Ref-based retry counter to avoid stale closures
- Proper cleanup on unmount

---

### I-3: No XSS Vulnerabilities Found

The codebase does not use `dangerouslySetInnerHTML` or raw `innerHTML` assignment. User-provided content (notes, names, labels) is rendered through React's JSX which auto-escapes HTML. The only raw HTML comes from static `<style>` tags (see L-4).

---

## Summary of Recommendations (Priority Order)

1. **Create `useIsMounted()` utility hook** and retrofit all 30+ non-compliant hooks (H-1)
2. **Refactor `useImpersonation`** to use `apiClient` instead of raw `fetch()` (H-2)
3. **Replace `require()` calls in Settings.tsx** with proper ESM imports or `React.lazy()` (H-3)
4. **Fix `Sites.tsx` hardcoded data** -- "2 Units", "8 Hives", "Last inspected 2 days ago" (M-5)
5. **Extract shared task utilities** from `useHiveTasks`/`useOfflineTasks` into `utils/taskUtils.ts` (M-1)
6. **Break up `HiveDetail.tsx`** (756 lines) and `Settings.tsx` (1040 lines) god components (M-3, M-4)
7. **Fix Dashboard hardcoded username** `'Sam'` using `useAuth().user?.name` (L-1)
8. **Remove or use `_taskStats`** in Tasks.tsx to avoid unnecessary API call (L-2)
9. **Replace inline `<style>` tags** with scoped CSS solutions (L-4)
10. **Create `useCurrentUser` hook** to replace raw `fetch()` in Settings.tsx (H-4)
