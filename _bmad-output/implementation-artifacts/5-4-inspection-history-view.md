# Story 5.4: Inspection History View

Status: done

## Story

As a **beekeeper**,
I want to review past inspections,
So that I can track hive progress and spot trends.

## Acceptance Criteria

1. **Given** I am on a hive detail page **When** I view the Inspection History section **Then** I see a chronological list of inspections (newest first) **And** each entry shows: Date, Key findings (Queen ✓, brood frames, stores level), Any issues flagged

2. **Given** I click on an inspection entry **When** the detail view opens **Then** I see all recorded data from that inspection **And** option to edit (within 24 hours) or delete

3. **Given** I'm on desktop **When** I view inspection history **Then** I see a table view with sortable columns **And** export option (CSV)

4. **Given** I want to compare inspections **When** I select two inspections **Then** I see a side-by-side comparison: Changes highlighted, Time between inspections

## Tasks / Subtasks

### Task 1: Backend - Add Pagination to List Inspections (AC: #1, #3)
- [ ] 1.1 Add offset/cursor pagination to ListInspectionsByHive
- [ ] 1.2 Add total count to response meta
- [ ] 1.3 Support sorting by inspected_at (asc/desc)

### Task 2: Backend - Export Endpoint (AC: #3)
- [ ] 2.1 Add GET /api/hives/{id}/inspections/export endpoint
- [ ] 2.2 Return CSV format with all inspection fields
- [ ] 2.3 Include proper Content-Disposition header

### Task 3: Frontend - Inspection History Table (AC: #1, #3)
- [ ] 3.1 Create InspectionHistory.tsx component
- [ ] 3.2 Display Ant Design Table with sortable columns
- [ ] 3.3 Show key findings summary in table row
- [ ] 3.4 Add "View Details" action per row
- [ ] 3.5 Add "Export CSV" button

### Task 4: Frontend - Inspection Detail Modal (AC: #2)
- [ ] 4.1 Create InspectionDetailModal.tsx component
- [ ] 4.2 Display all inspection fields in organized layout
- [ ] 4.3 Show edit button if within 24 hours
- [ ] 4.4 Show delete button with confirmation
- [ ] 4.5 Wire up edit to InspectionEdit page

### Task 5: Frontend - Edit Inspection Page (AC: #2)
- [ ] 5.1 Create InspectionEdit.tsx page
- [ ] 5.2 Pre-populate form with existing inspection data
- [ ] 5.3 Validate 24-hour edit window on backend

### Task 6: Backend - Update/Delete Validation (AC: #2)
- [ ] 6.1 Add edit window validation (24 hours) to UpdateInspection
- [ ] 6.2 Log edit attempts outside window

### Task 7: Frontend - Comparison View (AC: #4) [Optional for MVP]
- [ ] 7.1 Add checkbox selection for inspections
- [ ] 7.2 Create CompareInspections modal
- [ ] 7.3 Show side-by-side with highlighted changes

## Dev Notes

### Architecture Patterns

**Pagination:**
- Use limit/offset for simplicity
- Return total count for pagination UI
- Default limit: 20, max: 100

**CSV Export:**
- Stream large exports
- Include headers: date, queen_seen, eggs_seen, queen_cells, brood_frames, brood_pattern, honey_level, pollen_level, temperament, issues, notes

**Edit Window:**
- 24-hour window from created_at
- Show "Edit" button only when within window
- Backend rejects edits outside window with 403

### Project Structure Notes

**Backend files:**
- `apis-server/internal/handlers/inspections.go` (modify for pagination, export)

**Frontend files to create:**
- `apis-dashboard/src/components/InspectionHistory.tsx`
- `apis-dashboard/src/components/InspectionDetailModal.tsx`
- `apis-dashboard/src/pages/InspectionEdit.tsx`

### References

- [Source: epics.md#Story-5.4] - Full acceptance criteria
- [Source: Story 5.3] - Inspection data structure

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5

### Debug Log References

- Fixed missing pagination parameters in ListInspectionsByHive handler
- Added 24-hour edit window validation to UpdateInspection handler
- Added server-side sorting support
- Fixed linter warnings about string concatenation in loops

### Completion Notes List

1. Backend pagination endpoint now uses ListInspectionsPaginated with offset, limit, and sort params
2. 24-hour edit window enforced on backend with 403 response for expired edits
3. CSV export uses streaming with proper escaping
4. Server-side sorting implemented (asc/desc by inspected_at)
5. Frontend table with controlled sorting that triggers server-side sort
6. AC #4 (comparison view) explicitly marked as optional for MVP - not implemented

### File List

**Backend:**
- `apis-server/internal/storage/inspections.go` - ListInspectionsPaginated, ListAllInspectionsByHive
- `apis-server/internal/handlers/inspections.go` - Updated ListInspectionsByHive for pagination, added edit window validation, export endpoint
- `apis-server/cmd/server/main.go` - Export route registration

**Frontend:**
- `apis-dashboard/src/components/InspectionHistory.tsx` - Table with pagination, sorting, export
- `apis-dashboard/src/components/InspectionDetailModal.tsx` - Detail view with edit/delete
- `apis-dashboard/src/pages/InspectionEdit.tsx` - Edit form with 24-hour window UI
- `apis-dashboard/src/components/index.ts` - Exports
- `apis-dashboard/src/pages/index.ts` - Page exports
- `apis-dashboard/src/App.tsx` - Route registration
