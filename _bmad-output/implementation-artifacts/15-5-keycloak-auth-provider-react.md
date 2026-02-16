# Story 15.5: Keycloak Auth Provider (react-oidc-context)

Status: ready-for-dev

## Story

As a frontend developer,
I want to replace the `@zitadel/react` SDK with `react-oidc-context` and `oidc-client-ts`,
so that the dashboard SaaS auth flow authenticates against Keycloak instead of Zitadel.

## Context

This is Story 5 in Epic 15 (Keycloak Migration). Backend stories 15.1 through 15.4 are complete -- the Go server already accepts `AUTH_MODE=keycloak`, validates Keycloak JWTs, and extracts `realm_access.roles` and `org_id` claims. This story migrates the React dashboard SaaS auth provider.

**Key constraint:** `localAuthProvider` (standalone mode) must remain completely unchanged. Only the SaaS code path is affected.

**Dependency:** Story 15.1 (config/env vars) is complete. The server's `GET /api/auth/config` now returns `mode: "keycloak"` with `keycloak_authority` and `client_id` fields in SaaS mode.

## Acceptance Criteria

1. **Dependency Swap:** `@zitadel/react` removed from `package.json`; `react-oidc-context` and `oidc-client-ts` listed as direct dependencies
2. **Keycloak Auth Provider:** New `keycloakAuthProvider.ts` implements Refine `AuthProvider` interface using `UserManager` from `oidc-client-ts`
3. **PKCE S256:** OIDC configuration uses `code_challenge_method: "S256"` for PKCE
4. **In-Memory Token Storage:** Tokens stored in `InMemoryWebStorage` (no localStorage/sessionStorage) per security policy AUTH-001-1-DASH
5. **Roles Extraction:** `getPermissions()` extracts roles from `realm_access.roles` in the user profile
6. **Token Refresh:** Token renewal uses refresh tokens via `automaticSilentRenew` (not iframe-based silent refresh)
7. **Logout:** `logout()` calls `signoutRedirect()` to Keycloak end-session endpoint
8. **Config Integration:** Provider reads `VITE_KEYCLOAK_AUTHORITY` and `VITE_KEYCLOAK_CLIENT_ID` env vars, with `/api/auth/config` override
9. **Refine Provider Updated:** `refineAuthProvider.ts` imports `keycloakAuthProvider` instead of `zitadelAuthProvider`
10. **Provider Barrel Updated:** `providers/index.ts` exports updated to reference keycloak provider
11. **Config Updated:** `config.ts` env vars renamed from `VITE_ZITADEL_*` to `VITE_KEYCLOAK_*` and `isValidAuthConfig()` updated for `mode: 'keycloak'`
12. **useAuth Hook Updated:** `useAuth.ts` imports from keycloak provider instead of zitadel provider
13. **apiClient Updated:** `apiClient.ts` imports from keycloak provider, mode checks use `'keycloak'` instead of `'zitadel'`
14. **Zitadel Provider Deleted:** `zitadelAuthProvider.ts` removed
15. **localAuthProvider Unchanged:** Zero changes to `localAuthProvider.ts`
16. **TypeScript Clean:** `npx tsc --noEmit` compiles without errors
17. **Tests Updated:** Provider tests updated for keycloak mode

## Tasks / Subtasks

- [ ] **Task 1: Swap npm dependencies** (AC: #1)
  - [ ] 1.1: Run `npm remove @zitadel/react` in `apis-dashboard/`
  - [ ] 1.2: Run `npm install react-oidc-context oidc-client-ts` in `apis-dashboard/` (both as direct dependencies -- `oidc-client-ts` was previously a transitive dep of `@zitadel/react` and must now be explicit)
  - [ ] 1.3: Verify `package.json` no longer lists `@zitadel/react`, and both `react-oidc-context` and `oidc-client-ts` are in `dependencies`

- [ ] **Task 2: Create keycloakAuthProvider.ts** (AC: #2, #3, #4, #5, #6, #7, #8)
  - [ ] 2.1: Create `apis-dashboard/src/providers/keycloakAuthProvider.ts`
  - [ ] 2.2: Import `UserManager`, `InMemoryWebStorage`, `WebStorageStateStore` from `oidc-client-ts`
  - [ ] 2.3: Create `InMemoryWebStorage` singleton and `WebStorageStateStore` wrapper (same pattern as current zitadel provider)
  - [ ] 2.4: Create `clearAllAuthStorageSync()` function (same cleanup logic as current zitadel provider)
  - [ ] 2.5: Create `getKeycloakConfig()` function that reads from `getAuthConfigSync()` (mode `'keycloak'`, fields `keycloak_authority` and `client_id`), falling back to `KEYCLOAK_AUTHORITY` / `KEYCLOAK_CLIENT_ID` env vars
  - [ ] 2.6: Create `createUserManagerConfig()` function returning `UserManagerSettings`:
    - `authority`: From `getKeycloakConfig().authority` (e.g. `https://keycloak.example.com/realms/honeybee`)
    - `client_id`: From `getKeycloakConfig().clientId`
    - `redirect_uri`: `${window.location.origin}/callback`
    - `post_logout_redirect_uri`: `${window.location.origin}/login`
    - `scope`: `"openid profile email offline_access"`
    - `automaticSilentRenew`: `true`
    - `accessTokenExpiringNotificationTimeInSeconds`: `120`
    - `userStore`: `inMemoryUserStore` (the `WebStorageStateStore` wrapping `InMemoryWebStorage`)
    - `response_type`: `"code"` (authorization code flow)
  - [ ] 2.7: Create lazy-initialized `UserManager` instance with proxy pattern (same pattern as current zitadel provider for deferred initialization -- SECURITY S4-H1)
  - [ ] 2.8: Export `getUserManager()` function, `userManager` lazy proxy, and `keycloakUserManager` alias
  - [ ] 2.9: Implement `loginWithReturnTo(returnTo?: string)` function with same open-redirect validation as current zitadel provider (SECURITY CSRF-001-2)
  - [ ] 2.10: Implement `getSafeReturnToFromState(state: unknown): string` (identical logic to current)
  - [ ] 2.11: Implement `keycloakAuthProvider: AuthProvider` object:
    - `login`: Call `userManager.signinRedirect()` (OIDC redirect to Keycloak)
    - `logout`: Call `clearAllAuthStorageSync()`, `userManager.revokeTokens()`, `cleanupAllAuthData()`, then `userManager.signoutRedirect()`. On error: `userManager.removeUser()` and redirect to `/login`
    - `check`: Call `userManager.getUser()`, return `{ authenticated: true }` if user exists and not expired
    - `getIdentity`: Return `{ id: sub, name, email, avatar: picture }` from OIDC profile
    - `onError`: Handle 401 (logout+redirect) and 403 (forbidden message)
    - `getPermissions`: Extract `realm_access.roles` from user profile (see Dev Notes for claim path details)
  - [ ] 2.12: Export `keycloakAuthProvider` as default and named export

- [ ] **Task 3: Update config.ts env vars** (AC: #8, #11)
  - [ ] 3.1: Rename `ZITADEL_AUTHORITY` constant to `KEYCLOAK_AUTHORITY`, change env var from `VITE_ZITADEL_AUTHORITY` to `VITE_KEYCLOAK_AUTHORITY`
  - [ ] 3.2: Rename `ZITADEL_CLIENT_ID` constant to `KEYCLOAK_CLIENT_ID`, change env var from `VITE_ZITADEL_CLIENT_ID` to `VITE_KEYCLOAK_CLIENT_ID`
  - [ ] 3.3: Update `isValidAuthConfig()` function: change `config.mode === 'zitadel'` check to `config.mode === 'keycloak'`, and change field checks from `zitadel_authority`/`zitadel_client_id` to `keycloak_authority`/`client_id`
  - [ ] 3.4: Update all JSDoc comments referencing "Zitadel" to "Keycloak"

- [ ] **Task 4: Update refineAuthProvider.ts** (AC: #9)
  - [ ] 4.1: Change import from `zitadelAuthProvider` to `keycloakAuthProvider` (from `./keycloakAuthProvider`)
  - [ ] 4.2: Update `createAuthProvider()`: change `mode === 'local' ? localAuthProvider : zitadelAuthProvider` to `mode === 'local' ? localAuthProvider : keycloakAuthProvider`
  - [ ] 4.3: Update JSDoc: change "Zitadel OIDC" to "Keycloak OIDC", change `AuthMode` doc to `'local' | 'keycloak'`
  - [ ] 4.4: Update deprecated `authProvider` export to use `keycloakAuthProvider` instead of `zitadelAuthProvider`
  - [ ] 4.5: Update re-exports at bottom of file: replace `zitadelAuthProvider` with `keycloakAuthProvider`

- [ ] **Task 5: Update providers/index.ts barrel** (AC: #10)
  - [ ] 5.1: Replace all `zitadelAuthProvider` references with `keycloakAuthProvider`
  - [ ] 5.2: Replace `zitadelAuth` export with `keycloakUserManager` (or equivalent)
  - [ ] 5.3: Keep `userManager` export (same name, now from keycloak provider)
  - [ ] 5.4: Keep `loginWithReturnTo` export (same name, now from keycloak provider)
  - [ ] 5.5: Update comments from "Zitadel" to "Keycloak"

- [ ] **Task 6: Update useAuth.ts hook** (AC: #12)
  - [ ] 6.1: Change import of `zitadelAuth` and `userManager` from `../providers/zitadelAuthProvider` to `../providers/keycloakAuthProvider`
  - [ ] 6.2: Update `login` callback: change `authConfig?.mode === 'zitadel'` to `authConfig?.mode === 'keycloak'`
  - [ ] 6.3: Update `login` callback: replace `zitadelAuth.authorize()` with `userManager.signinRedirect()`
  - [ ] 6.4: Update `getAccessToken` callback: change mode check from `'local'` (fallthrough to Zitadel) to explicit `'keycloak'` handling
  - [ ] 6.5: Update all JSDoc comments from "Zitadel" to "Keycloak"

- [ ] **Task 7: Update apiClient.ts** (AC: #13)
  - [ ] 7.1: Change import from `./zitadelAuthProvider` to `./keycloakAuthProvider`
  - [ ] 7.2: Update request interceptor: change `VITE_ZITADEL_AUTHORITY` / `VITE_ZITADEL_CLIENT_ID` env var checks to `VITE_KEYCLOAK_AUTHORITY` / `VITE_KEYCLOAK_CLIENT_ID`
  - [ ] 7.3: Update request interceptor: change `authConfig.mode === 'zitadel'` to `authConfig.mode === 'keycloak'`
  - [ ] 7.4: Update response interceptor: change `authConfig?.mode === 'zitadel'` to `authConfig?.mode === 'keycloak'`
  - [ ] 7.5: Update all JSDoc comments from "Zitadel" to "Keycloak"

- [ ] **Task 8: Delete zitadelAuthProvider.ts** (AC: #14)
  - [ ] 8.1: Delete `apis-dashboard/src/providers/zitadelAuthProvider.ts`
  - [ ] 8.2: Grep entire `apis-dashboard/src/` for any remaining imports from `zitadelAuthProvider` and fix

- [ ] **Task 9: Update provider tests** (AC: #17)
  - [ ] 9.1: Update `tests/providers/refineAuthProvider.test.ts`:
    - Change mock path from `./zitadelAuthProvider` to `./keycloakAuthProvider`
    - Change `zitadelAuthProvider` references to `keycloakAuthProvider`
    - Change mode string from `'zitadel'` to `'keycloak'`
  - [ ] 9.2: Update `tests/providers/authConfig.test.ts`:
    - Change all `mode: 'zitadel'` fixtures to `mode: 'keycloak'`
    - Change `zitadel_authority` / `zitadel_client_id` to `keycloak_authority` / `client_id`
    - Update `isValidAuthConfig` test expectations
  - [ ] 9.3: Update any other test files that mock or reference `zitadelAuthProvider`:
    - `tests/auth/AuthGuard.test.tsx` (check for zitadel mock paths)
    - `tests/auth/DualModeAuth.test.tsx` (update mode references)
    - `tests/auth/Login.test.tsx` (check for ZitadelLoginButton imports -- note: ZitadelLoginButton rename is Story 15.6, so keep imports if still present)

- [ ] **Task 10: Verify TypeScript compilation and localAuthProvider isolation** (AC: #15, #16)
  - [ ] 10.1: Run `npx tsc --noEmit` in `apis-dashboard/` -- must compile clean
  - [ ] 10.2: Verify `localAuthProvider.ts` has zero changes (diff check)
  - [ ] 10.3: Verify no remaining imports of `@zitadel/react` anywhere in `apis-dashboard/src/`

## Dev Notes

### Architecture Compliance

**Package Structure (from CLAUDE.md):**
- Providers stay in `apis-dashboard/src/providers/`
- Types stay in `apis-dashboard/src/types/` (auth.ts type updates are Story 15.6 scope -- `AuthMode` type change)
- Tests go in `apis-dashboard/tests/providers/` (not co-located)
- PascalCase components, camelCase hooks/utils

**Layered Hooks Architecture:**
- This story touches only the provider layer (transport/auth)
- No page or component changes (those are Story 15.6)
- `useAuth` hook update is minimal (import path + mode string)

### Important: AuthMode Type Note

The `AuthMode` type in `types/auth.ts` currently reads `'local' | 'zitadel'`. Strictly speaking, this should change to `'local' | 'keycloak'`. However, this type change cascades into `AuthConfig`, `AuthConfigZitadel` (rename to `AuthConfigKeycloak`), and the `isValidAuthConfig()` function in `config.ts`.

**Decision for this story:** Update `config.ts` `isValidAuthConfig()` to accept BOTH `'zitadel'` and `'keycloak'` mode values temporarily, so that the type system does not break while the `types/auth.ts` rename is deferred to Story 15.6 (Login Page & Callback Integration) which handles the `AuthMode` type change, `AuthConfigZitadel` rename, and component renames together. Alternatively, if straightforward, the developer may update `types/auth.ts` in this story as well -- the key constraint is that `npx tsc --noEmit` must pass.

**Recommended approach:** Update `types/auth.ts` in this story to change `AuthMode` from `'local' | 'zitadel'` to `'local' | 'keycloak'`, rename `AuthConfigZitadel` to `AuthConfigKeycloak` with updated fields, and update the `AuthConfig` union. This keeps the type system clean and avoids leaving behind stale types. Story 15.6 can then focus purely on component renames and UI text.

### Keycloak realm_access.roles Extraction

In Keycloak JWTs, roles live in a nested structure:

```json
{
  "realm_access": {
    "roles": ["admin", "user"]
  }
}
```

With `oidc-client-ts`, user profile claims are accessible via `user.profile`. The `realm_access` claim is a nested object. The `getPermissions()` method must access it as:

```typescript
const realmAccess = user.profile["realm_access"] as { roles?: string[] } | undefined;
const roles = realmAccess?.roles ?? [];
```

**IMPORTANT:** By default, `oidc-client-ts` only includes standard OIDC claims in `user.profile`. Non-standard claims like `realm_access` are included because Keycloak adds them to the ID token. If `realm_access` is only in the access token (not ID token), the Keycloak realm must be configured to include realm roles in the ID token via a protocol mapper on the `roles` client scope.

### UserManager vs createZitadelAuth

The current code uses `createZitadelAuth()` from `@zitadel/react` which returns an object with `{ authorize(), signout(), userManager }`. In the new code, we use `UserManager` from `oidc-client-ts` directly:

| Zitadel SDK | oidc-client-ts UserManager | Notes |
|-------------|---------------------------|-------|
| `zitadelAuth.authorize()` | `userManager.signinRedirect()` | Triggers OIDC login redirect |
| `zitadelAuth.signout()` | `userManager.signoutRedirect()` | Triggers OIDC logout redirect |
| `zitadelAuth.userManager` | Direct `UserManager` instance | Same underlying class |
| `createZitadelAuth(config)` | `new UserManager(settings)` | Direct instantiation |

### Lazy Initialization Pattern

The current zitadel provider uses a `Proxy`-based lazy initialization pattern (SECURITY S4-H1) to defer `UserManager` creation until after `fetchAuthConfig()` completes. This prevents using stale/missing config values at module load time. **Replicate this exact same pattern** in the keycloak provider:

```typescript
let _userManager: UserManager | null = null;

function getOrCreateUserManager(): UserManager {
  if (!_userManager) {
    _userManager = new UserManager(createUserManagerConfig());
  }
  return _userManager;
}

export const userManager = new Proxy({} as UserManager, {
  get(_target, prop, receiver) {
    const real = getOrCreateUserManager();
    const value = Reflect.get(real, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(real);
    }
    return value;
  },
  set(_target, prop, value, receiver) {
    const real = getOrCreateUserManager();
    return Reflect.set(real, prop, value, receiver);
  },
});
```

### PKCE S256 Note

`oidc-client-ts` enables PKCE with S256 by default for the authorization code flow when `response_type: "code"` is used. No explicit `code_challenge_method` setting is needed in `UserManagerSettings` -- it is handled internally. However, the Keycloak client must have PKCE enforcement configured server-side (Story 15.7).

### Token Refresh Strategy

The current approach uses `automaticSilentRenew: true` on the `UserManager`. With `@zitadel/react`, this tried iframe-based silent refresh first. With plain `oidc-client-ts` + `scope: "offline_access"`, the `UserManager` will use the refresh token for renewal instead of iframe. This is the correct behavior -- no iframe-based silent refresh (per FR-KC-10, Risk 4 in PRD addendum).

### In-Memory Storage Security

The `InMemoryWebStorage` from `oidc-client-ts` stores tokens only in JavaScript memory. This means:
- Tokens are lost on page refresh (user must re-authenticate)
- Tokens are not accessible via `localStorage`, `sessionStorage`, or `document.cookie`
- The `automaticSilentRenew` with refresh tokens partially mitigates this by keeping the session alive as long as the refresh token is valid (30min with rotation per Keycloak config)
- This is the required security posture per AUTH-001-1-DASH

### Scope of ZitadelLoginButton

The `ZitadelLoginButton` component rename (to `OIDCLoginButton`) and the Login page text changes are **Story 15.6 scope**, not this story. This story only changes the provider layer. After this story:
- `ZitadelLoginButton` will still exist and still import `loginWithReturnTo` from `../../providers` -- that export name is preserved
- Login page will still check `authConfig?.mode === "zitadel"` -- this will break if the type is changed. See AuthMode Type Note above for the recommended approach.

### Files Created

- `apis-dashboard/src/providers/keycloakAuthProvider.ts`

### Files Modified

- `apis-dashboard/package.json` (dependency swap)
- `apis-dashboard/package-lock.json` (auto-generated)
- `apis-dashboard/src/config.ts` (env var rename, isValidAuthConfig update)
- `apis-dashboard/src/types/auth.ts` (AuthMode type update, AuthConfigZitadel -> AuthConfigKeycloak)
- `apis-dashboard/src/providers/refineAuthProvider.ts` (import swap)
- `apis-dashboard/src/providers/index.ts` (export updates)
- `apis-dashboard/src/hooks/useAuth.ts` (import swap, mode string)
- `apis-dashboard/src/providers/apiClient.ts` (import swap, mode string, env var names)
- `apis-dashboard/tests/providers/refineAuthProvider.test.ts` (mode/import updates)
- `apis-dashboard/tests/providers/authConfig.test.ts` (mode/field updates)
- `apis-dashboard/tests/auth/DualModeAuth.test.tsx` (mode string updates)

### Files Deleted

- `apis-dashboard/src/providers/zitadelAuthProvider.ts`

### Current Auth Config API Response (from Story 15.2)

**GET /api/auth/config** in keycloak mode now returns:
```json
{
  "mode": "keycloak",
  "keycloak_authority": "https://keycloak.example.com/realms/honeybee",
  "client_id": "apis-dashboard"
}
```

**GET /api/auth/config** in local mode returns (unchanged):
```json
{
  "mode": "local",
  "setup_required": false
}
```

### Testing Strategy

**Unit tests should mock:**
- `oidc-client-ts` `UserManager` class (signinRedirect, signoutRedirect, getUser, signinRedirectCallback, revokeTokens, removeUser, signinSilent)
- `fetch` calls to /api/auth/config
- `sessionStorage` for config caching

**Test scenarios (refineAuthProvider.test.ts):**
1. `createAuthProvider('local')` returns localAuthProvider
2. `createAuthProvider('keycloak')` returns keycloakAuthProvider
3. DEV_MODE returns devAuthProvider regardless of mode
4. Deprecated `authProvider` export logs warning and delegates to keycloakAuthProvider

**Test scenarios (authConfig.test.ts):**
1. `isValidAuthConfig({ mode: 'keycloak', keycloak_authority: '...', client_id: '...' })` returns true
2. `isValidAuthConfig({ mode: 'zitadel', ... })` returns false (no longer valid)
3. `isValidAuthConfig({ mode: 'local', setup_required: true })` returns true (unchanged)
4. Config fetch + cache round-trip with keycloak mode

### Previous Story Context (15.4)

Story 15.4 completed the backend tenant middleware update. The Go server now:
- Extracts `org_id` from Keycloak JWT claims (not `urn:zitadel:iam:org:id`)
- `AUTH_MODE=keycloak` is fully functional on the server side
- `GET /api/auth/config` returns `mode: "keycloak"` in SaaS mode

### References

- [Source: apis-dashboard/src/providers/zitadelAuthProvider.ts - Current implementation to replace]
- [Source: apis-dashboard/src/providers/refineAuthProvider.ts - Mode-aware factory to update]
- [Source: apis-dashboard/src/providers/index.ts - Barrel exports to update]
- [Source: apis-dashboard/src/config.ts - Env vars and auth config to update]
- [Source: apis-dashboard/src/hooks/useAuth.ts - Hook to update imports]
- [Source: apis-dashboard/src/providers/apiClient.ts - API client to update imports/mode checks]
- [Source: apis-dashboard/src/types/auth.ts - Auth types to update]
- [Source: _bmad-output/planning-artifacts/epic-15-keycloak-migration.md - Epic requirements]
- [Source: _bmad-output/planning-artifacts/prd-addendum-keycloak-migration.md - PRD Section 3.3, 3.4]
- [Source: _bmad-output/implementation-artifacts/13-5-retrofit-auth-provider-react.md - Previous auth provider story]
- [Source: CLAUDE.md - Project conventions and architecture patterns]

## Test Criteria

- [ ] `@zitadel/react` not in `package.json`
- [ ] `react-oidc-context` in `package.json` dependencies
- [ ] `oidc-client-ts` in `package.json` dependencies (direct, not transitive)
- [ ] OIDC config uses PKCE authorization code flow (response_type: "code")
- [ ] Token storage uses InMemoryWebStorage (not localStorage/sessionStorage)
- [ ] Token refresh uses refresh tokens (automaticSilentRenew, offline_access scope)
- [ ] `getPermissions()` extracts roles from `realm_access.roles`
- [ ] `logout()` redirects to Keycloak end-session endpoint via signoutRedirect()
- [ ] `loginWithReturnTo()` validates returnTo URL (open redirect prevention)
- [ ] `getSafeReturnToFromState()` validates state returnTo URL
- [ ] Lazy initialization pattern used for UserManager (SECURITY S4-H1)
- [ ] `localAuthProvider.ts` has zero modifications
- [ ] `npx tsc --noEmit` compiles clean
- [ ] No imports of `@zitadel/react` remain in `apis-dashboard/src/`
- [ ] No imports of `zitadelAuthProvider` remain in `apis-dashboard/src/`
- [ ] Provider tests updated and pass
- [ ] `config.ts` reads `VITE_KEYCLOAK_AUTHORITY` and `VITE_KEYCLOAK_CLIENT_ID`

## Change Log

- 2026-02-08: Story created for Epic 15 Keycloak Migration
