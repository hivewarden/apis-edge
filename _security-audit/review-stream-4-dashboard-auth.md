# Stream 4: Dashboard -- Auth, Routing, Providers, Config

## Summary

The APIS dashboard auth system demonstrates strong security fundamentals: in-memory OIDC token storage, CSRF protection, open redirect prevention, and error message sanitization. However, critical gaps remain: admin routes lack client-side role guards, the OIDC callback page does not validate `returnTo` from state (bypassing the redirect validation used everywhere else), the Zitadel `UserManager` is initialized at module load with potentially stale config, and the `StaleWhileRevalidate` service worker caching strategy could serve stale API responses containing another user's data after logout/re-login as a different user.

## Findings

### CRITICAL

#### C1: Admin Routes Have No Client-Side Role Guard
- **File:** `apis-dashboard/src/App.tsx`:269-272
- **Description:** Admin routes (`/admin/tenants`, `/admin/tenants/:tenantId`, `/admin/beebrain`) are wrapped only in the generic `AuthGuard` which checks `authenticated` status. There is no client-side permission check (e.g., `usePermissions`, `CanAccess`, or a `RoleGuard` wrapper). Any authenticated user can navigate directly to `/admin/tenants` and the admin page components (`Tenants.tsx`, `TenantDetail.tsx`, `BeeBrainConfig.tsx`) do not check permissions before rendering. A `grep` for `getPermissions|usePermissions|CanAccess|AccessControl` across `src/pages/admin/` returns zero matches.
- **Risk:** A regular `member` user can access super-admin pages including tenant management, impersonation, and BeeBrain configuration. While the server should reject unauthorized API calls, the admin UI would still render, potentially leaking information about other tenants, system configuration, or triggering side effects if server-side guards have gaps.
- **Fix:** Add a `RoleGuard` or `AdminGuard` component that checks `usePermissions` or `getPermissions` from the auth provider, and wraps admin routes. Return 403 or redirect non-admin users. Also add permission checks inside admin page components as defense-in-depth.

#### C2: OIDC Callback Does Not Validate returnTo from State
- **File:** `apis-dashboard/src/pages/Callback.tsx`:38-40
- **Description:** The Callback page extracts `returnTo` from OIDC state and passes it directly to `navigate()` without any validation: `const returnTo = state?.returnTo || "/"; navigate(returnTo, { replace: true });`. While `loginWithReturnTo()` in `zitadelAuthProvider.ts:187` validates the URL before putting it in state, the Callback page trusts the state unconditionally. OIDC state is passed through the authorization server's redirect and could potentially be tampered with depending on Zitadel's state handling. Additionally, `getSafeReturnToFromState()` in `zitadelAuthProvider.ts:205-213` exists specifically for this purpose but is never called in Callback.tsx.
- **Risk:** Open redirect vulnerability. An attacker who can manipulate the OIDC state (e.g., via a compromised or malicious Zitadel instance, or state injection in the authorization URL) could redirect authenticated users to an external phishing site after login.
- **Fix:** Use `getSafeReturnToFromState(user?.state)` or `getSafeRedirectUrl(returnTo, '/')` in Callback.tsx instead of using the raw `returnTo` from state. The validation function already exists and is already used in Login.tsx -- it just needs to be called in Callback.tsx as well.

### HIGH

#### H1: Zitadel UserManager Initialized at Module Load with Potentially Stale Config
- **File:** `apis-dashboard/src/providers/zitadelAuthProvider.ts`:167
- **Description:** `createZitadelAuth(createConfig())` is called at module import time as a top-level statement. The `createConfig()` function tries `getAuthConfigSync()` first, but this module is imported before `fetchAuthConfig()` completes in App.tsx. This means on initial load, the UserManager is always configured with the fallback environment variables (`ZITADEL_AUTHORITY`, `ZITADEL_CLIENT_ID`), not the server-provided config. Once initialized, the UserManager's config (authority, client_id, redirect_uri) is immutable.
- **Risk:** In SaaS mode where the server provides dynamic Zitadel config (different authority per tenant, etc.), the dashboard will always use the environment variable defaults for the OIDC flow, ignoring server-provided config. This could cause authentication to fail or redirect to the wrong identity provider, especially in multi-tenant SaaS deployments where each tenant may have different OIDC settings.
- **Fix:** Defer UserManager creation until after `fetchAuthConfig()` completes. Create the Zitadel auth instance lazily (e.g., via a factory function called from the auth provider's methods) rather than at module load time.

#### H2: Service Worker Caches API Responses with StaleWhileRevalidate After User Switch
- **File:** `apis-dashboard/vite.config.ts`:77-88
- **Description:** The service worker uses `StaleWhileRevalidate` for all API responses matching `/api/.*`. While auth endpoints (`/api/auth/*`, `/api/users/me`) are excluded via `NetworkOnly` rules, other data endpoints (sites, hives, detections, clips, etc.) are cached for up to 1 hour. If user A logs out and user B logs in on the same browser, the `api-cache` may serve user A's cached data to user B until revalidation completes.
- **Risk:** Cross-user data leakage. A shared device scenario (common in beekeeping clubs using SaaS mode) could expose one user's hive data, detection events, clips, and other sensitive information to the next user who logs in.
- **Fix:** Clear the `api-cache` service worker cache during logout (it is partially addressed in `authCleanup.ts:140-146` which clears caches matching `api-cache`, `api-`, `data-`, `user-` patterns, but this cleanup is async and may not complete before the new user's requests hit the cache). Consider using `NetworkOnly` for data endpoints that contain tenant-specific data, or add a cache key that includes user/tenant identity.

#### H3: DEV_MODE Can Be Enabled in Non-Production Builds (Staging, Preview)
- **File:** `apis-dashboard/vite.config.ts`:13, `apis-dashboard/src/config.ts`:88
- **Description:** The `__DEV_MODE__` define only forces `false` when `mode === 'production'`. Vite's `mode` defaults to `development` for `vite dev` but can be any custom string for other build modes (e.g., `staging`, `preview`). For non-production build modes, `__DEV_MODE__` evaluates to `import.meta.env.VITE_DEV_MODE === "true"`, meaning setting `VITE_DEV_MODE=true` in a staging environment would bypass all authentication.
- **Risk:** Authentication bypass in staging/preview environments. If a staging build is accidentally exposed to the internet with `VITE_DEV_MODE=true` in its environment, all routes become publicly accessible with admin permissions (the dev auth provider returns `["admin"]` permissions).
- **Fix:** Change the condition to check `mode !== 'development'` (i.e., `mode === 'development' ? 'import.meta.env.VITE_DEV_MODE === "true"' : 'false'`) or explicitly allowlist only `mode === 'development'`.

#### H4: No Token Refresh Race Condition Protection in API Client
- **File:** `apis-dashboard/src/providers/apiClient.ts`:89-99
- **Description:** The request interceptor calls `userManager.getUser()` for every Zitadel-mode request. If a token is about to expire and two requests fire simultaneously, both will call `getUser()`, both may find the token expired/expiring, and both may trigger `signinSilent()` (via automatic silent renew) concurrently. The `oidc-client-ts` library has some built-in deduplication, but the interceptor itself does not coordinate concurrent refreshes, which could lead to race conditions or duplicate refresh token grants.
- **Risk:** Token refresh failures due to concurrent refresh attempts, potentially causing authenticated requests to fail sporadically. In the worst case, a refresh token that only allows single use could be consumed by the first concurrent request, causing the second to fail and triggering a logout.
- **Fix:** Implement a token refresh lock/queue pattern in the API client interceptor. Use a shared promise to ensure only one refresh is in flight, and have concurrent requests await the same refresh result.

### MEDIUM

#### M1: Auth Config Cache Integrity Hash Is Trivially Bypassable
- **File:** `apis-dashboard/src/config.ts`:27-49
- **Description:** The `simpleHash()` function used for cache integrity verification is a non-cryptographic hash (DJB2-variant) with a "salt" based on `window.performance.timeOrigin`. The comment states "This prevents pre-computed hash attacks," but `performance.timeOrigin` is a stable value (fixed at page load, accessible to any script on the page). An attacker with XSS access can trivially compute the correct hash for any forged config by calling the same functions. Additionally, `simpleHash()` recursively calls `simpleHash2()` which doesn't include the salt, providing minimal additional security.
- **Risk:** If an attacker has XSS, they can forge the sessionStorage cache to change the auth mode (e.g., from `zitadel` to `local`, or vice versa), potentially causing confusion or enabling a downgrade attack. However, since XSS already grants full control, this is a defense-in-depth concern rather than a primary vulnerability.
- **Fix:** Either use `crypto.subtle.digest('SHA-256', ...)` for a proper cryptographic hash, or document that this integrity check is only for accidental corruption (not security). An HMAC with a per-session random key stored only in memory would be more robust.

#### M2: SetupWizard Sends Password in JSON Body Without Additional Protections
- **File:** `apis-dashboard/src/components/auth/SetupWizard.tsx`:157-166
- **Description:** The setup wizard sends the admin password in a plain JSON POST body to `/api/auth/setup`. While `credentials: 'include'` is set, there is no CSRF token sent with this request (CSRF protection requires a prior login to get the cookie, but setup happens before any login). The setup endpoint is also accessible without authentication by design.
- **Risk:** An attacker could set up the admin account on a freshly deployed instance before the legitimate user does (race condition). If the server doesn't restrict the setup endpoint to only allow creation when zero users exist AND verify the request origin, CSRF from another site could create an admin account. The mitigation relies entirely on server-side protections.
- **Fix:** Document that the server must verify `setup_required` is still true at time of request execution (not just initial check), and consider adding a one-time setup token or rate limiting on the setup endpoint. The client-side can't do much here, but should ensure the request goes to the correct origin.

#### M3: InviteAccept Page Does Not Send CSRF Token
- **File:** `apis-dashboard/src/pages/InviteAccept.tsx`:126-137
- **Description:** The invite acceptance POST request uses raw `fetch()` rather than the CSRF-aware `apiClient`. It does not include a CSRF token header. Since this is an unauthenticated endpoint (the user hasn't logged in yet), the CSRF cookie won't exist, but the pattern is inconsistent with the rest of the codebase and could be a problem if CSRF protection is extended to cover unauthenticated state-changing endpoints.
- **Risk:** Inconsistent CSRF protection. Currently low risk because the endpoint is pre-auth, but if server-side CSRF enforcement is tightened, this endpoint will break. Also, a CSRF attack could cause a victim to unknowingly create an account on a specific tenant.
- **Fix:** Use `apiClient` for consistency, or document why CSRF protection is intentionally omitted for this endpoint.

#### M4: Error Messages from Server Displayed Directly in UI (Setup/Invite Pages)
- **File:** `apis-dashboard/src/components/auth/SetupWizard.tsx`:176, `apis-dashboard/src/pages/InviteAccept.tsx`:93,145,157
- **Description:** Server error responses (`errorData.error`) are displayed directly to the user without sanitization in SetupWizard and InviteAccept. While the main apiClient interceptor uses `sanitizeString()`, these pages use raw `fetch()` and display error text directly.
- **Risk:** If the server returns an error message containing HTML or script content, it could be rendered in the Ant Design Alert component. While React escapes HTML by default, some Ant Design components render rich content that could be exploited. Additionally, verbose server errors could leak implementation details.
- **Fix:** Apply `sanitizeString()` to all server error messages before displaying them, consistent with the apiClient interceptor pattern.

#### M5: apiClient Request Interceptor Always Attempts Zitadel Token Fetch Even in Local Mode
- **File:** `apis-dashboard/src/providers/apiClient.ts`:63-73
- **Description:** When `authConfig` is null (before `fetchAuthConfig` completes), the interceptor defensively tries `userManager.getUser()` for all requests, even in local mode. The `userManager` module is imported at the top level, meaning the Zitadel SDK is always initialized regardless of auth mode, adding unnecessary code execution and potential for errors in standalone/local deployments.
- **Risk:** In local-only deployments, unnecessary Zitadel SDK initialization and token fetch attempts could cause console errors or performance issues. The `userManager.getUser()` call may trigger side effects in the OIDC client library.
- **Fix:** Guard the defensive Zitadel token fetch with a check for Zitadel mode, or lazy-import the userManager only when Zitadel mode is active.

### LOW

#### L1: Deprecated authProvider Export Still Active
- **File:** `apis-dashboard/src/providers/refineAuthProvider.ts`:87
- **Description:** `export const authProvider: AuthProvider = DEV_MODE ? devAuthProvider : zitadelAuthProvider;` is marked as deprecated but still exported and used as the default export. This always falls back to Zitadel provider (not local), which could cause confusion if imported by mistake.
- **Risk:** If any code imports the deprecated `authProvider` instead of using `createAuthProvider(mode)`, it will always use Zitadel auth regardless of the configured mode, causing auth failures in local mode.
- **Fix:** Remove the deprecated export or make it throw an error at runtime to prevent accidental usage.

#### L2: Session Storage Cache Not Cleared Between Auth Mode Switches
- **File:** `apis-dashboard/src/config.ts`:132-146
- **Description:** The sessionStorage cache for auth config persists across the session. If the server auth mode changes (e.g., admin switches from local to zitadel), the client will continue using the cached mode until the session ends or the cache is cleared. The `clearAuthConfigCache()` is called in specific places (Setup success, logout) but not on auth failures that might indicate a mode change.
- **Risk:** After a server-side auth mode reconfiguration, the client could be stuck in the wrong mode, causing auth failures that require a hard refresh or browser restart to resolve.
- **Fix:** Clear the auth config cache on authentication failures (401 from the check endpoint) to force a fresh config fetch.

#### L3: CSRF Token Cookie Deletion Uses document.cookie Without Secure/HttpOnly Attributes
- **File:** `apis-dashboard/src/utils/csrf.ts`:116
- **Description:** `clearCsrfToken()` sets an expired cookie with `path=/; SameSite=Strict` but does not include `Secure` flag. If the original CSRF cookie was set by the server with `Secure`, the client-side deletion attempt will not match and the cookie won't be cleared.
- **Risk:** CSRF token may persist after logout if the `Secure` flag doesn't match, potentially causing CSRF validation failures on re-login if the token format has changed.
- **Fix:** Include `Secure` flag in the cookie deletion (or delegate cookie deletion to the server's logout endpoint entirely).

#### L4: Multiple Redundant /api/auth/me Calls
- **File:** `apis-dashboard/src/providers/localAuthProvider.ts`:141-163,170-191,228-244
- **Description:** `check()`, `getIdentity()`, and `getPermissions()` each independently call `/api/auth/me`. On every route navigation or auth check cycle, Refine may call multiple of these sequentially, resulting in 2-3 redundant API calls to the same endpoint.
- **Risk:** Performance degradation, especially on slow connections. Each navigation could trigger 3 identical network requests.
- **Fix:** Implement a shared cache for the `/api/auth/me` response within the localAuthProvider, with a short TTL (e.g., 5 seconds).

#### L5: Zitadel Config Change Not Reflected After Module Load
- **File:** `apis-dashboard/src/providers/zitadelAuthProvider.ts`:91-107,116-151,167
- **Description:** `getZitadelConfig()` reads from `getAuthConfigSync()` for dynamic config, but it's only called once during module initialization (`createConfig()` at line 167). Even though it reads from cache, the UserManager's config is fixed at creation time. If the auth config is fetched *after* the module loads (which is always the case per the App.tsx flow), the dynamic config is never applied.
- **Risk:** Same as H1 but from a different angle -- the Zitadel SDK will always use env var defaults in practice.
- **Fix:** Same as H1 -- defer UserManager creation.

### INFO

#### I1: Well-Implemented In-Memory Token Storage for Zitadel
- **File:** `apis-dashboard/src/providers/zitadelAuthProvider.ts`:41-47
- **Description:** OIDC tokens are stored in `InMemoryWebStorage` rather than `localStorage`/`sessionStorage`. This is a strong security pattern that prevents XSS from stealing long-lived tokens. The trade-off (re-authentication on page refresh) is mitigated by `automaticSilentRenew`.
- **Risk:** None -- this is a positive finding.

#### I2: Comprehensive Auth Cleanup on Logout
- **File:** `apis-dashboard/src/services/authCleanup.ts`:43-104
- **Description:** `cleanupAllAuthData()` clears IndexedDB, sessionStorage, localStorage (auth keys only), CSRF tokens, and service worker caches. This is thorough defense-in-depth for preventing post-logout data leakage.
- **Risk:** None -- this is a positive finding.

#### I3: Redirect URL Validation Is Thorough
- **File:** `apis-dashboard/src/utils/urlValidation.ts`:140-177
- **Description:** `isValidRedirectUrl()` blocks `javascript:`, `vbscript:`, `data:`, protocol-relative (`//`) URLs, and requires same-origin for absolute URLs. Used consistently in Login.tsx and zitadelAuthProvider.ts (but not Callback.tsx -- see C2).
- **Risk:** None -- positive finding (with the exception noted in C2).

#### I4: Error Sanitization Prevents Token Leakage
- **File:** `apis-dashboard/src/utils/sanitizeError.ts`
- **Description:** The `sanitizeString()` function redacts JWTs, Bearer tokens, API keys, session tokens, and other sensitive patterns from error messages before they reach the console or UI.
- **Risk:** None -- positive finding.

#### I5: CSRF Protection Correctly Implemented for Local Auth
- **File:** `apis-dashboard/src/providers/apiClient.ts`:78-85, `apis-dashboard/src/utils/csrf.ts`
- **Description:** The cookie-to-header CSRF pattern is correctly implemented: server sets a non-httpOnly cookie, client reads it and sends it in `X-CSRF-Token` header for POST/PUT/PATCH/DELETE requests.
- **Risk:** None -- positive finding.

#### I6: Auth Config Fetch Response Not Validated Against Schema
- **File:** `apis-dashboard/src/config.ts`:163
- **Description:** `const config = await response.json() as AuthConfig` uses a type assertion without runtime validation. A malformed server response (or MITM on HTTP) could cause unexpected behavior.
- **Risk:** Low -- primarily a robustness concern. Could cause confusing errors if the server returns unexpected shape.

#### I7: Good Test Coverage for Auth Providers
- **Description:** Tests exist for localAuthProvider (login, logout, check, getIdentity, onError, getPermissions), refineAuthProvider (mode switching, DEV_MODE, legacy export), authConfig (caching, error resilience), AuthGuard (loading, authenticated, unauthenticated), Callback (success, failure), and dual-mode testing. Coverage is thorough.
- **Risk:** None -- positive finding.

## Files Reviewed

### Core App
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/App.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/config.ts`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/vite.config.ts`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/vitest.config.ts`

### Providers
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/providers/apiClient.ts`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/providers/refineAuthProvider.ts`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/providers/localAuthProvider.ts`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/providers/zitadelAuthProvider.ts`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/providers/dataProvider.ts`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/providers/index.ts`

### Auth Components
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/auth/AuthGuard.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/auth/LoginForm.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/auth/SecurityWarningModal.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/auth/SetupWizard.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/auth/ZitadelLoginButton.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/auth/index.ts`

### Layout
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/layout/AppLayout.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/layout/Logo.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/layout/navItems.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/layout/index.ts`

### Context/State
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/context/BackgroundSyncContext.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/context/ProactiveInsightsContext.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/context/TimeRangeContext.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/context/index.ts`

### Types/Utils/Constants
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/types/auth.ts`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/types/hive.ts`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/types/index.ts`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/utils/urlValidation.ts`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/utils/csrf.ts`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/utils/sanitizeError.ts`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/utils/index.ts`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/constants/index.ts`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/constants/pagination.ts`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/constants/timezones.ts`

### Pages (auth-related)
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/pages/Login.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/pages/Setup.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/pages/InviteAccept.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/pages/Callback.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/pages/index.ts`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/pages/admin/Tenants.tsx` (partial)

### Lazy Loading
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/lazy.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/pages/lazy.tsx`

### Services
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/services/authCleanup.ts`

### Hooks
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/hooks/useAuth.ts`

### Tests
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/auth/AuthGuard.test.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/auth/Callback.test.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/auth/DualModeAuth.test.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/auth/Login.test.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/providers/localAuthProvider.test.ts`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/providers/authConfig.test.ts`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/providers/refineAuthProvider.test.ts`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/pages/Login.test.tsx` (partial)

## Metrics
- Files reviewed: 52
- Total findings: 19 (C: 2, H: 4, M: 5, L: 5, I: 7)
