# Story 8.4: Proactive Insight Notifications

Status: done

## Story

As a **beekeeper**,
I want important insights to appear proactively,
So that I don't miss critical information.

## Acceptance Criteria

1. **Given** BeeBrain detects an action-needed insight **When** I next open the app **Then** a notification card appears prominently:
   - Insight message displayed clearly
   - Buttons: [Dismiss] [Snooze] [Take Action]

2. **Given** I click "Snooze" **When** the snooze options appear **Then** I can choose: 1 day, 7 days, 30 days
   **And** the insight won't appear again until snooze expires

3. **Given** I click "Take Action" **When** the click is processed **Then** I'm navigated to the relevant page/form
   **And** context is pre-filled where possible (e.g., hive is selected)

4. **Given** I click "Dismiss" **When** the dismissal is processed **Then** the insight is hidden permanently for current conditions
   **And** won't reappear unless data changes significantly

5. **Given** multiple insights are pending **When** I view notifications **Then** they're prioritized by severity:
   - action-needed (highest priority, red indicator)
   - warning (medium priority, orange indicator)
   - info (lowest priority, blue indicator)

6. **Given** more than 3 insights are pending **When** notifications display **Then** only the top 3 most important show initially
   **And** a "Show X more" link reveals additional insights

## Tasks / Subtasks

### Task 1: Create useProactiveInsights Hook (AC: #1, #5, #6)
- [x] 1.1 Create `apis-dashboard/src/hooks/useProactiveInsights.ts`
- [x] 1.2 Define `ProactiveInsight` interface extending existing `Insight` type with `action_url` field
- [x] 1.3 Implement fetch from `GET /api/beebrain/dashboard` with filtering for non-dismissed, non-snoozed insights
- [x] 1.4 Implement severity-based sorting (action-needed > warning > info)
- [x] 1.5 Implement top-3 limiting with "show more" toggle state
- [x] 1.6 Track dismissed/snoozed insights locally (optimistic updates)
- [x] 1.7 Implement `dismissInsight(id: string)` function calling `POST /api/beebrain/insights/{id}/dismiss`
- [x] 1.8 Implement `snoozeInsight(id: string, days: number)` function calling `POST /api/beebrain/insights/{id}/snooze?days=N`
- [x] 1.9 Export hook from `apis-dashboard/src/hooks/index.ts`

### Task 2: Create ProactiveInsightNotification Component (AC: #1, #2, #3, #4)
- [x] 2.1 Create `apis-dashboard/src/components/ProactiveInsightNotification.tsx`
- [x] 2.2 Implement single insight notification card with:
  - Severity icon (color-coded: red/orange/blue)
  - Insight message text (human-readable)
  - Hive name link (if applicable)
- [x] 2.3 Implement action buttons row: [Dismiss] [Snooze] [Take Action]
- [x] 2.4 Implement Snooze dropdown/popover with options: 1 day, 7 days, 30 days
- [x] 2.5 Implement dismiss with loading state and success feedback
- [x] 2.6 Implement "Take Action" navigation logic:
  - queen_aging -> `/hives/{hive_id}` (queen info section)
  - treatment_due -> `/hives/{hive_id}` (treatments tab)
  - inspection_overdue -> `/hives/{hive_id}/inspections/new`
  - hornet_activity_spike -> `/clips?site_id={site_id}`
- [x] 2.7 Apply Honey Beegood theme styling (consistent with BeeBrainCard)
- [x] 2.8 Add keyboard accessibility (tabIndex, role, onKeyDown for Enter/Space)
- [x] 2.9 Add ARIA attributes (aria-label, aria-live="polite" for screen readers)
- [x] 2.10 Export component from `apis-dashboard/src/components/index.ts`

### Task 3: Create ProactiveInsightBanner Component (AC: #1, #5, #6)
- [x] 3.1 Create `apis-dashboard/src/components/ProactiveInsightBanner.tsx`
- [x] 3.2 Implement banner container that holds multiple ProactiveInsightNotification cards
- [x] 3.3 Implement stacked card layout (vertically stacked, max 3 visible)
- [x] 3.4 Implement "Show X more" link at bottom when > 3 insights
- [x] 3.5 Implement expand/collapse all insights functionality
- [x] 3.6 Implement smooth animations for card dismiss/snooze (fade out)
- [x] 3.7 Implement empty state (no banner shown when 0 insights)
- [x] 3.8 Add responsive styles (full-width on mobile, max-width on desktop)
- [x] 3.9 Export component from `apis-dashboard/src/components/index.ts`

### Task 4: Integrate Banner into Dashboard Layout (AC: #1)
- [x] 4.1 Import ProactiveInsightBanner into `pages/Dashboard.tsx`
- [x] 4.2 Position banner at top of dashboard, above time range selector
- [x] 4.3 Pass current siteId from site selector to the banner
- [x] 4.4 Ensure banner is visible on initial app load (not scroll-hidden)
- [x] 4.5 Verify banner renders correctly on all viewport sizes

### Task 5: Context Provider for Insights State (AC: #1, #4)
- [x] 5.1 Create `apis-dashboard/src/context/ProactiveInsightsContext.tsx`
- [x] 5.2 Define context with: insights, loading, dismissInsight, snoozeInsight, refreshInsights
- [x] 5.3 Implement provider that wraps app and fetches on mount
- [x] 5.4 Implement refetch on site change
- [x] 5.5 Implement refetch after dismiss/snooze actions
- [x] 5.6 Add ProactiveInsightsProvider to App.tsx

### Task 6: Testing (AC: #1, #2, #3, #4, #5, #6)
- [x] 6.1 Create `apis-dashboard/tests/hooks/useProactiveInsights.test.ts`
- [x] 6.2 Create `apis-dashboard/tests/components/ProactiveInsightNotification.test.tsx`
- [x] 6.3 Create `apis-dashboard/tests/components/ProactiveInsightBanner.test.tsx`
- [x] 6.4 Test severity-based sorting (action-needed first)
- [x] 6.5 Test top-3 limiting and "show more" functionality
- [x] 6.6 Test dismiss flow (API call, optimistic update, UI removal)
- [x] 6.7 Test snooze flow (API call with days param, UI removal)
- [x] 6.8 Test "Take Action" navigation for each rule type
- [x] 6.9 Test keyboard accessibility (Enter/Space activation)
- [x] 6.10 Test responsive layout (mobile/desktop)
- [x] 6.11 Test ARIA attributes are present

## Dev Notes

### API Endpoints (Already Implemented in Story 8-1)

The backend APIs are already complete from Story 8.1:

```
GET  /api/beebrain/dashboard           - Returns all active insights for tenant
POST /api/beebrain/insights/{id}/dismiss - Dismisses an insight permanently
POST /api/beebrain/insights/{id}/snooze  - Snoozes an insight (?days=1|7|30)
```

**Dashboard Response Structure:**
```typescript
interface DashboardResponse {
  data: {
    summary: string;
    last_analysis: string;  // ISO 8601 timestamp
    insights: Insight[];
    all_good: boolean;
  };
}

interface Insight {
  id: string;
  hive_id: string | null;
  hive_name: string | null;
  rule_id: string;  // 'queen_aging', 'treatment_due', 'inspection_overdue', 'hornet_activity_spike'
  severity: 'info' | 'warning' | 'action-needed';
  message: string;
  suggested_action: string;
  data_points: Record<string, unknown>;
  created_at: string;
}
```

**Dismiss Response:**
```json
{
  "data": {
    "message": "Insight dismissed successfully",
    "id": "insight-123"
  }
}
```

**Snooze Response:**
```json
{
  "data": {
    "message": "Insight snoozed for 7 days",
    "id": "insight-123",
    "snoozed_until": "2026-02-01T10:30:00Z"
  }
}
```

### Hook Implementation Pattern

Follow existing `useBeeBrain.ts` and `useHiveBeeBrain.ts` patterns:

```typescript
// apis-dashboard/src/hooks/useProactiveInsights.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../providers/apiClient';
import type { Insight } from './useBeeBrain';

const MAX_VISIBLE_INSIGHTS = 3;

// Severity priority for sorting (lower = higher priority)
const SEVERITY_PRIORITY: Record<string, number> = {
  'action-needed': 1,
  'warning': 2,
  'info': 3,
};

export interface UseProactiveInsightsResult {
  insights: Insight[];
  visibleInsights: Insight[];
  hiddenCount: number;
  showAll: boolean;
  loading: boolean;
  error: Error | null;
  dismissInsight: (id: string) => Promise<void>;
  snoozeInsight: (id: string, days: number) => Promise<void>;
  toggleShowAll: () => void;
  refresh: () => Promise<void>;
}

export function useProactiveInsights(siteId: string | null): UseProactiveInsightsResult {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [showAll, setShowAll] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Sort insights by severity priority
  const sortedInsights = [...insights].sort((a, b) =>
    SEVERITY_PRIORITY[a.severity] - SEVERITY_PRIORITY[b.severity]
  );

  // Split into visible and hidden
  const visibleInsights = showAll ? sortedInsights : sortedInsights.slice(0, MAX_VISIBLE_INSIGHTS);
  const hiddenCount = showAll ? 0 : Math.max(0, sortedInsights.length - MAX_VISIBLE_INSIGHTS);

  // Fetch insights on mount and siteId change
  useEffect(() => {
    if (!siteId) {
      setInsights([]);
      setLoading(false);
      return;
    }

    const fetchInsights = async () => {
      // Abort any pending request
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      setLoading(true);
      setError(null);

      try {
        const response = await apiClient.get(`/api/beebrain/dashboard?site_id=${siteId}`, {
          signal: abortControllerRef.current.signal,
        });
        setInsights(response.data.insights || []);
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(err);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchInsights();

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [siteId]);

  // Dismiss an insight (optimistic update)
  const dismissInsight = useCallback(async (id: string) => {
    // Optimistic update - remove from local state immediately
    setInsights(prev => prev.filter(i => i.id !== id));

    try {
      await apiClient.post(`/api/beebrain/insights/${id}/dismiss`);
    } catch (err) {
      // Rollback on error - refetch to restore state
      setError(err instanceof Error ? err : new Error('Failed to dismiss insight'));
      // Could refetch here to restore, but for UX we keep the optimistic update
    }
  }, []);

  // Snooze an insight (optimistic update)
  const snoozeInsight = useCallback(async (id: string, days: number) => {
    // Optimistic update - remove from local state immediately
    setInsights(prev => prev.filter(i => i.id !== id));

    try {
      await apiClient.post(`/api/beebrain/insights/${id}/snooze?days=${days}`);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to snooze insight'));
    }
  }, []);

  // Toggle show all
  const toggleShowAll = useCallback(() => {
    setShowAll(prev => !prev);
  }, []);

  // Manual refresh
  const refresh = useCallback(async () => {
    if (!siteId) return;

    setLoading(true);
    try {
      const response = await apiClient.get(`/api/beebrain/dashboard?site_id=${siteId}`);
      setInsights(response.data.insights || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to refresh'));
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  return {
    insights: sortedInsights,
    visibleInsights,
    hiddenCount,
    showAll,
    loading,
    error,
    dismissInsight,
    snoozeInsight,
    toggleShowAll,
    refresh,
  };
}
```

### Component Structure

**ProactiveInsightNotification (single card):**
```
+---------------------------------------------------------------+
| [!] Action Needed                                              |
|                                                                |
| Hive 2: Varroa treatment due (92 days since last treatment)    |
| Schedule varroa treatment within the next week.                |
|                                                                |
| [Dismiss]  [Snooze v]  [Take Action]                          |
+---------------------------------------------------------------+
```

**ProactiveInsightBanner (container):**
```
+---------------------------------------------------------------+
| [ProactiveInsightNotification 1 - action-needed]              |
+---------------------------------------------------------------+
| [ProactiveInsightNotification 2 - warning]                    |
+---------------------------------------------------------------+
| [ProactiveInsightNotification 3 - warning]                    |
+---------------------------------------------------------------+
| Show 2 more insights...                                        |
+---------------------------------------------------------------+
```

### Severity Configuration (Consistent with BeeBrainCard)

```typescript
const severityConfig = {
  'action-needed': {
    icon: <ExclamationCircleOutlined />,
    color: colors.error,  // '#c62828'
    tagColor: 'red',
    label: 'Action Needed',
    priority: 1,
  },
  'warning': {
    icon: <WarningOutlined />,
    color: colors.warning,  // '#f9a825'
    tagColor: 'orange',
    label: 'Warning',
    priority: 2,
  },
  'info': {
    icon: <InfoCircleOutlined />,
    color: colors.info,  // '#1976d2'
    tagColor: 'blue',
    label: 'Info',
    priority: 3,
  },
};
```

### Navigation Mapping (Rule ID to Action)

```typescript
const actionNavigation: Record<string, (insight: Insight) => string> = {
  'queen_aging': (insight) => insight.hive_id ? `/hives/${insight.hive_id}` : '/hives',
  'treatment_due': (insight) => insight.hive_id ? `/hives/${insight.hive_id}` : '/hives',
  'inspection_overdue': (insight) => insight.hive_id ? `/hives/${insight.hive_id}/inspections/new` : '/hives',
  'hornet_activity_spike': () => '/clips',
};

// Usage:
const handleTakeAction = (insight: Insight) => {
  const getPath = actionNavigation[insight.rule_id] || (() => '/hives');
  navigate(getPath(insight));
};
```

### Snooze Dropdown Options

Use Ant Design `Dropdown` with `Menu`:

```typescript
const snoozeOptions = [
  { key: '1', label: 'Snooze for 1 day', days: 1 },
  { key: '7', label: 'Snooze for 7 days', days: 7 },
  { key: '30', label: 'Snooze for 30 days', days: 30 },
];

<Dropdown
  menu={{
    items: snoozeOptions.map(opt => ({
      key: opt.key,
      label: opt.label,
      onClick: () => handleSnooze(insight.id, opt.days),
    })),
  }}
  trigger={['click']}
>
  <Button>
    Snooze <DownOutlined />
  </Button>
</Dropdown>
```

### Styling Requirements

Use Honey Beegood theme from `src/theme/apisTheme.ts`:

```typescript
// Card styling for notifications (prominent but not alarming)
const notificationCardStyle = {
  background: `linear-gradient(135deg, ${colors.salomie} 0%, #fff5e6 100%)`,
  borderLeft: `4px solid ${severityConfig[insight.severity].color}`,
  borderRadius: 8,
  marginBottom: spacing.sm,
  padding: spacing.md,
  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
};

// Banner container style
const bannerStyle = {
  padding: spacing.md,
  marginBottom: spacing.lg,
  borderRadius: 12,
  background: colors.coconutCream,
};
```

### Animation for Dismiss/Snooze

Use CSS transitions for smooth removal:

```typescript
const [removingId, setRemovingId] = useState<string | null>(null);

const handleDismiss = async (id: string) => {
  setRemovingId(id);
  // Wait for animation
  await new Promise(resolve => setTimeout(resolve, 300));
  await dismissInsight(id);
  setRemovingId(null);
};

// In render:
<div
  style={{
    opacity: removingId === insight.id ? 0 : 1,
    transform: removingId === insight.id ? 'translateX(-20px)' : 'translateX(0)',
    transition: 'opacity 0.3s, transform 0.3s',
  }}
>
  {/* card content */}
</div>
```

### Project Structure Notes

**Files to create:**
- `apis-dashboard/src/hooks/useProactiveInsights.ts`
- `apis-dashboard/src/components/ProactiveInsightNotification.tsx`
- `apis-dashboard/src/components/ProactiveInsightBanner.tsx`
- `apis-dashboard/src/context/ProactiveInsightsContext.tsx`
- `apis-dashboard/tests/hooks/useProactiveInsights.test.ts`
- `apis-dashboard/tests/components/ProactiveInsightNotification.test.tsx`
- `apis-dashboard/tests/components/ProactiveInsightBanner.test.tsx`

**Files to modify:**
- `apis-dashboard/src/hooks/index.ts` - add useProactiveInsights export
- `apis-dashboard/src/components/index.ts` - add component exports
- `apis-dashboard/src/pages/Dashboard.tsx` - integrate ProactiveInsightBanner
- `apis-dashboard/src/App.tsx` - add ProactiveInsightsProvider

### Integration Location in Dashboard

Insert banner at the top of Dashboard page, above the time range selector:

```tsx
// pages/Dashboard.tsx
import { ProactiveInsightBanner } from '../components';

function Dashboard() {
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);

  return (
    <div>
      {/* Proactive Insights Banner - Story 8.4 */}
      <ProactiveInsightBanner siteId={selectedSiteId} />

      {/* Existing dashboard content */}
      <TimeRangeSelector ... />
      {/* ... rest of dashboard */}
    </div>
  );
}
```

### Accessibility Requirements

- All interactive elements must have `tabIndex={0}`
- Buttons use native `<Button>` (already accessible)
- Clickable non-button elements use `role="button"` with `onKeyDown` for Enter/Space
- Container uses `aria-live="polite"` to announce changes to screen readers
- Severity indicators include `aria-label` for screen reader context
- Focus management: after dismiss/snooze, focus moves to next notification or banner header

### Empty State Behavior

When no insights exist:
- The ProactiveInsightBanner should NOT render (return null)
- No empty banner frame should be shown
- Dashboard renders as normal without the banner

### Loading State Behavior

During initial load:
- Show a subtle skeleton in banner position (1-2 lines)
- Do not block dashboard rendering

### Error State Behavior

On fetch error:
- Log error to console
- Do not show error message to user (graceful degradation)
- Dashboard functions normally without proactive notifications

### Key Implementation Details from Previous Stories

From `8-1-beebrain-rule-engine-mvp.md`:
- Insights have severity: 'info' | 'warning' | 'action-needed'
- Dismiss marks `dismissed_at` timestamp in DB
- Snooze marks `snoozed_until` timestamp in DB
- API returns only active (non-dismissed, non-snoozed) insights

From `8-3-hive-detail-beebrain-analysis.md`:
- Dismiss API: `POST /api/beebrain/insights/{id}/dismiss`
- Snooze API: `POST /api/beebrain/insights/{id}/snooze?days=7`
- Use optimistic updates for responsive UX

### References

- [Source: architecture.md#Frontend-Architecture] - React patterns and theme
- [Source: architecture.md#Complete-API-Endpoints] - BeeBrain API definitions
- [Source: epics.md#Story-8.4] - Full acceptance criteria
- [Source: 8-1-beebrain-rule-engine-mvp.md] - API implementation details
- [Source: 8-2-dashboard-beebrain-card.md] - BeeBrainCard component patterns
- [Source: 8-3-hive-detail-beebrain-analysis.md] - Dismiss/snooze patterns
- [Source: ux-design-specification.md#BeeBrain-Proactive-Insights] - UX guidelines
- [Source: BeeBrainCard.tsx] - Existing severity config and styling patterns
- [Source: useBeeBrain.ts] - Hook pattern reference

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A

### Completion Notes List

- Implemented `useProactiveInsights` hook with severity-based sorting, top-3 limiting, and optimistic dismiss/snooze updates
- Created `ProactiveInsightNotification` component with full accessibility support (ARIA labels, keyboard navigation, screen reader announcements)
- Created `ProactiveInsightBanner` container component with smooth animations for dismiss/snooze actions
- Integrated banner into Dashboard at top position, above time range selector
- Added `ProactiveInsightsContext` provider for global state management
- Added provider to App.tsx within protected routes
- All 70 tests pass covering:
  - Hook functionality (14 tests)
  - ProactiveInsightNotification component (34 tests)
  - ProactiveInsightBanner component (22 tests)
- No regressions in existing test suite (failing tests are unrelated - from Story 7.5 Voice Input)

### File List

**New Files:**
- `apis-dashboard/src/hooks/useProactiveInsights.ts`
- `apis-dashboard/src/components/ProactiveInsightNotification.tsx`
- `apis-dashboard/src/components/ProactiveInsightBanner.tsx`
- `apis-dashboard/src/context/ProactiveInsightsContext.tsx`
- `apis-dashboard/tests/hooks/useProactiveInsights.test.ts`
- `apis-dashboard/tests/components/ProactiveInsightNotification.test.tsx`
- `apis-dashboard/tests/components/ProactiveInsightBanner.test.tsx`

**Modified Files:**
- `apis-dashboard/src/hooks/index.ts` - Added useProactiveInsights export
- `apis-dashboard/src/components/index.ts` - Added component exports
- `apis-dashboard/src/context/index.ts` - Added ProactiveInsightsContext export
- `apis-dashboard/src/pages/Dashboard.tsx` - Integrated ProactiveInsightBanner
- `apis-dashboard/src/App.tsx` - Added ProactiveInsightsProvider

### Change Log

- 2026-01-25: Implemented Story 8.4 - Proactive Insight Notifications (all ACs satisfied, tests passing)
- 2026-01-25: Remediation - Fixed 6 code review issues (H1, M1-M3, L1-L2)

