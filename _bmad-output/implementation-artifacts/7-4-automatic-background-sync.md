# Story 7.4: Automatic Background Sync

Status: done

## Story

As a **beekeeper**,
I want my offline changes to sync automatically,
So that I don't have to remember to sync manually.

## Acceptance Criteria

1. **Given** I have pending offline changes **When** the device regains internet connection **Then**:
   - Sync begins automatically in the background
   - "Syncing..." indicator appears

2. **Given** sync is in progress **When** each record syncs successfully **Then**:
   - The pending count decreases
   - Local records are updated with server IDs
   - `pending_sync` flag is cleared

3. **Given** all records sync successfully **When** sync completes **Then**:
   - I see "All changes synced" notification (auto-dismisses after 3s)
   - All data now has server IDs

4. **Given** a sync fails (conflict, server error) **When** the error occurs **Then**:
   - That specific record is flagged as "sync_error"
   - Other records continue syncing
   - I see "1 item failed to sync - tap to resolve"

5. **Given** there's a sync conflict (server has newer data) **When** conflict is detected **Then**:
   - I'm prompted to choose: "Keep mine", "Keep server", or "View diff"
   - Resolution is applied

## Tasks / Subtasks

### Task 1: Create Background Sync Service (AC: #1, #2, #3)
- [x] 1.1 Create `apis-dashboard/src/services/backgroundSync.ts`
- [x] 1.2 Implement `startBackgroundSync()` function that processes sync_queue
- [x] 1.3 Implement `syncInspection(queueItem)` - POST to `/api/hives/{hiveId}/inspections`
- [x] 1.4 Implement retry logic with exponential backoff (1s, 2s, 4s, 8s, max 60s)
- [x] 1.5 Call `markAsSynced(localId, serverId)` on success (from offlineInspection.ts)
- [x] 1.6 Call `markSyncError(localId, error)` on failure (from offlineInspection.ts)
- [x] 1.7 Update sync_queue item status: pending -> syncing -> (delete on success | error)
- [x] 1.8 Export `SyncProgress` type: `{ total, completed, failed, current }`

### Task 2: Create useBackgroundSync Hook (AC: #1, #2, #3)
- [x] 2.1 Create `apis-dashboard/src/hooks/useBackgroundSync.ts`
- [x] 2.2 Listen for `online` event using `useOnlineStatus` hook
- [x] 2.3 Trigger `startBackgroundSync()` when transitioning offline -> online
- [x] 2.4 Track sync state: `{ isSyncing, progress: SyncProgress }`
- [x] 2.5 Use `useLiveQuery` to watch sync_queue for reactive updates
- [x] 2.6 Return `{ isSyncing, progress, triggerSync, lastSyncResult }`

### Task 3: Create SyncNotification Component (AC: #3, #4)
- [x] 3.1 Create `apis-dashboard/src/components/SyncNotification.tsx`
- [x] 3.2 Show "Syncing... X of Y" during sync
- [x] 3.3 Show "All changes synced" on success (auto-dismiss 3s)
- [x] 3.4 Show "X items failed to sync - tap to resolve" on partial failure
- [x] 3.5 Use Ant Design `notification` API for toast-style alerts
- [x] 3.6 Style with APIS theme (seaBuckthorn for syncing, success green, error red)

### Task 4: Create ConflictResolutionModal Component (AC: #5)
- [x] 4.1 Create `apis-dashboard/src/components/ConflictResolutionModal.tsx`
- [x] 4.2 Props: `{ localData, serverData, onResolve, onCancel }`
- [x] 4.3 Show side-by-side diff of local vs server inspection data
- [x] 4.4 Three buttons: "Keep Mine", "Keep Server", "Cancel"
- [x] 4.5 Display key differences: date, queen_seen, notes, etc.
- [x] 4.6 Use APIS theme colors, 64px tap targets

### Task 5: Implement Conflict Detection (AC: #5)
- [x] 5.1 Add `updated_at` check in `syncInspection()` - compare local vs server timestamp
- [x] 5.2 If server returns 409 Conflict, extract server version from response
- [x] 5.3 Store conflict in state: `{ localInspection, serverInspection }`
- [x] 5.4 Pause sync for that item, continue others
- [x] 5.5 Implement `resolveConflict(localId, choice: 'local' | 'server')`:
   - If 'local': force-update server (PUT with `force=true` query param or skip version check)
   - If 'server': delete local, fetch and cache server version

### Task 6: Integrate Sync into App Layout (AC: #1, #2, #3)
- [x] 6.1 Add `BackgroundSyncProvider` context to `App.tsx`
- [x] 6.2 Wrap app with provider to manage sync state globally
- [x] 6.3 Update `SyncStatus.tsx` to use `useBackgroundSync` hook
- [x] 6.4 Show real-time sync progress in SyncStatus component
- [x] 6.5 Render `SyncNotification` in AppLayout for toast alerts

### Task 7: Update Existing Components (AC: #2, #4)
- [x] 7.1 Update `OfflineBanner.tsx` to show "Syncing..." when sync in progress
- [x] 7.2 Update `usePendingSync.ts` to include sync state (syncing items count)
- [x] 7.3 Add retry button to SyncStatus for failed items
- [x] 7.4 Add "Resolve" action to failed items list in SyncStatus

### Task 8: API Integration (AC: #2, #5)
- [x] 8.1 Ensure POST `/api/hives/{id}/inspections` returns created inspection with server ID
- [x] 8.2 Handle 409 Conflict response - server should return its current version
- [x] 8.3 Implement force-update via query param: `PUT /api/inspections/{id}?force=true`
- [x] 8.4 Handle 401/403 - refresh auth token or prompt re-login
- [x] 8.5 Handle network errors vs server errors (retry vs permanent fail)

### Task 9: Testing (AC: #1, #2, #3, #4, #5)
- [x] 9.1 Create `tests/services/backgroundSync.test.ts`
- [x] 9.2 Create `tests/hooks/useBackgroundSync.test.ts`
- [x] 9.3 Create `tests/components/SyncNotification.test.tsx`
- [x] 9.4 Create `tests/components/ConflictResolutionModal.test.tsx`
- [x] 9.5 Test sync retry logic with exponential backoff
- [x] 9.6 Test conflict detection and resolution flow
- [x] 9.7 All tests pass with `npm test`

## Dev Notes

### Architecture Patterns

**PWA Sync Protocol (from architecture.md):**
```typescript
// POST /api/sync handles offline data synchronization
// Request body:
{
  "client_timestamp": "2026-01-22T10:00:00Z",
  "inspections": [
    {"local_id": "temp-1", "hive_id": "...", "date": "...", ...}
  ]
}
// Response:
{
  "synced": {
    "inspections": [{"local_id": "temp-1", "server_id": "insp-123"}]
  },
  "conflicts": [],
  "server_timestamp": "2026-01-22T10:00:05Z"
}
// Conflict resolution: Last-write-wins with user notification
```

**Existing Infrastructure from Story 7-3:**
```
IndexedDB (Dexie.js)
├── inspections (pending_sync, local_id, sync_error fields)
├── sync_queue (id, table, action, payload, status, error)
└── metadata (sync timestamps)
```

### Sync Service Implementation Pattern

```typescript
// src/services/backgroundSync.ts
import { db, type SyncQueueItem } from './db';
import { markAsSynced, markSyncError } from './offlineInspection';

export interface SyncProgress {
  total: number;
  completed: number;
  failed: number;
  currentItem?: string;
}

export interface SyncResult {
  success: boolean;
  synced: number;
  failed: number;
  conflicts: ConflictItem[];
}

interface ConflictItem {
  localId: string;
  localData: any;
  serverData: any;
}

const RETRY_DELAYS = [1000, 2000, 4000, 8000, 60000]; // Exponential backoff

export async function startBackgroundSync(
  onProgress: (progress: SyncProgress) => void,
  authToken: string
): Promise<SyncResult> {
  const pendingItems = await db.sync_queue
    .where('status')
    .equals('pending')
    .toArray();

  const progress: SyncProgress = {
    total: pendingItems.length,
    completed: 0,
    failed: 0,
  };

  const conflicts: ConflictItem[] = [];

  for (const item of pendingItems) {
    progress.currentItem = item.id?.toString();
    onProgress(progress);

    // Mark as syncing
    await db.sync_queue.update(item.id!, { status: 'syncing' });

    try {
      const result = await syncItem(item, authToken);

      if (result.conflict) {
        conflicts.push(result.conflict);
        progress.failed++;
      } else {
        await db.sync_queue.delete(item.id!);
        progress.completed++;
      }
    } catch (error) {
      await handleSyncError(item, error as Error);
      progress.failed++;
    }

    onProgress(progress);
  }

  return {
    success: progress.failed === 0,
    synced: progress.completed,
    failed: progress.failed,
    conflicts,
  };
}

async function syncItem(
  item: SyncQueueItem,
  authToken: string
): Promise<{ conflict?: ConflictItem }> {
  const payload = JSON.parse(item.payload);

  if (item.table === 'inspections' && item.action === 'create') {
    const response = await fetchWithRetry(
      `/api/hives/${payload.hive_id}/inspections`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload.data),
      },
      RETRY_DELAYS
    );

    if (response.status === 409) {
      // Conflict - server has newer data
      const serverData = await response.json();
      return {
        conflict: {
          localId: payload.local_id,
          localData: payload.data,
          serverData: serverData.data,
        },
      };
    }

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const result = await response.json();
    await markAsSynced(payload.local_id, result.data.id);
    return {};
  }

  throw new Error(`Unknown sync operation: ${item.table}.${item.action}`);
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  delays: number[],
  attempt = 0
): Promise<Response> {
  try {
    const response = await fetch(url, options);

    // Don't retry on client errors (except 408, 429)
    if (response.status >= 400 && response.status < 500) {
      if (response.status !== 408 && response.status !== 429) {
        return response;
      }
    }

    // Retry on server errors
    if (response.status >= 500 && attempt < delays.length) {
      await sleep(delays[attempt]);
      return fetchWithRetry(url, options, delays, attempt + 1);
    }

    return response;
  } catch (error) {
    // Network error - retry
    if (attempt < delays.length) {
      await sleep(delays[attempt]);
      return fetchWithRetry(url, options, delays, attempt + 1);
    }
    throw error;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function handleSyncError(item: SyncQueueItem, error: Error): Promise<void> {
  const payload = JSON.parse(item.payload);

  await db.sync_queue.update(item.id!, {
    status: 'error',
    error: error.message,
  });

  if (item.table === 'inspections') {
    await markSyncError(payload.local_id, error.message);
  }
}
```

### useBackgroundSync Hook Pattern

```typescript
// src/hooks/useBackgroundSync.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useOnlineStatus } from './useOnlineStatus';
import { db } from '../services/db';
import { startBackgroundSync, type SyncProgress, type SyncResult } from '../services/backgroundSync';

export interface UseBackgroundSyncResult {
  isSyncing: boolean;
  progress: SyncProgress | null;
  lastSyncResult: SyncResult | null;
  triggerSync: () => Promise<void>;
  conflicts: Array<{ localId: string; localData: any; serverData: any }>;
  resolveConflict: (localId: string, choice: 'local' | 'server') => Promise<void>;
}

export function useBackgroundSync(authToken: string): UseBackgroundSyncResult {
  const isOnline = useOnlineStatus();
  const wasOffline = useRef(!isOnline);

  const [isSyncing, setIsSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const [conflicts, setConflicts] = useState<any[]>([]);

  // Watch sync queue for pending items
  const pendingCount = useLiveQuery(
    () => db.sync_queue.where('status').equals('pending').count(),
    []
  );

  const triggerSync = useCallback(async () => {
    if (isSyncing || !isOnline || pendingCount === 0) return;

    setIsSyncing(true);
    setProgress({ total: pendingCount ?? 0, completed: 0, failed: 0 });

    try {
      const result = await startBackgroundSync(setProgress, authToken);
      setLastSyncResult(result);

      if (result.conflicts.length > 0) {
        setConflicts(result.conflicts);
      }
    } finally {
      setIsSyncing(false);
      setProgress(null);
    }
  }, [isOnline, isSyncing, pendingCount, authToken]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && wasOffline.current && pendingCount && pendingCount > 0) {
      triggerSync();
    }
    wasOffline.current = !isOnline;
  }, [isOnline, pendingCount, triggerSync]);

  const resolveConflict = useCallback(async (localId: string, choice: 'local' | 'server') => {
    // Implementation in Task 5
  }, []);

  return {
    isSyncing,
    progress,
    lastSyncResult,
    triggerSync,
    conflicts,
    resolveConflict,
  };
}
```

### SyncNotification Component Pattern

```typescript
// src/components/SyncNotification.tsx
import React, { useEffect } from 'react';
import { notification, Progress } from 'antd';
import { SyncOutlined, CheckCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { colors } from '../theme/apisTheme';
import type { SyncProgress, SyncResult } from '../services/backgroundSync';

interface SyncNotificationProps {
  isSyncing: boolean;
  progress: SyncProgress | null;
  lastResult: SyncResult | null;
  onResolveErrors: () => void;
}

export function SyncNotification({
  isSyncing,
  progress,
  lastResult,
  onResolveErrors,
}: SyncNotificationProps): null {
  // Show syncing notification
  useEffect(() => {
    if (isSyncing && progress) {
      notification.open({
        key: 'sync-progress',
        message: 'Syncing...',
        description: (
          <div>
            <Progress
              percent={Math.round((progress.completed / progress.total) * 100)}
              size="small"
              strokeColor={colors.seaBuckthorn}
            />
            <span>{progress.completed} of {progress.total} items</span>
          </div>
        ),
        icon: <SyncOutlined spin style={{ color: colors.seaBuckthorn }} />,
        duration: 0, // Don't auto-close
      });
    } else {
      notification.destroy('sync-progress');
    }
  }, [isSyncing, progress]);

  // Show result notification
  useEffect(() => {
    if (lastResult && !isSyncing) {
      if (lastResult.success) {
        notification.success({
          message: 'All changes synced',
          icon: <CheckCircleOutlined style={{ color: colors.success }} />,
          duration: 3, // Auto-dismiss after 3 seconds
        });
      } else if (lastResult.failed > 0) {
        notification.warning({
          message: `${lastResult.failed} item${lastResult.failed > 1 ? 's' : ''} failed to sync`,
          description: 'Tap to resolve',
          onClick: onResolveErrors,
          icon: <ExclamationCircleOutlined style={{ color: colors.warning }} />,
          duration: 0, // Don't auto-close
        });
      }
    }
  }, [lastResult, isSyncing, onResolveErrors]);

  return null; // Renders via notification API
}
```

### ConflictResolutionModal Pattern

```typescript
// src/components/ConflictResolutionModal.tsx
import React from 'react';
import { Modal, Button, Typography, Space, Divider, Row, Col, Tag } from 'antd';
import { CloudOutlined, MobileOutlined, SwapOutlined } from '@ant-design/icons';
import { colors } from '../theme/apisTheme';
import dayjs from 'dayjs';

const { Text, Title } = Typography;

interface ConflictResolutionModalProps {
  visible: boolean;
  localData: any;
  serverData: any;
  onResolve: (choice: 'local' | 'server') => void;
  onCancel: () => void;
}

export function ConflictResolutionModal({
  visible,
  localData,
  serverData,
  onResolve,
  onCancel,
}: ConflictResolutionModalProps): React.ReactElement {
  const differences = findDifferences(localData, serverData);

  return (
    <Modal
      open={visible}
      title={
        <Space>
          <SwapOutlined style={{ color: colors.warning }} />
          <span>Sync Conflict</span>
        </Space>
      }
      onCancel={onCancel}
      footer={null}
      width={600}
    >
      <Text type="secondary">
        This inspection was modified on the server while you were offline.
        Choose which version to keep:
      </Text>

      <Divider />

      <Row gutter={16}>
        {/* Local version */}
        <Col span={12}>
          <div
            style={{
              padding: 16,
              background: 'rgba(247, 164, 45, 0.1)',
              borderRadius: 8,
              border: `1px solid ${colors.seaBuckthorn}`,
            }}
          >
            <Space>
              <MobileOutlined style={{ color: colors.seaBuckthorn }} />
              <Text strong>Your Version</Text>
            </Space>
            <div style={{ marginTop: 12 }}>
              {differences.map(diff => (
                <div key={diff.field} style={{ marginBottom: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{diff.label}</Text>
                  <div><Text>{formatValue(diff.local)}</Text></div>
                </div>
              ))}
            </div>
          </div>
        </Col>

        {/* Server version */}
        <Col span={12}>
          <div
            style={{
              padding: 16,
              background: 'rgba(82, 196, 26, 0.1)',
              borderRadius: 8,
              border: '1px solid #52c41a',
            }}
          >
            <Space>
              <CloudOutlined style={{ color: '#52c41a' }} />
              <Text strong>Server Version</Text>
            </Space>
            <div style={{ marginTop: 12 }}>
              {differences.map(diff => (
                <div key={diff.field} style={{ marginBottom: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{diff.label}</Text>
                  <div><Text>{formatValue(diff.server)}</Text></div>
                </div>
              ))}
            </div>
          </div>
        </Col>
      </Row>

      <Divider />

      <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
        <Button onClick={onCancel}>Cancel</Button>
        <Button
          type="primary"
          style={{ background: colors.seaBuckthorn, borderColor: colors.seaBuckthorn }}
          onClick={() => onResolve('local')}
        >
          Keep Mine
        </Button>
        <Button
          type="primary"
          style={{ background: '#52c41a', borderColor: '#52c41a' }}
          onClick={() => onResolve('server')}
        >
          Keep Server
        </Button>
      </Space>
    </Modal>
  );
}

function findDifferences(local: any, server: any) {
  const fields = ['date', 'queen_seen', 'eggs_seen', 'brood_frames', 'notes'];
  const labels: Record<string, string> = {
    date: 'Inspection Date',
    queen_seen: 'Queen Seen',
    eggs_seen: 'Eggs Seen',
    brood_frames: 'Brood Frames',
    notes: 'Notes',
  };

  return fields
    .filter(f => JSON.stringify(local?.[f]) !== JSON.stringify(server?.[f]))
    .map(f => ({
      field: f,
      label: labels[f] || f,
      local: local?.[f],
      server: server?.[f],
    }));
}

function formatValue(val: any): string {
  if (val === null || val === undefined) return '-';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}/)) {
    return dayjs(val).format('MMM D, YYYY');
  }
  return String(val);
}
```

### Existing Code to Reuse

**DO NOT RECREATE - Import these from previous stories:**

| Module | Import From | Purpose |
|--------|-------------|---------|
| `useOnlineStatus` | `src/hooks/useOnlineStatus.ts` | Detect online/offline transitions |
| `usePendingSync` | `src/hooks/usePendingSync.ts` | Get pending items count |
| `db` | `src/services/db.ts` | IndexedDB instance |
| `SyncQueueItem` | `src/services/db.ts` | Sync queue type |
| `markAsSynced` | `src/services/offlineInspection.ts` | Mark inspection synced |
| `markSyncError` | `src/services/offlineInspection.ts` | Mark inspection error |
| `SyncStatus` | `src/components/SyncStatus.tsx` | Sync status display |
| `OfflineBanner` | `src/components/OfflineBanner.tsx` | Offline indicator |
| `colors` | `src/theme/apisTheme.ts` | Theme colors |

### File Structure

**Files to create:**
- `apis-dashboard/src/services/backgroundSync.ts` - Core sync service
- `apis-dashboard/src/hooks/useBackgroundSync.ts` - Background sync hook
- `apis-dashboard/src/components/SyncNotification.tsx` - Toast notifications
- `apis-dashboard/src/components/ConflictResolutionModal.tsx` - Conflict UI
- `apis-dashboard/src/context/BackgroundSyncContext.tsx` - Sync provider
- `apis-dashboard/tests/services/backgroundSync.test.ts`
- `apis-dashboard/tests/hooks/useBackgroundSync.test.ts`
- `apis-dashboard/tests/components/SyncNotification.test.tsx`
- `apis-dashboard/tests/components/ConflictResolutionModal.test.tsx`

**Files to modify:**
- `apis-dashboard/src/App.tsx` - Add BackgroundSyncProvider
- `apis-dashboard/src/components/SyncStatus.tsx` - Show real-time sync progress
- `apis-dashboard/src/components/OfflineBanner.tsx` - Show "Syncing..." state
- `apis-dashboard/src/hooks/usePendingSync.ts` - Add syncing state
- `apis-dashboard/src/components/index.ts` - Export new components
- `apis-dashboard/src/hooks/index.ts` - Export new hook
- `apis-dashboard/src/services/index.ts` - Export new service
- `apis-dashboard/src/context/index.ts` - Export new context (create if not exists)

### Theme Colors Reference

```typescript
// From src/theme/apisTheme.ts
seaBuckthorn: '#f7a42d'  // Primary gold - syncing state
coconutCream: '#fbf9e7'  // Background
brownBramble: '#662604'  // Text
salomie: '#fcd483'       // Cards/borders
warning: '#e67e00'       // Error/failed states
success: '#52c41a'       // Synced successfully
```

### API Endpoint Requirements

The backend needs to support:

1. **POST `/api/hives/{id}/inspections`** - Create inspection
   - Returns: `{ data: { id: "server-uuid", ...inspection } }`
   - On conflict: `409` with `{ data: serverInspection, error: "conflict" }`

2. **PUT `/api/inspections/{id}?force=true`** - Force update (skip version check)
   - Used when user chooses "Keep Mine" for conflict resolution

3. **Standard error responses:**
   - `401` - Token expired, needs re-auth
   - `403` - Permission denied
   - `409` - Version conflict
   - `500+` - Server error (retry)

### Testing Strategy

**Unit Tests:**
1. `backgroundSync.test.ts`:
   - Test sync queue processing
   - Test exponential backoff timing
   - Test error handling and retry logic
   - Test conflict detection

2. `useBackgroundSync.test.ts`:
   - Test auto-sync on online transition
   - Test manual trigger
   - Test progress tracking
   - Test conflict state management

3. `SyncNotification.test.tsx`:
   - Test syncing notification appears
   - Test success notification auto-dismisses
   - Test error notification click handler

4. `ConflictResolutionModal.test.tsx`:
   - Test diff display
   - Test button actions
   - Test field formatting

**Manual Testing Checklist:**
1. Toggle offline in Chrome DevTools > Network
2. Create inspection offline
3. Go back online
4. Verify "Syncing..." appears
5. Verify "All changes synced" toast (3s dismiss)
6. Check IndexedDB - pending_sync should be false, local_id null, id is server UUID
7. Test sync failure - start server without DB, verify error handling
8. Test conflict - modify same inspection on server while offline, verify modal

### Previous Story Intelligence

**From Story 7-3 (Offline Inspection Creation):**
- Schema v2 with `pending_sync`, `local_id`, `sync_error` fields
- `sync_queue` table for tracking pending operations
- `markAsSynced(localId, serverId)` - updates ID, clears flags
- `markSyncError(localId, error)` - sets sync_error field
- `getPendingSyncItems()` - returns pending queue items
- `useLiveQuery` for reactive IndexedDB queries

**Key Learnings:**
- Dexie stores booleans as `true`/`false`, not 1/0 - use `.filter(i => i.pending_sync === true)`
- Always delete old record before putting new one when changing primary key
- Use `db.transaction('rw', [...tables], async () => {})` for atomic operations

### Project Structure Notes

- All services in `apis-dashboard/src/services/`
- All hooks in `apis-dashboard/src/hooks/`
- All components in `apis-dashboard/src/components/`
- All context providers in `apis-dashboard/src/context/`
- All tests in `apis-dashboard/tests/` (not co-located)
- Export new modules from barrel files (`index.ts`)
- Use absolute imports with `@/` alias configured in vite.config.ts

### References

- [Source: architecture.md#PWA-Sync-Protocol] - Sync endpoint specification
- [Source: architecture.md#Frontend-Architecture] - Component patterns
- [Source: epics.md#Story-7.4] - Full acceptance criteria with BDD scenarios
- [Source: 7-3-offline-inspection-creation.md] - Previous story infrastructure
- [Source: offlineInspection.ts] - markAsSynced, markSyncError functions
- [Source: db.ts] - SyncQueueItem interface, sync_queue table

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

None - implementation proceeded without errors requiring debugging.

### Completion Notes List

1. Created `backgroundSync.ts` service with exponential backoff retry logic (1s, 2s, 4s, 8s, max 60s)
2. Created `useBackgroundSync.ts` hook with auto-sync on online transition
3. Created `SyncNotification.tsx` using Ant Design notification API for toast-style alerts
4. Created `ConflictResolutionModal.tsx` with side-by-side diff display
5. Created `BackgroundSyncContext.tsx` provider for global sync state management
6. Integrated BackgroundSyncProvider into App.tsx
7. Updated OfflineBanner.tsx to show "Syncing..." state with spinning icon
8. Updated usePendingSync.ts to include syncingCount
9. Updated SyncStatus.tsx with retry functionality
10. Updated layout.test.tsx to include BackgroundSyncProvider wrapper and proper mocks
11. All 370 tests pass

### File List

**Files Created:**
- `apis-dashboard/src/services/backgroundSync.ts` - Core sync service with exponential backoff
- `apis-dashboard/src/hooks/useBackgroundSync.ts` - Background sync hook
- `apis-dashboard/src/components/SyncNotification.tsx` - Toast notifications component
- `apis-dashboard/src/components/ConflictResolutionModal.tsx` - Conflict resolution UI
- `apis-dashboard/src/context/BackgroundSyncContext.tsx` - Global sync provider
- `apis-dashboard/tests/services/backgroundSync.test.ts` - 12 tests
- `apis-dashboard/tests/hooks/useBackgroundSync.test.ts` - 11 tests
- `apis-dashboard/tests/components/SyncNotification.test.tsx` - 10 tests
- `apis-dashboard/tests/components/ConflictResolutionModal.test.tsx` - 13 tests

**Files Modified:**
- `apis-dashboard/src/App.tsx` - Added BackgroundSyncProvider
- `apis-dashboard/src/components/OfflineBanner.tsx` - Added isSyncing and syncProgress props
- `apis-dashboard/src/components/SyncStatus.tsx` - Added onRetryFailed and failedCount props
- `apis-dashboard/src/hooks/usePendingSync.ts` - Added syncingCount to return type
- `apis-dashboard/src/components/layout/AppLayout.tsx` - Added useBackgroundSyncContext usage
- `apis-dashboard/src/services/index.ts` - Exported backgroundSync module
- `apis-dashboard/src/hooks/index.ts` - Exported useBackgroundSync hook
- `apis-dashboard/src/components/index.ts` - Exported new components
- `apis-dashboard/src/context/index.ts` - Exported BackgroundSyncContext
- `apis-dashboard/tests/layout.test.tsx` - Added BackgroundSyncProvider wrapper and mocks

## Remediation Log

**Remediated:** 2026-01-25T19:22:00Z
**Issues Fixed:** 7 of 7

### Changes Applied

**HIGH:**
- H1: Added "View Diff" tab to ConflictResolutionModal with unified diff view showing local/server changes stacked vertically with color markers
- H2: Removed unused `useMemo` import from useBackgroundSync.ts
- H3: Increased retry delay from 100ms to 500ms to prevent race condition in retryFailed()

**MEDIUM:**
- M1: Added fallback to `http://localhost:3000` for API_BASE_URL in development mode
- M2: Wrapped all notification API calls in try/catch blocks to handle environments where notification may fail

**LOW:**
- L1: Replaced hardcoded `#52c41a` with `colors.success` theme variable in ConflictResolutionModal
- L2: Added try/catch around JSON.parse in syncItem() with specific error message including item id

### Files Modified During Remediation
- `apis-dashboard/src/components/ConflictResolutionModal.tsx` - Added View Diff tab, fixed hardcoded colors
- `apis-dashboard/src/hooks/useBackgroundSync.ts` - Removed unused import, fixed retry delay
- `apis-dashboard/src/services/backgroundSync.ts` - Added dev fallback URL, improved JSON.parse error handling
- `apis-dashboard/src/components/SyncNotification.tsx` - Added error boundaries around notification API calls

### Remaining Issues
None - all issues fixed.
