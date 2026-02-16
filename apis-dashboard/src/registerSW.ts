/**
 * Service Worker Registration Module
 *
 * Handles PWA service worker registration, update detection, and lifecycle management.
 * Uses vite-plugin-pwa's virtual module for seamless Workbox integration.
 *
 * This module provides:
 * - Service worker registration with error handling
 * - Update detection with user notification callback
 * - Offline-ready state tracking
 * - Manual update application
 * - Sync-on-reconnect for offline tasks (Story 14.16)
 */
import { registerSW } from 'virtual:pwa-register';
import { syncPendingTasks, hasPendingTaskSync } from './services/taskSync';
import { isSyncRunning } from './services/backgroundSync';

/** Check if we're in development mode */
const isDev = import.meta.env.DEV;

/** Conditional logging - only logs in development mode */
function devLog(message: string, ...args: unknown[]) {
  if (isDev) {
    console.log(message, ...args);
  }
}

/** Conditional error logging - always logs errors but adds prefix */
function devError(message: string, ...args: unknown[]) {
  console.error(message, ...args);
}

/**
 * Service Worker Update State
 *
 * Tracks the current state of service worker updates and offline readiness.
 */
export interface SWUpdateState {
  /** True when a new version is available and waiting to activate */
  needRefresh: boolean;
  /** True when the app has been cached for offline use */
  offlineReady: boolean;
}

/**
 * Callback type for update state changes
 */
export type SWUpdateCallback = (state: SWUpdateState) => void;

/**
 * Callback type for registration errors
 */
export type SWErrorCallback = (error: Error) => void;

// Module-level reference to the update function
let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined;

// Interval ID for the hourly update check (for cleanup)
let updateCheckIntervalId: ReturnType<typeof setInterval> | undefined;

// Debounce timer for sync-on-reconnect (Story 14.16)
let syncDebounceTimer: ReturnType<typeof setTimeout> | undefined;

// SECURITY (S6-L6): Store event listener reference for cleanup
let onlineEventHandler: (() => void) | undefined;

/** Debounce delay for sync-on-reconnect in milliseconds */
const SYNC_DEBOUNCE_MS = 1000;

/**
 * Initialize the Service Worker
 *
 * Registers the service worker and sets up callbacks for state changes.
 * Should be called once at app startup.
 *
 * @param onUpdate - Called when the SW state changes (new version available or offline ready)
 * @param onError - Called if service worker registration fails
 *
 * @example
 * ```ts
 * initServiceWorker(
 *   (state) => {
 *     if (state.needRefresh) showUpdateNotification();
 *     if (state.offlineReady) console.log('App ready for offline use');
 *   },
 *   (error) => console.error('SW registration failed:', error)
 * );
 * ```
 */
export function initServiceWorker(
  onUpdate: SWUpdateCallback,
  onError: SWErrorCallback
): void {
  updateSW = registerSW({
    onNeedRefresh() {
      devLog('[SW] New content available, refresh needed');
      onUpdate({ needRefresh: true, offlineReady: false });
    },
    onOfflineReady() {
      devLog('[SW] App is ready to work offline');
      onUpdate({ needRefresh: false, offlineReady: true });
    },
    onRegistered(registration) {
      devLog('[SW] Service Worker registered:', registration);

      // Check for updates periodically (every hour)
      if (registration) {
        const intervalId = setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000);

        // Store interval ID for potential cleanup
        updateCheckIntervalId = intervalId;
      }
    },
    onRegisterError(error) {
      devError('[SW] Service Worker registration error:', error);
      onError(error);
    },
  });

  // Set up sync-on-reconnect handler (Story 14.16)
  setupSyncOnReconnect();
}

/**
 * Set up sync-on-reconnect handler for offline tasks
 *
 * When the browser comes back online, automatically sync any pending
 * offline task operations (creates, completions).
 *
 * Uses debouncing to prevent rapid re-triggers from flaky connections.
 *
 * Part of Epic 14, Story 14.16: Offline Task Support
 */
function setupSyncOnReconnect(): void {
  // SECURITY (S6-L6): Remove any previous handler before adding a new one
  // (prevents duplicate handlers during HMR in development)
  if (onlineEventHandler) {
    window.removeEventListener('online', onlineEventHandler);
  }

  const handleOnline = async () => {
    devLog('[SW] Network connection restored, checking for pending sync');

    // Debounce to prevent rapid re-triggers
    if (syncDebounceTimer) {
      clearTimeout(syncDebounceTimer);
    }

    syncDebounceTimer = setTimeout(async () => {
      try {
        // SECURITY (S6-H3): Check if a background sync is already running
        // (e.g., triggered by useBackgroundSync hook) to prevent race condition
        if (isSyncRunning()) {
          devLog('[SW] Background sync already in progress, skipping task sync');
          return;
        }

        // Check if there are pending items before syncing
        const hasPending = await hasPendingTaskSync();
        if (hasPending) {
          devLog('[SW] Pending task sync items found, starting sync');
          await syncPendingTasks();
        } else {
          devLog('[SW] No pending task sync items');
        }
      } catch (err) {
        devError('[SW] Error during sync-on-reconnect:', err);
      }
    }, SYNC_DEBOUNCE_MS);
  };

  window.addEventListener('online', handleOnline);
  onlineEventHandler = handleOnline;

  devLog('[SW] Sync-on-reconnect handler registered');
}

/**
 * Apply the pending Service Worker update
 *
 * Activates the waiting service worker and reloads the page to use the new version.
 * Only works if there's a pending update (needRefresh is true).
 *
 * @param reload - Whether to reload the page after update (default: true)
 *
 * @example
 * ```ts
 * // In an update notification component
 * <Button onClick={() => applyUpdate()}>Refresh to Update</Button>
 * ```
 */
export function applyUpdate(reload: boolean = true): void {
  if (updateSW) {
    updateSW(reload);
  } else {
    devLog('[SW] No update function available - service worker may not be registered');
  }
}

/**
 * Cleanup the Service Worker update check interval
 *
 * Call this when the application is being torn down to prevent memory leaks.
 * In most cases, this is not needed as the interval runs for the lifetime of the app.
 *
 * **Use Cases:**
 * - Micro-frontend unmounting from a parent shell
 * - Test cleanup in integration tests
 * - Hot module replacement during development
 *
 * **Note:** This is intentionally exported but rarely called in production.
 * The hourly update check interval is typically desired for the app lifetime.
 *
 * @example
 * ```ts
 * // In test cleanup
 * afterEach(() => {
 *   cleanupServiceWorker();
 * });
 *
 * // In micro-frontend unmount
 * window.addEventListener('beforeunload', cleanupServiceWorker);
 * ```
 */
export function cleanupServiceWorker(): void {
  if (updateCheckIntervalId) {
    clearInterval(updateCheckIntervalId);
    updateCheckIntervalId = undefined;
    devLog('[SW] Update check interval cleared');
  }

  // SECURITY (S6-L6): Remove the online event listener to prevent memory leaks
  // during HMR in development or micro-frontend unmounting
  if (onlineEventHandler) {
    window.removeEventListener('online', onlineEventHandler);
    onlineEventHandler = undefined;
    devLog('[SW] Online event handler removed');
  }

  // Clear any pending sync debounce timer
  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = undefined;
  }
}
