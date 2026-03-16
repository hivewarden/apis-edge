# Code Review: 6-4-equipment-log

**Story:** 6-4-equipment-log.md
**Reviewed:** 2026-01-25
**Status:** PASS

## Summary
The Equipment Log implementation is largely complete with solid backend/frontend architecture following project patterns. However, there are several issues including missing unit tests (critical for a feature of this scope), missing server-side validation for notes length, and the update handler lacks equipment state consistency checks that exist in the create handler.

## Acceptance Criteria Validation

| AC | Status | Evidence |
|----|--------|----------|
| AC1: Form with Equipment type, Action, Date, Notes including Custom... option | IMPLEMENTED | EquipmentFormModal.tsx:157-159 adds "Custom..." option, lines 214-229 show custom input field |
| AC2: Equipment installation appears in Currently Installed list | IMPLEMENTED | EquipmentStatusCard.tsx:249-268 shows Currently Installed section, storage.GetCurrentlyInstalledByHive properly queries |
| AC3: Removal moves to History with duration display | IMPLEMENTED | EquipmentStatusCard.tsx:270-291 shows Equipment History section with period and duration columns |
| AC4: Two sections displayed (Currently Installed + Equipment History) | IMPLEMENTED | EquipmentStatusCard.tsx:249-291 shows both sections with proper structure |
| AC5: Seasonal recommendations | DEFERRED | Story explicitly marks this as deferred to future story |

## Task Completion Audit

| Task | Claimed | Actual | Evidence |
|------|---------|--------|----------|
| 1.1 Create migration 0014_equipment_logs.sql | [x] | DONE | apis-server/internal/storage/migrations/0014_equipment_logs.sql exists with table definition |
| 1.2 Add indexes for tenant_id, hive_id, logged_at | [x] | DONE | Migration lines 17-20 show all required indexes |
| 1.3 Add composite index for currently-installed | [x] | DONE | Migration line 20: idx_equipment_logs_currently_installed |
| 1.4 Test migration runs cleanly | [x] | CANNOT VERIFY | No migration test evidence, claimed in completion notes |
| 2.1 Create equipment.go with struct and CRUD | [x] | DONE | apis-server/internal/storage/equipment.go contains EquipmentLog struct and all operations |
| 2.2 CreateEquipmentLog | [x] | DONE | storage/equipment.go:61-76 |
| 2.3 ListEquipmentByHive | [x] | DONE | storage/equipment.go:79-107 |
| 2.4 GetEquipmentByID | [x] | DONE | storage/equipment.go:110-127 (named GetEquipmentLogByID) |
| 2.5 UpdateEquipmentLog + DeleteEquipmentLog | [x] | DONE | storage/equipment.go:130-191 |
| 2.6 GetCurrentlyInstalledByHive | [x] | DONE | storage/equipment.go:216-252 |
| 2.7 GetEquipmentHistoryByHive | [x] | DONE | storage/equipment.go:256-329 |
| 3.1 Create handlers/equipment.go | [x] | DONE | apis-server/internal/handlers/equipment.go exists |
| 3.2 POST /api/hives/{hive_id}/equipment | [x] | DONE | handlers/equipment.go:146-251 |
| 3.3 GET /api/hives/{hive_id}/equipment | [x] | DONE | handlers/equipment.go:254-292 |
| 3.4 GET /api/hives/{hive_id}/equipment/current | [x] | DONE | handlers/equipment.go:295-341 |
| 3.5 GET /api/equipment/{id} | [x] | DONE | handlers/equipment.go:393-414 |
| 3.6 PUT /api/equipment/{id} | [x] | DONE | handlers/equipment.go:417-482 |
| 3.7 DELETE /api/equipment/{id} | [x] | DONE | handlers/equipment.go:485-510 |
| 3.8 Register routes in main.go | [x] | DONE | main.go:191-197 |
| 4.1-4.7 EquipmentFormModal | [x] | DONE | EquipmentFormModal.tsx with all form fields, edit mode support |
| 5.1-5.7 EquipmentStatusCard | [x] | DONE | EquipmentStatusCard.tsx with both sections, remove button, edit/delete |
| 6.1-6.3 HiveDetail integration | [x] | DONE | HiveDetail.tsx:736-754 integrates EquipmentStatusCard |
| 7.1 useEquipment.ts hook | [x] | DONE | apis-dashboard/src/hooks/useEquipment.ts |
| 7.2 Type definitions | [x] | DONE | useEquipment.ts:15-88 |
| 7.3 Export from index files | [x] | DONE | hooks/index.ts:16-17, components/index.ts:47-48 |

## Issues Found

### Critical (Must Fix)

- [x] **No unit tests for equipment feature** [multiple files]
  - Story claims "All tests pass (67 frontend, Go backend tests)" but no equipment-specific tests exist
  - No `*_test.go` files for equipment handlers or storage
  - No frontend test files for equipment components
  - Similar stories (treatments, feedings, harvests) also lack dedicated tests, suggesting a pattern
  - Test coverage is critical for CRUD operations to prevent regressions

### High (Should Fix)

- [x] **Update handler lacks equipment state consistency validation** [handlers/equipment.go:417-482]
  - CreateEquipmentLog validates duplicate installations (lines 218-227) but UpdateEquipmentLog does not
  - A user could update an existing "removed" log to "installed" for equipment that's already installed
  - This could create inconsistent equipment state that breaks the Currently Installed logic

- [x] **Missing server-side validation for notes field length** [handlers/equipment.go]
  - Frontend enforces 500 character max (EquipmentFormModal.tsx:267) but backend accepts any length
  - Best practice to validate on server as well to prevent malicious/automated requests bypassing frontend

### Medium (Consider Fixing)

- [x] **Equipment history table in status card uses unsafe rowKey** [EquipmentStatusCard.tsx:281]
  - `rowKey={(record) => `${record.equipment_type}-${record.installed_at}`}` could produce duplicates
  - If same equipment type is installed/removed twice on the same date, keys will collide
  - Consider adding a unique identifier to EquipmentHistoryItem or using index fallback

- [x] **GET /api/hives/{hive_id}/equipment/history endpoint not documented in story** [main.go:194]
  - Story Dev Notes (lines 145-152) lists API endpoints but doesn't include `/equipment/history`
  - Implementation correctly adds this endpoint but documentation is incomplete
  - Frontend correctly calls this endpoint (useEquipment.ts:144)

### Low (Nice to Have)

- [x] **formatDuration edge cases may produce awkward text** [useEquipment.ts:252-258]
  - `formatDuration(0)` returns "0 days"
  - `formatDuration(29)` returns "29 days" but `formatDuration(30)` returns "1 months" (should be "1 month")
  - Consider singular/plural handling for months

- [x] **History table doesn't show notes column** [EquipmentStatusCard.tsx:122-149]
  - Currently Installed table doesn't show notes either (only in hover/tooltip might be useful)
  - The equipment history API returns notes but UI doesn't display them
  - Could add notes column or tooltip for complete information

## Recommendations

1. **Add unit tests immediately** - Create at minimum:
   - `apis-server/internal/handlers/equipment_test.go` with integration tests for all endpoints
   - `apis-server/internal/storage/equipment_test.go` with storage function tests
   - Consider adding frontend component tests for EquipmentStatusCard

2. **Add consistency validation to UpdateEquipmentLog** - Before allowing action changes, verify the new state would be valid using `IsEquipmentCurrentlyInstalled` similar to create handler

3. **Add server-side validation for notes** - Add length check: `if req.Notes != nil && len(*req.Notes) > 500 { respondError(w, "notes must be 500 characters or less", http.StatusBadRequest); return }`

4. **Update story documentation** - Add the `/equipment/history` endpoint to the API Endpoints section for completeness

5. **Consider adding equipment ID to history items** - Would make rowKey unique and enable edit/delete directly from history view

---
*Review generated by bulk-review workflow*

## Remediation Log

**Remediated:** 2026-01-25
**Issues Fixed:** 7 of 7

### Changes Applied
- C1: Created unit tests for equipment feature in `tests/handlers/equipment_test.go` and `tests/storage/equipment_test.go` (Go), plus `tests/hooks/useEquipment.test.ts` (frontend)
- H1: Added equipment state consistency validation to UpdateEquipmentLog handler - checks IsEquipmentCurrentlyInstalled before allowing action changes
- H2: Added server-side validation for notes field length (max 500 chars) to both Create and Update handlers
- M1: Fixed unsafe rowKey in equipment history table - now includes removed_at and index for uniqueness
- M2: Added `/equipment/history` endpoint to story documentation in API Endpoints section
- L1: Fixed formatDuration singular/plural handling - "1 month" instead of "1 months"
- L2: Added Tooltip support to show notes on hover in both Currently Installed and Equipment History tables

### Remaining Issues
None - all issues remediated.
