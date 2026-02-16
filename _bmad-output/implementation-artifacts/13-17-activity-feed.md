# Story 13.17: Activity Feed

Status: done

## Story

As a tenant user,
I want a human-readable activity feed,
so that I can see what's been happening in my apiary.

## Acceptance Criteria

1. **AC1: GET /api/activity endpoint returns human-readable activity**
   - Returns activity items with icon identifier, human-readable message, relative time
   - Uses cursor-based pagination (cursor param, has_more flag)
   - Scoped to tenant via RLS (normal users see their tenant's activity)
   - Optional filters: entity_type, hive_id, site_id, limit (default 20, max 100)

2. **AC2: Activity types are transformed from audit log entries**
   - Supported activity types:
     - `inspection_created` - "John recorded an inspection on Hive A"
     - `treatment_recorded` - "John applied Oxalic acid treatment to Hive B"
     - `feeding_recorded` - "John fed 2L of sugar syrup to Hive C"
     - `harvest_recorded` - "John harvested 5kg of honey from Hive D"
     - `hive_created` - "John created a new hive: Hive E"
     - `clip_uploaded` - "Unit Alpha uploaded a detection clip"
     - `user_joined` - "Jane joined the team"
   - Each activity includes: icon, message, relative_time, timestamp, entity_type, entity_id, entity_name

3. **AC3: Dashboard shows condensed activity feed (5 items)**
   - New ActivityFeedCard component on Dashboard
   - Shows 5 most recent activities
   - "View All" link navigates to /activity page
   - No filters in condensed view

4. **AC4: Full activity page at /activity**
   - Shows paginated list of all activity
   - Filter by activity type (inspection, treatment, feeding, harvest, hive, clip, user)
   - Filter by hive (dropdown of tenant hives)
   - "Load More" button for cursor pagination
   - Empty state when no activity

5. **AC5: Site/hive detail pages show filtered activity**
   - Site detail: Shows activity filtered by site_id
   - Hive detail: Shows activity filtered by hive_id
   - Condensed view (5 items) with "View All" link to /activity?filter=...

6. **AC6: Entity links navigate correctly**
   - Clicking on entity name navigates to entity detail page
   - Hive links go to /hives/{id}
   - Inspection links go to /inspections/{id} (if route exists, else hive detail)
   - User links have no navigation (just display name)

## Technical Context

### Backend - Activity Service Architecture

The activity feed builds on top of the existing audit_log infrastructure (Story 13.16). Rather than duplicating data, we query the audit_log and transform entries into human-readable activity items.

**Storage Layer (`apis-server/internal/storage/activity.go`):**
```go
// ActivityFilters for querying activity
type ActivityFilters struct {
    EntityTypes []string  // Filter by entity types (maps to audit entity_type)
    HiveID      *string   // Filter by hive (requires JOIN)
    SiteID      *string   // Filter by site (requires JOIN through hives)
    Cursor      *string   // Cursor for pagination (audit_log.id)
    Limit       int       // Max items (default 20, max 100)
}

// ActivityEntry is a processed audit log entry with entity details
type ActivityEntry struct {
    ID          string    `json:"id"`
    Action      string    `json:"action"`      // create, update, delete
    EntityType  string    `json:"entity_type"` // hives, inspections, etc.
    EntityID    string    `json:"entity_id"`
    EntityName  string    `json:"entity_name"` // Name from joined entity
    UserID      *string   `json:"user_id,omitempty"`
    UserName    *string   `json:"user_name,omitempty"`
    HiveID      *string   `json:"hive_id,omitempty"`      // For hive-related entities
    HiveName    *string   `json:"hive_name,omitempty"`
    SiteID      *string   `json:"site_id,omitempty"`      // For site filtering
    NewValues   json.RawMessage `json:"new_values,omitempty"` // For message generation
    CreatedAt   time.Time `json:"created_at"`
}
```

**Query Strategy:**
- Query audit_log with LEFT JOINs to get entity names:
  - JOIN users for user_name
  - JOIN hives when entity_type IN ('inspections', 'treatments', 'feedings', 'harvests') to get hive_id, hive_name
  - JOIN sites for site filtering
- Filter by `action = 'create'` for most activity types (except hive updates/deletes)
- Support cursor pagination using `audit_log.id < cursor` ORDER BY `created_at DESC, id DESC`

**Entity Name Resolution:**
Since entities might be deleted but we still want historical activity, consider:
- Store entity name in audit_log.new_values at creation time (already done by audit service)
- Extract name from new_values JSONB when entity JOIN returns NULL

**Service Layer (`apis-server/internal/services/activity.go`):**
```go
// ActivityItem is the API response format
type ActivityItem struct {
    ID           string  `json:"id"`
    ActivityType string  `json:"activity_type"`  // inspection_created, treatment_recorded, etc.
    Icon         string  `json:"icon"`           // ant-design icon name
    Message      string  `json:"message"`        // Human-readable message
    RelativeTime string  `json:"relative_time"`  // "2 hours ago", "yesterday"
    Timestamp    string  `json:"timestamp"`      // ISO 8601
    EntityType   string  `json:"entity_type"`
    EntityID     string  `json:"entity_id"`
    EntityName   *string `json:"entity_name,omitempty"`
    HiveID       *string `json:"hive_id,omitempty"`
    HiveName     *string `json:"hive_name,omitempty"`
}

// TransformToActivityItem converts audit entry to activity item
func TransformToActivityItem(entry *storage.ActivityEntry) *ActivityItem
```

**Message Templates:**
```go
var messageTemplates = map[string]map[string]string{
    "inspections": {
        "create": "%s recorded an inspection on %s",
    },
    "treatments": {
        "create": "%s applied %s treatment to %s",
    },
    "feedings": {
        "create": "%s fed %s to %s",
    },
    "harvests": {
        "create": "%s harvested %s from %s",
    },
    "hives": {
        "create": "%s created a new hive: %s",
        "update": "%s updated hive %s",
        "delete": "%s removed hive %s",
    },
    "clips": {
        "create": "Unit %s uploaded a detection clip",
    },
    "users": {
        "create": "%s joined the team",
    },
}
```

**Icon Mapping:**
```go
var activityIcons = map[string]string{
    "inspection_created":   "FileSearchOutlined",
    "treatment_recorded":   "MedicineBoxOutlined",
    "feeding_recorded":     "CoffeeOutlined",
    "harvest_recorded":     "GiftOutlined",
    "hive_created":         "HomeOutlined",
    "hive_updated":         "EditOutlined",
    "hive_deleted":         "DeleteOutlined",
    "clip_uploaded":        "VideoCameraOutlined",
    "user_joined":          "UserAddOutlined",
}
```

### Handler Layer (`apis-server/internal/handlers/activity.go`)

**GET /api/activity:**
- No admin role required (available to all authenticated users)
- Query params: entity_type (comma-separated), hive_id, site_id, cursor, limit
- Response format:
```json
{
  "data": [
    {
      "id": "audit-uuid",
      "activity_type": "inspection_created",
      "icon": "FileSearchOutlined",
      "message": "John recorded an inspection on Hive Alpha",
      "relative_time": "2 hours ago",
      "timestamp": "2024-01-15T10:30:00Z",
      "entity_type": "inspections",
      "entity_id": "inspection-uuid",
      "entity_name": null,
      "hive_id": "hive-uuid",
      "hive_name": "Hive Alpha"
    }
  ],
  "meta": {
    "cursor": "next-cursor-id",
    "has_more": true
  }
}
```

### Relative Time Calculation

Server-side relative time calculation (Go):
```go
func formatRelativeTime(t time.Time) string {
    now := time.Now()
    diff := now.Sub(t)

    switch {
    case diff < time.Minute:
        return "just now"
    case diff < time.Hour:
        mins := int(diff.Minutes())
        if mins == 1 {
            return "1 minute ago"
        }
        return fmt.Sprintf("%d minutes ago", mins)
    case diff < 24*time.Hour:
        hours := int(diff.Hours())
        if hours == 1 {
            return "1 hour ago"
        }
        return fmt.Sprintf("%d hours ago", hours)
    case diff < 48*time.Hour:
        return "yesterday"
    case diff < 7*24*time.Hour:
        days := int(diff.Hours() / 24)
        return fmt.Sprintf("%d days ago", days)
    default:
        return t.Format("Jan 2, 2006")
    }
}
```

### Frontend - React Components

**useActivityFeed Hook (`apis-dashboard/src/hooks/useActivityFeed.ts`):**
```typescript
interface ActivityItem {
  id: string;
  activity_type: string;
  icon: string;
  message: string;
  relative_time: string;
  timestamp: string;
  entity_type: string;
  entity_id: string;
  entity_name?: string;
  hive_id?: string;
  hive_name?: string;
}

interface ActivityFilters {
  entityTypes?: string[];
  hiveId?: string;
  siteId?: string;
}

interface UseActivityFeedOptions {
  filters?: ActivityFilters;
  limit?: number;
  enabled?: boolean;
}

interface UseActivityFeedResult {
  activities: ActivityItem[];
  loading: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore: () => void;
  refetch: () => void;
}
```

**ActivityFeedCard Component (`apis-dashboard/src/components/ActivityFeedCard.tsx`):**
- Compact card for Dashboard with 5 items
- Props: `siteId?: string` for filtering
- Shows icon, message, relative time
- "View All" link to /activity

**Activity Page (`apis-dashboard/src/pages/Activity.tsx`):**
- Full-page activity feed
- Filter controls:
  - Activity type multi-select
  - Hive dropdown (loads tenant hives)
- Infinite scroll or "Load More" button
- Empty state with illustration

**Icon Rendering:**
```typescript
import * as Icons from '@ant-design/icons';

const ActivityIcon = ({ iconName }: { iconName: string }) => {
  const Icon = (Icons as any)[iconName];
  return Icon ? <Icon /> : <Icons.ClockCircleOutlined />;
};
```

### Existing Code References

**Audit Log Storage (from 13.16):**
- `apis-server/internal/storage/audit_log.go` - Base queries
- `apis-server/internal/services/audit.go` - Audit entry structure

**Handler Patterns:**
- `apis-server/internal/handlers/audit.go` - Query filtering patterns
- `apis-server/internal/handlers/clips.go` - Pagination patterns

**Dashboard Components:**
- `apis-dashboard/src/pages/Dashboard.tsx` - Card layout patterns
- `apis-dashboard/src/hooks/useClips.ts` - Hook structure with pagination

### Files to Create

**Backend:**
- `apis-server/internal/storage/activity.go` - Activity queries
- `apis-server/internal/services/activity.go` - Activity transformation
- `apis-server/internal/handlers/activity.go` - GET /api/activity handler

**Frontend:**
- `apis-dashboard/src/hooks/useActivityFeed.ts` - Activity feed hook
- `apis-dashboard/src/components/ActivityFeedCard.tsx` - Dashboard card
- `apis-dashboard/src/pages/Activity.tsx` - Full activity page

**Tests:**
- `apis-server/tests/handlers/activity_test.go`
- `apis-dashboard/tests/hooks/useActivityFeed.test.ts`
- `apis-dashboard/tests/components/ActivityFeedCard.test.tsx`
- `apis-dashboard/tests/pages/Activity.test.tsx`

## Tasks

### Backend

#### Task 1: Create Activity Storage Layer (AC: #1, #2)
- [x] Create `apis-server/internal/storage/activity.go`
- [x] Define ActivityEntry struct with all required fields
- [x] Define ActivityFilters struct
- [x] Implement ListActivity query with:
  - LEFT JOIN users for user_name
  - LEFT JOIN on inspections/treatments/feedings/harvests to get hive_id
  - LEFT JOIN hives for hive_name
  - Filter by entity_types (action='create' for most)
  - Cursor-based pagination
  - Limit enforcement (max 100)
- [x] Implement entity name extraction from new_values JSONB

#### Task 2: Create Activity Service Layer (AC: #2)
- [x] Create `apis-server/internal/services/activity.go`
- [x] Define ActivityItem struct (API response format)
- [x] Implement message templates for each entity type
- [x] Implement icon mapping
- [x] Implement formatRelativeTime function
- [x] Implement TransformToActivityItem function
- [x] Implement GetActivityFeed function that:
  - Calls storage.ListActivity
  - Transforms each entry to ActivityItem
  - Returns items with cursor metadata

#### Task 3: Create Activity Handler (AC: #1)
- [x] Create `apis-server/internal/handlers/activity.go`
- [x] Implement GET /api/activity handler
- [x] Parse query params: entity_type, hive_id, site_id, cursor, limit
- [x] Call activity service
- [x] Return JSON response with data and meta (cursor, has_more)

#### Task 4: Register Activity Route
- [x] Add `/api/activity` GET route in main.go
- [x] Apply auth middleware (no admin requirement)

### Frontend

#### Task 5: Create useActivityFeed Hook (AC: #1, #4)
- [x] Create `apis-dashboard/src/hooks/useActivityFeed.ts`
- [x] Define ActivityItem interface
- [x] Define UseActivityFeedOptions and UseActivityFeedResult
- [x] Implement hook with cursor-based pagination
- [x] Support filters: entityTypes, hiveId, siteId
- [x] Support limit parameter
- [x] Implement loadMore function
- [x] Export from hooks/index.ts

#### Task 6: Create ActivityFeedCard Component (AC: #3, #6)
- [x] Create `apis-dashboard/src/components/ActivityFeedCard.tsx`
- [x] Display 5 most recent activities
- [x] Render icon from icon name
- [x] Display message and relative_time
- [x] Make entity names clickable (navigate to entity)
- [x] Add "View All" link to /activity
- [x] Handle loading and empty states
- [x] Export from components/index.ts

#### Task 7: Create Activity Page (AC: #4, #6)
- [x] Create `apis-dashboard/src/pages/Activity.tsx`
- [x] Add filter controls (activity type, hive)
- [x] Fetch hives for hive filter dropdown
- [x] Display activity list with infinite scroll or "Load More"
- [x] Handle empty state
- [x] Make entity links navigable
- [x] Add route to App.tsx

#### Task 8: Integrate Activity on Dashboard (AC: #3)
- [x] Add ActivityFeedCard to Dashboard.tsx
- [x] Position in existing grid layout (after BeeBrainCard row)
- [x] Pass siteId filter

#### Task 9: Add Filtered Activity to Detail Pages (AC: #5)
- [x] Add condensed ActivityFeedCard to HiveDetail.tsx with hiveId filter
- [x] Add condensed ActivityFeedCard to SiteDetail.tsx with siteId filter
- [x] "View All" links should include filter params

### Testing

#### Task 10: Backend Tests
- [x] Test activity storage queries with filters
- [x] Test relative time formatting
- [x] Test message template generation
- [x] Test activity handler response format
- [x] Test cursor pagination

#### Task 11: Frontend Tests
- [x] Test useActivityFeed hook
- [x] Test ActivityFeedCard component rendering
- [x] Test Activity page filtering
- [x] Test entity link navigation

## Dev Notes

### Implementation Strategy

1. **Start with storage layer** - Build the complex JOIN query first, test in isolation
2. **Add service layer** - Message formatting and relative time are pure functions, easy to test
3. **Create handler** - Follow existing patterns from audit.go
4. **Frontend hook** - Model after useClips with cursor pagination
5. **Components** - Build card first, page uses the same hook

### Query Optimization

The activity query joins multiple tables. For performance:
- Use indexed columns in WHERE clause (audit_log has indexes on tenant_id, created_at)
- Limit results (max 100)
- Consider materializing activity entries if performance becomes an issue (future optimization)

### Entity Name Fallback

When entities are deleted, the JOIN returns NULL. The audit_log.new_values contains the entity data at creation time. Extract name from JSONB:
```sql
COALESCE(h.name, new_values->>'name') as entity_name
```

### Cursor Pagination

Use the audit_log.id as cursor since it's a UUID and entries are already ordered by created_at DESC:
```sql
WHERE al.id < $cursor  -- For next page
ORDER BY al.created_at DESC, al.id DESC
LIMIT $limit + 1  -- Fetch one extra to determine has_more
```

### Project Structure Notes

- Backend files follow existing patterns in `internal/services/`, `internal/storage/`, `internal/handlers/`
- Frontend follows existing component patterns with Ant Design
- Tests go in `tests/` directories per project convention

### References

- [Source: _bmad-output/implementation-artifacts/13-16-audit-log-infrastructure.md] - Audit log foundation
- [Source: apis-server/internal/storage/audit_log.go] - Audit storage patterns
- [Source: apis-server/internal/handlers/audit.go] - Handler patterns
- [Source: apis-dashboard/src/hooks/useClips.ts] - Hook pagination patterns
- [Source: apis-dashboard/src/pages/Dashboard.tsx] - Dashboard layout patterns
- [Source: CLAUDE.md] - Project conventions and API patterns

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A

### Completion Notes List

1. Created backend storage layer (`apis-server/internal/storage/activity.go`) with complex JOIN query to fetch activity entries with entity names, hive info, and user names.
2. Created backend service layer (`apis-server/internal/services/activity.go`) with message templates, icon mapping, and relative time formatting.
3. Created backend handler (`apis-server/internal/handlers/activity.go`) with query parameter parsing and validation.
4. Registered `/api/activity` route in `main.go` with auth middleware (no admin required).
5. Created `useActivityFeed` hook with cursor-based pagination and filter support.
6. Created `ActivityFeedCard` component for Dashboard and detail pages.
7. Created full `Activity` page with filtering and "Load More" pagination.
8. Added ActivityFeedCard to Dashboard.tsx (after BeeBrain row).
9. Added filtered ActivityFeedCard to HiveDetail.tsx and SiteDetail.tsx.
10. Added "Activity" link to navigation sidebar.
11. All tests pass (backend handler tests, service tests, frontend hook and component tests).

### File List

**Backend (Created):**
- `apis-server/internal/storage/activity.go`
- `apis-server/internal/services/activity.go`
- `apis-server/internal/handlers/activity.go`
- `apis-server/tests/handlers/activity_test.go`
- `apis-server/tests/services/activity_test.go`

**Backend (Modified):**
- `apis-server/cmd/server/main.go` - Added `/api/activity` route

**Frontend (Created):**
- `apis-dashboard/src/hooks/useActivityFeed.ts`
- `apis-dashboard/src/components/ActivityFeedCard.tsx`
- `apis-dashboard/src/pages/Activity.tsx`
- `apis-dashboard/tests/hooks/useActivityFeed.test.ts`
- `apis-dashboard/tests/components/ActivityFeedCard.test.tsx`
- `apis-dashboard/tests/pages/Activity.test.tsx`

**Frontend (Modified):**
- `apis-dashboard/src/hooks/index.ts` - Export useActivityFeed
- `apis-dashboard/src/components/index.ts` - Export ActivityFeedCard
- `apis-dashboard/src/pages/index.ts` - Export Activity
- `apis-dashboard/src/pages/Dashboard.tsx` - Added ActivityFeedCard
- `apis-dashboard/src/pages/HiveDetail.tsx` - Added ActivityFeedCard with hiveId filter
- `apis-dashboard/src/pages/SiteDetail.tsx` - Added ActivityFeedCard with siteId filter
- `apis-dashboard/src/components/layout/navItems.tsx` - Added Activity nav item
- `apis-dashboard/src/App.tsx` - Added /activity route

### Change Log

- [2026-01-27] Remediation: Fixed 6 issues from code review:
  - H1: Added explicit tenant_id filtering in activity storage query (defense-in-depth)
  - H2: Changed cursor pagination to use (created_at, id) tuple comparison for reliable ordering
  - H3: Fixed frontend hook dependency array issue by using refs for cursor state
  - M4: Extracted duplicated icon/color/link mapping to `src/utils/activityUtils.ts`
  - L5: Kept direct apiClient for hives in Activity page (acceptable pattern)
  - L6: Extracted hardcoded limit (20) to constants in `src/constants/pagination.ts`

**New Files Created:**
- `apis-dashboard/src/utils/activityUtils.ts` - Shared activity icon/color/link utilities
- `apis-dashboard/src/constants/pagination.ts` - Pagination constants

**Additional Files Modified:**
- `apis-server/internal/storage/activity.go` - Added TenantID filter and cursor tuple pagination
- `apis-server/internal/services/activity.go` - Added CursorTime to result
- `apis-server/internal/handlers/activity.go` - Pass tenant_id and cursor_time params
- `apis-dashboard/src/hooks/useActivityFeed.ts` - Use refs for cursor, added cursor_time support
- `apis-dashboard/src/components/ActivityFeedCard.tsx` - Use shared utils
- `apis-dashboard/src/pages/Activity.tsx` - Use shared utils and constants
- `apis-dashboard/src/utils/index.ts` - Export activity utils
- `apis-dashboard/src/constants/index.ts` - Export pagination constants
