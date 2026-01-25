/**
 * Background Sync Context
 *
 * Provides global access to background sync state and controls.
 * Wraps the application to enable automatic sync when coming online
 * and manual sync triggers from anywhere in the app.
 *
 * Part of Epic 7, Story 7.4: Automatic Background Sync
 *
 * @module context/BackgroundSyncContext
 */
import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { useBackgroundSync, type UseBackgroundSyncResult } from '../hooks/useBackgroundSync';
import { SyncNotification } from '../components/SyncNotification';
import { ConflictResolutionModal } from '../components/ConflictResolutionModal';
import type { ConflictItem } from '../services/backgroundSync';

// ============================================================================
// Types
// ============================================================================

/**
 * Context value extends the hook result with additional UI state
 */
export interface BackgroundSyncContextValue extends UseBackgroundSyncResult {
  /** Show the sync errors/conflicts modal */
  showSyncErrorsModal: () => void;
}

// ============================================================================
// Context
// ============================================================================

const BackgroundSyncContext = createContext<BackgroundSyncContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

export interface BackgroundSyncProviderProps {
  children: ReactNode;
}

/**
 * BackgroundSyncProvider - Global sync state provider
 *
 * Provides:
 * - Automatic background sync when device comes online
 * - Sync progress notifications via toast
 * - Conflict resolution modal when needed
 * - Global access to sync state via useBackgroundSyncContext()
 *
 * @example
 * ```tsx
 * // In App.tsx
 * function App() {
 *   return (
 *     <BackgroundSyncProvider>
 *       <YourApp />
 *     </BackgroundSyncProvider>
 *   );
 * }
 *
 * // In any component
 * function MyComponent() {
 *   const { isSyncing, pendingCount, triggerSync } = useBackgroundSyncContext();
 *   // ...
 * }
 * ```
 */
export function BackgroundSyncProvider({
  children,
}: BackgroundSyncProviderProps): React.ReactElement {
  // Use the background sync hook
  const syncState = useBackgroundSync();

  // Local UI state for modals
  const [showErrorsModal, setShowErrorsModal] = useState(false);
  const [currentConflict, setCurrentConflict] = useState<ConflictItem | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  /**
   * Show the sync errors/conflicts modal
   */
  const showSyncErrorsModal = useCallback(() => {
    // If there are conflicts, show the first one
    if (syncState.conflicts.length > 0) {
      setCurrentConflict(syncState.conflicts[0]);
    } else {
      setShowErrorsModal(true);
    }
  }, [syncState.conflicts]);

  /**
   * Handle conflict resolution
   */
  const handleResolveConflict = useCallback(
    async (choice: 'local' | 'server') => {
      if (!currentConflict) return;

      setIsResolving(true);
      try {
        await syncState.resolveConflict(currentConflict.localId, choice);

        // Move to next conflict or close modal
        const remainingConflicts = syncState.conflicts.filter(
          c => c.localId !== currentConflict.localId
        );
        if (remainingConflicts.length > 0) {
          setCurrentConflict(remainingConflicts[0]);
        } else {
          setCurrentConflict(null);
        }
      } finally {
        setIsResolving(false);
      }
    },
    [currentConflict, syncState]
  );

  /**
   * Handle cancel conflict modal
   */
  const handleCancelConflict = useCallback(() => {
    setCurrentConflict(null);
  }, []);

  /**
   * Handle resolve errors action from notification
   */
  const handleResolveErrors = useCallback(() => {
    // If there are conflicts, show conflict modal
    if (syncState.conflicts.length > 0) {
      setCurrentConflict(syncState.conflicts[0]);
    }
    // Otherwise, could show a general errors modal (future enhancement)
  }, [syncState.conflicts]);

  // Build context value
  const contextValue: BackgroundSyncContextValue = {
    ...syncState,
    showSyncErrorsModal,
  };

  return (
    <BackgroundSyncContext.Provider value={contextValue}>
      {children}

      {/* Sync notifications (toast-style) */}
      <SyncNotification
        isSyncing={syncState.isSyncing}
        progress={syncState.progress}
        lastResult={syncState.lastSyncResult}
        onResolveErrors={handleResolveErrors}
      />

      {/* Conflict resolution modal */}
      <ConflictResolutionModal
        visible={!!currentConflict}
        localData={currentConflict?.localData ?? null}
        serverData={currentConflict?.serverData ?? null}
        onResolve={handleResolveConflict}
        onCancel={handleCancelConflict}
        isResolving={isResolving}
      />
    </BackgroundSyncContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access background sync context
 *
 * @throws Error if used outside BackgroundSyncProvider
 *
 * @example
 * ```tsx
 * function SyncButton() {
 *   const { isSyncing, pendingCount, triggerSync } = useBackgroundSyncContext();
 *
 *   return (
 *     <Button
 *       onClick={triggerSync}
 *       loading={isSyncing}
 *       disabled={pendingCount === 0}
 *     >
 *       Sync ({pendingCount} pending)
 *     </Button>
 *   );
 * }
 * ```
 */
export function useBackgroundSyncContext(): BackgroundSyncContextValue {
  const context = useContext(BackgroundSyncContext);

  if (!context) {
    throw new Error(
      'useBackgroundSyncContext must be used within a BackgroundSyncProvider'
    );
  }

  return context;
}

export default BackgroundSyncProvider;
