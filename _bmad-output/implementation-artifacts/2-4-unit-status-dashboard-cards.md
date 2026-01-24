# Story 2.4: Unit Status Dashboard Cards

Status: done

## Story

As a **beekeeper**,
I want to see the status of all my units at a glance,
So that I know if any unit needs attention.

## Acceptance Criteria

1. **Given** I am on the Dashboard
   **When** I view the Units section
   **Then** I see a card for each unit showing:
   - Unit name
   - Assigned site name
   - Status indicator (green=online+armed, yellow=online+disarmed, red=offline)
   - Last seen timestamp ("2 minutes ago" or "Offline since 10:30")

2. **Given** a unit is online and armed
   **When** I view its card
   **Then** I see a green status dot with label "Armed"
   **And** optionally a small live preview thumbnail (if video proxy is available)

3. **Given** a unit is online but disarmed
   **When** I view its card
   **Then** I see a yellow status dot with label "Disarmed"

4. **Given** a unit is offline (no heartbeat > 120s)
   **When** I view its card
   **Then** I see a red status dot with label "Offline"
   **And** the last seen time shows when it went offline

5. **Given** I click on a unit card
   **When** the click is processed
   **Then** I navigate to the unit detail page

6. **Given** the dashboard is open
   **When** a unit's status changes
   **Then** the card updates within 30 seconds (polling interval)

## Tasks / Subtasks

- [x] Task 1: Create UnitStatusCard Component (AC: #1, #2, #3, #4, #5)
  - [x] 1.1: Create `UnitStatusCard.tsx` component in `apis-dashboard/src/components/`
  - [x] 1.2: Implement status dot with three states (green/armed, yellow/disarmed, red/offline)
  - [x] 1.3: Display unit name, site name, last seen timestamp
  - [x] 1.4: Add click handler for navigation to unit detail page
  - [x] 1.5: Style with Ant Design Card component using Honey Beegood theme tokens

- [x] Task 2: Add Units Section to Dashboard (AC: #1, #6)
  - [x] 2.1: Update `Dashboard.tsx` to include Units section with responsive grid
  - [x] 2.2: Fetch units from `GET /api/units` endpoint
  - [x] 2.3: Implement 30-second polling interval with useEffect and setInterval
  - [x] 2.4: Show loading state on initial load
  - [x] 2.5: Show empty state when no units registered

- [x] Task 3: Implement Relative Time Display (AC: #1, #4)
  - [x] 3.1: Create utility function for relative time formatting (in UnitStatusCard)
  - [x] 3.2: Handle "Just now", "X minutes ago", "X hours ago", "X days ago"
  - [x] 3.3: For offline units, show "Offline since HH:MM"

- [x] Task 4: Add Armed/Disarmed Status Support (AC: #2, #3)
  - [x] 4.1: Update Unit interface to include `armed` field if available from API
  - [x] 4.2: If API doesn't have armed status yet, default armed units to "Armed" and show label
  - [x] 4.3: Determine armed/disarmed from unit properties or assume armed for online units (MVP)

## Dev Notes

### Project Structure Notes

**Frontend changes:**
- New: `apis-dashboard/src/components/UnitStatusCard.tsx` (new component)
- Modified: `apis-dashboard/src/pages/Dashboard.tsx` (add units section)
- Optional: `apis-dashboard/src/utils/formatTime.ts` (relative time helper)

**No backend changes required** - Uses existing `GET /api/units` endpoint.

### Existing Code Patterns

**From Units.tsx (existing unit card implementation):**
```typescript
// Unit interface
interface Unit {
  id: string;
  serial: string;
  name: string | null;
  site_id: string | null;
  site_name: string | null;
  firmware_version: string | null;
  status: string;  // 'online' | 'offline' | 'error'
  last_seen: string | null;
  created_at: string;
  updated_at: string;
}

// Relative time formatting
const formatLastSeen = (lastSeen: string | null) => {
  if (!lastSeen) return 'Never';
  const date = new Date(lastSeen);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
};
```

**API client pattern (from apiClient.ts):**
```typescript
import { apiClient } from '../providers/apiClient';

const response = await apiClient.get<UnitsResponse>('/units');
const units = response.data.data || [];
```

**Theme tokens available (from theme/index.ts):**
- Primary color (honey orange): For active states
- Success color (green): For armed status
- Warning color (yellow): For disarmed status
- Error color (red): For offline status

### Component Implementation Pattern

```typescript
// UnitStatusCard.tsx
import { Card, Badge, Typography, Space } from 'antd';
import { ClockCircleOutlined, EnvironmentOutlined } from '@ant-design/icons';

interface UnitStatusCardProps {
  unit: Unit;
  onClick: (id: string) => void;
}

export function UnitStatusCard({ unit, onClick }: UnitStatusCardProps) {
  const getStatusConfig = (status: string) => {
    // Note: API currently only has 'online' | 'offline' | 'error'
    // Armed/disarmed distinction will be added in future stories
    if (status === 'online') {
      return { color: 'green', label: 'Armed', status: 'success' as const };
    } else if (status === 'error') {
      return { color: 'yellow', label: 'Disarmed', status: 'warning' as const };
    }
    return { color: 'red', label: 'Offline', status: 'error' as const };
  };

  // ... component implementation
}
```

### Polling Implementation Pattern

```typescript
// Dashboard.tsx
useEffect(() => {
  fetchUnits(); // Initial fetch

  const interval = setInterval(() => {
    fetchUnits();
  }, 30000); // 30 seconds

  return () => clearInterval(interval);
}, []);
```

### Responsive Grid Pattern

```typescript
// From existing Units.tsx
<Row gutter={[16, 16]}>
  {units.map((unit) => (
    <Col xs={24} sm={12} lg={8} xl={6} key={unit.id}>
      <UnitStatusCard unit={unit} onClick={handleUnitClick} />
    </Col>
  ))}
</Row>
```

### Status Determination Logic

**Current API Status Values:**
- `online` - Unit has heartbeat within last 120 seconds
- `offline` - Unit has no recent heartbeat
- `error` - Unit reported an error condition

**MVP Implementation:**
Since the API doesn't yet have an `armed` field:
- `online` → Show as "Armed" (green) - default assumption
- `error` → Show as "Disarmed" (yellow) - interpret error as disarmed
- `offline` → Show as "Offline" (red)

**Future Enhancement (Story 2.5 or later):**
- Add `armed` boolean field to Unit model
- Update heartbeat to include armed status
- Show "Disarmed" (yellow) when online but `armed=false`

### Offline Time Formatting

```typescript
const formatOfflineSince = (lastSeen: string | null) => {
  if (!lastSeen) return 'Offline - Never connected';
  const date = new Date(lastSeen);
  return `Offline since ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};
```

### Testing Strategy

**Component Tests (optional for MVP):**
```typescript
// tests/components/UnitStatusCard.test.tsx
describe('UnitStatusCard', () => {
  it('shows green status for online units', () => { /* ... */ });
  it('shows red status for offline units', () => { /* ... */ });
  it('navigates on click', () => { /* ... */ });
});
```

### Security Considerations

1. **No sensitive data exposed** - Unit cards only show public information
2. **API authentication** - Uses existing JWT-protected endpoints
3. **No additional permissions needed** - Uses same GET /api/units endpoint

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.4]
- [Source: apis-dashboard/src/pages/Units.tsx] - Existing unit card implementation
- [Source: apis-dashboard/src/providers/apiClient.ts] - API client
- [Source: apis-dashboard/src/theme/index.ts] - Theme tokens

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- TypeScript build: Successful compilation
- No test files created (frontend component tests optional for MVP)

### Completion Notes List

1. **UnitStatusCard Component (components/UnitStatusCard.tsx)**: Created new component with status indicator (green/yellow/red), unit name, site name, last seen display, click handler for navigation
2. **Dashboard Page (pages/Dashboard.tsx)**: Updated to include Units section with responsive grid, 30-second polling, loading state, empty state, manual refresh button
3. **Status Logic**: MVP maps online→armed (green), error→disarmed (yellow), offline→offline (red)
4. **Relative Time**: Implemented formatLastSeen function with "Just now", "Xm ago", "Xh ago", "Xd ago", "Offline since HH:MM"

### File List

**New files:**
- apis-dashboard/src/components/UnitStatusCard.tsx

**Modified files:**
- apis-dashboard/src/pages/Dashboard.tsx

## Change Log

- 2026-01-24: Story 2.4 created from epics definition
- 2026-01-24: Implementation of Story 2.4 - Unit status dashboard cards with polling
