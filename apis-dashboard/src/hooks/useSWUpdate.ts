/**
 * Service Worker Update Hook
 *
 * React hook for managing service worker update state.
 * Provides a simple interface for components to react to
 * available updates and trigger refresh actions.
 *
 * @module hooks/useSWUpdate
 */
import { useState, useEffect, useCallback } from 'react';
import { initServiceWorker, applyUpdate, type SWUpdateState } from '../registerSW';

/** Initial SW state - no updates, not offline ready */
const initialState: SWUpdateState = {
  needRefresh: false,
  offlineReady: false,
};

// Module-level flag to prevent multiple initializations
let isInitialized = false;
// Module-level state for sharing across hook instances
let sharedState = initialState;
// Listeners for state changes
const listeners = new Set<(state: SWUpdateState) => void>();

/**
 * Initialize service worker (called once)
 */
function ensureInitialized(): void {
  if (isInitialized) return;
  isInitialized = true;

  initServiceWorker(
    (state) => {
      sharedState = state;
      listeners.forEach((listener) => listener(state));
    },
    (error) => {
      console.error('[useSWUpdate] Service worker error:', error);
      // Reset to initial state on error - app continues in online-only mode
      sharedState = initialState;
      listeners.forEach((listener) => listener(initialState));
    }
  );
}

/**
 * Hook for service worker update state
 *
 * Returns the current update state and a function to apply updates.
 * Automatically initializes the service worker on first use.
 *
 * @returns Object containing:
 *   - needRefresh: boolean - true when a new version is available
 *   - offlineReady: boolean - true when app is cached for offline
 *   - updateServiceWorker: function - call to apply the update and reload
 *
 * @example
 * ```tsx
 * function UpdateBanner() {
 *   const { needRefresh, updateServiceWorker } = useSWUpdate();
 *
 *   if (!needRefresh) return null;
 *
 *   return (
 *     <div>
 *       New version available!
 *       <button onClick={updateServiceWorker}>Update Now</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useSWUpdate() {
  const [state, setState] = useState<SWUpdateState>(sharedState);

  useEffect(() => {
    // Initialize SW if not already done
    ensureInitialized();

    // Subscribe to state changes
    const listener = (newState: SWUpdateState) => setState(newState);
    listeners.add(listener);

    // Sync with current shared state
    setState(sharedState);

    return () => {
      listeners.delete(listener);
    };
  }, []);

  const updateServiceWorker = useCallback(() => {
    applyUpdate(true);
  }, []);

  return {
    needRefresh: state.needRefresh,
    offlineReady: state.offlineReady,
    updateServiceWorker,
  };
}

/**
 * Reset the hook's module-level state
 *
 * This is exported for testing purposes only. It resets the singleton
 * state and allows the service worker to be re-initialized.
 *
 * @internal
 */
export function __resetForTesting(): void {
  isInitialized = false;
  sharedState = initialState;
  listeners.clear();
}

export default useSWUpdate;
