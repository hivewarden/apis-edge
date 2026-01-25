/**
 * Mock for vite-plugin-pwa's virtual:pwa-register module
 *
 * This is used during testing to avoid the virtual import
 * which only works during the Vite build process.
 *
 * The mock stores callbacks and provides helper functions
 * to simulate service worker events for realistic testing.
 */

type RegisterSWOptions = {
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
  onRegistered?: (registration?: ServiceWorkerRegistration) => void;
  onRegisterError?: (error: Error) => void;
};

// Store the latest registered callbacks for test access
let currentCallbacks: RegisterSWOptions = {};

/**
 * Mock registerSW function
 *
 * Stores callbacks and returns a mock update function.
 * Test code can use the helper functions below to trigger callbacks.
 */
export function registerSW(options?: RegisterSWOptions) {
  // Store callbacks for later invocation by tests
  currentCallbacks = options || {};

  // Simulate successful registration by default
  if (options?.onRegistered) {
    // Use setTimeout to simulate async registration
    setTimeout(() => {
      options.onRegistered?.(undefined);
    }, 0);
  }

  // Return a mock update function
  return async (_reloadPage?: boolean) => {
    // No-op in tests - real implementation would reload
  };
}

/**
 * Simulate a new version being available
 * Call this in tests to trigger the onNeedRefresh callback
 */
export function __triggerNeedRefresh() {
  currentCallbacks.onNeedRefresh?.();
}

/**
 * Simulate the app being ready for offline use
 * Call this in tests to trigger the onOfflineReady callback
 */
export function __triggerOfflineReady() {
  currentCallbacks.onOfflineReady?.();
}

/**
 * Simulate a registration error
 * Call this in tests to trigger the onRegisterError callback
 */
export function __triggerRegisterError(error: Error) {
  currentCallbacks.onRegisterError?.(error);
}

/**
 * Reset the mock state between tests
 * Call this in beforeEach/afterEach to ensure clean state
 */
export function __resetMock() {
  currentCallbacks = {};
}

/**
 * Get the current callbacks for inspection
 */
export function __getCallbacks() {
  return currentCallbacks;
}
