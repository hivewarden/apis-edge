/**
 * Error Sanitization Utility
 *
 * Sanitizes error objects and messages to prevent sensitive data exposure
 * in console logs, error reporting, and debugging output.
 *
 * SECURITY: This utility redacts tokens, API keys, and other sensitive
 * patterns that might be exposed through error messages or stack traces.
 *
 * Part of AUTH-001-6-DASH remediation.
 */

/**
 * Patterns that indicate sensitive data which should be redacted.
 * These patterns match common token and credential formats.
 */
const SENSITIVE_PATTERNS: RegExp[] = [
  // JWT tokens (header.payload.signature format)
  /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,

  // Bearer tokens in headers
  /Bearer\s+[A-Za-z0-9_-]+/gi,

  // Authorization header values
  /Authorization['":\s]+[A-Za-z0-9_-]+/gi,

  // API keys (common patterns)
  /api[_-]?key['":\s]+[A-Za-z0-9_-]+/gi,
  /apikey['":\s]+[A-Za-z0-9_-]+/gi,

  // Access tokens
  /access[_-]?token['":\s]+[A-Za-z0-9_-]+/gi,

  // Refresh tokens
  /refresh[_-]?token['":\s]+[A-Za-z0-9_-]+/gi,

  // Session tokens/IDs
  /session[_-]?(?:id|token)['":\s]+[A-Za-z0-9_-]+/gi,

  // Generic token patterns
  /token['":\s]+[A-Za-z0-9_-]{20,}/gi,

  // OAuth tokens (common prefixes)
  /gho_[A-Za-z0-9_-]+/g, // GitHub OAuth
  /ghp_[A-Za-z0-9_-]+/g, // GitHub Personal Access Token
  /sk-[A-Za-z0-9_-]+/g, // OpenAI-style keys

  // OpenBao/Vault tokens
  /hvs\.[A-Za-z0-9_-]+/g, // HashiCorp Vault/OpenBao tokens

  // Password patterns in URLs
  /:[^:@\s]+@/g, // password in user:password@host format
];

/**
 * Replacement text for redacted sensitive data.
 */
const REDACTED = '[REDACTED]';

/**
 * Sanitize a string by redacting sensitive patterns.
 *
 * @param input - The string to sanitize
 * @returns The sanitized string with sensitive data redacted
 *
 * @example
 * ```typescript
 * const message = "Failed with token: eyJhbGciOiJIUzI1...";
 * console.log(sanitizeString(message));
 * // Output: "Failed with token: [REDACTED]"
 * ```
 */
export function sanitizeString(input: string): string {
  if (!input || typeof input !== 'string') {
    return input;
  }

  let sanitized = input;
  for (const pattern of SENSITIVE_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    sanitized = sanitized.replace(pattern, REDACTED);
  }

  return sanitized;
}

/**
 * Sanitize an error object for safe logging.
 *
 * Creates a new error-like object with sanitized message and redacted
 * stack trace (in production). Does not modify the original error.
 *
 * @param error - The error to sanitize (can be Error, string, or unknown)
 * @returns A sanitized error representation
 *
 * @example
 * ```typescript
 * try {
 *   await apiCall();
 * } catch (error) {
 *   console.error('API failed:', sanitizeError(error));
 * }
 * ```
 */
export function sanitizeError(error: unknown): { message: string; name: string; stack?: string } {
  // Handle null/undefined
  if (error == null) {
    return { message: 'Unknown error', name: 'Error' };
  }

  // Handle string errors
  if (typeof error === 'string') {
    return {
      message: sanitizeString(error),
      name: 'Error',
    };
  }

  // Handle Error objects
  if (error instanceof Error) {
    const sanitized: { message: string; name: string; stack?: string } = {
      message: sanitizeString(error.message),
      name: error.name,
    };

    // In production, omit stack trace entirely to prevent information leakage
    // In development, sanitize the stack trace
    if (import.meta.env.DEV && error.stack) {
      sanitized.stack = sanitizeString(error.stack);
    }

    return sanitized;
  }

  // Handle objects with message property (e.g., axios errors)
  if (typeof error === 'object' && 'message' in error) {
    const errorObj = error as { message?: unknown; name?: unknown; stack?: unknown };
    return {
      message: sanitizeString(String(errorObj.message ?? 'Unknown error')),
      name: String(errorObj.name ?? 'Error'),
      stack: import.meta.env.DEV && errorObj.stack ? sanitizeString(String(errorObj.stack)) : undefined,
    };
  }

  // Fallback for other types
  return {
    message: 'Unknown error',
    name: 'Error',
  };
}

/**
 * Create a safe console logger that sanitizes all output.
 *
 * Use this for logging in auth-related code to prevent accidental
 * token exposure.
 *
 * @example
 * ```typescript
 * import { safeConsole } from './utils/sanitizeError';
 *
 * safeConsole.error('Auth failed:', error);
 * safeConsole.warn('Token refresh issue:', details);
 * ```
 */
export const safeConsole = {
  log: (...args: unknown[]) => {
    console.log(...args.map((arg) => (typeof arg === 'string' ? sanitizeString(arg) : arg)));
  },
  warn: (...args: unknown[]) => {
    console.warn(...args.map((arg) => (typeof arg === 'string' ? sanitizeString(arg) : arg)));
  },
  error: (...args: unknown[]) => {
    // For errors, apply full sanitization
    console.error(
      ...args.map((arg) => {
        if (typeof arg === 'string') return sanitizeString(arg);
        if (arg instanceof Error || (typeof arg === 'object' && arg !== null && 'message' in arg)) {
          return sanitizeError(arg);
        }
        return arg;
      })
    );
  },
  debug: (...args: unknown[]) => {
    // Only in development
    if (import.meta.env.DEV) {
      console.debug(...args.map((arg) => (typeof arg === 'string' ? sanitizeString(arg) : arg)));
    }
  },
};

export default sanitizeError;
