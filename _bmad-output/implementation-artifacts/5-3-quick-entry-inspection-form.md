# Story 5.3: Quick-Entry Inspection Form

Status: done

## Story

As a **beekeeper**,
I want to record inspections quickly in the field,
so that I can document observations without taking off my gloves.

## Acceptance Criteria

1. **Given** I am on a hive detail page (mobile) **When** I tap "New Inspection" **Then** a swipe-based card flow begins with large 64px touch targets

2. **Given** I am on the Queen card **When** I view it **Then** I see three large toggles:
   - Queen seen? (Yes/No)
   - Eggs seen? (Yes/No)
   - Queen cells? (Yes/No)
   **And** I swipe right to proceed to next card

3. **Given** I am on the Brood card **When** I view it **Then** I see:
   - Brood frames stepper (0-10, large +/- buttons)
   - Pattern quality (Good/Spotty/Poor - large buttons)

4. **Given** I am on the Stores card **When** I view it **Then** I see:
   - Honey level (Low/Medium/High - large segment)
   - Pollen level (Low/Medium/High - large segment)

5. **Given** I am on the Issues card **When** I view it **Then** I see large checkboxes for common issues:
   - DWV (Deformed Wing Virus)
   - Chalkbrood
   - Wax moth
   - Robbing
   - Other (opens text input)

6. **Given** I am on the Notes card **When** I view it **Then** I see a large text area **And** a prominent voice button for voice input **And** a smaller "Keyboard" button

7. **Given** I complete all cards **When** I reach the Review card **Then** I see a summary of all entered data **And** a large "SAVE" button (64px, full width, bottom-anchored)

## Tasks / Subtasks

### Task 1: Database Schema (AC: All)
- [x] 1.1 Create migration `0010_inspections.sql` with inspections table
- [x] 1.2 Add indexes for tenant_id, hive_id, inspected_at lookups
- [x] 1.3 Add RLS policy for tenant isolation

### Task 2: Backend Storage Layer (AC: All)
- [x] 2.1 Create `internal/storage/inspections.go` with CRUD operations
- [x] 2.2 Implement `CreateInspection`, `GetInspectionByID`, `ListInspectionsByHive`
- [x] 2.3 Implement `UpdateInspection`, `DeleteInspection`
- [x] 2.4 Implement `GetLastInspectionForHive` for status calculation

### Task 3: Backend API Handlers (AC: All)
- [x] 3.1 Create `internal/handlers/inspections.go` with REST endpoints
- [x] 3.2 Implement `POST /api/hives/{hive_id}/inspections` - Create inspection
- [x] 3.3 Implement `GET /api/hives/{hive_id}/inspections` - List inspections
- [x] 3.4 Implement `GET /api/inspections/{id}` - Get inspection
- [x] 3.5 Implement `PUT /api/inspections/{id}` - Update inspection
- [x] 3.6 Implement `DELETE /api/inspections/{id}` - Delete inspection
- [x] 3.7 Register routes in main.go

### Task 4: Update Hive Handlers for Inspection Status (AC: From 5.2)
- [x] 4.1 Update hive response to include actual last inspection data
- [x] 4.2 Calculate hive status based on inspection age and issues

### Task 5: Frontend - Inspection Form Page (AC: #1-7)
- [x] 5.1 Create `InspectionCreate.tsx` page component
- [x] 5.2 Implement swipe-based card flow with steps
- [x] 5.3 Create QueenCard component with large toggles
- [x] 5.4 Create BroodCard component with stepper and pattern buttons
- [x] 5.5 Create StoresCard component with level segments
- [x] 5.6 Create IssuesCard component with checkboxes
- [x] 5.7 Create NotesCard component with text area
- [x] 5.8 Create ReviewCard component with summary and save button

### Task 6: Frontend - Touch-Friendly Styling (AC: #1, UX reqs)
- [x] 6.1 Ensure all touch targets are 64px minimum
- [x] 6.2 Add swipe gesture support between cards
- [x] 6.3 Style for glove-friendly operation

### Task 7: Routing and Integration (AC: #1)
- [x] 7.1 Add route: `/hives/:hiveId/inspections/new`
- [x] 7.2 Wire up "New Inspection" button in HiveDetail.tsx
- [x] 7.3 Redirect to hive detail on successful save

## Dev Notes

### Architecture Patterns

**Database Schema:**
```sql
CREATE TABLE inspections (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    hive_id TEXT NOT NULL REFERENCES hives(id) ON DELETE CASCADE,
    inspected_at DATE NOT NULL DEFAULT CURRENT_DATE,
    -- Queen observations
    queen_seen BOOLEAN,
    eggs_seen BOOLEAN,
    queen_cells BOOLEAN,
    -- Brood
    brood_frames INTEGER CHECK (brood_frames >= 0 AND brood_frames <= 20),
    brood_pattern TEXT CHECK (brood_pattern IN ('good', 'spotty', 'poor')),
    -- Stores
    honey_level TEXT CHECK (honey_level IN ('low', 'medium', 'high')),
    pollen_level TEXT CHECK (pollen_level IN ('low', 'medium', 'high')),
    -- Temperament
    temperament TEXT CHECK (temperament IN ('calm', 'nervous', 'aggressive')),
    -- Issues (JSON array of issue codes)
    issues JSONB DEFAULT '[]',
    -- Notes
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Issue Codes:**
- `dwv` - Deformed Wing Virus
- `chalkbrood` - Chalkbrood
- `wax_moth` - Wax moth
- `robbing` - Robbing behavior
- `other:{text}` - Custom issue with description

**Swipe Navigation:**
Use a simple step-based approach with next/prev buttons. True swipe gestures are nice-to-have but not critical for MVP.

### Project Structure Notes

**Backend files to create:**
- `apis-server/internal/storage/migrations/0010_inspections.sql`
- `apis-server/internal/storage/inspections.go`
- `apis-server/internal/handlers/inspections.go`

**Frontend files to create:**
- `apis-dashboard/src/pages/InspectionCreate.tsx`
- `apis-dashboard/src/components/inspection/` (optional: component breakdown)

### References

- [Source: epics.md#Story-5.3] - Full acceptance criteria
- [Source: epics.md#Story-5.4] - Inspection table schema notes
- [Source: UX design] - 64px touch targets, glove-friendly operation

## Dev Agent Record

### Agent Model Used

claude-opus-4-5-20251101

### Debug Log References

- Backend compilation verified successfully
- Frontend compilation verified successfully with Vite build

### Completion Notes List

1. Created inspections database table with full schema (queen observations, brood, stores, issues, notes)
2. Implemented full CRUD operations in storage layer with JSON handling for issues array
3. Created REST API handlers with proper validation for enum values
4. Added `enrichHiveResponseWithInspection()` to calculate hive status based on last inspection
5. Built mobile-first inspection form with step-based navigation (Queen → Brood → Stores → Issues → Notes → Review)
6. All touch targets are 64px minimum for glove-friendly operation
7. Updated HiveDetail.tsx to display recent inspections timeline
8. Proper routing integration at `/hives/:hiveId/inspections/new`

### Code Review Fixes Applied

**HIGH severity fixes:**
1. Added `validateIssues()` to validate issue codes (dwv, chalkbrood, wax_moth, robbing, other:*)
2. Added `validateNotes()` to enforce 2000 character limit on notes
3. Added future date validation - inspection date cannot be in the future
4. Added proper loading/error states for inspections list in HiveDetail.tsx

**MEDIUM severity fixes:**
5. Added `inspectionsLoading` and `inspectionsError` states to HiveDetail
6. Added retry button when inspections fail to load

### File List

**Backend:**
- `apis-server/internal/storage/migrations/0010_inspections.sql` (new)
- `apis-server/internal/storage/inspections.go` (new)
- `apis-server/internal/handlers/inspections.go` (new)
- `apis-server/internal/handlers/hives.go` (modified - added enrichment function)
- `apis-server/cmd/server/main.go` (modified - registered inspection routes)

**Frontend:**
- `apis-dashboard/src/pages/InspectionCreate.tsx` (new)
- `apis-dashboard/src/pages/index.ts` (modified - added export)
- `apis-dashboard/src/pages/HiveDetail.tsx` (modified - wired up inspection buttons, displays inspections list)
- `apis-dashboard/src/App.tsx` (modified - added route)
