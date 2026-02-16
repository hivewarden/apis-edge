# Code Review: Story 1.4 Zitadel OIDC Integration

**Review Date:** 2026-01-26  
**Reviewer:** Codex (GPT-5.2)  
**Story File:** `_bmad-output/implementation-artifacts/1-4-zitadel-oidc-integration.md`

## Story Verdict

- **Score:** 6.5 / 10
- **Verdict:** **CONCERNS**
- **Rationale:** OIDC wiring exists (login/callback, JWT validation, 401 handling), but unauthenticated navigation does not directly redirect to Zitadel (it redirects to an in-app login page and requires an extra click) (`apis-dashboard/src/components/auth/AuthGuard.tsx:55-58` `navigate(\`/login?...`)`).

---

## Acceptance Criteria Verification

| AC | Status | Evidence | Notes |
|---|---|---|---|
| AC1: Redirect to Zitadel login when not authenticated | Partial | `apis-dashboard/src/components/auth/AuthGuard.tsx:55-58` `navigate(\`/login?returnTo=...\`)` + `apis-dashboard/src/pages/Login.tsx:191-218` `onClick={handleLogin}` `Sign in with Zitadel` | Current flow is “redirect to `/login` → user clicks to start OIDC”. If AC requires *immediate* Zitadel redirect, this is incomplete. |
| AC2: Successful login redirects back; username appears in sidebar; protected routes accessible | Needs runtime verification | `apis-dashboard/src/pages/Callback.tsx:34-41` `signinRedirectCallback()` + `navigate(returnTo...)` + `apis-dashboard/src/components/layout/AppLayout.tsx:152-167` `{user?.name ... user.email}` | Logic supports it; true verification requires a real Zitadel instance and valid credentials. |
| AC3: Logout terminates session and redirects to login | Needs runtime verification | `apis-dashboard/src/components/layout/AppLayout.tsx:171-185` `onClick={handleLogout}` + `apis-dashboard/src/hooks/useAuth.ts:130-136` `await zitadelAuth.signout(); ... removeUser()` | Signout should redirect via OIDC, but failure path doesn’t navigate. |
| AC4: Token expiration → server returns 401 → dashboard re-auth | Implemented | `apis-server/internal/middleware/auth.go:311-317` `Validate(...); respondUnauthorized(...)` + `apis-dashboard/src/providers/refineAuthProvider.ts:148-159` `if ... 401 ... redirectTo: "/login"` | Server enforces exp/iss/aud and client redirects on 401. |
| AC5: JWT validation (JWKS) and claim extraction | Implemented | `apis-server/internal/middleware/auth.go:107-173` fetch discovery/JWKS + `apis-server/internal/middleware/auth.go:305-309` `expectedClaims := ... Issuer ... AnyAudience ...` + `apis-server/internal/middleware/auth.go:331-338` `UserID: claims.Subject ... OrgID: claims.OrgID` | JWKS is cached for 1 hour (`apis-server/internal/middleware/auth.go:223-226`). |

---

## Findings

**F1: Protected-route redirect stops at `/login` instead of initiating OIDC immediately (AC1 mismatch)**  
- Severity: High  
- Category: Correctness / UX  
- Evidence: `apis-dashboard/src/components/auth/AuthGuard.tsx:55-58` `navigate(\`/login?returnTo=...\`)` + `apis-dashboard/src/providers/authProvider.ts:66-68` `signinRedirect({ state })` (only called from UI)  
- Why it matters: If the contract is “hit protected route → go to Zitadel login”, the extra click is a functional mismatch and increases drop-off (especially on mobile).  
- Recommended fix: Either (a) make `/login` auto-trigger `loginWithReturnTo()` on mount (with a visible “Cancel” option), or (b) have AuthGuard call `signinRedirect()` directly when unauthenticated.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given I open `/units` unauthenticated, when the route loads, then the browser redirects to Zitadel without requiring a manual click.
  - AC2: Given redirect fails (e.g., config missing), when the app detects the error, then the user sees an actionable message and retry option.
  - Tests/Verification: update `apis-dashboard/tests/auth/AuthGuard.test.tsx` to assert direct redirect behavior (or update AC expectation explicitly).  
- “Out of scope?”: no

**F2: Logout/auth state is split between `useAuth` and Refine `authProvider` (can leave UI in stale “authenticated” state)**  
- Severity: Medium  
- Category: Reliability / Maintainability  
- Evidence: `apis-dashboard/src/components/layout/AppLayout.tsx:44-45` `const { user, logout } = useAuth()` + `apis-dashboard/src/hooks/useAuth.ts:133-137` `removeUser()` (no navigation) + `apis-dashboard/src/components/auth/AuthGuard.tsx:35-40` `useState(...);` (no subscription)  
- Why it matters: If signout fails and only local storage is cleared, the shell can keep rendering protected content until a route change triggers a re-check. This is confusing and can cause loops of 401s.  
- Recommended fix: Make a single source of truth for logout + auth state. Simplest: use Refine’s `authProvider.logout()` everywhere (including AppLayout), and have AuthGuard subscribe to `userManager.events` or re-check on “user unloaded”.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given I click Logout and signout fails, when local state is cleared, then the app navigates to `/login` immediately.
  - AC2: Given the user session ends (userManager unload), when the event fires, then protected routes stop rendering and the user is redirected to `/login`.
  - Tests/Verification: add a unit test where `zitadelAuth.signout()` rejects and assert navigation to `/login`.  
- “Out of scope?”: no

**F3: Non-docker dev/prod bootstrap is brittle without a config sanity check or `/api/auth/config` consumption**  
- Severity: Medium  
- Category: Reliability / Docs  
- Evidence: `apis-server/internal/middleware/auth.go:214-216` `return nil, ErrMissingClientID` + `apis-server/cmd/server/main.go:83-86` `log.Fatal... check ... CLIENT_ID` + `apis-dashboard/src/config.ts:19` `VITE_ZITADEL_CLIENT_ID || ""`  
- Why it matters: Outside docker-compose (where `zitadel-bootstrap` writes env files), it’s easy to start a broken stack with empty client IDs; failures show up as redirects/errors rather than a clear setup step.  
- Recommended fix: Add explicit startup validation and/or have the dashboard fetch config from `/api/auth/config` (single source of truth) when env vars are missing.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given `VITE_ZITADEL_CLIENT_ID` is empty, when the dashboard starts, then it shows a clear “auth not configured” message (or fetches config from the server).
  - AC2: Given `ZITADEL_CLIENT_ID` is empty, when the server starts with auth enabled, then it fails with a single actionable error message (current behavior is close).
  - Tests/Verification: add a unit test that asserts the dashboard behavior when client ID is missing; run `npm test`.  
- “Out of scope?”: no

---

## Story Score Breakdown (0–2 each)

- **AC completeness:** 1.0 / 2 (AC1 is only partially met; `apis-dashboard/src/components/auth/AuthGuard.tsx:55-58`)  
- **Correctness / edge cases:** 1.5 / 2 (JWT validation looks correct; logout state edge cases remain)  
- **Security / privacy / secrets:** 1.5 / 2 (server validates issuer/audience/expiry; `apis-server/internal/middleware/auth.go:305-317`)  
- **Testing / verification:** 1.5 / 2 (component-level auth tests exist; end-to-end OIDC requires runtime)  
- **Maintainability / clarity / docs:** 1.0 / 2 (two parallel auth abstractions increase drift risk)  

## What I Could Not Verify (story-specific)

- Full OIDC flow against a real Zitadel instance (redirects, PKCE exchange, refresh token renew) (`apis-dashboard/src/pages/Callback.tsx:34-40` `signinRedirectCallback()`).  
- Server JWKS validation against real Zitadel keys and issuer/audience correctness in docker vs host networking (`apis-server/internal/middleware/auth.go:305-309` `Issuer: issuer, AnyAudience: ...`).  

