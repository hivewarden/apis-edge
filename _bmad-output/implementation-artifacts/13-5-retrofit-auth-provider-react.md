# Story 13.5: Retrofit Auth Provider (React)

Status: done

## Story

As a frontend developer,
I want the auth provider to support both local and Zitadel authentication,
so that the dashboard works correctly in both deployment modes.

## Acceptance Criteria

1. **Mode Detection:** Fetch `/api/auth/config` on app init, cache result
2. **Auth Provider Abstraction:** Interface with `login()`, `logout()`, `getIdentity()`, `checkAuth()`
3. **Local Mode Provider:** POST /api/auth/login with credentials, session cookie auth
4. **SaaS Mode Provider:** Zitadel OIDC redirect flow (preserve existing behavior)
5. **Refine Integration:** Export provider compatible with Refine's authProvider interface

## Tasks / Subtasks

- [x] **Task 1: Add AUTH_MODE to config and create auth config types** (AC: #1)
  - [x] 1.1: Update `apis-dashboard/src/config.ts` to add AUTH_MODE detection
  - [x] 1.2: Create `apis-dashboard/src/types/auth.ts` with AuthConfig and AuthMode types
  - [x] 1.3: Create async function `fetchAuthConfig()` that calls GET /api/auth/config
  - [x] 1.4: Add caching to prevent repeated API calls (store in memory + sessionStorage)

- [x] **Task 2: Create auth provider abstraction interface** (AC: #2, #5)
  - [x] 2.1: Create `apis-dashboard/src/providers/authProvider.ts` (rename existing to zitadelAuthProvider.ts)
  - [x] 2.2: Define IAuthProvider interface with: login, logout, checkAuth, getIdentity, getPermissions, onError
  - [x] 2.3: Define login params type: `{ email: string; password: string; rememberMe?: boolean }` for local mode

- [x] **Task 3: Create local auth provider** (AC: #3)
  - [x] 3.1: Create `apis-dashboard/src/providers/localAuthProvider.ts`
  - [x] 3.2: Implement login(): POST /api/auth/login with credentials, handle session cookie
  - [x] 3.3: Implement logout(): POST /api/auth/logout, clear any local state
  - [x] 3.4: Implement checkAuth(): GET /api/auth/me to verify session validity
  - [x] 3.5: Implement getIdentity(): Return user from /api/auth/me response
  - [x] 3.6: Implement getPermissions(): Return role from user object
  - [x] 3.7: Implement onError(): Handle 401/403 appropriately

- [x] **Task 4: Refactor existing Zitadel auth provider** (AC: #4)
  - [x] 4.1: Rename `apis-dashboard/src/providers/authProvider.ts` to `zitadelAuthProvider.ts`
  - [x] 4.2: Update exports to use new filename
  - [x] 4.3: Implement IAuthProvider interface for type safety
  - [x] 4.4: Preserve all existing Zitadel OIDC functionality

- [x] **Task 5: Create mode-aware Refine auth provider** (AC: #2, #5)
  - [x] 5.1: Refactor `apis-dashboard/src/providers/refineAuthProvider.ts` to be mode-aware
  - [x] 5.2: Import both localAuthProvider and zitadelAuthProvider
  - [x] 5.3: Create factory function `createAuthProvider(mode: AuthMode): AuthProvider`
  - [x] 5.4: Replace DEV_MODE logic with auth mode detection
  - [x] 5.5: Ensure Refine AuthProvider interface compliance

- [x] **Task 6: Update providers index** (AC: #5)
  - [x] 6.1: Update `apis-dashboard/src/providers/index.ts` with new exports
  - [x] 6.2: Export fetchAuthConfig, AuthMode, AuthConfig types
  - [x] 6.3: Export createAuthProvider factory
  - [x] 6.4: Maintain backward compatibility for zitadelAuth, userManager exports

- [x] **Task 7: Write unit tests** (AC: #1, #2, #3, #4, #5)
  - [x] 7.1: Create `apis-dashboard/tests/providers/authConfig.test.ts`
  - [x] 7.2: Create `apis-dashboard/tests/providers/localAuthProvider.test.ts`
  - [x] 7.3: Create `apis-dashboard/tests/providers/refineAuthProvider.test.ts`
  - [x] 7.4: Test mode detection from /api/auth/config
  - [x] 7.5: Test local mode login/logout/checkAuth flow
  - [x] 7.6: Test SaaS mode preserves existing behavior
  - [x] 7.7: Test getIdentity returns user in both modes

## Dev Notes

### Architecture Compliance

**Package Structure (from CLAUDE.md):**
- Providers stay in `apis-dashboard/src/providers/`
- Types go in `apis-dashboard/src/types/`
- Tests go in `apis-dashboard/tests/providers/` (not co-located)
- PascalCase components, camelCase hooks/utils

**TypeScript Patterns:**
- Use interfaces for provider contracts
- Use type-only imports where possible
- Export types from barrel files

### Current Implementation Analysis

**Current `providers/authProvider.ts` (will become zitadelAuthProvider.ts):**
- Uses `@zitadel/react` SDK with `createZitadelAuth()`
- Exports: `zitadelAuth`, `userManager`, `loginWithReturnTo()`
- Config from `ZITADEL_AUTHORITY`, `ZITADEL_CLIENT_ID`
- OIDC redirect flow with PKCE

**Current `providers/refineAuthProvider.ts`:**
- Implements Refine's `AuthProvider` interface
- DEV_MODE bypass (VITE_DEV_MODE=true skips auth)
- Methods: login, logout, check, getIdentity, onError, getPermissions
- DEV_USER mock: `{ id, name, email, avatar }`

**Current `config.ts`:**
```typescript
export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
export const ZITADEL_AUTHORITY = import.meta.env.VITE_ZITADEL_AUTHORITY || "http://localhost:8080";
export const ZITADEL_CLIENT_ID = import.meta.env.VITE_ZITADEL_CLIENT_ID || "";
export const DEV_MODE = import.meta.env.VITE_DEV_MODE === "true";
```

### Auth Config API Response (from Story 13.2)

**GET /api/auth/config (public endpoint):**

Local mode response:
```json
{
  "mode": "local",
  "setup_required": true  // or false if admin exists
}
```

SaaS mode response:
```json
{
  "mode": "zitadel",
  "zitadel_authority": "https://zitadel.example.com",
  "zitadel_client_id": "123456789012345678"
}
```

### Local Auth Flow (Stories 13.7, 13.8)

**POST /api/auth/login:**
- Request: `{ email: string, password: string, remember_me?: boolean }`
- Success Response: `{ user: { id, email, name, role, tenant_id } }`
- Sets `apis_session` HttpOnly cookie with JWT
- Rate limited: 5/email/15min

**POST /api/auth/logout:**
- Clears `apis_session` cookie
- Response: `{ success: true }`

**GET /api/auth/me:**
- Requires valid session cookie
- Response: `{ user: { id, email, name, role, tenant_id } }`
- 401 if no valid session

### Key Implementation Details

**Auth Mode Detection Strategy:**
```typescript
// apis-dashboard/src/types/auth.ts
export type AuthMode = 'local' | 'zitadel';

export interface AuthConfigLocal {
  mode: 'local';
  setup_required: boolean;
}

export interface AuthConfigZitadel {
  mode: 'zitadel';
  zitadel_authority: string;
  zitadel_client_id: string;
}

export type AuthConfig = AuthConfigLocal | AuthConfigZitadel;
```

**Config Fetch with Caching:**
```typescript
// apis-dashboard/src/config.ts
let authConfigCache: AuthConfig | null = null;

export async function fetchAuthConfig(): Promise<AuthConfig> {
  // Check cache first
  if (authConfigCache) return authConfigCache;

  // Check sessionStorage for persistence across page reloads
  const cached = sessionStorage.getItem('apis_auth_config');
  if (cached) {
    authConfigCache = JSON.parse(cached);
    return authConfigCache;
  }

  // Fetch from API
  const response = await fetch(`${API_URL}/auth/config`);
  if (!response.ok) {
    throw new Error('Failed to fetch auth config');
  }

  authConfigCache = await response.json();
  sessionStorage.setItem('apis_auth_config', JSON.stringify(authConfigCache));
  return authConfigCache;
}
```

**Local Auth Provider Pattern:**
```typescript
// apis-dashboard/src/providers/localAuthProvider.ts
import type { AuthProvider } from "@refinedev/core";
import { API_URL } from "../config";

export const localAuthProvider: AuthProvider = {
  login: async ({ email, password, rememberMe }) => {
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',  // Important for cookies
        body: JSON.stringify({ email, password, remember_me: rememberMe }),
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          error: { name: 'LoginError', message: error.error || 'Invalid credentials' },
        };
      }

      return { success: true, redirectTo: '/' };
    } catch (error) {
      return {
        success: false,
        error: { name: 'NetworkError', message: 'Failed to connect to server' },
      };
    }
  },

  logout: async () => {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    return { success: true, redirectTo: '/login' };
  },

  check: async () => {
    try {
      const response = await fetch(`${API_URL}/auth/me`, {
        credentials: 'include',
      });
      if (response.ok) {
        return { authenticated: true };
      }
      return { authenticated: false, redirectTo: '/login', logout: true };
    } catch {
      return { authenticated: false, redirectTo: '/login', logout: true };
    }
  },

  getIdentity: async () => {
    try {
      const response = await fetch(`${API_URL}/auth/me`, {
        credentials: 'include',
      });
      if (!response.ok) return null;
      const { user } = await response.json();
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: undefined,
      };
    } catch {
      return null;
    }
  },

  onError: async (error) => {
    if (error?.statusCode === 401 || error?.status === 401) {
      return { logout: true, redirectTo: '/login' };
    }
    if (error?.statusCode === 403 || error?.status === 403) {
      return { error: { name: 'Forbidden', message: 'Access denied' } };
    }
    return {};
  },

  getPermissions: async () => {
    try {
      const response = await fetch(`${API_URL}/auth/me`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      const { user } = await response.json();
      return [user.role];  // ['admin'] or ['member']
    } catch {
      return [];
    }
  },
};
```

**Mode-Aware Factory:**
```typescript
// apis-dashboard/src/providers/refineAuthProvider.ts
import type { AuthProvider } from "@refinedev/core";
import { localAuthProvider } from "./localAuthProvider";
import { zitadelAuthProvider } from "./zitadelAuthProvider";
import type { AuthMode } from "../types/auth";

export function createAuthProvider(mode: AuthMode): AuthProvider {
  return mode === 'local' ? localAuthProvider : zitadelAuthProvider;
}

// For backward compatibility during transition
export { localAuthProvider, zitadelAuthProvider };
```

### Backward Compatibility

**Must preserve for existing code:**
- `zitadelAuth` and `userManager` exports from providers/index.ts
- `loginWithReturnTo()` function for Zitadel redirect
- DEV_MODE bypass (can coexist with local mode)

**DEV_MODE vs Local Mode:**
- DEV_MODE (VITE_DEV_MODE=true): Bypasses ALL auth, uses mock user
- Local mode (AUTH_MODE=local): Real auth with email/password, actual API calls
- DEV_MODE should continue to work for development without running auth services

### Cookie Handling

**Critical for local auth:**
- Use `credentials: 'include'` on all fetch calls
- Server sets `apis_session` cookie with HttpOnly, Secure, SameSite=Strict
- Cookie-based auth eliminates need to manage tokens in frontend

### Error Handling

**Login errors from API:**
- 401: Invalid credentials
- 429: Rate limited (show retry time)
- 500: Server error

**Standard error response format:**
```json
{
  "error": "Invalid credentials",
  "code": 401
}
```

### Testing Strategy

**Unit tests should mock:**
- `fetch` calls to /api/auth/* endpoints
- sessionStorage for config caching
- Zitadel SDK for SaaS mode tests

**Test scenarios:**
1. Mode detection: local vs zitadel based on /api/auth/config
2. Local login: success, invalid credentials, rate limited
3. Local logout: clears session
4. Local checkAuth: valid session vs expired
5. SaaS mode: existing behavior preserved
6. Config caching: sessionStorage persists across calls

### Previous Story Learnings (13.4)

From Story 13.4 implementation:
- Claims struct has both `OrgID` and `TenantID` fields (both populated with same value)
- Local mode uses `tenant_id` from JWT, SaaS uses `org_id` from Zitadel
- Backward compatibility maintained by mirroring fields
- Error responses use consistent JSON format: `{ error, code }`

### Project Structure Notes

**Files to Create:**
- `apis-dashboard/src/types/auth.ts` - Auth type definitions
- `apis-dashboard/src/providers/localAuthProvider.ts` - Local mode provider
- `apis-dashboard/tests/providers/authConfig.test.ts` - Config tests
- `apis-dashboard/tests/providers/localAuthProvider.test.ts` - Local provider tests
- `apis-dashboard/tests/providers/refineAuthProvider.test.ts` - Mode-aware provider tests

**Files to Modify:**
- `apis-dashboard/src/config.ts` - Add fetchAuthConfig()
- `apis-dashboard/src/providers/authProvider.ts` - Rename to zitadelAuthProvider.ts
- `apis-dashboard/src/providers/refineAuthProvider.ts` - Make mode-aware
- `apis-dashboard/src/providers/index.ts` - Update exports

**Naming Convention:**
- `authProvider.ts` -> `zitadelAuthProvider.ts` (specific to Zitadel)
- `localAuthProvider.ts` (specific to local mode)
- `refineAuthProvider.ts` (mode-aware factory, integrates with Refine)

### References

- [Source: apis-dashboard/src/providers/authProvider.ts - Current Zitadel provider]
- [Source: apis-dashboard/src/providers/refineAuthProvider.ts - Current Refine auth provider]
- [Source: apis-dashboard/src/config.ts - Current config]
- [Source: _bmad-output/planning-artifacts/epic-13-dual-auth-mode.md - Story 13.5 requirements]
- [Source: _bmad-output/planning-artifacts/architecture.md - Auth patterns and API contracts]
- [Source: _bmad-output/implementation-artifacts/13-4-retrofit-tenant-middleware.md - Previous story context]
- [Source: CLAUDE.md - TypeScript patterns and project conventions]

## Test Criteria

- [x] Local mode uses email/password flow (POST /api/auth/login)
- [x] Local mode login sets session cookie and returns user
- [x] Local mode logout clears session (POST /api/auth/logout)
- [x] Local mode checkAuth validates session via GET /api/auth/me
- [x] SaaS mode uses OIDC redirect (existing Zitadel flow)
- [x] SaaS mode preserves all existing functionality
- [x] getIdentity returns user { id, name, email, avatar } in both modes
- [x] getPermissions returns roles array in both modes
- [x] logout clears session in both modes
- [x] Mode detection fetches /api/auth/config on app init
- [x] Config is cached in memory and sessionStorage
- [x] onError handles 401 (logout) and 403 (forbidden) correctly
- [x] DEV_MODE bypass still works for development

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

None

### Completion Notes List

- Implemented dual-mode authentication provider supporting both local (email/password) and Zitadel (OIDC) authentication
- Created auth config fetching with memory + sessionStorage caching for persistence across page reloads
- Renamed authProvider.ts to zitadelAuthProvider.ts and preserved all existing OIDC functionality
- Created localAuthProvider.ts implementing Refine AuthProvider interface with cookie-based auth
- Updated refineAuthProvider.ts with createAuthProvider(mode) factory function
- DEV_MODE bypass continues to work independently of auth mode
- Updated apiClient to support both cookie-based (local) and Bearer token (Zitadel) authentication
- Updated AuthGuard component to import from new zitadelAuthProvider path
- Updated useAuth hook import path
- Created comprehensive test suites: 14 tests for authConfig, 23 tests for localAuthProvider, 13 tests for refineAuthProvider
- All 67 auth/provider tests pass
- Backward compatibility maintained for existing zitadelAuth, userManager, loginWithReturnTo exports

### File List

**Files Created:**
- apis-dashboard/src/types/auth.ts
- apis-dashboard/src/providers/localAuthProvider.ts
- apis-dashboard/src/providers/zitadelAuthProvider.ts
- apis-dashboard/tests/providers/authConfig.test.ts
- apis-dashboard/tests/providers/localAuthProvider.test.ts
- apis-dashboard/tests/providers/refineAuthProvider.test.ts

**Files Modified:**
- apis-dashboard/src/config.ts (added fetchAuthConfig, clearAuthConfigCache, getAuthConfigSync)
- apis-dashboard/src/types/index.ts (added auth type exports)
- apis-dashboard/src/providers/refineAuthProvider.ts (added createAuthProvider factory)
- apis-dashboard/src/providers/index.ts (updated exports for dual-mode auth)
- apis-dashboard/src/providers/apiClient.ts (added mode-aware auth handling)
- apis-dashboard/src/hooks/useAuth.ts (updated import path)
- apis-dashboard/src/components/auth/AuthGuard.tsx (updated import path)
- apis-dashboard/tests/auth/AuthGuard.test.tsx (updated mock path)

**Files Deleted:**
- apis-dashboard/src/providers/authProvider.ts (renamed to zitadelAuthProvider.ts)

## Change Log

- 2026-01-27: Implemented Story 13.5 - Dual-mode authentication provider supporting local and Zitadel modes
- 2026-01-27: Remediation: Fixed 9 issues from code review (2 Critical, 3 High, 2 Medium, 1 Low)
