/**
 * SyncNotification Component Tests
 *
 * Tests for the sync notification component that displays toast-style
 * notifications for background sync events.
 *
 * Part of Epic 7, Story 7.4: Automatic Background Sync
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { notification } from 'antd';
import { SyncNotification } from '../../src/components/SyncNotification';
import type { SyncProgress, SyncResult } from '../../src/services/backgroundSync';

// Mock Ant Design notification
vi.mock('antd', async () => {
  const actual = await vi.importActual('antd');
  return {
    ...actual,
    notification: {
      open: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
      destroy: vi.fn(),
    },
  };
});

describe('SyncNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('should render without crashing', () => {
    const { container } = render(
      <SyncNotification
        isSyncing={false}
        progress={null}
        lastResult={null}
        onResolveErrors={() => {}}
      />
    );

    // Component returns null, so container should be empty
    expect(container.firstChild).toBeNull();
  });

  it('should show syncing notification when syncing starts', () => {
    const progress: SyncProgress = {
      total: 5,
      completed: 2,
      failed: 0,
    };

    render(
      <SyncNotification
        isSyncing={true}
        progress={progress}
        lastResult={null}
        onResolveErrors={() => {}}
      />
    );

    expect(notification.open).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'sync-progress',
        message: 'Syncing...',
        duration: 0, // Don't auto-close
      })
    );
  });

  it('should close syncing notification when sync stops', () => {
    const { rerender } = render(
      <SyncNotification
        isSyncing={true}
        progress={{ total: 1, completed: 0, failed: 0 }}
        lastResult={null}
        onResolveErrors={() => {}}
      />
    );

    // Stop syncing
    rerender(
      <SyncNotification
        isSyncing={false}
        progress={null}
        lastResult={null}
        onResolveErrors={() => {}}
      />
    );

    expect(notification.destroy).toHaveBeenCalledWith('sync-progress');
  });

  it('should show success notification when all items sync', () => {
    const lastResult: SyncResult = {
      success: true,
      synced: 3,
      failed: 0,
      conflicts: [],
    };

    render(
      <SyncNotification
        isSyncing={false}
        progress={null}
        lastResult={lastResult}
        onResolveErrors={() => {}}
      />
    );

    expect(notification.success).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'All changes synced',
        duration: 3, // Auto-dismiss after 3 seconds
      })
    );
  });

  it('should show warning notification when items fail', () => {
    const lastResult: SyncResult = {
      success: false,
      synced: 1,
      failed: 2,
      conflicts: [],
    };

    render(
      <SyncNotification
        isSyncing={false}
        progress={null}
        lastResult={lastResult}
        onResolveErrors={() => {}}
      />
    );

    expect(notification.warning).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '2 items failed to sync',
        duration: 0, // Don't auto-close errors
      })
    );
  });

  it('should show singular message for single failure', () => {
    const lastResult: SyncResult = {
      success: false,
      synced: 0,
      failed: 1,
      conflicts: [],
    };

    render(
      <SyncNotification
        isSyncing={false}
        progress={null}
        lastResult={lastResult}
        onResolveErrors={() => {}}
      />
    );

    expect(notification.warning).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '1 item failed to sync',
      })
    );
  });

  it('should not show notification when no items synced and none failed', () => {
    const lastResult: SyncResult = {
      success: true,
      synced: 0,
      failed: 0,
      conflicts: [],
    };

    render(
      <SyncNotification
        isSyncing={false}
        progress={null}
        lastResult={lastResult}
        onResolveErrors={() => {}}
      />
    );

    // Should clear previous notifications but not show new ones
    expect(notification.success).not.toHaveBeenCalled();
    expect(notification.warning).not.toHaveBeenCalled();
  });

  it('should not show result notification while still syncing', () => {
    const lastResult: SyncResult = {
      success: true,
      synced: 3,
      failed: 0,
      conflicts: [],
    };

    render(
      <SyncNotification
        isSyncing={true} // Still syncing
        progress={{ total: 5, completed: 3, failed: 0 }}
        lastResult={lastResult}
        onResolveErrors={() => {}}
      />
    );

    // Should show progress notification, not success
    expect(notification.open).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'sync-progress',
      })
    );
    expect(notification.success).not.toHaveBeenCalled();
  });

  it('should update progress notification as sync progresses', () => {
    const { rerender } = render(
      <SyncNotification
        isSyncing={true}
        progress={{ total: 5, completed: 1, failed: 0 }}
        lastResult={null}
        onResolveErrors={() => {}}
      />
    );

    // Update progress
    rerender(
      <SyncNotification
        isSyncing={true}
        progress={{ total: 5, completed: 3, failed: 0 }}
        lastResult={null}
        onResolveErrors={() => {}}
      />
    );

    // notification.open should be called for each progress update
    expect(notification.open).toHaveBeenCalledTimes(2);
  });

  it('should show single item synced message correctly', () => {
    const lastResult: SyncResult = {
      success: true,
      synced: 1,
      failed: 0,
      conflicts: [],
    };

    render(
      <SyncNotification
        isSyncing={false}
        progress={null}
        lastResult={lastResult}
        onResolveErrors={() => {}}
      />
    );

    expect(notification.success).toHaveBeenCalledWith(
      expect.objectContaining({
        description: '1 item synchronized',
      })
    );
  });
});
