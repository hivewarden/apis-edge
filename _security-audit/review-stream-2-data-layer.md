# Stream 2: Server Data Layer Review

**Scope:** All storage implementations, database migrations, and storage tests
**Date:** 2026-02-06
**Reviewer:** Claude Opus 4.6 (automated)
**Status:** COMPLETE

---

## Files Reviewed

### Storage Implementations (42 files)
- `apis-server/internal/storage/postgres.go` -- DB init, pool config, context helpers
- `apis-server/internal/storage/migrations.go` -- Embedded migration runner
- `apis-server/internal/storage/sites.go` -- Sites CRUD
- `apis-server/internal/storage/units.go` -- Units CRUD + API key management
- `apis-server/internal/storage/detections.go` -- Detections CRUD + stats aggregation
- `apis-server/internal/storage/clips.go` -- Clips CRUD with soft delete
- `apis-server/internal/storage/hives.go` -- Hives CRUD + queen history + box changes
- `apis-server/internal/storage/inspections.go` -- Inspections CRUD
- `apis-server/internal/storage/inspection_frames.go` -- Frame-level data with UPSERT
- `apis-server/internal/storage/treatments.go` -- Treatments CRUD with multi-hive batch
- `apis-server/internal/storage/feedings.go` -- Feedings CRUD with multi-hive batch
- `apis-server/internal/storage/harvests.go` -- Harvests with per-hive breakdown
- `apis-server/internal/storage/equipment.go` -- Equipment install/remove log
- `apis-server/internal/storage/hive_losses.go` -- Hive loss post-mortem
- `apis-server/internal/storage/milestones.go` -- Milestone photos + flags
- `apis-server/internal/storage/overwintering.go` -- Winter survival tracking
- `apis-server/internal/storage/insights.go` -- BeeBrain insights CRUD
- `apis-server/internal/storage/season_recaps.go` -- Season recap cache
- `apis-server/internal/storage/export_presets.go` -- Export config presets
- `apis-server/internal/storage/tasks.go` -- Hive tasks CRUD
- `apis-server/internal/storage/task_templates.go` -- Task templates
- `apis-server/internal/storage/task_suggestions.go` -- BeeBrain task suggestions
- `apis-server/internal/storage/users.go` -- User management (dual auth)
- `apis-server/internal/storage/tenants.go` -- Tenant CRUD + settings
- `apis-server/internal/storage/labels.go` -- Custom labels with cascade rename
- `apis-server/internal/storage/admin.go` -- Super-admin queries (bypass RLS)
- `apis-server/internal/storage/audit_log.go` -- Audit log queries
- `apis-server/internal/storage/activity_log.go` -- Hive activity log
- `apis-server/internal/storage/activity.go` -- Activity feed (audit log enriched)
- `apis-server/internal/storage/token_revocations.go` -- In-memory JWT revocation
- `apis-server/internal/storage/default_tenant.go` -- Default tenant bootstrap
- `apis-server/internal/storage/limits.go` -- Tenant resource limit checks
- `apis-server/internal/storage/reminders.go` -- Calendar reminders
- `apis-server/internal/storage/invite_tokens.go` -- Invitation tokens
- `apis-server/internal/storage/impersonation.go` -- Impersonation session tracking
- `apis-server/internal/storage/beebrain_config.go` -- BeeBrain AI configuration
- `apis-server/internal/storage/test_helpers.go` -- Test utilities

### Migrations (34 files)
All 34 SQL migrations from `0001_tenants_users.sql` through `0034_hive_activity_log.sql`.

### Tests (co-located + external)
- `apis-server/internal/storage/postgres_test.go`
- `apis-server/internal/storage/detections_test.go`
- `apis-server/tests/storage/clips_test.go`
- `apis-server/tests/storage/labels_test.go`
- `apis-server/tests/storage/default_tenant_test.go`

---

## Findings

### CRITICAL

#### DL-C01: Cross-Tenant API Key Lookup Bypasses RLS
- **File:** `apis-server/internal/storage/units.go`, lines 202-244
- **Function:** `GetUnitByAPIKey`
- **Issue:** This function queries the `units` table across ALL tenants without setting the RLS tenant context. It first retrieves all units matching a `api_key_prefix` (line 214: `SELECT ... FROM units WHERE api_key_prefix = $1`) with no `tenant_id` filter and no `set_config('app.tenant_id', ...)`. If the database role is the same superuser that bypasses RLS (or if the connection was not set with a tenant context), this scans all units across all tenants.
- **Risk:** In a multi-tenant SaaS deployment, an attacker with knowledge of API key prefixes could cause the system to load unit records from any tenant. While bcrypt verification prevents unauthorized access, the query itself reveals cross-tenant unit existence.
- **Recommendation:** The function takes `*pgxpool.Pool` directly (not a tenant-scoped `*pgxpool.Conn`), so it intentionally bypasses RLS. This is by design for device authentication, but the query should be documented as a security-sensitive code path and the bcrypt timing should be constant-time (it already is via `bcrypt.CompareHashAndPassword`). Mark this code path explicitly with a `// SECURITY:` comment.

#### DL-C02: Admin Dashboard Queries Reference Non-Existent Schema Elements
- **File:** `apis-server/internal/storage/admin.go`, lines 60-70
- **Function:** `AdminListAllTenants`
- **Issue:** Two schema-struct mismatches that will cause runtime SQL errors:
  1. Line 63: `WHERE status != 'dead' AND status != 'sold' AND deleted_at IS NULL` -- the `hives` table (per migration `0009_hives.sql` and `0018_hive_losses.sql`) does NOT have a `deleted_at` column. Valid status values per the CHECK constraint are `'active'`, `'lost'`, `'archived'`. References to `'dead'` and `'sold'` are invalid.
  2. Line 67: `SUM(file_size)` -- the `clips` table column is `file_size_bytes` (per migration `0008_clips.sql`), not `file_size`.
- **Risk:** These queries will fail at runtime, causing the admin dashboard tenant list to return 500 errors. The hive count and storage calculations will be incorrect.
- **Recommendation:** Fix column references to match actual schema. Replace `deleted_at IS NULL` with `status = 'active'`, and `SUM(file_size)` with `SUM(file_size_bytes)`.

#### DL-C03: Audit Log Query Joins on Renamed Column
- **File:** `apis-server/internal/storage/audit_log.go`, lines ~30-60
- **Function:** `ListAuditLog`
- **Issue:** The query joins `LEFT JOIN users u ON al.user_id = u.id` and selects `u.name as user_name`. However, per migration `0023_dual_auth_users.sql`, the users table renamed the `name` column to `display_name`. This join will fail with a "column does not exist" error at runtime.
- **Risk:** Audit log listing will fail, breaking audit compliance features.
- **Recommendation:** Change `u.name` to `u.display_name`.

---

### HIGH

#### DL-H01: Non-Atomic Hive Creation (Queen History)
- **File:** `apis-server/internal/storage/hives.go`, lines ~125-160
- **Function:** `CreateHive`
- **Issue:** After creating the hive record, queen history creation is done as a separate non-transactional operation. If queen history creation fails, the hive exists but with incomplete data. The failure is silently logged (`log.Warn`) but not returned as an error.
- **Risk:** Data inconsistency: a hive can exist without its initial queen history record.
- **Recommendation:** Wrap both operations in a single transaction.

#### DL-H02: Non-Atomic Label Cascade Rename
- **File:** `apis-server/internal/storage/labels.go`, lines ~85-130
- **Function:** `UpdateLabel`
- **Issue:** The function performs three operations without a transaction: (1) get current label, (2) update label name, (3) cascade rename in treatments/feedings/equipment. If step 3 fails, the label is renamed but historical records still reference the old name.
- **Risk:** Data inconsistency between label name and historical records.
- **Recommendation:** Wrap all operations in a transaction. The `cascadeLabelRename` function should accept a transaction context.

#### DL-H03: Silently Swallowed Box Change Errors
- **File:** `apis-server/internal/storage/hives.go`, lines ~440-470
- **Functions:** `IncrementHiveField`, `DecrementHiveField`
- **Issue:** Box change creation results are discarded with `_, _` (blank identifiers). If the box change audit trail fails to write, the hive field is updated but the audit record is lost.
- **Risk:** Loss of audit trail for box modifications without any indication.
- **Recommendation:** Return the error and let the caller decide. At minimum, log the error.

#### DL-H04: TOCTOU Race in Multiple Update Functions
- **File:** `apis-server/internal/storage/sites.go` (UpdateSite), `units.go` (UpdateUnit), `hives.go` (UpdateHive), `equipment.go` (UpdateEquipmentLog), `reminders.go` (UpdateReminder)
- **Issue:** All these update functions use a read-then-write pattern: fetch current record, merge fields, then update. Between the read and write, another concurrent request could modify the same record. The updates are NOT wrapped in transactions, so the second write silently overwrites changes.
- **Risk:** Lost updates in concurrent modification scenarios.
- **Recommendation:** Either use a single `UPDATE` with `COALESCE` patterns, or wrap read+write in a serializable transaction with `SELECT FOR UPDATE`.

#### DL-H05: UpdateHive RETURNING Clause Missing Fields
- **File:** `apis-server/internal/storage/hives.go`, lines ~303-310
- **Function:** `UpdateHive`
- **Issue:** The `RETURNING` clause does not include `status` and `lost_at` columns, but the `Hive` struct has these fields. After updating a hive, the returned object will always have zero-value `status` and `nil` `lost_at`, regardless of their actual database values.
- **Risk:** Callers receive incomplete hive objects after update, potentially causing incorrect status display or logic errors.
- **Recommendation:** Add `status, lost_at` to the RETURNING clause and Scan call.

#### DL-H06: Hive Status Mismatch in Limit Checks
- **File:** `apis-server/internal/storage/limits.go`, lines 97-116
- **Function:** `CheckHiveLimit`
- **Issue:** The query uses `status != 'deleted'` to count active hives, but the hives table CHECK constraint (from migration `0018_hive_losses.sql`) only allows `'active'`, `'lost'`, `'archived'`. There is no `'deleted'` status, so this condition is always true and counts ALL hives including lost ones toward the limit.
- **Risk:** Users cannot create new hives once they reach the limit even if most hives are "lost" or "archived".
- **Recommendation:** Use `status = 'active'` to only count active hives toward the limit.

#### DL-H07: Missing FORCE ROW LEVEL SECURITY on Most Tables
- **File:** `apis-server/internal/storage/migrations/0002_rls_policies.sql`
- **Issue:** `FORCE ROW LEVEL SECURITY` is applied only to the `users` table. All other RLS-enabled tables (hives, inspections, treatments, feedings, clips, detections, etc.) use `ENABLE ROW LEVEL SECURITY` but NOT `FORCE ROW LEVEL SECURITY`. If the application connects as the table owner, RLS policies are silently bypassed.
- **Risk:** If the database role is the table owner (common in development and some production setups), all RLS policies are ineffective. Any connection can read/write any tenant's data.
- **Recommendation:** Add `ALTER TABLE <table> FORCE ROW LEVEL SECURITY` to all tables with RLS policies, or create a dedicated non-owner application role.

---

### MEDIUM

#### DL-M01: Global Mutable DB Variable
- **File:** `apis-server/internal/storage/postgres.go`, line 20
- **Issue:** `var DB *pgxpool.Pool` is a package-level mutable global. Multiple goroutines could race on `CloseDB()` vs `DB` access. `RequireConn` (line 45) panics if DB is nil.
- **Risk:** Panic in production if `RequireConn` is called before `InitDB` or after `CloseDB`.
- **Recommendation:** Use sync.Once for initialization and atomic operations for access, or pass the pool explicitly.

#### DL-M02: Connection Pool Config Hardcoded
- **File:** `apis-server/internal/storage/postgres.go`, lines 54-58
- **Issue:** Pool settings (MaxConns=25, MinConns=5, MaxConnLifetime=1h, MaxConnIdleTime=30m, HealthCheckPeriod=30s) are hardcoded with no configuration override.
- **Risk:** Cannot tune for different deployment sizes without code changes.
- **Recommendation:** Make configurable via environment variables with current values as defaults.

#### DL-M03: GenerateID Fallback Uses Timestamp
- **File:** `apis-server/internal/storage/postgres.go`, lines ~120-130
- **Function:** `GenerateID`
- **Issue:** If `uuid.NewRandom()` fails (crypto/rand unavailable), the fallback generates an ID from `time.Now().UnixNano()`. This is not cryptographically random and could collide under high concurrency.
- **Risk:** ID collisions in edge cases. The timestamp-based ID also leaks timing information.
- **Recommendation:** If random fails, return an error instead of falling back to a predictable value.

#### DL-M04: Timezone Parameter Passed Directly to SQL
- **File:** `apis-server/internal/storage/detections.go`, lines ~165-200
- **Functions:** `GetDetectionStats`, `GetTrendData`
- **Issue:** A timezone string (e.g., `"America/New_York"`) is passed as `$4` parameter to `AT TIME ZONE` clauses. While parameterized, PostgreSQL does not validate timezone names -- an invalid timezone silently falls back to UTC in some PostgreSQL versions, or errors in others.
- **Risk:** Incorrect time bucketing if invalid timezone is provided. Not SQL injection (parameterized), but could cause subtle data errors.
- **Recommendation:** Validate timezone against a known list before passing to SQL.

#### DL-M05: Missing WITH CHECK on Several RLS Policies
- **Files:** Migrations `0007_detections.sql`, `0009_hives.sql`, `0015_insights.sql`, `0018_hive_losses.sql`, `0019_season_recaps.sql`, `0020_overwintering_records.sql`, `0032_task_suggestions.sql`
- **Issue:** Several RLS policies use `FOR ALL USING (...)` without a `WITH CHECK (...)` clause. The `USING` clause filters reads, but without `WITH CHECK`, inserts and updates are not separately constrained. In PostgreSQL, when `WITH CHECK` is omitted on `FOR ALL`, the `USING` expression is applied for both -- so functionally this is correct. However, explicit `WITH CHECK` is a defense-in-depth best practice that makes the intent clear.
- **Risk:** Low risk due to PostgreSQL's fallback behavior, but the inconsistency across migrations (some tables like clips and treatments DO have explicit WITH CHECK) makes auditing harder.
- **Recommendation:** Add explicit `WITH CHECK` clauses to all tenant-isolation policies for consistency.

#### DL-M06: N+1 Query Pattern in Inspection Frames
- **File:** `apis-server/internal/storage/inspection_frames.go`, lines ~30-60
- **Function:** `CreateInspectionFrames`
- **Issue:** Creates frames one at a time in a loop with individual INSERT statements. For an inspection with 5 boxes, this is 5 separate queries.
- **Risk:** Performance degradation with many boxes. Not critical since frame count is bounded (max ~8 boxes), but unnecessarily chatty.
- **Recommendation:** Use a batch INSERT or `pgx.CopyFrom` for better performance.

#### DL-M07: Activity Feed Query Has Excessive JOINs
- **File:** `apis-server/internal/storage/activity.go`, lines 54-126
- **Function:** `ListActivity`
- **Issue:** A single query with 11 LEFT JOINs to resolve entity names, hive associations, and site filtering. The complex CASE expressions for each entity type make this query expensive and hard to maintain.
- **Risk:** Performance degradation as activity log grows. Query plan may be suboptimal with so many joins.
- **Recommendation:** Consider pre-computing entity names at insert time (denormalization in audit_log), or implement a materialized view for the activity feed.

#### DL-M08: SoftDeleteClip Does Not Return ErrNotFound
- **File:** `apis-server/internal/storage/clips.go`, lines ~190-210
- **Function:** `SoftDeleteClip`
- **Issue:** The function does not check `RowsAffected()`. If the clip ID does not exist or is already soft-deleted, the function returns `nil` (success).
- **Risk:** Callers cannot distinguish between "clip deleted" and "clip not found". The API would return 200 OK for non-existent clip IDs.
- **Recommendation:** Check `result.RowsAffected() == 0` and return `ErrNotFound`.

#### DL-M09: Duplicated Dynamic WHERE Clause Logic in Clips
- **File:** `apis-server/internal/storage/clips.go`
- **Functions:** `ListClips` and `ListClipsWithUnitName`
- **Issue:** Both functions contain nearly identical dynamic WHERE clause construction for filtering by site, unit, date range, and soft-delete exclusion. This is duplicated code that must be maintained in sync.
- **Risk:** Bug fix in one function might not be applied to the other.
- **Recommendation:** Extract shared filter-building logic into a helper function.

#### DL-M10: Unused Import Suppressor
- **File:** `apis-server/internal/storage/treatments.go`, line ~444
- **Issue:** `var _ = strings.TrimSpace` is used to suppress an unused import. This suggests the `strings` package was imported for a purpose that was later removed, but the import was kept.
- **Risk:** Code smell. The import may have been needed for string operations that were refactored away.
- **Recommendation:** Remove the unused import and suppressor.

#### DL-M11: Token Revocation Store Not Persistent
- **File:** `apis-server/internal/storage/token_revocations.go`
- **Issue:** The JWT revocation store is purely in-memory using `sync.RWMutex` + `map[string]tokenRevocation`. On server restart, all revoked tokens become valid again until their natural expiry.
- **Risk:** After a server restart (deploy, crash), previously revoked tokens (e.g., from password change or logout) are valid again for up to the JWT lifetime.
- **Recommendation:** Either persist revocations to the database, or ensure JWT lifetime is very short (< 5 minutes) with refresh tokens handled separately.

#### DL-M12: Test Helpers Use SET LOCAL Without Transaction
- **File:** `apis-server/internal/storage/test_helpers.go`, line 72
- **Issue:** `SET LOCAL app.tenant_id = $1` is used to set the RLS context, but `SET LOCAL` only works within a transaction block. Outside a transaction, it has no effect (or may error). The test helper does not start a transaction.
- **Risk:** Tests may not properly enforce RLS, leading to false positives (tests pass but RLS is not actually active).
- **Recommendation:** Use `SELECT set_config('app.tenant_id', $1, false)` (session-level) instead of `SET LOCAL`, or wrap the test in a transaction.

#### DL-M13: Invite Token Stored in Plaintext
- **File:** `apis-server/internal/storage/invite_tokens.go`, lines 44-50 + migration `0025_invite_tokens.sql`
- **Issue:** Invite tokens are generated using `crypto/rand` (32 bytes, hex encoded) but stored as plaintext in the database. Anyone with database access can use any unexpired invite token.
- **Risk:** Database compromise reveals all active invite tokens, allowing unauthorized account creation.
- **Recommendation:** Store a hash of the token (like API keys use bcrypt). Compare hash on validation.

#### DL-M14: Impersonation Check-Then-Act Race
- **File:** `apis-server/internal/storage/impersonation.go`, lines 33-78
- **Function:** `CreateImpersonationLog`
- **Issue:** The function first checks if an active session exists, then inserts a new one. Between check and insert, another concurrent request could also pass the check, resulting in two active sessions for the same super-admin.
- **Risk:** Duplicate impersonation sessions could confuse audit trails.
- **Recommendation:** Use a unique partial index `ON impersonation_log(super_admin_id) WHERE ended_at IS NULL` and handle the constraint violation, or use `INSERT ... WHERE NOT EXISTS` atomically.

---

### LOW

#### DL-L01: Bubble Sort in Equipment History
- **File:** `apis-server/internal/storage/equipment.go`, lines 320-326
- **Function:** `GetEquipmentHistoryByHive`
- **Issue:** Uses a manual O(n^2) bubble sort to sort history items by date. Go's `sort.Slice` is O(n log n).
- **Risk:** Negligible for typical equipment counts (<100), but poor practice.
- **Recommendation:** Use `sort.Slice`.

#### DL-L02: Error String Matching for JSONB Null Detection
- **File:** `apis-server/internal/storage/milestones.go`, lines 147-155
- **Function:** `GetMilestoneFlags`
- **Issue:** Error handling uses `strings.Contains(errStr, "cannot cast jsonb null")` to detect JSONB null values. This is fragile and depends on the exact PostgreSQL error message text.
- **Risk:** Breaking on PostgreSQL version upgrades that change error messages.
- **Recommendation:** Handle the NULL case in SQL using `COALESCE` or `CASE WHEN ... IS NULL` instead of Go-side error string matching.

#### DL-L03: Missing Pagination Limits on Several List Functions
- **Files:** Multiple storage files
- **Functions:** `ListEquipmentByHive`, `ListHiveLosses`, `ListInsightsByHive`, `ListInsightsByTenant`, `ListRemindersByHive`, `ListMilestonePhotos`, `ListOverwinteringRecordsBySeason`
- **Issue:** Several list functions have no LIMIT clause or pagination support. They return all matching rows.
- **Risk:** For tenants with large datasets, these queries could return thousands of rows, consuming excessive memory and bandwidth.
- **Recommendation:** Add optional pagination or a default maximum limit.

#### DL-L04: No RLS on queen_history and box_changes (Defense-in-Depth Exists)
- **File:** Migration `0009_hives.sql`, lines 76-98
- **Issue:** RLS on `queen_history` and `box_changes` uses correlated subqueries (`EXISTS (SELECT 1 FROM hives ...)`). This is correct but slower than a direct `tenant_id` column check.
- **Risk:** Performance overhead on every access to these tables. For large datasets, the correlated subquery could be slow.
- **Recommendation:** Consider adding `tenant_id` directly to these tables for faster RLS checks, even though the current approach is functionally correct.

#### DL-L05: GetHiveLossStats Missing Tenant Filter
- **File:** `apis-server/internal/storage/hive_losses.go`, lines 292-369
- **Function:** `GetHiveLossStats`
- **Issue:** The three queries in this function (`losses by cause`, `losses by year`, `common symptoms`) do not include a `tenant_id` filter in their WHERE clauses. They rely entirely on RLS for tenant isolation.
- **Risk:** If RLS is bypassed (see DL-H07), this would aggregate data across all tenants. With proper RLS, this is safe but defense-in-depth with explicit `tenant_id` filters is recommended.
- **Recommendation:** Add explicit `WHERE tenant_id = current_setting('app.tenant_id', true)` to all three queries.

#### DL-L06: No updated_at Trigger on Several Tables
- **Files:** Migrations for `treatments`, `feedings`, `harvests`, `equipment_logs`, `reminders`
- **Issue:** These tables have `updated_at` columns but no automatic trigger to update them. The Go code manually sets `updated_at = NOW()` in UPDATE queries, but this is easy to forget.
- **Risk:** Stale `updated_at` timestamps if a new UPDATE query is added without remembering to set the field.
- **Recommendation:** Add `BEFORE UPDATE` triggers like those on `hives`, `inspections`, and `sites`.

#### DL-L07: Duplicate error_log Rows.Err() Check Pattern Could Be Helper
- **Files:** All storage files
- **Issue:** Every list function follows the same pattern: `for rows.Next()` + `rows.Scan()` + `rows.Err()`. This boilerplate is repeated ~40 times across the codebase.
- **Risk:** Maintenance burden. A subtle change (e.g., adding a field) must be made in many places.
- **Recommendation:** Consider using `pgx.CollectRows` or a generic scan helper to reduce boilerplate.

---

### INFO

#### DL-I01: Consistent Parameterized Queries -- No SQL Injection
- **All storage files**
- **Observation:** All queries use parameterized `$N` placeholders. No string concatenation of user input into SQL. Dynamic query building (in `detections.go`, `clips.go`, `tasks.go`, `activity.go`) uses safe parameter indexing (`fmt.Sprintf("$%d", argNum)`).

#### DL-I02: Proper ErrNoRows Handling
- **All storage files**
- **Observation:** Almost all single-row queries correctly use `errors.Is(err, pgx.ErrNoRows)` to map to `ErrNotFound`. One exception: `audit_log.go` uses direct `==` comparison (`err == pgx.ErrNoRows`), which works but is less robust than `errors.Is()`.

#### DL-I03: Good RLS Coverage
- **All migrations**
- **Observation:** All tenant-scoped tables have RLS enabled with `current_setting('app.tenant_id', true)` policies. Tables intentionally without RLS (`beebrain_config`, `tenant_limits`, `impersonation_log`) are documented with comments explaining why.

#### DL-I04: Transaction Usage Where Critical
- **Files:** `hive_losses.go` (CreateHiveLossWithTransaction), `invite_tokens.go` (CreateUserFromInvite), `treatments.go` (batch operations), `harvests.go` (batch operations)
- **Observation:** Critical multi-step operations correctly use transactions with `defer tx.Rollback(ctx)`. The pattern is consistent and correct.

#### DL-I05: Export Preset IDOR Protection
- **File:** `apis-server/internal/storage/export_presets.go`, lines 91-109
- **Observation:** `GetExportPresetByID` and `DeleteExportPreset` both include `tenant_id` in the WHERE clause as defense-in-depth against IDOR, in addition to RLS. Well-documented with `// SECURITY:` comments.

#### DL-I06: BeeBrain Config Encryption Architecture
- **File:** `apis-server/internal/storage/beebrain_config.go`
- **Observation:** API keys for external AI providers are stored in `api_key_encrypted` column with `json:"-"` tag to prevent JSON serialization. The `EffectiveBeeBrainConfig.APIKeyEncrypted` also has `json:"-"`. This is a good defense-in-depth pattern.

#### DL-I07: Well-Structured Migration Ordering
- **All migrations**
- **Observation:** Migrations are numbered sequentially (0001-0034) with clear naming conventions. Each migration is idempotent using `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and `DROP POLICY IF EXISTS` patterns. The embedded migration runner (`migrations.go`) tracks applied migrations in a `schema_migrations` table.

#### DL-I08: SetupTestDB Uses Randomized Tenant IDs
- **File:** `apis-server/internal/storage/test_helpers.go`
- **Observation:** Test helper generates unique tenant IDs using `"test-tenant-" + GenerateID()[:8]`, preventing test interference. Good pattern.

---

## Test Quality Assessment

### Coverage Gaps

1. **No integration tests for core CRUD operations**: The existing tests in `apis-server/internal/storage/detections_test.go` and `apis-server/tests/storage/clips_test.go` only test struct field assignments, not actual database operations. They verify that Go struct fields can be set and read -- this has zero value for catching SQL bugs, schema mismatches, or RLS policy issues.

2. **Skipped integration tests**: `apis-server/tests/storage/labels_test.go` has integration test stubs (`TestCreateLabelIntegration`, `TestUpdateLabelCascadeIntegration`, `TestTenantIsolationIntegration`) that are all `t.Skip("Requires database connection")`. The cascade rename logic (DL-H02) is untested.

3. **Good integration test examples**: `apis-server/tests/storage/default_tenant_test.go` has proper integration tests that create real tenants, insert users, and verify counts. This is the pattern all storage tests should follow.

4. **Missing test areas**:
   - No tests for RLS policy enforcement (cross-tenant access attempts)
   - No tests for concurrent access (TOCTOU patterns in DL-H04)
   - No tests for limit checks (DL-H06)
   - No tests for soft delete behavior (clips)
   - No tests for transaction rollback scenarios

### Test Quality Score: 2/10
The majority of "tests" are struct field verification tests that provide no confidence in the correctness of the storage layer. Only `default_tenant_test.go` demonstrates proper integration testing. The test suite would not catch any of the CRITICAL or HIGH findings in this review.

---

## Metrics Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 3     |
| HIGH     | 7     |
| MEDIUM   | 14    |
| LOW      | 7     |
| INFO     | 8     |
| **Total** | **39** |

### By Category

| Category | Count | Key Examples |
|----------|-------|-------------|
| SQL Injection | 0 | All queries properly parameterized |
| RLS Policies | 4 | DL-H07 (missing FORCE), DL-M05 (missing WITH CHECK), DL-C01 (bypass), DL-L05 (missing filter) |
| Transaction Correctness | 4 | DL-H01, DL-H02, DL-H04, DL-M14 |
| Migration Safety | 1 | DL-L06 (missing triggers) |
| Missing Indexes | 0 | Good index coverage across all tables |
| N+1 Patterns | 2 | DL-M06 (inspection frames), DL-M07 (activity feed) |
| Connection Pool | 1 | DL-M02 (hardcoded config) |
| Schema-Struct Consistency | 3 | DL-C02, DL-C03, DL-H05 |
| Null Handling | 1 | DL-L02 (JSONB null string matching) |
| Error Handling | 3 | DL-H03 (swallowed), DL-M08 (missing ErrNotFound), DL-M10 (unused import) |
| Test Quality | 1 | Test suite provides negligible coverage of actual database operations |

### Priority Remediation Order

1. **DL-C02** (admin.go schema mismatches) -- Immediate fix, will cause runtime errors
2. **DL-C03** (audit_log.go column name) -- Immediate fix, will cause runtime errors
3. **DL-H07** (FORCE ROW LEVEL SECURITY) -- Security-critical for SaaS deployment
4. **DL-H05** (UpdateHive RETURNING) -- Returns incorrect data to callers
5. **DL-H06** (limits.go status mismatch) -- Prevents hive creation incorrectly
6. **DL-H01** + **DL-H02** (atomicity) -- Data consistency
7. **DL-M11** (token revocation persistence) -- Security gap on restart
8. **DL-M13** (plaintext invite tokens) -- Security for database compromise scenario
