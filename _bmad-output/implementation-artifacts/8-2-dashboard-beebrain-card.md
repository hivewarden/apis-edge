# Story 8.2: Dashboard BeeBrain Card

Status: done

## Story

As a **beekeeper**,
I want to see BeeBrain's daily summary on the dashboard,
So that I know if anything needs my attention today.

## Acceptance Criteria

1. **Given** I am on the Dashboard **When** I view the BeeBrain card **Then** I see:
   - Header showing "BeeBrain Analysis" with brain icon
   - "Last updated: X ago" with refresh button
   - Summary text of current status

2. **Given** everything is healthy **When** BeeBrain has no warnings **Then** I see: "All quiet at [Site Name]. Your X hives are doing well. No actions needed."

3. **Given** there are concerns **When** BeeBrain has warnings **Then** I see a prioritized list:
   - Warning icon + "Hive 2: Varroa treatment due (92 days since last)"
   - Info icon + "Hive 3: Consider inspection (16 days)"
   - Each item links to the relevant hive

4. **Given** I click Refresh **When** the analysis runs **Then** I see:
   - A loading spinner on the refresh button
   - The card updates with fresh analysis
   - Timestamp updates to "Just now"

5. **Given** analysis takes too long (>10s) **When** the timeout is reached **Then** I see: "Analysis is taking longer than expected. Check back soon."

## Tasks / Subtasks

### Task 1: Create useBeeBrain Hook (AC: #1, #2, #3, #4, #5)
- [x] 1.1 Create `apis-dashboard/src/hooks/useBeeBrain.ts`
- [x] 1.2 Define BeeBrainData interface matching API response
- [x] 1.3 Implement fetch from `GET /api/beebrain/dashboard?site_id=xxx`
- [x] 1.4 Implement refresh function calling `POST /api/beebrain/refresh`
- [x] 1.5 Add 10-second timeout handling for refresh
- [x] 1.6 Add auto-refresh on 1-hour interval (cached data TTL)
- [x] 1.7 Export hook from `apis-dashboard/src/hooks/index.ts`

### Task 2: Create BeeBrainCard Component (AC: #1, #2, #3, #4, #5)
- [x] 2.1 Create `apis-dashboard/src/components/BeeBrainCard.tsx`
- [x] 2.2 Implement card header with brain icon and "BeeBrain Analysis" title
- [x] 2.3 Implement "Last updated: X ago" with relative time formatting
- [x] 2.4 Implement refresh button with loading state
- [x] 2.5 Implement healthy state display ("All quiet...")
- [x] 2.6 Implement concerns state display (prioritized list with icons)
- [x] 2.7 Make each insight clickable, linking to `/hives/{hive_id}`
- [x] 2.8 Implement loading skeleton state
- [x] 2.9 Implement timeout message state
- [x] 2.10 Apply Honey Beegood theme styling
- [x] 2.11 Export component from `apis-dashboard/src/components/index.ts`

### Task 3: Integrate into Dashboard Page (AC: #1)
- [x] 3.1 Import BeeBrainCard into Dashboard.tsx
- [x] 3.2 Add BeeBrainCard to dashboard layout after Weather row
- [x] 3.3 Pass selectedSiteId prop to BeeBrainCard
- [x] 3.4 Verify card renders correctly in all site selection states

### Task 4: Testing (AC: #1, #2, #3, #4, #5)
- [x] 4.1 Create `apis-dashboard/tests/hooks/useBeeBrain.test.ts`
- [x] 4.2 Create `apis-dashboard/tests/components/BeeBrainCard.test.tsx`
- [x] 4.3 Test healthy state rendering
- [x] 4.4 Test concerns state with multiple insights
- [x] 4.5 Test refresh button functionality
- [x] 4.6 Test timeout handling
- [x] 4.7 Test navigation to hive detail

## Dev Notes

### API Response Structure (from Story 8.1)

The BeeBrain API returns this structure from `GET /api/beebrain/dashboard`:

```typescript
interface BeeBrainResponse {
  data: {
    summary: string;           // "All looks good..." or analysis text
    last_analysis: string;     // ISO 8601 timestamp
    insights: Insight[];       // Array of insights (empty if all_good)
    all_good: boolean;         // true if no warnings
  };
}

interface Insight {
  id: string;
  hive_id: string | null;      // null for tenant-wide insights
  hive_name: string | null;
  rule_id: string;             // 'queen_aging', 'treatment_due', etc.
  severity: 'info' | 'warning' | 'action-needed';
  message: string;
  suggested_action: string;
  data_points: Record<string, any>;
  created_at: string;
}
```

### Hook Implementation Pattern

Follow `useWeather.ts` pattern exactly:

```typescript
// apis-dashboard/src/hooks/useBeeBrain.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../providers/apiClient';

const BEEBRAIN_REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour (matches server TTL)
const REFRESH_TIMEOUT_MS = 10000; // 10 seconds

export interface Insight {
  id: string;
  hive_id: string | null;
  hive_name: string | null;
  rule_id: string;
  severity: 'info' | 'warning' | 'action-needed';
  message: string;
  suggested_action: string;
  data_points: Record<string, unknown>;
  created_at: string;
}

export interface BeeBrainData {
  summary: string;
  last_analysis: string;
  insights: Insight[];
  all_good: boolean;
}

interface UseBeeBrainResult {
  data: BeeBrainData | null;
  loading: boolean;
  refreshing: boolean;
  error: Error | null;
  timedOut: boolean;
  refresh: () => Promise<void>;
}

export function useBeeBrain(siteId: string | null): UseBeeBrainResult {
  // State and fetch logic following useWeather pattern
  // Include timeout handling for refresh operation
}
```

### Component Pattern

Follow `WeatherCard.tsx` pattern for card structure:

```typescript
// apis-dashboard/src/components/BeeBrainCard.tsx
import { Card, Typography, Button, Space, Skeleton, List, Tooltip, Tag } from 'antd';
import { ReloadOutlined, BulbOutlined, WarningOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useBeeBrain, Insight } from '../hooks/useBeeBrain';
import { colors } from '../theme/apisTheme';

interface BeeBrainCardProps {
  siteId: string | null;
}

// Severity to icon/color mapping
const severityConfig = {
  'action-needed': { icon: <WarningOutlined />, color: '#f5222d' },  // red
  'warning': { icon: <WarningOutlined />, color: '#fa8c16' },        // orange
  'info': { icon: <InfoCircleOutlined />, color: '#1890ff' },        // blue
};

export function BeeBrainCard({ siteId }: BeeBrainCardProps) {
  const navigate = useNavigate();
  const { data, loading, refreshing, error, timedOut, refresh } = useBeeBrain(siteId);

  // Render states: loading, no site, error, healthy, concerns
}
```

### Relative Time Formatting

Reuse pattern from WeatherCard:

```typescript
function formatLastUpdated(dateStr: string): string {
  const now = new Date();
  const then = new Date(dateStr);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return then.toLocaleDateString();
}
```

### Styling Requirements

Use Honey Beegood theme colors from `src/theme/apisTheme.ts`:
- Card background: `colors.salomie` (light honey)
- Border: `colors.seaBuckthorn` (orange)
- Text: `colors.brownBramble` (dark brown)
- Brain icon: Use `BulbOutlined` from Ant Design (closest to brain concept)

Card gradient similar to WeatherCard:
```typescript
style={{
  background: `linear-gradient(135deg, ${colors.salomie} 0%, #f0e6ff 100%)`, // honey to light purple
  borderColor: colors.seaBuckthorn,
  borderWidth: 2,
}}
```

### Dashboard Integration

Add to Dashboard.tsx in the Detection Activity Section:

```tsx
// After the TodayActivityCard, WeatherCard, ActivityClockCard row
<Row gutter={[16, 16]} style={{ marginTop: 16 }}>
  <Col xs={24} lg={12}>
    <BeeBrainCard siteId={selectedSiteId} />
  </Col>
  <Col xs={24} lg={12}>
    <NestEstimatorCard ... />
  </Col>
</Row>
```

### Test Patterns

Follow existing test structure in `apis-dashboard/tests/`:

```typescript
// tests/hooks/useBeeBrain.test.ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useBeeBrain } from '../../src/hooks/useBeeBrain';

describe('useBeeBrain', () => {
  it('returns null data when no siteId', async () => {
    const { result } = renderHook(() => useBeeBrain(null));
    expect(result.current.data).toBeNull();
  });

  // Test API fetch, refresh, timeout, error handling
});
```

### Project Structure Notes

**Files to create:**
- `apis-dashboard/src/hooks/useBeeBrain.ts`
- `apis-dashboard/src/components/BeeBrainCard.tsx`
- `apis-dashboard/tests/hooks/useBeeBrain.test.ts`
- `apis-dashboard/tests/components/BeeBrainCard.test.tsx`

**Files to modify:**
- `apis-dashboard/src/hooks/index.ts` - add useBeeBrain export
- `apis-dashboard/src/components/index.ts` - add BeeBrainCard export
- `apis-dashboard/src/pages/Dashboard.tsx` - import and add BeeBrainCard

### Key Implementation Details

**Insight Priority Order:**
Display insights in this order (severity):
1. `action-needed` - Red warning icon
2. `warning` - Orange warning icon
3. `info` - Blue info icon

**Empty States:**
- No site selected: "Select a site to view BeeBrain analysis"
- Loading: Skeleton with 2 lines
- Error: "Analysis unavailable" with retry button
- Timeout: "Analysis is taking longer than expected. Check back soon."
- All good: Summary text with green check

**Refresh Behavior:**
- Button shows spinning icon while refreshing
- Disable button during refresh
- 10s timeout triggers timeout message
- On success, update data and timestamp

### References

- [Source: architecture.md#BeeBrain-AI] - API endpoints and response format
- [Source: architecture.md#Frontend-Architecture] - React patterns and theme
- [Source: epics.md#Story-8.2] - Full acceptance criteria
- [Source: 8-1-beebrain-rule-engine-mvp.md] - API implementation details
- [Source: useWeather.ts] - Hook pattern reference
- [Source: WeatherCard.tsx] - Card component pattern reference

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A - Implementation completed without debug issues.

### Completion Notes List

- Implemented `useBeeBrain` hook following the `useWeather.ts` pattern with:
  - Auto-refresh on 1-hour interval to match server cache TTL
  - 10-second timeout handling for manual refresh operations using AbortController
  - Proper cleanup of intervals, timeouts, and abort controllers on unmount
  - Error state handling that preserves stale data for display

- Implemented `BeeBrainCard` component following the `WeatherCard.tsx` pattern with:
  - BulbOutlined icon (closest to brain concept in Ant Design)
  - Honey Beegood theme colors with purple gradient accent
  - All required states: loading, no site, error, timeout, healthy, concerns
  - Insights sorted by severity (action-needed first, then warning, then info)
  - Clickable insights that navigate to hive detail pages
  - Severity tags with appropriate colors

- Integrated BeeBrainCard into Dashboard.tsx in a row with NestEstimatorCard

- Created comprehensive tests:
  - 12 tests for useBeeBrain hook covering data fetching, refresh, timeout, and cleanup
  - 23 tests for BeeBrainCard component covering all states and interactions

- All 318 dashboard tests pass with no regressions

### File List

**Created:**
- apis-dashboard/src/hooks/useBeeBrain.ts
- apis-dashboard/src/components/BeeBrainCard.tsx
- apis-dashboard/tests/hooks/useBeeBrain.test.ts
- apis-dashboard/tests/components/BeeBrainCard.test.tsx

**Modified:**
- apis-dashboard/src/hooks/index.ts (added useBeeBrain export)
- apis-dashboard/src/components/index.ts (added BeeBrainCard export)
- apis-dashboard/src/pages/Dashboard.tsx (imported and added BeeBrainCard)

## Change Log

- 2026-01-25: Implemented story 8.2 - Dashboard BeeBrain Card with all acceptance criteria satisfied
- 2026-01-25: Remediation: Fixed 8 code review issues (2 High, 4 Medium, 2 Low)
  - Added keyboard accessibility (tabIndex, role, onKeyDown) to clickable insights
  - Added ARIA attributes (aria-label) for screen readers
  - Simplified complex nested conditional in useBeeBrain error handling
  - Replaced magic numbers with spacing constants from apisTheme
  - Used ref for timedOut to avoid stale closure in async callbacks
  - Added test coverage for loading state during siteId change
  - Added 5 keyboard accessibility tests for Enter/Space activation
  - Removed redundant default exports from both files
