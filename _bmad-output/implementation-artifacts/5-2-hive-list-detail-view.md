# Story 5.2: Hive List & Detail View

Status: done

## Story

As a **beekeeper**,
I want to see all my hives at a glance,
so that I can quickly check their status and select one for inspection.

## Acceptance Criteria

1. **Given** I am on a Site page **When** I view the Hives section **Then** I see a list/grid of hive cards showing:
   - Hive name
   - Queen age: "Queen: 2 years"
   - Box config: "2 brood + 1 super"
   - Last inspection: "5 days ago"
   - Status indicator (healthy/needs attention/unknown)

2. **Given** I click on a hive card **When** the detail page loads **Then** I see:
   - Hive configuration summary
   - Queen info with age calculation
   - Box visualization (stacked boxes diagram)
   - Recent inspection summary
   - Quick actions: "New Inspection", "Edit Config"

3. **Given** the hive hasn't been inspected in >14 days **When** I view the hive list **Then** that hive shows a yellow "Needs inspection" badge

4. **Given** the last inspection noted issues (DWV, Varroa high, etc.) **When** I view the hive list **Then** that hive shows an orange "Issues noted" badge

## Tasks / Subtasks

### Task 1: Backend - Add Inspection Summary to Hive Response (AC: #1, #2, #3, #4)
- [x] 1.1 Add `last_inspection_at` and `last_inspection_issues` fields to hive response
- [x] 1.2 Create query to get most recent inspection for each hive (placeholder - inspection table doesn't exist yet)
- [x] 1.3 Calculate hive status based on inspection data (defaults to "unknown" until Story 5.3)

### Task 2: Update Site Detail Hive List (AC: #1, #3, #4)
- [x] 2.1 Update `SiteDetail.tsx` hive cards to show queen age
- [x] 2.2 Add "Last inspection: X days ago" to hive cards
- [x] 2.3 Add status badge logic (yellow for needs_attention, green for healthy, default for unknown)
- [x] 2.4 Style cards using theme colors with Badge dot indicators

### Task 3: Update Hive Detail Page (AC: #2)
- [x] 3.1 Update `HiveDetail.tsx` to show recent inspection summary section (placeholder card)
- [x] 3.2 Add "New Inspection" quick action button (shows info message until Story 5.3)
- [x] 3.3 Ensure box visualization is prominent and accurate

### Task 4: Update Hives List Page (AC: #1, #3, #4)
- [x] 4.1 Update `Hives.tsx` to show same card format as Site detail
- [x] 4.2 Add status badges to list view
- [x] 4.3 Add queen age and last inspection info

## Dev Notes

### Architecture Patterns (from CLAUDE.md and architecture.md)

**API Response Enhancement:**
The hive response should be extended to include derived fields:
```json
{
  "data": {
    "id": "...",
    "name": "Hive 1",
    "queen_introduced_at": "2024-03-15",
    "brood_boxes": 2,
    "honey_supers": 1,
    // New derived fields:
    "last_inspection_at": "2026-01-20",
    "last_inspection_issues": ["varroa_high"],
    "status": "needs_attention" // "healthy" | "needs_attention" | "unknown"
  }
}
```

**Status Logic:**
- `unknown`: No inspections recorded
- `needs_attention`: >14 days since inspection OR issues in last inspection
- `healthy`: Inspected within 14 days AND no issues

**Note:** The inspections table doesn't exist yet (Story 5.3). For now:
- If no inspections table: always show "unknown" status
- Add placeholder text: "No inspections recorded"
- Once Story 5.3 is complete, this will automatically work

### Project Structure Notes

**Backend files to modify:**
- `apis-server/internal/handlers/hives.go` - Add inspection summary to response
- `apis-server/internal/storage/hives.go` - Query for last inspection (when table exists)

**Frontend files to modify:**
- `apis-dashboard/src/pages/SiteDetail.tsx` - Enhanced hive cards
- `apis-dashboard/src/pages/Hives.tsx` - Enhanced list view
- `apis-dashboard/src/pages/HiveDetail.tsx` - Add inspection summary section

### References

- [Source: epics.md#Story-5.2] - Full acceptance criteria
- [Source: architecture.md#Data-Model] - Hives table schema
- [Source: HiveDetail.tsx] - Existing hive detail implementation
- [Source: SiteDetail.tsx] - Existing site detail with hives section

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Implementation completed with placeholder support for inspections
- All frontend and backend changes build successfully

### Completion Notes List

1. **Queen Age Display**: Backend now calculates and returns `queen_age_display` in human-readable format (days/months/years)
2. **Status Field**: Added `status` field to hive response (defaults to "unknown" until inspections are implemented in Story 5.3)
3. **Last Inspection Fields**: Added `last_inspection_at` and `last_inspection_issues` fields (null until Story 5.3)
4. **Status Badges**: All hive lists now show status badges with appropriate colors
5. **Badge Dots**: Mini hive visualization icons now have status dot indicators
6. **New Inspection Button**: HiveDetail page has "New Inspection" button that shows info message until Story 5.3
7. **Inspection Summary Card**: Placeholder card with Empty state and "New Inspection" button

### File List

**Backend:**
- `apis-server/internal/handlers/hives.go` - Added queen age calculation, status field, inspection fields

**Frontend:**
- `apis-dashboard/src/pages/Hives.tsx` - Enhanced with status badges, queen age, last inspection
- `apis-dashboard/src/pages/SiteDetail.tsx` - Enhanced hive cards with status badges and inspection info
- `apis-dashboard/src/pages/HiveDetail.tsx` - Added inspection summary card and "New Inspection" button
