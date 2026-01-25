# Story 5.5: Frame-Level Data Tracking

Status: done

## Story

As a **beekeeper**,
I want to record frame counts per box,
So that I can track detailed hive development.

## Acceptance Criteria

1. **Given** I am recording an inspection **When** I reach the Frames section (optional advanced card) **Then** I see a per-box breakdown: For each box (Brood 1, Brood 2, Super 1, etc.) with fields for total frames, drawn comb count, brood frames count, honey frames count, pollen frames count

2. **Given** I enter frame data for a box **When** I enter "8 drawn, 6 brood, 2 honey, 1 pollen" **Then** "Empty/foundation" is auto-calculated (10 - 8 = 2) **And** validation warns if brood + honey > drawn (impossible)

3. **Given** frame tracking is complex **When** the user is in "Simple mode" **Then** only the basic brood/stores cards are shown **And** frame-level tracking is hidden behind "Advanced" toggle

4. **Given** I view a hive's frame history **When** I check past inspections **Then** I can see frame-by-frame progression over time

## Tasks / Subtasks

### Task 1: Backend - Create inspection_frames Table (AC: #1)
- [ ] 1.1 Create migration 0010_inspection_frames.sql
- [ ] 1.2 Add inspection_frames storage functions
- [ ] 1.3 Include frame data when returning inspection

### Task 2: Backend - Frame Data CRUD (AC: #1, #2)
- [ ] 2.1 Add frame data to CreateInspection endpoint
- [ ] 2.2 Add frame data to UpdateInspection endpoint
- [ ] 2.3 Add frame data to GetInspection response
- [ ] 2.4 Add validation for frame counts

### Task 3: Frontend - Advanced Mode Toggle (AC: #3)
- [ ] 3.1 Add advancedMode flag to user settings context
- [ ] 3.2 Add toggle in Settings page
- [ ] 3.3 Store preference in localStorage

### Task 4: Frontend - Frame Entry Form (AC: #1, #2)
- [ ] 4.1 Create FrameEntryCard component
- [ ] 4.2 Per-box frame inputs with validation
- [ ] 4.3 Auto-calculate empty/foundation count
- [ ] 4.4 Show only when advancedMode enabled

### Task 5: Frontend - Frame Data Display (AC: #4)
- [ ] 5.1 Show frame data in InspectionDetailModal
- [ ] 5.2 Include frame history in InspectionHistory table

## Dev Notes

### Database Schema

```sql
CREATE TABLE inspection_frames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  box_position INT NOT NULL,  -- 1 = bottom, increasing upward
  box_type VARCHAR(10) NOT NULL CHECK (box_type IN ('brood', 'super')),
  total_frames INT NOT NULL DEFAULT 10,
  drawn_frames INT NOT NULL DEFAULT 0,
  brood_frames INT NOT NULL DEFAULT 0,
  honey_frames INT NOT NULL DEFAULT 0,
  pollen_frames INT NOT NULL DEFAULT 0,
  UNIQUE (inspection_id, box_position)
);
```

### Validation Rules

- drawn_frames <= total_frames
- brood_frames + honey_frames <= drawn_frames (can overlap with pollen)
- All counts must be non-negative

### Project Structure

**Backend files:**
- `apis-server/internal/storage/migrations/0010_inspection_frames.sql`
- `apis-server/internal/storage/inspection_frames.go`
- `apis-server/internal/handlers/inspections.go` (modify)

**Frontend files:**
- `apis-dashboard/src/components/FrameEntryCard.tsx`
- `apis-dashboard/src/context/SettingsContext.tsx`
- `apis-dashboard/src/pages/Settings.tsx` (modify)
- `apis-dashboard/src/pages/InspectionCreate.tsx` (modify)
- `apis-dashboard/src/components/InspectionDetailModal.tsx` (modify)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5

### Debug Log References

- Created inspection_frames table migration
- Added storage functions for frame CRUD
- Integrated frame data into inspection create/update/get handlers
- Added SettingsContext for advancedMode preference
- Created FrameEntryCard component with validation
- Updated Settings page with advanced mode toggle

### Completion Notes List

1. Database: inspection_frames table with RLS, validation constraints
2. Backend: Full CRUD for frames via inspection endpoints
3. Frontend: SettingsContext persists advancedMode to localStorage
4. Frontend: FrameEntryCard shows collapsible frame tracking in inspection form
5. Frontend: InspectionDetailModal displays frame data when present
6. Settings: Toggle in Settings page for advanced mode
7. Validation: drawn >= brood + honey, all values non-negative

### File List

**Backend:**
- `apis-server/internal/storage/migrations/0010_inspection_frames.sql`
- `apis-server/internal/storage/inspection_frames.go`
- `apis-server/internal/handlers/inspections.go` (modified)
- `apis-server/cmd/server/main.go` (added frame-history route)

**Frontend:**
- `apis-dashboard/src/context/SettingsContext.tsx`
- `apis-dashboard/src/context/index.ts` (modified)
- `apis-dashboard/src/components/FrameEntryCard.tsx`
- `apis-dashboard/src/components/index.ts` (modified)
- `apis-dashboard/src/pages/Settings.tsx` (modified)
- `apis-dashboard/src/pages/InspectionCreate.tsx` (modified)
- `apis-dashboard/src/components/InspectionDetailModal.tsx` (modified)
- `apis-dashboard/src/App.tsx` (added SettingsProvider)
