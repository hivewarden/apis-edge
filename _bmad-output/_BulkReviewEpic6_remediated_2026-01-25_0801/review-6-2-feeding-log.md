# Code Review: 6-2-feeding-log

**Story:** 6-2-feeding-log.md
**Reviewed:** 2026-01-25
**Status:** PASS

## Summary

Story 6.2 (Feeding Log) is substantially complete with working backend and frontend implementation. However, there are two Medium-severity issues in the UpdateFeeding handler: missing server-side enforcement to clear concentration for non-syrup types on update, and missing amount validation on update. One additional Low-severity code smell was found (redundant ternary in FeedingFormModal). No unit tests exist for the feeding functionality.

## Acceptance Criteria Validation

| AC | Status | Evidence |
|----|--------|----------|
| AC1: Form with date, hive(s), feed type, amount, unit, concentration, notes | IMPLEMENTED | `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/FeedingFormModal.tsx` - all fields present including multi-hive selection |
| AC2: Concentration field shows only for sugar_syrup | IMPLEMENTED | `FeedingFormModal.tsx:143-151` - conditional `showConcentration` state with options 1:1, 2:1, custom |
| AC3: Feeding history with date, type, amount and season totals | IMPLEMENTED | `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/FeedingHistoryCard.tsx` - table with columns + season totals display at bottom |
| AC4: Weight chart correlation (deferred) | N/A | Story explicitly defers this to Epic 8+ |

## Task Completion Audit

| Task | Claimed | Actual | Evidence |
|------|---------|--------|----------|
| 1.1 Create migration 0012_feedings.sql | [x] | DONE | `/Users/jermodelaruelle/Projects/apis/apis-server/internal/storage/migrations/0012_feedings.sql` exists |
| 1.2 Add indexes | [x] | DONE | Migration lines 19-21: idx_feedings_tenant, idx_feedings_hive, idx_feedings_date |
| 1.3 Add RLS policy | [x] | DONE | Migration lines 24-36: RLS with SELECT/INSERT/UPDATE/DELETE policies |
| 1.4 Test migration | [x] | NOT VERIFIED | No migration test exists, but story notes claim "8 packages" pass |
| 2.1 Create feedings.go storage | [x] | DONE | `/Users/jermodelaruelle/Projects/apis/apis-server/internal/storage/feedings.go` |
| 2.2 CRUD operations | [x] | DONE | CreateFeeding, ListFeedingsByHive, GetFeedingByID implemented |
| 2.3 UpdateFeeding | [x] | DONE | `feedings.go:168-226` |
| 2.4 DeleteFeeding | [x] | DONE | `feedings.go:229-240` |
| 2.5 CreateFeedingsForMultipleHives | [x] | DONE | `feedings.go:78-112` with transaction support |
| 2.6 GetFeedingSeasonTotals | [x] | DONE | `feedings.go:244-283` with Apr 1-Mar 31 season logic |
| 3.1 Create handlers/feedings.go | [x] | DONE | `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/feedings.go` |
| 3.2 POST /api/feedings | [x] | DONE | `CreateFeeding` handler with multi-hive support |
| 3.3 GET /api/hives/{hive_id}/feedings | [x] | DONE | `ListFeedingsByHive` handler |
| 3.4 GET /api/hives/{hive_id}/feedings/season-totals | [x] | DONE | `GetFeedingSeasonTotals` handler |
| 3.5 GET /api/feedings/{id} | [x] | DONE | `GetFeeding` handler |
| 3.6 PUT /api/feedings/{id} | [x] | DONE | `UpdateFeeding` handler (but see issues) |
| 3.7 DELETE /api/feedings/{id} | [x] | DONE | `DeleteFeeding` handler |
| 3.8 Register routes | [x] | DONE | `main.go:173-179` - all 6 feeding routes registered |
| 4.1-4.7 FeedingFormModal | [x] | DONE | Complete component with all fields, conditional concentration |
| 5.1-5.5 FeedingHistoryCard | [x] | DONE | Table with season totals, edit/delete actions |
| 6.1-6.3 HiveDetail Integration | [x] | DONE | `HiveDetail.tsx:706-718` - FeedingHistoryCard integrated with handlers |
| 7.1 useFeedings hook | [x] | DONE | `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/hooks/useFeedings.ts` |
| 7.2 Type definitions | [x] | DONE | Feeding, CreateFeedingInput, UpdateFeedingInput, SeasonTotal types defined |
| 7.3 Exports | [x] | DONE | `components/index.ts:37-38`, `hooks/index.ts:10-11` |

## Issues Found

### Critical (Must Fix)

None

### High (Should Fix)

None

### Medium (Consider Fixing)

- [x] **UpdateFeeding handler does not clear concentration for non-syrup types** [`/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/feedings.go:322-412`]

  The CreateFeeding handler correctly clears concentration when feed_type is not "sugar_syrup" (lines 165-166), but the UpdateFeeding handler does not apply this business rule. If a user creates a sugar_syrup feeding with concentration "2:1" and later edits it to change the type to "fondant", the concentration value will be retained in the database. This violates the data invariant that only sugar_syrup feeds should have concentration values.

- [x] **UpdateFeeding handler does not validate amount > 0** [`/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/feedings.go:381-386`]

  The CreateFeeding handler validates that amount must be greater than 0 (line 123-126), but the UpdateFeeding handler allows any amount value including zero or negative numbers when the amount field is provided. This allows invalid data to be saved during updates.

- [x] **No unit tests for feeding functionality**

  The story claims "all existing tests pass" but there are no dedicated tests for the feeding storage layer or handlers. While the story worked on the first try, having tests is important for preventing regressions. The CLAUDE.md testing guidelines state "Go: go test, testify for assertions" and "Tests go in separate tests/ directory."

### Low (Nice to Have)

- [x] **Redundant ternary expression in FeedingFormModal** [`/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/FeedingFormModal.tsx:241`]

  The code `{isEditMode ? currentHiveName : currentHiveName}` always evaluates to `currentHiveName` regardless of the condition. This is dead code that should be simplified to just `{currentHiveName}`.

## Recommendations

1. **Fix UpdateFeeding concentration clearing**: Add the same business logic from CreateFeeding to UpdateFeeding:
   ```go
   // After validating feed type
   if req.FeedType != nil && *req.FeedType != "sugar_syrup" {
       // Clear concentration when switching to non-syrup type
       emptyConc := ""
       req.Concentration = &emptyConc
   }
   ```

2. **Add amount validation to UpdateFeeding**: Add validation when amount is provided:
   ```go
   if req.Amount != nil && *req.Amount <= 0 {
       respondError(w, "amount must be greater than 0", http.StatusBadRequest)
       return
   }
   ```

3. **Consider adding basic unit tests** for the feeding handlers, particularly for edge cases like:
   - Multi-hive creation transaction rollback
   - Season totals calculation at season boundary
   - Update with type change from syrup to non-syrup

4. **Clean up redundant ternary**: Change line 241 from:
   ```tsx
   {isEditMode ? currentHiveName : currentHiveName}
   ```
   to:
   ```tsx
   {currentHiveName}
   ```

---
*Review generated by bulk-review workflow*

## Remediation Log

**Remediated:** 2026-01-25
**Issues Fixed:** 4 of 4

### Changes Applied
- M1: Added concentration clearing logic to UpdateFeeding handler (lines 380-384 in feedings.go) - clears concentration to empty string when feed_type is changed to non-syrup type
- M2: Added amount validation to UpdateFeeding handler (lines 386-389 in feedings.go) - returns 400 if amount <= 0
- M3: Created comprehensive unit tests in `tests/handlers/feedings_test.go` and `tests/storage/feedings_test.go` covering validation logic, feed types, units, season calculation, and struct behavior
- L1: Simplified redundant ternary in FeedingFormModal.tsx line 241 from `{isEditMode ? currentHiveName : currentHiveName}` to `{currentHiveName}`

### Remaining Issues
None - all issues fixed
