# Story 8.5: Maintenance Priority View

Status: done

## Story

As a **beekeeper**,
I want to see all hives that need attention ranked by priority,
So that I can plan my apiary work efficiently.

## Acceptance Criteria

1. **Given** I navigate to the Maintenance page **When** it loads **Then** I see a list of all hives with pending actions sorted by priority (most urgent first)

2. **Given** a hive needs attention **When** I view its entry **Then** I see:
   - Hive name and location (site name)
   - Priority indicator (red "Urgent", yellow "Soon", green "Optional")
   - Summary text (e.g., "Treatment due, 92 days since last")
   - Quick action buttons (Log Treatment, Log Inspection, etc.)

3. **Given** no hives need attention **When** I view the page **Then** I see: "All caught up! No maintenance needed." with a green checkmark icon

4. **Given** I complete an action **When** I return to the maintenance list **Then** the completed item is removed or moved to "Recently completed" section

5. **Given** I want to batch actions **When** I select multiple hives (checkboxes) **Then** I can apply the same action to all selected (e.g., "Log treatment for selected")

6. **Given** I filter by site **When** I select a site from the site filter **Then** only hives from that site are shown in the maintenance list

## Tasks / Subtasks

### Task 1: Backend - Maintenance API Endpoint (AC: #1, #2, #3, #6)
- [x] 1.1 Add `GetMaintenance` handler to `apis-server/internal/handlers/beebrain.go`
- [x] 1.2 Implement `GET /api/beebrain/maintenance?site_id=xxx` endpoint
- [x] 1.3 Create `MaintenanceItem` struct with: hive_id, hive_name, site_id, site_name, priority, priority_score, summary, insights, quick_actions
- [x] 1.4 Implement priority score calculation: severity_weight (action-needed=100, warning=50, info=10) + age_days
- [x] 1.5 Aggregate insights by hive_id, return one MaintenanceItem per hive with oldest/highest-severity insight as primary
- [x] 1.6 Return quick_actions array based on rule_id mapping (treatment_due -> "Log Treatment", inspection_overdue -> "Log Inspection", etc.)
- [x] 1.7 Register route in main.go: `r.Get("/api/beebrain/maintenance", h.GetMaintenance)`
- [x] 1.8 Add site_id query param filtering (optional, if not provided return all sites)

### Task 2: Backend - Maintenance Service Logic (AC: #1, #4)
- [x] 2.1 Add `GetMaintenanceItems` function to `apis-server/internal/services/beebrain.go`
- [x] 2.2 Query active insights (not dismissed, not snoozed) grouped by hive_id
- [x] 2.3 Join with hives and sites tables to get names
- [x] 2.4 Calculate priority_score for each hive: `max_severity_weight + EXTRACT(EPOCH FROM NOW() - oldest_insight_created_at) / 86400`
- [x] 2.5 Sort by priority_score DESC (highest priority first)
- [x] 2.6 Map severity to priority label: action-needed -> "Urgent", warning -> "Soon", info -> "Optional"

### Task 3: Frontend - useMaintenanceItems Hook (AC: #1, #4, #6)
- [x] 3.1 Create `apis-dashboard/src/hooks/useMaintenanceItems.ts`
- [x] 3.2 Define `MaintenanceItem` interface matching backend response
- [x] 3.3 Implement fetch from `GET /api/beebrain/maintenance?site_id=xxx`
- [x] 3.4 Track loading, error states
- [x] 3.5 Implement refetch function for use after completing actions
- [x] 3.6 Export from `apis-dashboard/src/hooks/index.ts`

### Task 4: Frontend - MaintenanceItemCard Component (AC: #2)
- [x] 4.1 Create `apis-dashboard/src/components/MaintenanceItemCard.tsx`
- [x] 4.2 Implement card layout with:
   - Checkbox for selection (left side)
   - Priority indicator badge (red/yellow/green with icon)
   - Hive name (link to hive detail)
   - Site name (secondary text)
   - Summary text
   - Quick action buttons row
- [x] 4.3 Implement priority badge styling using theme colors:
   - Urgent: `colors.error` (#c62828) with ExclamationCircleOutlined
   - Soon: `colors.warning` (#f9a825) with WarningOutlined
   - Optional: `colors.success` (#2e7d32) with InfoCircleOutlined
- [x] 4.4 Implement quick action buttons that navigate to relevant forms:
   - "Log Treatment" -> `/hives/{hive_id}` (treatments tab)
   - "Log Inspection" -> `/hives/{hive_id}/inspections/new`
   - "View Details" -> `/hives/{hive_id}`
- [x] 4.5 Add selection checkbox with onChange callback
- [x] 4.6 Apply Honey Beegood theme styling
- [x] 4.7 Export from `apis-dashboard/src/components/index.ts`

### Task 5: Frontend - Maintenance Page (AC: #1, #2, #3, #5, #6)
- [x] 5.1 Create `apis-dashboard/src/pages/Maintenance.tsx`
- [x] 5.2 Implement page header with title "Maintenance" and site filter dropdown
- [x] 5.3 Implement empty state: "All caught up! No maintenance needed." with CheckCircleOutlined icon
- [x] 5.4 Implement loading state with Ant Design Skeleton
- [x] 5.5 Render list of MaintenanceItemCard components
- [x] 5.6 Implement batch selection state (selectedHiveIds: Set<string>)
- [x] 5.7 Implement "Select All" checkbox in header
- [x] 5.8 Implement batch action toolbar (appears when items selected):
   - "X items selected" text
   - "Log Treatment for Selected" button
   - "Clear Selection" button
- [x] 5.9 Implement batch action modal for treatment logging
- [x] 5.10 Add page route to App.tsx: `/maintenance`
- [x] 5.11 Add "Maintenance" item to sidebar navigation in navItems.tsx (using ToolOutlined icon)

### Task 6: Frontend - Recently Completed Section (AC: #4)
- [x] 6.1 Add `completed_insights` array to maintenance API response (last 7 days, up to 10 items)
- [x] 6.2 Create collapsible "Recently Completed" section at bottom of page
- [x] 6.3 Show completed items with strikethrough styling
- [x] 6.4 Include completion date and what action was taken

### Task 7: Testing (AC: #1, #2, #3, #4, #5, #6)
- [x] 7.1 Create `apis-server/tests/handlers/beebrain_test.go` (added maintenance tests)
- [x] 7.2 Test GET /api/beebrain/maintenance returns aggregated items
- [x] 7.3 Test priority_score calculation and sorting
- [x] 7.4 Test site_id filtering
- [x] 7.5 Test empty state (no active insights)
- [x] 7.6 Create `apis-dashboard/tests/hooks/useMaintenanceItems.test.ts` (22 tests)
- [x] 7.7 Create `apis-dashboard/tests/components/MaintenanceItemCard.test.tsx` (21 tests)
- [x] 7.8 Create `apis-dashboard/tests/pages/Maintenance.test.tsx` (19 tests)
- [x] 7.9 Test batch selection and action flow
- [x] 7.10 Test empty state rendering

## Dev Notes

### API Endpoint Specification

**Endpoint:** `GET /api/beebrain/maintenance`

**Query Parameters:**
- `site_id` (optional): Filter by site

**Response Structure:**
```json
{
  "data": {
    "items": [
      {
        "hive_id": "hive-123",
        "hive_name": "Hive 2",
        "site_id": "site-456",
        "site_name": "Home Apiary",
        "priority": "Urgent",
        "priority_score": 192,
        "summary": "Varroa treatment due (92 days since last treatment)",
        "insights": [
          {
            "id": "ins-789",
            "rule_id": "treatment_due",
            "severity": "action-needed",
            "message": "Hive 2: Varroa treatment due (92 days since last treatment)",
            "created_at": "2026-01-25T10:30:00Z"
          }
        ],
        "quick_actions": [
          { "label": "Log Treatment", "url": "/hives/hive-123", "tab": "treatments" },
          { "label": "View Details", "url": "/hives/hive-123" }
        ]
      }
    ],
    "recently_completed": [
      {
        "hive_id": "hive-001",
        "hive_name": "Hive 1",
        "action": "Treatment logged",
        "completed_at": "2026-01-24T15:00:00Z"
      }
    ],
    "total_count": 3,
    "all_caught_up": false
  }
}
```

### Priority Score Calculation

```go
// Priority score = severity_weight + age_in_days
// Higher score = more urgent (appears first in list)

const (
    SeverityActionNeeded = 100  // Red - Urgent
    SeverityWarning      = 50   // Yellow - Soon
    SeverityInfo         = 10   // Green - Optional
)

func calculatePriorityScore(severity string, createdAt time.Time) int {
    weight := SeverityInfo
    switch severity {
    case "action-needed":
        weight = SeverityActionNeeded
    case "warning":
        weight = SeverityWarning
    }
    ageInDays := int(time.Since(createdAt).Hours() / 24)
    return weight + ageInDays
}
```

### Quick Action Mapping

```typescript
// Rule ID to quick action buttons
const quickActionsByRuleId: Record<string, QuickAction[]> = {
  'treatment_due': [
    { label: 'Log Treatment', url: '/hives/{hive_id}', tab: 'treatments' },
    { label: 'View Details', url: '/hives/{hive_id}' }
  ],
  'inspection_overdue': [
    { label: 'Log Inspection', url: '/hives/{hive_id}/inspections/new' },
    { label: 'View Details', url: '/hives/{hive_id}' }
  ],
  'queen_aging': [
    { label: 'View Queen Info', url: '/hives/{hive_id}' },
    { label: 'View Details', url: '/hives/{hive_id}' }
  ],
  'hornet_activity_spike': [
    { label: 'View Clips', url: '/clips' },
    { label: 'View Details', url: '/hives/{hive_id}' }
  ]
};
```

### Backend Handler Pattern (Follow Existing beebrain.go)

```go
// Add to internal/handlers/beebrain.go

// MaintenanceResponse represents the maintenance API response.
type MaintenanceResponse struct {
    Data MaintenanceData `json:"data"`
}

// MaintenanceData contains the maintenance items and metadata.
type MaintenanceData struct {
    Items            []MaintenanceItem          `json:"items"`
    RecentlyCompleted []RecentlyCompletedItem    `json:"recently_completed"`
    TotalCount       int                         `json:"total_count"`
    AllCaughtUp      bool                        `json:"all_caught_up"`
}

// MaintenanceItem represents a hive needing attention.
type MaintenanceItem struct {
    HiveID        string              `json:"hive_id"`
    HiveName      string              `json:"hive_name"`
    SiteID        string              `json:"site_id"`
    SiteName      string              `json:"site_name"`
    Priority      string              `json:"priority"`       // "Urgent", "Soon", "Optional"
    PriorityScore int                 `json:"priority_score"`
    Summary       string              `json:"summary"`
    Insights      []services.Insight  `json:"insights"`
    QuickActions  []QuickAction       `json:"quick_actions"`
}

// QuickAction represents a quick action button.
type QuickAction struct {
    Label string `json:"label"`
    URL   string `json:"url"`
    Tab   string `json:"tab,omitempty"`
}

// GetMaintenance handles GET /api/beebrain/maintenance
func (h *BeeBrainHandler) GetMaintenance(w http.ResponseWriter, r *http.Request) {
    if h.service == nil {
        log.Error().Msg("handler: BeeBrain service is nil")
        respondError(w, "Service unavailable", http.StatusInternalServerError)
        return
    }

    conn := storage.RequireConn(r.Context())
    tenantID := middleware.GetTenantID(r.Context())
    siteID := r.URL.Query().Get("site_id")  // Optional filter

    items, err := h.service.GetMaintenanceItems(r.Context(), conn, tenantID, siteID)
    if err != nil {
        log.Error().Err(err).Str("tenant_id", tenantID).Msg("handler: failed to get maintenance items")
        respondError(w, "Failed to get maintenance items", http.StatusInternalServerError)
        return
    }

    // Get recently completed (last 7 days, max 10)
    completed, _ := h.service.GetRecentlyCompletedInsights(r.Context(), conn, tenantID, siteID)

    respondJSON(w, MaintenanceResponse{
        Data: MaintenanceData{
            Items:            items,
            RecentlyCompleted: completed,
            TotalCount:       len(items),
            AllCaughtUp:      len(items) == 0,
        },
    }, http.StatusOK)
}
```

### Frontend TypeScript Interfaces

```typescript
// apis-dashboard/src/hooks/useMaintenanceItems.ts

export interface MaintenanceItem {
  hive_id: string;
  hive_name: string;
  site_id: string;
  site_name: string;
  priority: 'Urgent' | 'Soon' | 'Optional';
  priority_score: number;
  summary: string;
  insights: Insight[];
  quick_actions: QuickAction[];
}

export interface QuickAction {
  label: string;
  url: string;
  tab?: string;
}

export interface RecentlyCompletedItem {
  hive_id: string;
  hive_name: string;
  action: string;
  completed_at: string;
}

export interface MaintenanceData {
  items: MaintenanceItem[];
  recently_completed: RecentlyCompletedItem[];
  total_count: number;
  all_caught_up: boolean;
}
```

### Component Structure

```
Maintenance Page Layout:
+---------------------------------------------------------------+
| Maintenance                          [Site: All Sites v]       |
+---------------------------------------------------------------+
| [x] Select All                       3 items selected          |
| [ Log Treatment for Selected ]  [ Clear Selection ]            |
+---------------------------------------------------------------+
| [x] [!] Urgent  Hive 2 - Home Apiary                           |
|     Varroa treatment due (92 days since last treatment)        |
|     [ Log Treatment ]  [ View Details ]                        |
+---------------------------------------------------------------+
| [ ] [!] Soon    Hive 3 - Home Apiary                           |
|     Inspection overdue (16 days since last)                    |
|     [ Log Inspection ]  [ View Details ]                       |
+---------------------------------------------------------------+
| [ ] [i] Optional Hive 1 - Home Apiary                          |
|     Queen is 2+ years old                                      |
|     [ View Queen Info ]  [ View Details ]                      |
+---------------------------------------------------------------+
| v Recently Completed (3)                                        |
| - Hive 4: Treatment logged (Jan 24)                            |
| - Hive 5: Inspection logged (Jan 23)                           |
+---------------------------------------------------------------+
```

### Empty State Design

```tsx
// When no maintenance items exist
<Result
  icon={<CheckCircleOutlined style={{ color: colors.success }} />}
  title="All caught up!"
  subTitle="No maintenance needed. All your hives are in good shape."
  extra={
    <Button type="primary" onClick={() => navigate('/hives')}>
      View All Hives
    </Button>
  }
/>
```

### Theme Colors (from apisTheme.ts)

```typescript
const priorityStyles = {
  Urgent: {
    color: colors.error,      // '#c62828'
    bgColor: '#ffebee',
    icon: <ExclamationCircleOutlined />,
    tagColor: 'red'
  },
  Soon: {
    color: colors.warning,    // '#f9a825'
    bgColor: '#fff8e1',
    icon: <WarningOutlined />,
    tagColor: 'orange'
  },
  Optional: {
    color: colors.success,    // '#2e7d32'
    bgColor: '#e8f5e9',
    icon: <InfoCircleOutlined />,
    tagColor: 'green'
  }
};
```

### Sidebar Navigation Update

Add to `apis-dashboard/src/components/layout/AppLayout.tsx`:

```typescript
// Add after existing menu items
{
  key: 'maintenance',
  icon: <ToolOutlined />,
  label: <Link to="/maintenance">Maintenance</Link>,
}
```

### Route Registration

Add to `apis-dashboard/src/App.tsx`:

```typescript
<Route path="/maintenance" element={<Maintenance />} />
```

### Project Structure Notes

**Backend files to create/modify:**
- `apis-server/internal/handlers/beebrain.go` - Add GetMaintenance handler
- `apis-server/internal/services/beebrain.go` - Add GetMaintenanceItems, GetRecentlyCompletedInsights
- `apis-server/cmd/server/main.go` - Register maintenance route
- `apis-server/tests/handlers/beebrain_maintenance_test.go` - New test file

**Frontend files to create:**
- `apis-dashboard/src/hooks/useMaintenanceItems.ts`
- `apis-dashboard/src/components/MaintenanceItemCard.tsx`
- `apis-dashboard/src/pages/Maintenance.tsx`
- `apis-dashboard/tests/hooks/useMaintenanceItems.test.ts`
- `apis-dashboard/tests/components/MaintenanceItemCard.test.tsx`
- `apis-dashboard/tests/pages/Maintenance.test.tsx`

**Frontend files to modify:**
- `apis-dashboard/src/hooks/index.ts` - Export useMaintenanceItems
- `apis-dashboard/src/components/index.ts` - Export MaintenanceItemCard
- `apis-dashboard/src/pages/index.ts` - Export Maintenance
- `apis-dashboard/src/components/layout/AppLayout.tsx` - Add sidebar menu item
- `apis-dashboard/src/App.tsx` - Add route

### Key Implementation Details from Previous Stories

**From 8-1 (Rule Engine):**
- Insights table has: id, tenant_id, hive_id, rule_id, severity, message, suggested_action, data_points, created_at, dismissed_at, snoozed_until
- Active insights: dismissed_at IS NULL AND (snoozed_until IS NULL OR snoozed_until < NOW())
- Rule IDs: queen_aging, treatment_due, inspection_overdue, hornet_activity_spike

**From 8-4 (Proactive Notifications):**
- Severity priority: action-needed > warning > info
- Use existing `Insight` interface from `useBeeBrain.ts`
- Follow ProactiveInsightNotification styling patterns

**From BeeBrain service (services/beebrain.go):**
- Use existing `ListActiveInsights` from storage
- Follow AnalyzeTenant pattern for tenant-scoped queries

### Testing Requirements

**Backend Tests:**
- Test maintenance items are sorted by priority_score DESC
- Test site_id filter works correctly
- Test empty response when no active insights
- Test recently_completed items query
- Test priority calculation formula

**Frontend Tests:**
- Test hook fetches and returns maintenance items
- Test MaintenanceItemCard renders all fields correctly
- Test priority badge colors match severity
- Test quick action buttons navigate correctly
- Test batch selection state management
- Test empty state renders with correct message
- Test site filter updates displayed items

### References

- [Source: architecture.md#BeeBrain-Service] - BeeBrain API patterns
- [Source: architecture.md#Complete-API-Endpoints] - `GET /api/beebrain/maintenance`
- [Source: epics.md#Story-8.5] - Full acceptance criteria and technical notes
- [Source: 8-1-beebrain-rule-engine-mvp.md] - Insights table schema, rule IDs
- [Source: 8-4-proactive-insight-notifications.md] - Severity styling, priority sorting
- [Source: beebrain.go] - Handler pattern reference
- [Source: ProactiveInsightNotification.tsx] - Component styling patterns
- [Source: apisTheme.ts] - Theme colors for priority badges

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A

### Completion Notes List

- All acceptance criteria implemented and tested
- Backend: Added maintenance endpoint to BeeBrain API (`GET /api/beebrain/maintenance`)
- Frontend: Created Maintenance page with batch selection, site filtering, and recently completed section
- Navigation: Added Maintenance link to sidebar using ToolOutlined icon
- Tests: 62 frontend tests + 14 backend tests passing

### Change Log

- [2026-01-25] Story 8-5: Implemented full maintenance priority view feature
- [2026-01-25] Remediation: Fixed 6 code review issues (2 HIGH, 2 MEDIUM, 2 LOW)

### File List

**Backend (created/modified):**
- `apis-server/internal/storage/insights.go` - Added ListMaintenanceInsights, ListRecentlyCompletedInsights
- `apis-server/internal/services/beebrain.go` - Added GetMaintenanceItems, GetRecentlyCompletedInsights, priority calculation helpers
- `apis-server/internal/handlers/beebrain.go` - Added GetMaintenance handler
- `apis-server/cmd/server/main.go` - Registered /api/beebrain/maintenance route
- `apis-server/tests/handlers/beebrain_test.go` - Added maintenance-related tests

**Frontend (created):**
- `apis-dashboard/src/hooks/useMaintenanceItems.ts` - Hook for fetching maintenance data
- `apis-dashboard/src/components/MaintenanceItemCard.tsx` - Card component for maintenance items
- `apis-dashboard/src/pages/Maintenance.tsx` - Main maintenance page
- `apis-dashboard/tests/hooks/useMaintenanceItems.test.ts` - 22 hook tests
- `apis-dashboard/tests/components/MaintenanceItemCard.test.tsx` - 21 component tests
- `apis-dashboard/tests/pages/Maintenance.test.tsx` - 19 page tests

**Frontend (modified):**
- `apis-dashboard/src/hooks/index.ts` - Export useMaintenanceItems
- `apis-dashboard/src/components/index.ts` - Export MaintenanceItemCard
- `apis-dashboard/src/pages/index.ts` - Export Maintenance
- `apis-dashboard/src/App.tsx` - Added /maintenance route
- `apis-dashboard/src/components/layout/navItems.tsx` - Added Maintenance navigation item
