# Code Review: Story 4.2 - Clip Archive List View

**Story File:** `_bmad-output/implementation-artifacts/4-2-clip-archive-list-view.md`
**Reviewer:** BMAD Adversarial Code Review
**Date:** 2026-01-25
**Story Status at Review:** done

---

## Acceptance Criteria Verification

| AC# | Requirement | Status | Evidence |
|-----|-------------|--------|----------|
| AC1 | Grid of clip thumbnails (newest first) with preview image, date/time, unit name, duration | IMPLEMENTED | `Clips.tsx:414-420` renders grid, `ClipCard.tsx` displays all required fields, `clips.go:261` orders by `recorded_at DESC` |
| AC2 | Infinite scroll or pagination | IMPLEMENTED | `Clips.tsx:422-446` implements `Pagination` component with page controls |
| AC3 | Filter by date range, unit dropdown, site dropdown | IMPLEMENTED | `Clips.tsx:267-281` DateRangePicker, `Clips.tsx:256-265` Unit Select, `Clips.tsx:246-253` Site Select |
| AC4 | Clear filters button, result count displayed | IMPLEMENTED | `Clips.tsx:282-291` Clear button, `Clips.tsx:311-335` shows "Showing X of Y clips" |
| AC5 | Empty state with "No clips found" and filter suggestions | IMPLEMENTED | `Clips.tsx:370-408` shows empty state with suggestion text |

---

## Issues Found

### I1: Task 6 (Testing) Marked Incomplete But Story Status is "done"

**File:** `_bmad-output/implementation-artifacts/4-2-clip-archive-list-view.md`
**Line:** 57-60
**Severity:** CRITICAL
**Status:** [x] FIXED

Story status is set to "done" but Task 6 is NOT complete:
```markdown
- [ ] Task 6: Testing (All ACs)
  - [ ] 6.1 Unit test for ListClips handler
  - [ ] 6.2 Test filter parameter validation
  - [ ] 6.3 Test empty state display
```

**Evidence:** No test files exist for clips in:
- `apis-server/tests/handlers/` - no clips_test.go
- `apis-dashboard/tests/components/` - no ClipCard.test.tsx or Clips.test.tsx
- `apis-dashboard/tests/hooks/` - no useClips.test.ts

**Impact:** Story should NOT be marked done with incomplete tests. This violates the acceptance criteria "All ACs" requirement.

**Fix Applied:** Added ListClips handler tests to clips_test.go and created ClipCard.test.tsx, useClips.test.ts, Clips.test.tsx. Updated Task 6 checkboxes in story file.

---

### I2: Dev Agent Record File List is Empty

**File:** `_bmad-output/implementation-artifacts/4-2-clip-archive-list-view.md`
**Line:** 189
**Severity:** HIGH
**Status:** [x] FIXED

The Dev Agent Record section shows:
```markdown
### File List

```
No files are documented despite multiple files being created/modified.

**Expected files that should be listed:**
- `apis-dashboard/src/pages/Clips.tsx` (modified)
- `apis-dashboard/src/components/ClipCard.tsx` (created)
- `apis-dashboard/src/hooks/useClips.ts` (created)
- `apis-server/internal/handlers/clips.go` (modified - added ListClips, GetClipThumbnail)
- `apis-server/internal/storage/clips.go` (modified - added ListClipsWithUnitName)

**Impact:** Poor documentation makes tracking changes difficult and violates story completion requirements.

**Fix Applied:** Populated File List in story file with all created/modified files.

---

### I3: Missing total_pages in API Meta Response

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/clips.go`
**Line:** 378-385
**Severity:** MEDIUM
**Status:** [x] FIXED

The Dev Notes specify `total_pages` in the API response (line 97-98 in story):
```json
"meta": {
  "total": 42,
  "page": 1,
  "per_page": 20,
  "total_pages": 3
}
```

But the actual implementation returns:
```go
Meta: MetaResponse{
    Total:   total,
    Page:    params.Page,
    PerPage: params.PerPage,
},
```

`total_pages` is missing from `MetaResponse`. The frontend doesn't use it currently, but the API contract documented in the story is not fulfilled.

**Fix Applied:** Added TotalPages field to MetaResponse struct and calculated it in ListClips handler.

---

### I4: ClipPlayerModal Import Creates Story 4.3 Dependency

**File:** `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/pages/Clips.tsx`
**Line:** 25, 451-459
**Severity:** MEDIUM
**Status:** [x] FIXED

`Clips.tsx` imports and uses `ClipPlayerModal`:
```tsx
import { ClipCard, ClipPlayerModal } from '../components';
...
<ClipPlayerModal
  open={selectedClipIndex !== null}
  clip={...}
  ...
/>
```

`ClipPlayerModal.tsx` is documented as "Part of Epic 4, Story 4.3 (Clip Video Playback)" - this creates a dependency on Story 4.3 that should be documented. If 4.2 is reviewed before 4.3 is complete, this component may not exist.

**Impact:** Story coupling not documented - 4.2 requires 4.3's component to function.

**Fix Applied:** Documented the cross-story dependency in the Dependencies section of the story file.

---

### I5: No Validation of site_id Tenant Ownership in ListClips

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/clips.go`
**Line:** 285-290
**Severity:** MEDIUM
**Status:** [x] FIXED

The handler validates site exists but doesn't verify tenant ownership:
```go
// Validate site exists and belongs to tenant
_, err := storage.GetSiteByID(r.Context(), conn, siteID)
if err != nil {
    respondError(w, "Site not found", http.StatusNotFound)
    return
}
```

The comment says "belongs to tenant" but `GetSiteByID` doesn't check tenant_id. RLS should handle this, but explicit validation is safer for defense in depth.

**Impact:** Relies entirely on RLS for tenant isolation - if RLS misconfigured, could leak clips across tenants.

**Fix Applied:** Added explicit tenant_id check after GetSiteByID for defense in depth.

---

### I6: formatDateParam Loses Time Precision

**File:** `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/hooks/useClips.ts`
**Line:** 62-65
**Severity:** LOW
**Status:** [x] FIXED

```tsx
function formatDateParam(date: Date | null | undefined): string | null {
  if (!date) return null;
  return date.toISOString().split('T')[0]; // Only keeps YYYY-MM-DD
}
```

Time component is stripped, so filtering by date range loses hour/minute precision. If user selects "Today 2pm to 5pm", the API receives just the date.

**Impact:** Date filtering is day-granular only, not precise to time. May show unexpected clips outside selected time window.

**Fix Applied:** Changed formatDateParam to return full ISO 8601 string preserving time component.

---

### I7: Unnecessary useState for hover/focus in ClipCard

**File:** `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/ClipCard.tsx`
**Line:** 39-40
**Severity:** LOW
**Status:** [x] FIXED

```tsx
const [isHovered, setIsHovered] = useState(false);
const [isFocused, setIsFocused] = useState(false);
```

Two separate state variables cause re-renders on hover. Could use CSS-only solution with `:hover` and `:focus-visible` pseudo-classes for better performance when rendering many cards.

**Impact:** Minor performance cost with large clip lists (20+ cards) due to re-renders.

**Fix Applied:** Removed useState hooks and replaced with CSS-only :hover/:focus-visible pseudo-classes.

---

### I8: Hardcoded per_page Limit in Backend

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/clips.go`
**Line:** 344-350
**Severity:** LOW
**Status:** [x] FIXED

```go
if perPage := r.URL.Query().Get("per_page"); perPage != "" {
    pp, err := strconv.Atoi(perPage)
    if err != nil || pp < 1 || pp > 100 {
        respondError(w, "Invalid 'per_page' parameter (1-100)", http.StatusBadRequest)
        return
    }
```

Max of 100 is hardcoded. Frontend uses 20 and doesn't expose page size control. If frontend adds "show 50" option, needs coordination.

**Impact:** Low - current implementation works, but magic number should be a constant.

**Fix Applied:** Extracted magic numbers to named constants (defaultClipsPerPage, maxClipsPerPage).

---

## Verdict

**Status:** PASS

**Summary:**
- 1 CRITICAL issue: FIXED - Tests added and Task 6 marked complete
- 1 HIGH issue: FIXED - File List populated
- 3 MEDIUM issues: FIXED - total_pages added, dependency documented, tenant validation added
- 3 LOW issues: FIXED - Date precision, hover state performance, hardcoded limits

All 8 issues have been remediated.

---

## Remediation Log

**Remediated:** 2026-01-25
**Issues Fixed:** 8 of 8

### Changes Applied
- I1: Added ListClips tests to clips_test.go, created ClipCard.test.tsx, useClips.test.ts, Clips.test.tsx
- I2: Populated File List in story file with all created/modified files
- I3: Added TotalPages field to MetaResponse and calculated it in ListClips handler
- I4: Documented cross-story dependency on ClipPlayerModal in story Dependencies
- I5: Added explicit tenant_id validation in ListClips handler
- I6: Changed formatDateParam to preserve full ISO 8601 timestamp
- I7: Refactored ClipCard to use CSS-only hover/focus states
- I8: Extracted pagination limits to named constants

### Remaining Issues
None - all issues fixed.

---

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
