/**
 * URL Validation Utilities
 *
 * Provides secure URL validation to prevent XSS and other URL-based attacks.
 * Used for validating image URLs, redirect URLs, and other user-provided URLs.
 *
 * Security: XSS-001-3, CSRF-001-2 remediation
 */

/** Placeholder image for invalid URLs */
const PLACEHOLDER_IMAGE = 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27320%27 height=%27240%27 fill=%27%23fcd483%27%3E%3Crect width=%27320%27 height=%27240%27/%3E%3Ctext x=%2750%25%27 y=%2750%25%27 dominant-baseline=%27middle%27 text-anchor=%27middle%27 fill=%27%23662604%27 font-family=%27system-ui%27 font-size=%2714%27%3EImage unavailable%3C/text%3E%3C/svg%3E';

/**
 * Validates if an image URL is safe to use.
 *
 * Only allows:
 * - Same-origin URLs (relative paths starting with /)
 * - URLs starting with /api/ or /uploads/ (backend-served content)
 * - Data URLs for SVG placeholders (data:image/svg+xml)
 * - Blob URLs (blob:) for local file handling
 *
 * Blocks:
 * - External URLs (could be used for tracking or malicious content)
 * - JavaScript URLs (javascript:)
 * - Data URLs that aren't SVG images
 *
 * @param url - The URL to validate
 * @returns true if the URL is safe to use as an image source
 *
 * @example
 * ```ts
 * isValidImageUrl('/api/clips/123/thumbnail') // true
 * isValidImageUrl('/uploads/photos/abc.jpg') // true
 * isValidImageUrl('https://evil.com/track.gif') // false
 * isValidImageUrl('javascript:alert(1)') // false
 * ```
 */
export function isValidImageUrl(url: string | undefined | null): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  const trimmed = url.trim();

  // Block empty strings
  if (trimmed.length === 0) {
    return false;
  }

  // Block javascript: URLs (XSS vector)
  if (trimmed.toLowerCase().startsWith('javascript:')) {
    return false;
  }

  // Block vbscript: URLs (IE XSS vector)
  if (trimmed.toLowerCase().startsWith('vbscript:')) {
    return false;
  }

  // Allow data:image/svg+xml for safe SVG placeholders
  if (trimmed.startsWith('data:image/svg+xml')) {
    return true;
  }

  // Block other data: URLs (could contain malicious content)
  if (trimmed.toLowerCase().startsWith('data:')) {
    return false;
  }

  // Allow blob: URLs (used for local file handling)
  if (trimmed.startsWith('blob:')) {
    return true;
  }

  // Allow relative paths starting with /
  if (trimmed.startsWith('/')) {
    // Extra check: ensure it's a valid path (no protocol injection)
    if (trimmed.startsWith('//')) {
      // Protocol-relative URL - could load from external domain
      return false;
    }
    return true;
  }

  // Block all absolute URLs (http://, https://, etc.)
  // This prevents loading images from external domains
  try {
    const parsed = new URL(trimmed, window.location.origin);
    // Only allow if it's same origin
    return parsed.origin === window.location.origin;
  } catch {
    // Invalid URL format
    return false;
  }
}

/**
 * Returns a safe image URL, falling back to placeholder if invalid.
 *
 * @param url - The URL to validate
 * @param fallback - Optional custom fallback URL (must also be valid)
 * @returns The original URL if valid, otherwise the fallback/placeholder
 *
 * @example
 * ```ts
 * getSafeImageUrl('/api/clips/123/thumbnail') // '/api/clips/123/thumbnail'
 * getSafeImageUrl('https://evil.com/track.gif') // placeholder SVG
 * ```
 */
export function getSafeImageUrl(url: string | undefined | null, fallback?: string): string {
  if (isValidImageUrl(url)) {
    return url!;
  }

  if (fallback && isValidImageUrl(fallback)) {
    return fallback;
  }

  return PLACEHOLDER_IMAGE;
}

/**
 * Validates if a redirect URL is safe (same-origin only).
 *
 * Used for auth flows to prevent open redirect attacks.
 * Only allows:
 * - Relative paths starting with /
 * - Absolute URLs with same origin
 *
 * @param url - The redirect URL to validate
 * @returns true if the redirect URL is safe
 *
 * @example
 * ```ts
 * isValidRedirectUrl('/dashboard') // true
 * isValidRedirectUrl('https://example.com/callback') // true (if same origin)
 * isValidRedirectUrl('https://evil.com/phish') // false
 * ```
 */
export function isValidRedirectUrl(url: string | undefined | null): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  const trimmed = url.trim();

  // Block empty strings
  if (trimmed.length === 0) {
    return false;
  }

  // Block javascript: and other dangerous protocols
  const lowerUrl = trimmed.toLowerCase();
  if (lowerUrl.startsWith('javascript:') ||
      lowerUrl.startsWith('vbscript:') ||
      lowerUrl.startsWith('data:')) {
    return false;
  }

  // Allow relative paths (but not protocol-relative)
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return true;
  }

  // Block protocol-relative URLs
  if (trimmed.startsWith('//')) {
    return false;
  }

  // For absolute URLs, verify same origin
  try {
    const parsed = new URL(trimmed, window.location.origin);
    return parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Returns a safe redirect URL, falling back to default if invalid.
 *
 * @param url - The redirect URL to validate
 * @param defaultPath - Default path to use if URL is invalid (default: '/')
 * @returns The original URL if valid, otherwise the default path
 */
export function getSafeRedirectUrl(url: string | undefined | null, defaultPath = '/'): string {
  if (isValidRedirectUrl(url)) {
    return url!;
  }
  return defaultPath;
}
