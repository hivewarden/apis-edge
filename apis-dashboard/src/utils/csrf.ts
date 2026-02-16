/**
 * CSRF Protection Utilities
 *
 * Implements CSRF token management for local authentication mode.
 * The server sets a CSRF token cookie on successful login, and the client
 * must include this token in the X-CSRF-Token header for state-changing requests.
 *
 * SECURITY (AUTH-001-7-DASH): Prevents Cross-Site Request Forgery attacks by
 * ensuring requests originate from our application, not malicious sites.
 *
 * How it works:
 * 1. Server sets httpOnly=false CSRF cookie on login (accessible via JS)
 * 2. Client reads cookie and includes in X-CSRF-Token header
 * 3. Server validates header matches cookie value
 * 4. This works because malicious sites can trigger cookies but can't read them
 *
 * @module utils/csrf
 */

/**
 * CSRF token cookie name.
 * Must match the server-side cookie name.
 */
const CSRF_COOKIE_NAME = 'apis_csrf_token';

/**
 * CSRF header name for sending token in requests.
 * Must match the server-side expected header.
 */
export const CSRF_HEADER_NAME = 'X-CSRF-Token';

/**
 * Get the CSRF token from cookies.
 *
 * The token is set by the server as a non-httpOnly cookie (readable by JS)
 * during login. We read it here to include in subsequent requests.
 *
 * @returns The CSRF token or null if not found
 *
 * @example
 * ```ts
 * const token = getCsrfToken();
 * if (token) {
 *   headers['X-CSRF-Token'] = token;
 * }
 * ```
 */
export function getCsrfToken(): string | null {
  try {
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === CSRF_COOKIE_NAME && value) {
        return decodeURIComponent(value);
      }
    }
  } catch {
    // Cookie access may fail in some contexts
  }
  return null;
}

/**
 * Check if CSRF protection is available.
 *
 * Returns true if a CSRF token cookie exists, indicating the user
 * has logged in via local auth and CSRF protection is active.
 *
 * @returns True if CSRF token is available
 */
export function hasCsrfToken(): boolean {
  return getCsrfToken() !== null;
}

/**
 * Create headers object with CSRF token included.
 *
 * Use this when making state-changing requests (POST, PUT, DELETE)
 * in local auth mode.
 *
 * @param additionalHeaders - Optional headers to merge
 * @returns Headers object with CSRF token
 *
 * @example
 * ```ts
 * const response = await fetch('/api/data', {
 *   method: 'POST',
 *   headers: getCsrfHeaders({ 'Content-Type': 'application/json' }),
 *   body: JSON.stringify(data),
 * });
 * ```
 */
export function getCsrfHeaders(
  additionalHeaders: Record<string, string> = {}
): Record<string, string> {
  const token = getCsrfToken();
  const headers = { ...additionalHeaders };

  if (token) {
    headers[CSRF_HEADER_NAME] = token;
  }

  return headers;
}

/**
 * Clear CSRF token (called on logout).
 *
 * Note: The actual cookie deletion should be done server-side.
 * This is just for client-side state management.
 *
 * SECURITY (S4-L3): Attempts both with and without the Secure flag to ensure
 * the cookie is cleared regardless of how it was set by the server.
 */
export function clearCsrfToken(): void {
  // Client can't delete httpOnly=false cookies directly,
  // but we can set an expired cookie to clear it
  try {
    // Clear without Secure flag (for HTTP / development)
    document.cookie = `${CSRF_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Strict`;
    // Clear with Secure flag (for HTTPS / production) -- ensures deletion
    // matches the cookie attributes if the server set it with Secure
    document.cookie = `${CSRF_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Strict; Secure`;
  } catch {
    // Ignore cookie deletion errors
  }
}
