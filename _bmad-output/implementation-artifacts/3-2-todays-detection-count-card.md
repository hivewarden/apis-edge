# Story 3.2: Today's Detection Count Card

Status: done

## Story

As a **beekeeper**,
I want to see how many hornets were deterred today,
So that I feel confident my hives are being protected.

## Acceptance Criteria

1. **Given** I am on the Dashboard
   **When** I view the "Today's Activity" card
   **Then** I see a large number showing today's detection count
   **And** friendly text: "5 hornets deterred today" (or "No hornets detected today — all quiet!")
   **And** the card uses the Honey Beegood warm styling

2. **Given** there are zero detections today
   **When** I view the card
   **Then** I see "All quiet today" with reassuring green checkmark
   **And** the card feels positive, not empty

3. **Given** there are detections today
   **When** I view the card
   **Then** I see the count prominently displayed
   **And** subtext shows "Last detection: 2 hours ago"
   **And** laser activation rate: "10 of 12 deterred with laser"

4. **Given** the selected site changes
   **When** I pick a different site from the dropdown
   **Then** the detection count updates to reflect that site's data

5. **Given** the data is loading
   **When** I view the card
   **Then** I see a loading skeleton
   **And** no error flashes

## Tasks / Subtasks

- [x] Task 1: Create TodayActivityCard Component (AC: #1, #2, #3)
  - [x] 1.1: Create `apis-dashboard/src/components/TodayActivityCard.tsx`
  - [x] 1.2: Implement large count display with warm styling
  - [x] 1.3: Implement zero-state "All quiet today" display
  - [x] 1.4: Implement detection-state with count, last detection time, laser stats
  - [x] 1.5: Add loading skeleton state

- [x] Task 2: Create useDetectionStats Hook (AC: #1, #4)
  - [x] 2.1: Create `apis-dashboard/src/hooks/useDetectionStats.ts`
  - [x] 2.2: Implement API call to `GET /api/detections/stats`
  - [x] 2.3: Add 30-second polling interval
  - [x] 2.4: Handle site_id changes (refetch on site change)

- [x] Task 3: Integrate Card into Dashboard (AC: #1, #4, #5)
  - [x] 3.1: Import TodayActivityCard into Dashboard.tsx
  - [x] 3.2: Pass selectedSiteId to the card
  - [x] 3.3: Position card prominently in dashboard layout

- [x] Task 4: Styling and UX Polish (AC: #1, #2)
  - [x] 4.1: Apply Honey Beegood warm color scheme
  - [x] 4.2: Ensure accessible contrast ratios
  - [x] 4.3: Add smooth transitions between states

## Dev Notes

### Component Structure

```typescript
// TodayActivityCard.tsx
interface TodayActivityCardProps {
  siteId: string | null;
}

interface DetectionStats {
  total_detections: number;
  laser_activations: number;
  avg_confidence: number | null;
  first_detection: string | null;
  last_detection: string | null;
  hourly_breakdown: number[];
}
```

### API Endpoint

Uses the existing `GET /api/detections/stats` endpoint from Story 3.1:

```typescript
// Request
GET /api/detections/stats?site_id=xxx&range=day

// Response
{
  "data": {
    "total_detections": 12,
    "laser_activations": 10,
    "hourly_breakdown": [0,0,0,0,0,0,0,0,0,2,3,1,0,2,3,1,0,0,0,0,0,0,0,0],
    "avg_confidence": 0.82,
    "first_detection": "2026-01-24T09:15:00Z",
    "last_detection": "2026-01-24T16:45:00Z"
  }
}
```

### Hook Pattern

Follow existing hook patterns from the codebase:

```typescript
// useDetectionStats.ts
import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../providers/apiClient';

const POLL_INTERVAL_MS = 30000;

interface DetectionStatsResponse {
  data: DetectionStats;
}

export function useDetectionStats(siteId: string | null) {
  const [stats, setStats] = useState<DetectionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchStats = useCallback(async () => {
    if (!siteId) {
      setStats(null);
      setLoading(false);
      return;
    }

    try {
      const response = await apiClient.get<DetectionStatsResponse>(
        `/detections/stats?site_id=${siteId}&range=day`
      );
      setStats(response.data.data);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchStats]);

  return { stats, loading, error, refetch: fetchStats };
}
```

### Visual Design

**Zero State (No detections):**
```
┌────────────────────────────────────┐
│  ☀️  All quiet today               │
│  ────────────────────────────────  │
│  No hornets detected — your hives  │
│  are protected                     │
│                        ✓ Online    │
└────────────────────────────────────┘
```

**Detection State:**
```
┌────────────────────────────────────┐
│  🐝  Today's Activity              │
│  ────────────────────────────────  │
│           12                       │  ← Large, warm amber
│  hornets deterred today            │
│                                    │
│  Last: 2 hours ago                 │
│  10 of 12 deterred with laser      │
└────────────────────────────────────┘
```

### Color Palette (Honey Beegood)

From the existing theme in `apis-dashboard/src/theme/`:
- Primary amber: `#f7a42d` (honey gold)
- Success green: `#52c41a` (Ant Design success)
- Background warm: `#fffbe6` (warm cream)
- Text dark: `#4a3c31` (warm brown)

### Time Formatting

Use relative time for "Last detection":
```typescript
function formatRelativeTime(date: string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);

  if (diffMins < 60) return `${diffMins} minutes ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  return then.toLocaleDateString();
}
```

### Dashboard Integration

Update Dashboard.tsx to include the card:

```typescript
// Dashboard.tsx
import { TodayActivityCard } from '../components/TodayActivityCard';

// In the render, after the site selector:
<Row gutter={[16, 16]}>
  <Col xs={24} sm={12} lg={8}>
    <TodayActivityCard siteId={selectedSiteId} />
  </Col>
  {/* Other cards will go here in future stories */}
</Row>
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.2]
- [Source: apis-dashboard/src/pages/Dashboard.tsx - Current dashboard]
- [Source: apis-dashboard/src/theme/ - Color theme]
- [Source: Story 3.1 - Detection stats API]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- TypeScript build: Successful compilation

### Completion Notes List

1. **useDetectionStats Hook**: Created custom hook with 30-second polling, site_id dependency, error handling
2. **TodayActivityCard Component**: Implemented with three states: no-site, zero-detections ("All quiet"), detection-state
3. **Dashboard Integration**: Added card to Dashboard.tsx in new Detection Activity section
4. **Styling**: Applied Honey Beegood theme colors with gradients for visual appeal

### File List

**New files:**
- apis-dashboard/src/hooks/useDetectionStats.ts
- apis-dashboard/src/components/TodayActivityCard.tsx

**Modified files:**
- apis-dashboard/src/components/index.ts (added exports)
- apis-dashboard/src/pages/Dashboard.tsx (integrated card)

## Change Log

- 2026-01-24: Story 3.2 created with comprehensive developer context
- 2026-01-24: Story 3.2 implemented - hook, component, dashboard integration complete
- 2026-01-25: Remediation: Fixed 7 issues from code review (barrel export, tests, transitions, accessibility, theme colors, memory leak, error flash)
