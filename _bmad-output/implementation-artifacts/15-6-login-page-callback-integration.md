# Story 15.6: Login Page & Callback Integration

Status: ready-for-dev

## Story

As a frontend developer,
I want to rename the `ZitadelLoginButton` component to `OIDCLoginButton` and remove all remaining "Zitadel" references from the Login page and related UI components,
so that the dashboard SSO experience reflects the provider-agnostic OIDC integration with Keycloak.

## Context

This is Story 6 in Epic 15 (Keycloak Migration). Story 15.5 already completed the heavy lifting:
- Replaced `@zitadel/react` with `react-oidc-context` and `oidc-client-ts`
- Created `keycloakAuthProvider.ts` (replacing `zitadelAuthProvider.ts`)
- Updated `config.ts` env vars from `VITE_ZITADEL_*` to `VITE_KEYCLOAK_*`
- Updated `types/auth.ts`: `AuthMode` is now `'local' | 'keycloak'`, `AuthConfigZitadel` renamed to `AuthConfigKeycloak`
- Updated `providers/index.ts`, `refineAuthProvider.ts`, `useAuth.ts`, `apiClient.ts`
- Deleted `zitadelAuthProvider.ts`
- `Callback.tsx` already imports from `keycloakAuthProvider` and works correctly

This story focuses on the remaining UI-layer rename: the `ZitadelLoginButton` component, the Login page text, and test file updates. The Callback page is already correct from 15.5 and only needs comment verification.

**Key constraint:** `localAuthProvider`, `LoginForm`, and all standalone-mode UI must remain completely unchanged. Only the SaaS SSO button and related references change.

**Dependency:** Story 15.5 is complete. The `loginWithReturnTo` function is exported from `providers/index.ts` (from `keycloakAuthProvider.ts`). The `ZitadelLoginButton` component already calls this correctly -- only the component name, file name, and display text need updating.

## Acceptance Criteria

1. **Component Renamed:** `ZitadelLoginButton.tsx` renamed to `OIDCLoginButton.tsx`, component name changed from `ZitadelLoginButton` to `OIDCLoginButton`
2. **Interface Renamed:** `ZitadelLoginButtonProps` renamed to `OIDCLoginButtonProps`
3. **Button Text Updated:** "Sign in with Zitadel" changed to "Sign in with SSO" (provider-neutral label)
4. **Aria Label Updated:** `aria-label="Sign in with Zitadel"` changed to `aria-label="Sign in with SSO"`
5. **Login Page Updated:** `Login.tsx` imports `OIDCLoginButton` instead of `ZitadelLoginButton`
6. **Login Page Text Updated:** "Secure authentication provided by Zitadel." changed to "Secure authentication via your identity provider."
7. **Login Page Comments Updated:** All JSDoc/comments referencing "Zitadel" updated to "Keycloak" or "OIDC"
8. **Auth Index Updated:** `components/auth/index.ts` exports `OIDCLoginButton` instead of `ZitadelLoginButton`
9. **Components Barrel Updated:** `components/index.ts` exports `OIDCLoginButton` instead of `ZitadelLoginButton`
10. **Callback Page Verified:** `Callback.tsx` already imports from `keycloakAuthProvider` (from Story 15.5) -- verify no remaining Zitadel references in comments
11. **Component Tests Renamed:** `tests/components/auth/ZitadelLoginButton.test.tsx` renamed to `OIDCLoginButton.test.tsx` with updated references
12. **Page Tests Updated:** `tests/pages/Login.test.tsx` updated to import `OIDCLoginButton` and match new button text/aria-label
13. **Basic Login Tests Updated:** `tests/auth/Login.test.tsx` updated to match new button text
14. **All Zitadel UI References Removed:** No remaining "Zitadel" text visible to users in the SSO login flow
15. **TypeScript Clean:** `npx tsc --noEmit` compiles without errors
16. **localAuthProvider Unchanged:** Zero changes to `localAuthProvider.ts` or `LoginForm.tsx`

## Tasks / Subtasks

- [ ] **Task 1: Rename ZitadelLoginButton component file** (AC: #1, #2, #3, #4)
  - [ ] 1.1: Create `apis-dashboard/src/components/auth/OIDCLoginButton.tsx` with contents from `ZitadelLoginButton.tsx`
  - [ ] 1.2: Rename component: `ZitadelLoginButton` -> `OIDCLoginButton`
  - [ ] 1.3: Rename interface: `ZitadelLoginButtonProps` -> `OIDCLoginButtonProps`
  - [ ] 1.4: Update button text: `"Sign in with Zitadel"` -> `"Sign in with SSO"`
  - [ ] 1.5: Update aria-label: `"Sign in with Zitadel"` -> `"Sign in with SSO"`
  - [ ] 1.6: Update JSDoc comment block:
    - Module title: `"OIDCLoginButton Component"`
    - Description: `"Single sign-on button for OIDC authentication."`
    - `"Used in SaaS mode when auth mode is 'keycloak'."`
    - Example: `<OIDCLoginButton returnTo="/dashboard" />`
    - Remove all Zitadel references from comments
  - [ ] 1.7: Update default export: `export default OIDCLoginButton`
  - [ ] 1.8: Delete `apis-dashboard/src/components/auth/ZitadelLoginButton.tsx`

- [ ] **Task 2: Update auth components barrel export** (AC: #8)
  - [ ] 2.1: In `apis-dashboard/src/components/auth/index.ts`, change:
    - `export { ZitadelLoginButton } from "./ZitadelLoginButton"` -> `export { OIDCLoginButton } from "./OIDCLoginButton"`
    - Update module comment: `"- ZitadelLoginButton: SSO button for Zitadel mode"` -> `"- OIDCLoginButton: SSO button for Keycloak/OIDC mode"`

- [ ] **Task 3: Update components barrel export** (AC: #9)
  - [ ] 3.1: In `apis-dashboard/src/components/index.ts`, change `ZitadelLoginButton` to `OIDCLoginButton` in the re-export line from `'./auth'`

- [ ] **Task 4: Update Login page** (AC: #5, #6, #7)
  - [ ] 4.1: Change import: `import { LoginForm, ZitadelLoginButton } from "../components/auth"` -> `import { LoginForm, OIDCLoginButton } from "../components/auth"`
  - [ ] 4.2: Change component usage: `<ZitadelLoginButton returnTo={safeReturnTo} />` -> `<OIDCLoginButton returnTo={safeReturnTo} />`
  - [ ] 4.3: Change subtitle text: `"Secure authentication provided by Zitadel."` -> `"Secure authentication via your identity provider."`
  - [ ] 4.4: Update JSDoc module comment:
    - Line 9: `"- Keycloak mode: SSO button (ZitadelLoginButton component)"` -> `"- Keycloak mode: SSO button (OIDCLoginButton component)"`
    - Line 31: `"- Mode-aware authentication (local or Zitadel)"` -> `"- Mode-aware authentication (local or Keycloak OIDC)"`

- [ ] **Task 5: Verify Callback page** (AC: #10)
  - [ ] 5.1: Verify `apis-dashboard/src/pages/Callback.tsx` imports from `../providers/keycloakAuthProvider` (already done in 15.5)
  - [ ] 5.2: Verify no "Zitadel" references remain in Callback.tsx comments (already clean -- module comment says "OIDC Callback Page" and "Keycloak")
  - [ ] 5.3: No code changes expected -- verification only

- [ ] **Task 6: Rename and update component test file** (AC: #11)
  - [ ] 6.1: Create `apis-dashboard/tests/components/auth/OIDCLoginButton.test.tsx` with contents from `ZitadelLoginButton.test.tsx`
  - [ ] 6.2: Update all references:
    - Import: `import { ZitadelLoginButton } from '...ZitadelLoginButton'` -> `import { OIDCLoginButton } from '...OIDCLoginButton'`
    - Test suite name: `"ZitadelLoginButton Component"` -> `"OIDCLoginButton Component"`
    - Render helper: `renderZitadelButton` -> `renderOIDCButton`
    - All `screen.getByRole('button', { name: /sign in with zitadel/i })` -> `screen.getByRole('button', { name: /sign in with sso/i })`
    - All `screen.getByLabelText('Sign in with Zitadel')` -> `screen.getByLabelText('Sign in with SSO')`
    - All test description strings mentioning "Zitadel" -> "OIDC" or "SSO"
  - [ ] 6.3: Delete `apis-dashboard/tests/components/auth/ZitadelLoginButton.test.tsx`

- [ ] **Task 7: Update Login page test (tests/pages/Login.test.tsx)** (AC: #12)
  - [ ] 7.1: Change import: `import { ZitadelLoginButton } from '../../src/components/auth/ZitadelLoginButton'` -> `import { OIDCLoginButton } from '../../src/components/auth/OIDCLoginButton'`
  - [ ] 7.2: Update module comment: remove "ZitadelLoginButton - rename in Story 15.6" -> just "OIDCLoginButton"
  - [ ] 7.3: In "Keycloak (SaaS) Mode" describe block:
    - Change `screen.getByRole('button', { name: /sign in with zitadel/i })` -> `screen.getByRole('button', { name: /sign in with sso/i })` (all occurrences)
    - Change `"shows SSO button when mode is keycloak"` test: keep description, update assertion
    - Change `"shows 'Secure authentication powered by Zitadel' footer"` test:
      - Update test description: `"shows authentication attribution footer"`
      - Update assertion: `expect(screen.getByText('Secure authentication provided by Zitadel'))` -> `expect(screen.getByText('Secure authentication via your identity provider.'))`
    - Update `"does not show Zitadel button in local mode"` test description to `"does not show SSO button in local mode"` and update assertion from `screen.queryByText('Sign in with Zitadel')` to `screen.queryByText('Sign in with SSO')`
  - [ ] 7.4: In "ZitadelLoginButton Component" describe block at bottom of file:
    - Rename to `"OIDCLoginButton Component"`
    - Update `renderZitadelButton` -> `renderOIDCButton`
    - Update all `screen.getByRole('button', { name: /sign in with zitadel/i })` -> `screen.getByRole('button', { name: /sign in with sso/i })`
    - Update all component references

- [ ] **Task 8: Update basic Login test (tests/auth/Login.test.tsx)** (AC: #13)
  - [ ] 8.1: Update comment: `"Note: Button text is still 'Sign in with Zitadel' until Story 15.6 renames the component"` -> Remove note, it is now renamed
  - [ ] 8.2: `screen.getByRole('button', { name: /sign in with/i })` -- this test already uses a generic regex, so it should pass without changes. Verify this is the case.
  - [ ] 8.3: Update module-level comment: `"Updated for Epic 15, Story 15.5: Keycloak Migration"` -> `"Updated for Epic 15, Story 15.6: Login Page & Callback Integration"`

- [ ] **Task 9: Update remaining Zitadel references in comment-only files** (AC: #14)
  - [ ] 9.1: In `apis-dashboard/src/components/auth/AuthGuard.tsx`:
    - Line 6: `"Works with both local and Zitadel auth modes."` -> `"Works with both local and Keycloak auth modes."`
    - Line 26: `"making it compatible with both local and Zitadel authentication modes."` -> `"making it compatible with both local and Keycloak authentication modes."`
  - [ ] 9.2: In `apis-dashboard/src/components/auth/AdminGuard.tsx`:
    - Line 6: `"Works with both local and Zitadel auth modes."` -> `"Works with both local and Keycloak auth modes."`
    - Line 9: `"Zitadel mode: getPermissions returns role strings from OIDC claims"` -> `"Keycloak mode: getPermissions returns role strings from OIDC claims"`
    - Line 50: `"making it compatible with both local and Zitadel modes."` -> `"making it compatible with both local and Keycloak modes."`
  - [ ] 9.3: In `apis-dashboard/src/providers/keycloakAuthProvider.ts`:
    - Line 211: `"Alias export for backward compatibility (replaces zitadelAuth)."` -> `"Alias export for backward compatibility."`
    - Line 213: `"the Zitadel SDK wrapper."` -> `"the previous SDK wrapper."`
  - [ ] 9.4: In `apis-dashboard/src/App.tsx`:
    - Line 88: `"- Dual-mode authentication (local or Zitadel OIDC)"` -> `"- Dual-mode authentication (local or Keycloak OIDC)"`

- [ ] **Task 10: Verify TypeScript compilation and test pass** (AC: #15, #16)
  - [ ] 10.1: Run `npx tsc --noEmit` in `apis-dashboard/` -- must compile clean
  - [ ] 10.2: Verify `localAuthProvider.ts` has zero changes
  - [ ] 10.3: Verify `LoginForm.tsx` has zero changes
  - [ ] 10.4: Grep `apis-dashboard/src/` for remaining "Zitadel" references (case-insensitive) -- should be zero except:
    - `utils/sanitizeError.ts` comment about Zitadel-specific tokens (acceptable: this is about sanitizing tokens from any provider, including historical Zitadel tokens)
    - `providers/localAuthProvider.ts` comment mentioning "zitadel" in a mode-switch context (acceptable: historical reference in a mode check fallback comment)
  - [ ] 10.5: Verify `Callback.tsx` has no Zitadel references (already clean from Story 15.5)

## Dev Notes

### Architecture Compliance

**Package Structure (from CLAUDE.md):**
- Components stay in `apis-dashboard/src/components/auth/`
- Pages stay in `apis-dashboard/src/pages/`
- Tests go in `apis-dashboard/tests/` (not co-located)
- PascalCase for component files and names

**Layered Hooks Architecture:**
- This story touches only the component and page layers (UI rename)
- No provider/hook changes needed (all done in 15.5)
- No API calls modified

### Why "Sign in with SSO" Not "Sign in with Keycloak"

The button text is changed to the provider-neutral "Sign in with SSO" rather than "Sign in with Keycloak" because:
1. End users do not know or care which identity provider backs the SSO flow
2. If the IdP changes again in the future, the UI text remains correct
3. This matches the component name `OIDCLoginButton` -- provider-agnostic by design
4. Keycloak's own best practices recommend against exposing the IdP brand in consumer applications

### Why "OIDCLoginButton" Not "KeycloakLoginButton"

The component is named `OIDCLoginButton` (not `KeycloakLoginButton`) because:
1. The component has zero Keycloak-specific logic -- it calls `loginWithReturnTo()` which is a standard OIDC redirect
2. If the IdP is swapped again, this component needs no changes
3. The provider-specific logic lives in `keycloakAuthProvider.ts`, not in the UI button

### Callback Page Status

`Callback.tsx` was already updated in Story 15.5:
- Imports `userManager` from `../providers` (which re-exports from `keycloakAuthProvider`)
- Imports `getSafeReturnToFromState` from `../providers/keycloakAuthProvider`
- Module comment already says "OIDC Callback Page" and references "Keycloak"
- No changes needed in this story

### Remaining Zitadel References After This Story

After this story, a small number of acceptable Zitadel references will remain in comments/strings that are not user-facing:

| File | Context | Action |
|------|---------|--------|
| `src/utils/sanitizeError.ts` | Comment: "Zitadel specific tokens" in error sanitization | **Acceptable**: sanitizer should handle legacy token patterns |
| `src/providers/localAuthProvider.ts` | Comment: "switched from local to zitadel" | **Accept or update**: low priority, just a fallback scenario comment |
| `src/pages/admin/TenantDetail.tsx` | String: `"AUTH_MODE=zitadel"` | **Story 15.8 or 15.9 scope**: admin UI text updates |
| `src/pages/admin/Tenants.tsx` | String: `"AUTH_MODE=zitadel"` | **Story 15.8 or 15.9 scope**: admin UI text updates |
| `src/pages/admin/BeeBrainConfig.tsx` | String: `"AUTH_MODE=zitadel"` | **Story 15.8 or 15.9 scope**: admin UI text updates |
| `src/pages/settings/Users.tsx` | Multiple "Zitadel" references | **Story 15.8 or 15.9 scope**: settings page text updates |
| `src/hooks/useImpersonation.ts` | Comment: "SaaS (Zitadel) mode" | **Acceptable**: comment only |
| `src/services/whisperTranscription.ts` | Comments: "Zitadel auth modes" | **Acceptable**: comments only |

The admin pages (`TenantDetail`, `Tenants`, `BeeBrainConfig`) and settings page (`Users`) display `AUTH_MODE=zitadel` text to administrators. These are deferred to Story 15.8 (Environment Templates & CLAUDE.md) or 15.9 (Documentation & Architecture Updates) since they involve broader text updates across documentation and admin UI.

### Files Created

- `apis-dashboard/src/components/auth/OIDCLoginButton.tsx` (renamed from ZitadelLoginButton.tsx)
- `apis-dashboard/tests/components/auth/OIDCLoginButton.test.tsx` (renamed from ZitadelLoginButton.test.tsx)

### Files Modified

- `apis-dashboard/src/components/auth/index.ts` (export rename)
- `apis-dashboard/src/components/index.ts` (export rename)
- `apis-dashboard/src/pages/Login.tsx` (import, component usage, text)
- `apis-dashboard/src/components/auth/AuthGuard.tsx` (comments only)
- `apis-dashboard/src/components/auth/AdminGuard.tsx` (comments only)
- `apis-dashboard/src/providers/keycloakAuthProvider.ts` (comments only)
- `apis-dashboard/src/App.tsx` (comments only)
- `apis-dashboard/tests/pages/Login.test.tsx` (imports, assertions, descriptions)
- `apis-dashboard/tests/auth/Login.test.tsx` (comments, verify assertions)

### Files Deleted

- `apis-dashboard/src/components/auth/ZitadelLoginButton.tsx`
- `apis-dashboard/tests/components/auth/ZitadelLoginButton.test.tsx`

### Current State of Key Files (Post Story 15.5)

**Callback.tsx** already imports correctly:
```typescript
import { userManager } from "../providers";
import { getSafeReturnToFromState } from "../providers/keycloakAuthProvider";
```

**types/auth.ts** already updated:
```typescript
export type AuthMode = 'local' | 'keycloak';
export interface AuthConfigKeycloak {
  mode: 'keycloak';
  keycloak_authority: string;
  client_id: string;
}
```

**config.ts** already updated:
```typescript
export const KEYCLOAK_AUTHORITY = import.meta.env.VITE_KEYCLOAK_AUTHORITY || "http://localhost:8081/realms/honeybee";
export const KEYCLOAK_CLIENT_ID = import.meta.env.VITE_KEYCLOAK_CLIENT_ID || "";
```

**Login.tsx** mode check already correct:
```typescript
const isSsoMode = authConfig?.mode === "keycloak";
```

### Testing Strategy

**Component tests (OIDCLoginButton.test.tsx) should verify:**
1. Renders the "Sign in with SSO" button
2. Has correct aria-label "Sign in with SSO"
3. Calls `loginWithReturnTo` when clicked
4. Shows loading state during login attempt
5. Shows error alert on failure with retry capability
6. Passes returnTo parameter correctly

**Login page tests should verify:**
1. SSO button renders in keycloak mode with new text
2. Attribution text updated ("Secure authentication via your identity provider.")
3. SSO button not shown in local mode
4. Click triggers loginWithReturnTo
5. Local mode unchanged (LoginForm renders correctly)

**Callback tests (no changes needed):**
- Existing tests in `tests/auth/Callback.test.tsx` mock `userManager.signinRedirectCallback()` and verify redirect behavior
- These tests are provider-agnostic and pass without modification

### References

- [Source: apis-dashboard/src/components/auth/ZitadelLoginButton.tsx - Component to rename]
- [Source: apis-dashboard/src/components/auth/index.ts - Barrel export to update]
- [Source: apis-dashboard/src/components/index.ts - Barrel export to update]
- [Source: apis-dashboard/src/pages/Login.tsx - Page to update imports and text]
- [Source: apis-dashboard/src/pages/Callback.tsx - Already correct, verify only]
- [Source: apis-dashboard/tests/components/auth/ZitadelLoginButton.test.tsx - Test to rename and update]
- [Source: apis-dashboard/tests/pages/Login.test.tsx - Test assertions to update]
- [Source: apis-dashboard/tests/auth/Login.test.tsx - Basic test, verify assertions]
- [Source: _bmad-output/planning-artifacts/epic-15-keycloak-migration.md - Story 15.6 requirements]
- [Source: _bmad-output/planning-artifacts/prd-addendum-keycloak-migration.md - FR-KC-09]
- [Source: _bmad-output/implementation-artifacts/15-5-keycloak-auth-provider-react.md - Previous story context]
- [Source: CLAUDE.md - Project conventions and architecture patterns]

## Test Criteria

- [ ] `ZitadelLoginButton.tsx` deleted from `src/components/auth/`
- [ ] `OIDCLoginButton.tsx` exists in `src/components/auth/` with correct component name
- [ ] Button text is "Sign in with SSO" (not "Sign in with Zitadel")
- [ ] `aria-label` is "Sign in with SSO"
- [ ] Login page imports `OIDCLoginButton` (not `ZitadelLoginButton`)
- [ ] Login page SSO subtitle says "Secure authentication via your identity provider."
- [ ] `components/auth/index.ts` exports `OIDCLoginButton`
- [ ] `components/index.ts` exports `OIDCLoginButton`
- [ ] Callback page has no Zitadel references
- [ ] `ZitadelLoginButton.test.tsx` deleted from tests
- [ ] `OIDCLoginButton.test.tsx` exists with updated assertions
- [ ] All Login page tests pass with updated button text
- [ ] `npx tsc --noEmit` compiles clean
- [ ] `localAuthProvider.ts` has zero modifications
- [ ] `LoginForm.tsx` has zero modifications
- [ ] No user-visible "Zitadel" text in the SSO login flow
- [ ] `loginWithReturnTo` function still works correctly (import unchanged, just re-exported)

## Change Log

- 2026-02-08: Story created for Epic 15 Keycloak Migration
