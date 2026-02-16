# Stream 6: Dashboard -- Offline/PWA, Services, Sync

## Summary

The offline/PWA infrastructure is well-architected with proper IndexedDB schema versioning, transactional writes for atomicity, and a layered sync queue design. However, there are several material issues: the `clearAllCache` function fails to clear the `tasks` and `sync_queue` tables (data leakage on logout), the `markAsSynced` function in `offlineInspection.ts` performs a non-atomic delete-then-put outside a transaction (crash during sync can lose data), uncaught `JSON.parse` exceptions in multiple `offlineTasks.ts` filter callbacks will crash Dexie queries, and the background sync system lacks a maximum retry count allowing permanently-errored items to accumulate indefinitely.

## Findings

### CRITICAL

#### C1: `clearAllCache` in offlineCache.ts does not clear `tasks` or `sync_queue` tables
- **File:** `/apis-dashboard/src/services/offlineCache.ts:325-336`
- **Description:** The `clearAllCache()` function clears `sites`, `hives`, `inspections`, `detections`, `units`, and `metadata` but omits `db.tasks.clear()` and `db.sync_queue.clear()`. This function is described as "Use for logout or manual cache reset" but will leave offline tasks and the entire sync queue intact after logout. Note that `forceClearCache()` in `db.ts` does clear tasks and sync_queue correctly, so if `authCleanup.ts` calls `forceClearCache()` instead, that path is safe. However, any code path using `clearAllCache()` from `offlineCache.ts` (e.g., a settings page "Clear Cache" button) will leak task data.
- **Risk:** A subsequent user on a shared device could see another user's pending tasks and sync queue entries. This is a cross-user data leakage vulnerability.
- **Fix:** Add `db.tasks.clear()` and `db.sync_queue.clear()` to the `clearAllCache()` function in `offlineCache.ts`.

#### C2: Non-atomic delete-then-put in `markAsSynced` (offlineInspection.ts)
- **File:** `/apis-dashboard/src/services/offlineInspection.ts:282-325`
- **Description:** `markAsSynced()` performs `db.inspections.delete(existing.id)` followed by `db.inspections.put({...})` with the new server ID, but these two operations are NOT wrapped in a Dexie transaction. If the browser tab is closed, crashes, or a quota error occurs between the delete and the put, the inspection data is permanently lost -- the local record is deleted and the new server-keyed record was never written. Compare this with `markTaskAsSynced()` in `offlineTasks.ts:401-429` which correctly wraps the same pattern in `db.transaction('rw', ...)`.
- **Risk:** Data loss of offline-created inspections during sync. The inspection is deleted locally but the replacement record is never written. The server has the data, but the user loses their local copy with no indication of what happened.
- **Fix:** Wrap the delete and put operations in `markAsSynced` in a `db.transaction('rw', [db.inspections, db.sync_queue], ...)` block, matching the pattern already used in `markTaskAsSynced`.

### HIGH

#### H1: Uncaught JSON.parse exceptions in offlineTasks.ts filter callbacks crash Dexie queries
- **File:** `/apis-dashboard/src/services/offlineTasks.ts:342, 421, 456, 488, 518`
- **Description:** Multiple functions (`deleteOfflineTask`, `markTaskAsSynced`, `markTaskSyncError`, `markTaskCompletionSynced`, `removeOrphanedTask`) call `JSON.parse(entry.payload)` inside Dexie `.filter()` callbacks without a try/catch. If any sync queue entry has corrupted or malformed JSON in its `payload` field, the `JSON.parse` will throw, crashing the entire Dexie query and propagating the exception up. By contrast, the equivalent functions in `offlineInspection.ts` (e.g., lines 210-214, 311-316, 350-356, 402-409) all wrap `JSON.parse` in try/catch blocks. The `offlineTasks.ts` code was written later and missed this defensive pattern.
- **Risk:** A single corrupted sync queue entry prevents all task sync operations from working -- creating, completing, syncing, and deleting offline tasks will all throw. The user gets stuck with no way to clear the corrupt entry.
- **Fix:** Wrap every `JSON.parse(entry.payload)` inside `.filter()` callbacks in try/catch blocks, returning `false` for corrupted entries, matching the pattern in `offlineInspection.ts`.

#### H2: backgroundSync only handles inspection sync; task sync queue items silently fail
- **File:** `/apis-dashboard/src/services/backgroundSync.ts:230-239`
- **Description:** The `syncItem()` function in `backgroundSync.ts` only handles `inspections` table with `create` action. Any other combination (including `tasks.create`, `tasks.complete`) returns `{ success: false, error: "Unsupported sync operation" }`. The task sync is handled separately by `taskSync.ts` via `syncPendingTasks()`. However, the `BackgroundSyncContext` uses `useBackgroundSync` hook which calls `startBackgroundSync()` from `backgroundSync.ts`. If a user creates offline inspections AND offline tasks, the background sync will process inspections but mark all task sync queue entries as "error" with "Unsupported sync operation". The task-specific sync (`syncPendingTasks`) is only triggered by the `online` event handler in `registerSW.ts`.
- **Risk:** Task sync queue items processed by the background sync system are incorrectly marked as errors. The sync-on-reconnect in `registerSW.ts` may then skip them because their status is `error` not `pending`. This creates a confusing state where task items appear permanently failed despite the server being reachable.
- **Fix:** Either (a) have `syncItem()` delegate to task sync for task table entries, (b) have `startBackgroundSync` filter to only process inspections, or (c) unify the two sync systems under a single orchestrator.

#### H3: Dual sync-on-reconnect handlers create race condition
- **File:** `/apis-dashboard/src/registerSW.ts:132-160` and `/apis-dashboard/src/hooks/useBackgroundSync.ts:204-217`
- **Description:** Two independent `online` event handlers trigger sync operations when connectivity is restored: (1) `setupSyncOnReconnect()` in `registerSW.ts` calls `syncPendingTasks()` with a 1000ms debounce, and (2) `useBackgroundSync` hook calls `triggerSync()` -> `startBackgroundSync()` with a 1000ms timeout. Both fire in response to the same `online` event. Since they target different sync services (task sync vs inspection sync), the task sync queue entries may be processed by both systems simultaneously -- `startBackgroundSync` marks them as errors (H2 above) while `syncPendingTasks` tries to actually sync them. The race depends on timing.
- **Risk:** Tasks may be double-synced, incorrectly marked as errors, or both systems may interfere with each other's sync queue status updates.
- **Fix:** Consolidate sync-on-reconnect into a single orchestrator that processes both inspections and tasks in a defined order.

### MEDIUM

#### M1: Storage size estimation ignores tasks table
- **File:** `/apis-dashboard/src/services/offlineCache.ts:213-229`
- **Description:** `calculateStorageSize()` only counts records from `sites`, `hives`, `inspections`, `detections`, and `units`. The `tasks` table (added in schema v3) is not included in the storage calculation. This means the quota management system (`pruneOldData`) will undercount actual storage usage and may not trigger pruning when needed.
- **Risk:** If a user has many cached tasks, the 50MB limit can be exceeded without triggering the pruning mechanism, potentially leading to IndexedDB quota errors.
- **Fix:** Add `db.tasks.count()` to the `calculateStorageSize()` function and include tasks in the `tables` array.

#### M2: `getCacheStats` does not report task counts
- **File:** `/apis-dashboard/src/services/offlineCache.ts:359-390`
- **Description:** The `getCacheStats()` function returns counts for sites, hives, inspections, detections, and units, but omits tasks. The `totalRecords` calculation also excludes tasks.
- **Risk:** Settings page or admin dashboards showing cache stats will underreport actual stored data, misleading users about their offline storage usage.
- **Fix:** Add `tasks` count to `getCacheStats()` return type and calculation.

#### M3: No maximum retry count for permanently failing sync items
- **File:** `/apis-dashboard/src/services/backgroundSync.ts:527-540` and `/apis-dashboard/src/hooks/useBackgroundSync.ts:252-260`
- **Description:** `retryAllFailedItems()` resets ALL errored items to `pending` status, and `retryFailed()` in the hook calls `triggerSync()` afterwards. There is no retry counter or maximum retry limit on sync queue items. If an item fails repeatedly (e.g., due to a permanent server-side validation error), the user can retry it infinitely. The item will fail, be marked error, get retried, fail again, in a loop.
- **Risk:** Permanently failing items accumulate in the sync queue with no way to age them out. Users may repeatedly trigger sync for items that will never succeed, wasting bandwidth and creating a poor UX.
- **Fix:** Add a `retry_count` field to `SyncQueueItem` and increment on each retry. After a configurable maximum (e.g., 5 retries), either remove the item or mark it as `permanently_failed` so it's excluded from bulk retries.

#### M4: Pruning can delete pending-sync inspections
- **File:** `/apis-dashboard/src/services/offlineCache.ts:266-283`
- **Description:** The `pruneOldData()` function deletes old inspections based on `synced_at` date, but does not check the `pending_sync` flag. Offline-created inspections that haven't been synced yet have `synced_at` set to their creation time (see `offlineInspection.ts:122`). If the user stays offline long enough (past `MIN_INSPECTION_DAYS = 30`), their unsynced inspections could be pruned and permanently lost.
- **Risk:** Data loss of offline-created inspections that have not been synced for 30+ days.
- **Fix:** Add a `.filter(i => !i.pending_sync)` condition to the pruning query so pending-sync inspections are never pruned.

#### M5: `getLastSyncTime` does not include tasks table
- **File:** `/apis-dashboard/src/services/offlineCache.ts:180-188`
- **Description:** When called without a table argument, `getLastSyncTime()` checks sync times for `sites`, `hives`, `inspections`, `detections`, and `units` but not `tasks`. This means the "last synced" timestamp shown to users may not reflect the most recent task sync.
- **Risk:** Misleading sync status information displayed to users.
- **Fix:** Add `'tasks'` to the `tables` array in the no-argument branch of `getLastSyncTime()`.

#### M6: API cache (StaleWhileRevalidate) may serve sensitive data to different users
- **File:** `/apis-dashboard/vite.config.ts:77-89`
- **Description:** The Workbox runtime caching rule for API responses uses `StaleWhileRevalidate` for all `/api/*` endpoints (after excluding `/api/auth/*` and `/api/users/me`). This means responses from tenant-scoped data endpoints (e.g., `/api/hives`, `/api/inspections`) are cached in the service worker cache. If user A logs out and user B logs in on the same device, user B's requests may be served stale cached responses from user A's session until the revalidation completes. The `authCleanup.ts` clears caches named with patterns `api-cache`, `api-`, `data-`, `user-`, which should catch the `api-cache` named cache. However, there's a window where the stale response is served before the cleanup completes.
- **Risk:** Brief cross-user data leakage if logout cleanup has not yet completed when a new user navigates to data pages.
- **Fix:** Consider using `NetworkFirst` instead of `StaleWhileRevalidate` for tenant-scoped API data, or ensure that cache clearing is awaited before any navigation occurs after login.

#### M7: Whisper transcription module-level state prevents concurrent recordings
- **File:** `/apis-dashboard/src/services/whisperTranscription.ts:34-37`
- **Description:** The recording state (`mediaRecorder`, `audioChunks`, `recordingTimeout`, `currentMimeType`) is stored at module level (singleton). If two components attempt to use recording simultaneously, or if `startRecording` is called while already recording, the state will be overwritten without stopping the previous recording. There is no guard against calling `startRecording()` twice.
- **Risk:** Audio data corruption, leaked media streams (microphone stays active), or unexpected behavior if multiple UI elements trigger recording.
- **Fix:** Add a guard in `startRecording` to throw or silently return if `isRecording()` is true. Also consider cleaning up the previous recording if `startRecording` is called while recording.

### LOW

#### L1: `navigator.onLine` false positives documented but not mitigated
- **File:** `/apis-dashboard/src/hooks/useOnlineStatus.ts:72-78` and `/apis-dashboard/src/hooks/useOfflineTasks.ts:168`
- **Description:** The `useOnlineStatus` hook correctly documents that `navigator.onLine` can have false positives (reporting online when actually offline). However, the sync system relies solely on this signal. A false positive could trigger sync attempts that fail, marking items as errors. A false negative could prevent sync even when the server is reachable. The `useOfflineTasks` hook directly initializes `isOffline` from `!navigator.onLine`.
- **Risk:** Sync may be attempted when offline (wasting battery and creating errors) or not attempted when online. The fetchWithRetry mechanism partially mitigates this but error items accumulate.
- **Fix:** Consider implementing a "server reachability" check (e.g., HEAD request to the health endpoint) before committing to a full sync operation.

#### L2: Sync queue status `syncing` can become stale if app crashes during sync
- **File:** `/apis-dashboard/src/services/backgroundSync.ts:322-324`
- **Description:** Before processing a sync item, its status is changed to `syncing` (line 323). If the browser crashes or the tab is force-closed during sync, the item remains in `syncing` status. There is no startup recovery that resets `syncing` items back to `pending`. Future sync operations only query for `pending` items, so the `syncing` items become orphaned.
- **Risk:** Sync queue items stuck in `syncing` status after a crash are never retried and never cleaned up.
- **Fix:** On app startup, reset all `syncing` status items to `pending`. Add this to the `checkAndMigrateCache()` or app initialization flow.

#### L3: `offlineInspection.ts` synced_at is misleading for offline-created inspections
- **File:** `/apis-dashboard/src/services/offlineInspection.ts:122`
- **Description:** When creating an offline inspection, `synced_at` is set to `new Date()` (current time). This is misleading because the inspection has NOT been synced to the server. It's used by the pruning mechanism (`offlineCache.ts:273`) to determine age. The field semantically means "last synced from server" but for offline-created records it represents creation time.
- **Risk:** Pruning logic may make incorrect age-based decisions for offline-created records. Also confusing for any debugging or admin tools that display synced_at.
- **Fix:** Consider using a sentinel date (e.g., `new Date(0)`) for `synced_at` on offline-created records, or check `pending_sync` flag in pruning queries (see M4).

#### L4: ConflictResolutionModal only handles inspections
- **File:** `/apis-dashboard/src/components/ConflictResolutionModal.tsx:58-93`
- **Description:** The `FIELD_LABELS` and `COMPARE_FIELDS` constants are hardcoded for inspection fields only. If task sync ever produces 409 conflicts (the task sync system currently handles 409 differently -- treating it as idempotent success), the ConflictResolutionModal would show empty or incorrect comparisons.
- **Risk:** If the conflict resolution flow is ever extended to tasks, the modal will not display task-relevant fields.
- **Fix:** Make field labels configurable via props or add task-specific field mappings.

#### L5: `backgroundSync.ts` constructs API URL from env vars, bypassing apiClient
- **File:** `/apis-dashboard/src/services/backgroundSync.ts:69-70`
- **Description:** The background sync service manually constructs `API_BASE_URL` from `import.meta.env.VITE_API_URL` and uses raw `fetch()` with a manually constructed `Authorization: Bearer` header. Meanwhile, `taskSync.ts` uses `apiClient` (Axios instance) which has interceptors for auth, error handling, and base URL. This means backgroundSync bypasses any request/response interceptors, CSRF token inclusion, and centralized error handling configured on apiClient.
- **Risk:** Inconsistent request behavior between the two sync systems. backgroundSync won't benefit from any interceptors added to apiClient (e.g., token refresh, rate limiting headers, CSRF tokens). In local auth mode where cookies handle auth, the `Bearer ${authToken}` header may be empty or incorrect.
- **Fix:** Refactor `backgroundSync.ts` to use `apiClient` instead of raw `fetch`, matching `taskSync.ts`.

#### L6: `cleanupServiceWorker` does not remove the `online` event listener
- **File:** `/apis-dashboard/src/registerSW.ts:132-160, 209-215`
- **Description:** `setupSyncOnReconnect()` adds an `online` event listener via `window.addEventListener('online', handleOnline)` but there is no mechanism to remove it. The `cleanupServiceWorker()` function only clears the update check interval. The `handleOnline` closure captures references to `syncPendingTasks` and `hasPendingTaskSync`.
- **Risk:** Minor memory leak in scenarios where the service worker module is hot-reloaded during development. In production, this listener lives for the page lifetime, so it's not a practical issue.
- **Fix:** Store the event listener reference and remove it in `cleanupServiceWorker()`.

### INFO

#### I1: Good use of transactions for atomicity in task operations
- **File:** `/apis-dashboard/src/services/offlineTasks.ts:245-248, 308-311, 334-352`
- **Description:** `saveOfflineTask`, `completeOfflineTask`, and `deleteOfflineTask` all correctly use `db.transaction('rw', ...)` to ensure atomicity of multi-table writes. This is the correct pattern and should be extended to `offlineInspection.ts` `markAsSynced` (see C2).

#### I2: Well-structured cache version management
- **File:** `/apis-dashboard/src/services/db.ts:416-448`
- **Description:** The `checkAndMigrateCache()` system provides a clean mechanism for forced cache invalidation on schema changes or security patches. Incrementing `CACHE_VERSION` clears all cached data. This is a good security practice.

#### I3: `registerType: 'prompt'` is the correct choice for a data-centric PWA
- **File:** `/apis-dashboard/vite.config.ts:19`
- **Description:** Using `prompt` instead of `autoUpdate` prevents the service worker from silently updating and potentially losing in-flight sync operations. The user is prompted to update, which is appropriate for an app with offline data.

#### I4: Good separation of auth cleanup concerns
- **File:** `/apis-dashboard/src/services/authCleanup.ts`
- **Description:** The `cleanupAllAuthData()` function is comprehensive, clearing IndexedDB, sessionStorage, localStorage (auth-related keys only), CSRF tokens, and service worker caches. The `cleanupExpiredSession()` variant preserves cached data for re-login, which is a good UX decision.

#### I5: Test coverage is reasonable but has gaps
- **Files:** All test files reviewed
- **Description:** Tests cover happy paths for offline task CRUD, sync ordering, and conflict handling. However, there are no tests for: corrupted JSON payloads in sync queue (the uncaught JSON.parse issue in H1), concurrent sync attempts, quota exceeded scenarios, or the interaction between the two sync systems. The OfflineBanner test expects a `.anticon-wifi` class but the component uses a Material Symbols `cloud_off` icon -- this test likely fails.

## Files Reviewed

1. `/apis-dashboard/src/services/db.ts`
2. `/apis-dashboard/src/services/offlineCache.ts`
3. `/apis-dashboard/src/services/offlineInspection.ts`
4. `/apis-dashboard/src/services/offlineTasks.ts`
5. `/apis-dashboard/src/services/backgroundSync.ts`
6. `/apis-dashboard/src/services/taskSync.ts`
7. `/apis-dashboard/src/services/whisperTranscription.ts`
8. `/apis-dashboard/src/services/authCleanup.ts`
9. `/apis-dashboard/src/registerSW.ts`
10. `/apis-dashboard/src/hooks/usePendingSync.ts`
11. `/apis-dashboard/src/hooks/useOfflineTasks.ts`
12. `/apis-dashboard/src/hooks/useOnlineStatus.ts`
13. `/apis-dashboard/src/hooks/useBackgroundSync.ts`
14. `/apis-dashboard/src/components/OfflineBanner.tsx`
15. `/apis-dashboard/src/components/OfflineTasksBanner.tsx`
16. `/apis-dashboard/src/components/SyncNotification.tsx`
17. `/apis-dashboard/src/components/ConflictResolutionModal.tsx`
18. `/apis-dashboard/src/context/BackgroundSyncContext.tsx`
19. `/apis-dashboard/tests/services/offlineTasks.test.ts`
20. `/apis-dashboard/tests/services/taskSync.test.ts`
21. `/apis-dashboard/tests/hooks/useOfflineTasks.test.ts`
22. `/apis-dashboard/tests/components/OfflineBanner.test.tsx`
23. `/apis-dashboard/vite.config.ts`

## Metrics
- Files reviewed: 23
- Total findings: 18 (C: 2, H: 3, M: 7, L: 6, I: 5)
