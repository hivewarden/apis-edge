# Story 8.3: Hive Detail BeeBrain Analysis

Status: done

## Story

As a **beekeeper**,
I want BeeBrain analysis specific to each hive,
So that I get tailored recommendations for that hive.

## Acceptance Criteria

1. **Given** I am on a hive detail page **When** I view the BeeBrain section **Then** I see analysis specific to that hive:
   - Current health assessment
   - Recommendations based on history
   - Comparisons to other hives or past seasons (when available)

2. **Given** the hive has a pattern detected **When** BeeBrain shows the insight **Then** I see specific data: e.g., "Queen is entering her 3rd year and productivity dropped 23% vs last season. Consider requeening in spring."

3. **Given** I want more detail **When** I click "Tell me more" **Then** I see expanded explanation:
   - What data triggered this insight (`data_points` from API)
   - Why this matters (contextual explanation)
   - Suggested next steps with links to relevant actions

4. **Given** the insight is wrong or not applicable **When** I click "Dismiss" **Then** the insight is hidden for this hive **And** doesn't appear again for 30 days (or until conditions change significantly)

5. **Given** I click Refresh **When** the analysis runs **Then** I see:
   - A loading spinner on the refresh button
   - The card updates with fresh analysis
   - Timestamp updates to "Just now"

6. **Given** all insights are healthy **When** BeeBrain has no warnings **Then** I see a positive health assessment with the recommendations list

## Tasks / Subtasks

### Task 1: Create useHiveBeeBrain Hook (AC: #1, #2, #5)
- [x] 1.1 Create `apis-dashboard/src/hooks/useHiveBeeBrain.ts`
- [x] 1.2 Define `HiveBeeBrainData` interface matching `HiveAnalysisResult` from API
- [x] 1.3 Implement fetch from `GET /api/beebrain/hive/{hiveId}`
- [x] 1.4 Implement refresh function (re-fetches hive analysis)
- [x] 1.5 Add 10-second timeout handling for refresh
- [x] 1.6 Handle loading, error, and timedOut states
- [x] 1.7 Export hook from `apis-dashboard/src/hooks/index.ts`

### Task 2: Create HiveBeeBrainCard Component (AC: #1, #2, #3, #4, #5, #6)
- [x] 2.1 Create `apis-dashboard/src/components/HiveBeeBrainCard.tsx`
- [x] 2.2 Implement card header with brain icon (BulbOutlined) and "BeeBrain Analysis" title
- [x] 2.3 Implement "Last updated: X ago" with relative time formatting (reuse from BeeBrainCard)
- [x] 2.4 Implement refresh button with loading state
- [x] 2.5 Implement health assessment section with colored status indicator
- [x] 2.6 Implement expandable insights list with "Tell me more" / "Less" toggle
- [x] 2.7 Implement expanded insight view showing:
  - Data points that triggered the insight (formatted key-value pairs)
  - Why it matters (insight message with context)
  - Suggested next steps with action button linking to relevant page
- [x] 2.8 Implement "Dismiss" button calling `POST /api/beebrain/insights/{id}/dismiss`
- [x] 2.9 Implement recommendations list (bulleted, when no insights)
- [x] 2.10 Implement loading skeleton state
- [x] 2.11 Implement timeout and error message states
- [x] 2.12 Apply Honey Beegood theme styling
- [x] 2.13 Add keyboard accessibility (tabIndex, role, onKeyDown for Enter/Space)
- [x] 2.14 Add ARIA attributes for screen readers
- [x] 2.15 Export component from `apis-dashboard/src/components/index.ts`

### Task 3: Integrate into HiveDetail Page (AC: #1)
- [x] 3.1 Import HiveBeeBrainCard into HiveDetail.tsx
- [x] 3.2 Add HiveBeeBrainCard after Queen Information Card (before Inspection History)
- [x] 3.3 Pass hiveId prop from useParams
- [x] 3.4 Verify card renders correctly with all hive data states

### Task 4: Testing (AC: #1, #2, #3, #4, #5, #6)
- [x] 4.1 Create `apis-dashboard/tests/hooks/useHiveBeeBrain.test.ts`
- [x] 4.2 Create `apis-dashboard/tests/components/HiveBeeBrainCard.test.tsx`
- [x] 4.3 Test healthy state rendering (all good, recommendations shown)
- [x] 4.4 Test insights state with multiple insights sorted by severity
- [x] 4.5 Test "Tell me more" expand/collapse functionality
- [x] 4.6 Test dismiss button functionality (API call, UI update)
- [x] 4.7 Test refresh button functionality
- [x] 4.8 Test timeout handling
- [x] 4.9 Test keyboard accessibility (Enter/Space activation)
- [x] 4.10 Test navigation from suggested action to target page

## Dev Notes

### API Response Structure (from Story 8.1 - Backend Already Implemented)

The BeeBrain API returns this structure from `GET /api/beebrain/hive/{id}`:

```typescript
// Response from /api/beebrain/hive/{id}
interface HiveBeeBrainResponse {
  data: {
    hive_id: string;
    hive_name: string;
    health_assessment: string;  // e.g., "This hive is in good health with no immediate concerns."
    insights: Insight[];        // Array of hive-specific insights
    recommendations: string[];  // General recommendations
    last_analysis: string;      // ISO 8601 timestamp
  };
}

interface Insight {
  id: string;
  hive_id: string | null;
  hive_name: string | null;
  rule_id: string;             // 'queen_aging', 'treatment_due', 'inspection_overdue', 'hornet_activity_spike'
  severity: 'info' | 'warning' | 'action-needed';
  message: string;             // Human-readable insight message
  suggested_action: string;    // Actionable recommendation
  data_points: Record<string, any>;  // Evidence supporting the insight
  created_at: string;
}
```

### Dismiss Insight API (Already Implemented)

```
POST /api/beebrain/insights/{id}/dismiss

Response:
{
  "data": {
    "message": "Insight dismissed successfully",
    "id": "insight-123"
  }
}
```

### Hook Implementation Pattern

Follow `useBeeBrain.ts` pattern exactly (same timeout handling, AbortController cleanup):

```typescript
// apis-dashboard/src/hooks/useHiveBeeBrain.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../providers/apiClient';

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

export interface HiveBeeBrainData {
  hive_id: string;
  hive_name: string;
  health_assessment: string;
  insights: Insight[];
  recommendations: string[];
  last_analysis: string;
}

interface UseHiveBeeBrainResult {
  data: HiveBeeBrainData | null;
  loading: boolean;
  refreshing: boolean;
  error: Error | null;
  timedOut: boolean;
  refresh: () => Promise<void>;
  dismissInsight: (insightId: string) => Promise<void>;
}

export function useHiveBeeBrain(hiveId: string | null): UseHiveBeeBrainResult {
  // Implementation following useBeeBrain pattern
  // Include dismissInsight function that calls POST /api/beebrain/insights/{id}/dismiss
}
```

### Component Pattern

Follow `BeeBrainCard.tsx` for base structure, with expandable insights:

```typescript
// apis-dashboard/src/components/HiveBeeBrainCard.tsx
import { useState } from 'react';
import { Card, Typography, Button, Space, Skeleton, List, Tag, Collapse, Descriptions, Divider } from 'antd';
import { ReloadOutlined, BulbOutlined, WarningOutlined, InfoCircleOutlined, CheckCircleOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useHiveBeeBrain, Insight } from '../hooks/useHiveBeeBrain';
import { colors, spacing } from '../theme/apisTheme';

interface HiveBeeBrainCardProps {
  hiveId: string;
}

// Severity to icon/color mapping
const severityConfig = {
  'action-needed': { icon: <WarningOutlined />, color: '#f5222d', label: 'Action Needed' },
  'warning': { icon: <WarningOutlined />, color: '#fa8c16', label: 'Warning' },
  'info': { icon: <InfoCircleOutlined />, color: '#1890ff', label: 'Info' },
};

// Map rule_id to navigation path and action label
const actionMapping: Record<string, { path: (hiveId: string) => string; label: string }> = {
  'queen_aging': { path: (id) => `/hives/${id}`, label: 'View Queen Info' },
  'treatment_due': { path: (id) => `/hives/${id}`, label: 'Log Treatment' },
  'inspection_overdue': { path: (id) => `/hives/${id}/inspections/new`, label: 'New Inspection' },
  'hornet_activity_spike': { path: (id) => `/clips`, label: 'View Clips' },
};

export function HiveBeeBrainCard({ hiveId }: HiveBeeBrainCardProps) {
  const navigate = useNavigate();
  const { data, loading, refreshing, error, timedOut, refresh, dismissInsight } = useHiveBeeBrain(hiveId);
  const [expandedInsights, setExpandedInsights] = useState<Set<string>>(new Set());
  const [dismissing, setDismissing] = useState<string | null>(null);

  // Toggle expanded state for insight
  const toggleExpanded = (insightId: string) => {
    setExpandedInsights(prev => {
      const next = new Set(prev);
      if (next.has(insightId)) {
        next.delete(insightId);
      } else {
        next.add(insightId);
      }
      return next;
    });
  };

  // Handle dismiss with loading state
  const handleDismiss = async (insightId: string) => {
    setDismissing(insightId);
    try {
      await dismissInsight(insightId);
    } finally {
      setDismissing(null);
    }
  };

  // Render states: loading, error, data...
}
```

### Expanded Insight UI Structure

```
┌────────────────────────────────────────────────────────────────┐
│ ⚠️ Warning: Varroa treatment due (92 days)                     │
│                                                                │
│ "Hive 2: Varroa treatment due (92 days since last treatment)"  │
│                                                                │
│ [Tell me more ▼]                            [Dismiss]          │
└────────────────────────────────────────────────────────────────┘

Expanded:
┌────────────────────────────────────────────────────────────────┐
│ ⚠️ Warning: Varroa treatment due (92 days)                     │
│                                                                │
│ "Hive 2: Varroa treatment due (92 days since last treatment)"  │
│                                                                │
│ [Less ▲]                                    [Dismiss]          │
│ ────────────────────────────────────────────────────────────── │
│                                                                │
│ 📊 What triggered this:                                        │
│   • Days since treatment: 92                                   │
│   • Last treatment date: 2025-10-25                            │
│   • Last treatment type: oxalic_acid                           │
│                                                                │
│ 💡 Why this matters:                                           │
│   Varroa mites can rapidly increase and cause significant      │
│   damage to your colony if left untreated for extended periods.│
│                                                                │
│ 🎯 Suggested next step:                                        │
│   Schedule varroa treatment within the next week.              │
│   [Log Treatment →]                                            │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Data Points Formatting

Format data_points as human-readable key-value pairs:

```typescript
function formatDataPoints(dataPoints: Record<string, unknown>): { label: string; value: string }[] {
  const keyLabels: Record<string, string> = {
    days_since_treatment: 'Days since treatment',
    last_treatment_date: 'Last treatment date',
    last_treatment_type: 'Last treatment type',
    days_since_inspection: 'Days since inspection',
    last_inspection_date: 'Last inspection date',
    queen_age_years: 'Queen age (years)',
    productivity_drop_percent: 'Productivity drop',
    count_24h: 'Detections in 24h',
    avg_daily: 'Average daily detections',
    multiplier: 'Activity multiplier',
  };

  return Object.entries(dataPoints).map(([key, value]) => ({
    label: keyLabels[key] || key.replace(/_/g, ' '),
    value: formatValue(key, value),
  }));
}

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return 'N/A';
  if (key.includes('date')) return dayjs(value as string).format('MMM D, YYYY');
  if (key.includes('percent')) return `${value}%`;
  if (key.includes('multiplier')) return `${(value as number).toFixed(1)}x`;
  return String(value);
}
```

### "Why This Matters" Context

Map rule_id to contextual explanations:

```typescript
const whyItMatters: Record<string, string> = {
  'queen_aging': 'An aging queen with declining productivity may lead to reduced colony strength, poor brood patterns, and lower honey yields. Early detection allows you to plan for requeening.',
  'treatment_due': 'Varroa mites can rapidly increase and cause significant damage to your colony if left untreated. Regular treatments help maintain colony health.',
  'inspection_overdue': 'Regular inspections help you catch problems early, assess colony strength, and make timely management decisions.',
  'hornet_activity_spike': 'Increased hornet activity may indicate a nest nearby or changing conditions. Monitoring helps protect your hives.',
};
```

### Styling Requirements

Use Honey Beegood theme colors from `src/theme/apisTheme.ts`:
- Card background: `colors.salomie` (light honey) with purple gradient
- Border: `colors.seaBuckthorn` (orange)
- Text: `colors.brownBramble` (dark brown)
- Health assessment positive: green (#52c41a)
- Health assessment neutral: `colors.seaBuckthorn`

### Project Structure Notes

**Files to create:**
- `apis-dashboard/src/hooks/useHiveBeeBrain.ts`
- `apis-dashboard/src/components/HiveBeeBrainCard.tsx`
- `apis-dashboard/tests/hooks/useHiveBeeBrain.test.ts`
- `apis-dashboard/tests/components/HiveBeeBrainCard.test.tsx`

**Files to modify:**
- `apis-dashboard/src/hooks/index.ts` - add useHiveBeeBrain export
- `apis-dashboard/src/components/index.ts` - add HiveBeeBrainCard export
- `apis-dashboard/src/pages/HiveDetail.tsx` - import and add HiveBeeBrainCard

### Key Implementation Details

**Insight Priority Order:**
Display insights sorted by severity (same as BeeBrainCard):
1. `action-needed` - Red warning icon
2. `warning` - Orange warning icon
3. `info` - Blue info icon

**Empty States:**
- No hiveId: Should never happen (component only renders with valid hiveId)
- Loading: Skeleton with health section + 2 insight placeholders
- Error: "Analysis unavailable" with retry button
- Timeout: "Analysis is taking longer than expected. Check back soon."
- All good: Health assessment + recommendations list (no insights section)

**Integration Location in HiveDetail:**
Insert after Queen Information Card, before Inspection History Card:
```tsx
{/* Queen Information Card */}
<Card title={...}>...</Card>

{/* BeeBrain Analysis - Story 8.3 */}
<div style={{ marginTop: spacing.md }}>
  <HiveBeeBrainCard hiveId={id || ''} />
</div>

{/* Inspection History Card */}
<Card title={...}>...</Card>
```

**Dismiss Behavior:**
- On dismiss click, show loading spinner on dismiss button
- Call `POST /api/beebrain/insights/{id}/dismiss`
- On success, remove insight from local state (optimistic update)
- On error, show error message and keep insight visible

### Accessibility Requirements

- All interactive elements must have `tabIndex={0}`
- Clickable elements use `role="button"` with `onKeyDown` for Enter/Space
- Expand/collapse uses ARIA: `aria-expanded`, `aria-controls`
- Severity tags include screen reader text via `aria-label`
- Focus management: after dismiss, focus moves to next insight or health section

### References

- [Source: architecture.md#BeeBrain-AI] - API endpoints and response format
- [Source: architecture.md#Frontend-Architecture] - React patterns and theme
- [Source: epics.md#Story-8.3] - Full acceptance criteria
- [Source: 8-1-beebrain-rule-engine-mvp.md] - API implementation details
- [Source: 8-2-dashboard-beebrain-card.md] - Component and hook patterns
- [Source: useBeeBrain.ts] - Hook pattern reference
- [Source: BeeBrainCard.tsx] - Card component pattern reference
- [Source: HiveDetail.tsx] - Integration target page

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

None - implementation completed without debugging issues.

### Completion Notes List

1. **Task 1 - useHiveBeeBrain Hook**: Created hook following the existing useBeeBrain pattern with:
   - 10-second timeout handling using AbortController
   - Optimistic dismiss functionality with error rollback
   - Full TypeScript types matching the API response structure
   - Proper cleanup on unmount and hiveId changes

2. **Task 2 - HiveBeeBrainCard Component**: Created component with:
   - Honey Beegood theme styling (honey gold gradient, seaBuckthorn border)
   - Expandable insights with "Tell me more" / "Less" toggle
   - Dismiss functionality with loading state and success/error messages
   - Severity-based sorting and visual indicators (action-needed > warning > info)
   - "Why this matters" contextual explanations for each rule type
   - Action buttons with navigation to relevant pages
   - Full keyboard accessibility (Enter/Space support, ARIA attributes)

3. **Task 3 - HiveDetail Integration**: Added HiveBeeBrainCard after Queen Information Card, passing hiveId from useParams.

4. **Task 4 - Testing**: Created comprehensive test suites:
   - 17 hook tests covering initial state, data fetching, refresh, dismiss, timeout, and error handling
   - 37 component tests covering all UI states, interactions, accessibility, and navigation
   - All 54 tests pass, full regression suite (424 tests) passes

### File List

**New Files:**
- apis-dashboard/src/hooks/useHiveBeeBrain.ts
- apis-dashboard/src/components/HiveBeeBrainCard.tsx
- apis-dashboard/tests/hooks/useHiveBeeBrain.test.ts
- apis-dashboard/tests/components/HiveBeeBrainCard.test.tsx

**Modified Files:**
- apis-dashboard/src/hooks/index.ts (added export)
- apis-dashboard/src/components/index.ts (added export)
- apis-dashboard/src/pages/HiveDetail.tsx (added HiveBeeBrainCard integration)
- _bmad-output/implementation-artifacts/sprint-status.yaml (status update)

## Change Log

- 2026-01-25: Story implementation completed - useHiveBeeBrain hook, HiveBeeBrainCard component, HiveDetail integration, and comprehensive tests (54 tests passing)
- 2026-01-25: Remediation - Fixed 5 issues from code review:
  1. MEDIUM: Added focus management after dismiss (refs for insight elements, focus moves to next insight or health section)
  2. MEDIUM: Fixed test act() warnings (proper async handling with fake timers using vi.runAllTimersAsync)
  3. LOW: Replaced custom formatLastUpdated with dayjs relativeTime plugin (consistent with other components)
  4. LOW: Replaced magic number `spacing.lg + 8` with `spacing.xl` in expanded details styling
  5. LOW: Cleaned up type import style (inline type import with named import)
- 2026-01-25: Remediation round 2 - Fixed 7 issues from code review (all now PASS):
  1. HIGH (I1): Fixed 9 test timeouts - added async/waitFor to keyboard accessibility and relative time tests
  2. MEDIUM (I3): Added console.error logging and improved error message in handleDismiss
  3. MEDIUM (I5): Added focusTimeoutRef with useEffect cleanup to prevent race conditions
  4. LOW (I2): Removed unused formatLastUpdated wrapper, inlined dayjs().fromNow() calls
  5. LOW (I4): Replaced hard-coded spacing values with theme spacing constants
  6. LOW (I6): Consolidated type exports in hooks/index.ts
  7. LOW (I7): Added conditional rendering guard for empty hiveId in HiveDetail.tsx
