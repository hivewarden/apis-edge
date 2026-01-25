/**
 * Online Status Hook
 *
 * React hook for detecting and reacting to network connectivity changes.
 * Uses the modern useSyncExternalStore pattern for optimal performance
 * and concurrent mode compatibility.
 *
 * @module hooks/useOnlineStatus
 */
import { useSyncExternalStore } from 'react';

/**
 * Subscribe to online/offline events
 *
 * Internal function that sets up event listeners for connectivity changes.
 * Returns a cleanup function per useSyncExternalStore contract.
 */
function subscribe(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);

  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

/**
 * Get current online status (client-side)
 *
 * Returns the current value of navigator.onLine.
 * Note: This reflects the browser's perspective on connectivity,
 * which may not always match actual server reachability.
 */
function getSnapshot(): boolean {
  return navigator.onLine;
}

/**
 * Get online status for SSR (server-side)
 *
 * Returns true during server-side rendering as we can't
 * know the client's connectivity status on the server.
 */
function getServerSnapshot(): boolean {
  return true;
}

/**
 * Hook to track online/offline status
 *
 * Returns a boolean indicating whether the browser believes
 * it has network connectivity. Automatically updates when
 * the connection status changes.
 *
 * @returns {boolean} true if online, false if offline
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const isOnline = useOnlineStatus();
 *
 *   if (!isOnline) {
 *     return <div>You are offline</div>;
 *   }
 *
 *   return <div>You are online</div>;
 * }
 * ```
 *
 * @remarks
 * This hook uses `navigator.onLine` which can have false positives
 * (returning true when actually offline). For critical operations,
 * consider also checking actual API connectivity.
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export default useOnlineStatus;
