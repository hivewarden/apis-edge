# Story 13.6: Retrofit Login Page

Status: draft

## Story

As a user,
I want the login page to show the appropriate authentication method,
so that I can sign in using the method configured for my deployment.

## Acceptance Criteria

1. **Mode Detection:** Fetch `/api/auth/config`, redirect to `/setup` if `setup_required`
2. **Local Mode UI:** Email/password form with "Remember me" checkbox
3. **SaaS Mode UI:** "Sign in with Zitadel" button
4. **Form Validation:** Email format, password required
5. **Error Handling:** Invalid credentials, rate limited, network error messages
6. **Success Flow:** Redirect to dashboard

## Tasks / Subtasks

- [ ] **Task 1: Create LoginForm component for local mode** (AC: #2, #4, #5)
  - [ ] 1.1: Create `apis-dashboard/src/components/auth/LoginForm.tsx`
  - [ ] 1.2: Implement email input with email format validation
  - [ ] 1.3: Implement password input with required validation
  - [ ] 1.4: Add "Remember me" checkbox
  - [ ] 1.5: Use Ant Design Form with proper validation rules
  - [ ] 1.6: Style to match existing honey/bee theme (brownBramble, seaBuckthorn colors)
  - [ ] 1.7: Handle form submission via useLogin hook from Refine
  - [ ] 1.8: Display validation errors inline on form fields
  - [ ] 1.9: Disable submit button while loading

- [ ] **Task 2: Create ZitadelLoginButton component for SaaS mode** (AC: #3)
  - [ ] 2.1: Create `apis-dashboard/src/components/auth/ZitadelLoginButton.tsx`
  - [ ] 2.2: Extract existing button code from Login.tsx
  - [ ] 2.3: Preserve existing hover effects and styling
  - [ ] 2.4: Accept loading and onClick props
  - [ ] 2.5: Display "Sign in with Zitadel" text with login icon

- [ ] **Task 3: Update Login page with mode-aware rendering** (AC: #1, #2, #3, #6)
  - [ ] 3.1: Modify `apis-dashboard/src/pages/Login.tsx`
  - [ ] 3.2: Add state for auth mode: `authMode: AuthMode | null`
  - [ ] 3.3: Add state for loading: `isLoadingConfig: boolean`
  - [ ] 3.4: Add useEffect to fetch `/api/auth/config` on mount (use fetchAuthConfig from config.ts)
  - [ ] 3.5: Redirect to `/setup` if `setup_required === true` using navigate
  - [ ] 3.6: Render LoginForm when mode is 'local'
  - [ ] 3.7: Render ZitadelLoginButton when mode is 'zitadel'
  - [ ] 3.8: Show loading spinner while fetching config
  - [ ] 3.9: Handle config fetch errors with retry button
  - [ ] 3.10: Preserve DEV_MODE auto-redirect behavior (existing functionality)

- [ ] **Task 4: Implement error handling for login flow** (AC: #5)
  - [ ] 4.1: Handle 401 invalid credentials error in LoginForm
  - [ ] 4.2: Handle 429 rate limited error with retry time display
  - [ ] 4.3: Handle network errors (server unreachable)
  - [ ] 4.4: Display errors using Ant Design Alert component
  - [ ] 4.5: Clear error when user starts typing again

- [ ] **Task 5: Implement success flow** (AC: #6)
  - [ ] 5.1: Use useLogin hook from @refinedev/core for login action
  - [ ] 5.2: Use redirectTo from localAuthProvider (defaults to '/')
  - [ ] 5.3: Support returnTo query parameter for post-login redirect
  - [ ] 5.4: Clear any previous auth state before redirecting

- [ ] **Task 6: Update component exports** (AC: #1-#6)
  - [ ] 6.1: Export LoginForm from `apis-dashboard/src/components/auth/index.ts`
  - [ ] 6.2: Export ZitadelLoginButton from `apis-dashboard/src/components/auth/index.ts`
  - [ ] 6.3: Update `apis-dashboard/src/components/index.ts` if needed

- [ ] **Task 7: Write unit tests** (AC: #1-#6)
  - [ ] 7.1: Create `apis-dashboard/tests/pages/Login.test.tsx`
  - [ ] 7.2: Test mode detection: fetch config and render correct UI
  - [ ] 7.3: Test local mode: shows LoginForm with email/password fields
  - [ ] 7.4: Test SaaS mode: shows ZitadelLoginButton
  - [ ] 7.5: Test setup redirect: navigates to /setup when setup_required
  - [ ] 7.6: Test form validation: email format, password required
  - [ ] 7.7: Test error handling: invalid credentials, rate limited, network error
  - [ ] 7.8: Test success flow: redirects to dashboard
  - [ ] 7.9: Test DEV_MODE bypass (existing behavior)
  - [ ] 7.10: Create `apis-dashboard/tests/components/auth/LoginForm.test.tsx`
  - [ ] 7.11: Create `apis-dashboard/tests/components/auth/ZitadelLoginButton.test.tsx`

## Dev Notes

### Architecture Compliance

**Package Structure (from CLAUDE.md):**
- Components go in `apis-dashboard/src/components/auth/`
- Pages stay in `apis-dashboard/src/pages/`
- Tests go in `apis-dashboard/tests/` (not co-located)
- PascalCase components, camelCase hooks/utils

**TypeScript Patterns:**
- Use Ant Design Form component with TypeScript generics
- Use Refine's useLogin hook for login action
- Import types from `../types/auth`

### Current Login.tsx Analysis

The existing Login.tsx (lines 1-257):
- Currently Zitadel-only: "Sign in with Zitadel" button
- DEV_MODE bypass: auto-redirects to dashboard when VITE_DEV_MODE=true
- Uses `loginWithReturnTo()` from providers for Zitadel redirect
- Honey/bee theme with brownBramble, seaBuckthorn, coconutCream, salomie colors
- Honeycomb background pattern with decorative golden orbs
- Card-based layout with bee emoji branding
- Error handling with Alert component and retry button
- Supports returnTo query parameter

**Key Elements to Preserve:**
- Background styling (honeycomb pattern, golden orbs)
- Card styling (rounded, bee theme colors)
- Branding (bee emoji, "APIS" title, tagline)
- Footer with auth provider info

**Key Elements to Modify:**
- Replace single Zitadel button with mode-aware content
- Add email/password form for local mode
- Add auth config fetch on mount

### Dependencies from Story 13.5

**Auth Provider Pattern (already implemented):**
```typescript
// apis-dashboard/src/providers/refineAuthProvider.ts
export function createAuthProvider(mode: AuthMode): AuthProvider {
  return mode === 'local' ? localAuthProvider : zitadelAuthProvider;
}
```

**Config Fetching (already implemented):**
```typescript
// apis-dashboard/src/config.ts
export async function fetchAuthConfig(): Promise<AuthConfig>;
export function getAuthConfigSync(): AuthConfig | null;
```

**Auth Types (already defined):**
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

export interface LocalLoginParams {
  email: string;
  password: string;
  rememberMe?: boolean;
}
```

**Local Auth Provider (already implemented):**
```typescript
// apis-dashboard/src/providers/localAuthProvider.ts
// login() expects { email, password, rememberMe }
// Returns { success: true, redirectTo: '/' } on success
// Returns { success: false, error: { name, message } } on failure
```

### Login Page Component Structure

```typescript
// apis-dashboard/src/pages/Login.tsx

import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLogin } from "@refinedev/core";
import { Spin } from "antd";
import { fetchAuthConfig, DEV_MODE } from "../config";
import type { AuthConfig, AuthMode } from "../types/auth";
import { LoginForm } from "../components/auth/LoginForm";
import { ZitadelLoginButton } from "../components/auth/ZitadelLoginButton";
import { loginWithReturnTo } from "../providers";

export function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { mutate: login } = useLogin();

  // State
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // DEV MODE bypass (existing behavior)
  useEffect(() => {
    if (DEV_MODE) {
      const returnTo = searchParams.get("returnTo");
      navigate(returnTo ? decodeURIComponent(returnTo) : "/", { replace: true });
    }
  }, [navigate, searchParams]);

  // Fetch auth config on mount
  useEffect(() => {
    if (DEV_MODE) return; // Skip if DEV_MODE

    async function loadConfig() {
      try {
        setIsLoadingConfig(true);
        setConfigError(null);
        const config = await fetchAuthConfig();
        setAuthConfig(config);

        // Redirect to setup if required
        if (config.mode === 'local' && config.setup_required) {
          navigate('/setup', { replace: true });
          return;
        }
      } catch (err) {
        setConfigError(err instanceof Error ? err.message : 'Failed to load authentication configuration');
      } finally {
        setIsLoadingConfig(false);
      }
    }

    loadConfig();
  }, [navigate]);

  // Render content based on auth mode
  const renderAuthContent = () => {
    if (isLoadingConfig) {
      return <Spin size="large" />;
    }

    if (configError) {
      return /* Error alert with retry */;
    }

    if (authConfig?.mode === 'local') {
      return (
        <LoginForm
          onSubmit={handleLocalLogin}
          isLoading={isLoggingIn}
          error={loginError}
          onErrorClear={() => setLoginError(null)}
        />
      );
    }

    // Default: Zitadel mode
    return (
      <ZitadelLoginButton
        onClick={handleZitadelLogin}
        isLoading={isLoggingIn}
      />
    );
  };

  // ... rest of component with existing layout
}
```

### LoginForm Component

```typescript
// apis-dashboard/src/components/auth/LoginForm.tsx

import { Form, Input, Button, Checkbox, Alert } from "antd";
import { MailOutlined, LockOutlined, LoginOutlined } from "@ant-design/icons";
import { colors } from "../../theme/apisTheme";
import type { LocalLoginParams } from "../../types/auth";

interface LoginFormProps {
  onSubmit: (values: LocalLoginParams) => void;
  isLoading: boolean;
  error: string | null;
  onErrorClear: () => void;
}

export function LoginForm({ onSubmit, isLoading, error, onErrorClear }: LoginFormProps) {
  const [form] = Form.useForm<LocalLoginParams>();

  const handleFinish = (values: LocalLoginParams) => {
    onSubmit(values);
  };

  const handleValuesChange = () => {
    if (error) onErrorClear();
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleFinish}
      onValuesChange={handleValuesChange}
      requiredMark={false}
    >
      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          style={{ marginBottom: 16, borderRadius: 8 }}
        />
      )}

      <Form.Item
        name="email"
        rules={[
          { required: true, message: "Please enter your email" },
          { type: "email", message: "Please enter a valid email" },
        ]}
      >
        <Input
          prefix={<MailOutlined />}
          placeholder="Email"
          size="large"
          autoFocus
          autoComplete="email"
        />
      </Form.Item>

      <Form.Item
        name="password"
        rules={[
          { required: true, message: "Please enter your password" },
        ]}
      >
        <Input.Password
          prefix={<LockOutlined />}
          placeholder="Password"
          size="large"
          autoComplete="current-password"
        />
      </Form.Item>

      <Form.Item name="rememberMe" valuePropName="checked">
        <Checkbox>Remember me</Checkbox>
      </Form.Item>

      <Form.Item>
        <Button
          type="primary"
          htmlType="submit"
          size="large"
          icon={<LoginOutlined />}
          loading={isLoading}
          block
          style={{
            height: 56,
            fontSize: 16,
            fontWeight: 600,
            borderRadius: 12,
            background: `linear-gradient(135deg, ${colors.brownBramble} 0%, ${colors.brownBramble}dd 100%)`,
            borderColor: colors.brownBramble,
          }}
        >
          Sign In
        </Button>
      </Form.Item>
    </Form>
  );
}
```

### ZitadelLoginButton Component

```typescript
// apis-dashboard/src/components/auth/ZitadelLoginButton.tsx

import { Button } from "antd";
import { LoginOutlined } from "@ant-design/icons";
import { colors } from "../../theme/apisTheme";

interface ZitadelLoginButtonProps {
  onClick: () => void;
  isLoading: boolean;
}

export function ZitadelLoginButton({ onClick, isLoading }: ZitadelLoginButtonProps) {
  return (
    <Button
      type="primary"
      size="large"
      icon={<LoginOutlined />}
      onClick={onClick}
      loading={isLoading}
      style={{
        width: "100%",
        height: 56,
        fontSize: 16,
        fontWeight: 600,
        borderRadius: 12,
        background: `linear-gradient(135deg, ${colors.brownBramble} 0%, ${colors.brownBramble}dd 100%)`,
        borderColor: colors.brownBramble,
        boxShadow: `0 4px 16px ${colors.brownBramble}30`,
        transition: "all 0.25s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = `0 6px 20px ${colors.brownBramble}40`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = `0 4px 16px ${colors.brownBramble}30`;
      }}
    >
      Sign in with Zitadel
    </Button>
  );
}
```

### Error Handling

**Error Types from localAuthProvider:**
- `InvalidCredentials`: 401 - "Invalid email or password"
- `RateLimited`: 429 - "Too many login attempts. Please try again later."
- `NetworkError`: Network failure - "Failed to connect to server. Please check your connection."
- `LoginError`: Generic - "Login failed. Please try again."

**Error Display Pattern:**
```typescript
const handleLocalLogin = async (values: LocalLoginParams) => {
  setIsLoggingIn(true);
  setLoginError(null);

  login(values, {
    onSuccess: () => {
      // Redirect handled by auth provider
      setIsLoggingIn(false);
    },
    onError: (error) => {
      setIsLoggingIn(false);
      if (error.name === 'RateLimited') {
        setLoginError('Too many login attempts. Please try again in a few minutes.');
      } else if (error.name === 'InvalidCredentials') {
        setLoginError('Invalid email or password.');
      } else if (error.name === 'NetworkError') {
        setLoginError('Unable to connect to server. Please check your connection.');
      } else {
        setLoginError(error.message || 'Login failed. Please try again.');
      }
    },
  });
};
```

### Footer Text Based on Mode

**Local Mode Footer:**
```typescript
<Text style={{ color: colors.brownBramble, opacity: 0.5, fontSize: 12 }}>
  Secure local authentication
</Text>
```

**Zitadel Mode Footer:**
```typescript
<Text style={{ color: colors.brownBramble, opacity: 0.5, fontSize: 12 }}>
  Secure authentication powered by Zitadel
</Text>
```

### Testing Strategy

**Test File Structure:**
- `apis-dashboard/tests/pages/Login.test.tsx` - Main page tests
- `apis-dashboard/tests/components/auth/LoginForm.test.tsx` - Form component tests
- `apis-dashboard/tests/components/auth/ZitadelLoginButton.test.tsx` - Button tests

**Mock Setup:**
```typescript
// Mock config fetch
vi.mock('../config', () => ({
  fetchAuthConfig: vi.fn(),
  DEV_MODE: false,
}));

// Mock navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual('react-router-dom')),
  useNavigate: () => mockNavigate,
  useSearchParams: () => [new URLSearchParams()],
}));

// Mock useLogin
vi.mock('@refinedev/core', async () => ({
  ...(await vi.importActual('@refinedev/core')),
  useLogin: () => ({
    mutate: vi.fn(),
  }),
}));
```

**Test Cases:**
1. Shows loading spinner while fetching config
2. Renders LoginForm when mode is 'local'
3. Renders ZitadelLoginButton when mode is 'zitadel'
4. Redirects to /setup when setup_required is true
5. Shows error alert when config fetch fails
6. Shows retry button on config error
7. DEV_MODE redirects directly to dashboard
8. Form validates email format
9. Form validates password required
10. Shows error message on invalid credentials
11. Shows rate limit message on 429
12. Shows network error message on connection failure
13. Clears error when user starts typing
14. Remember me checkbox works
15. Successful login redirects to dashboard
16. returnTo query param handled correctly

### Ant Design Form Validation Rules

**Email Field:**
```typescript
rules={[
  { required: true, message: "Please enter your email" },
  { type: "email", message: "Please enter a valid email address" },
]}
```

**Password Field:**
```typescript
rules={[
  { required: true, message: "Please enter your password" },
]}
```

### Theme Colors Reference

From `apis-dashboard/src/theme/apisTheme.ts`:
```typescript
export const colors = {
  brownBramble: "#662604",    // Primary dark brown
  seaBuckthorn: "#F69521",    // Accent orange
  salomie: "#FFE39F",         // Light gold
  coconutCream: "#FFF8E7",    // Background cream
  // ... more colors
};
```

### Accessibility Considerations

- Form inputs have proper labels via placeholder (consider adding label for screen readers)
- Button has proper loading state indicator
- Error messages are announced to screen readers via Alert component
- Tab order is logical: email -> password -> remember me -> submit
- Focus moves to first error field on validation failure

### References

- [Source: apis-dashboard/src/pages/Login.tsx - Current implementation]
- [Source: apis-dashboard/src/providers/localAuthProvider.ts - Login flow]
- [Source: apis-dashboard/src/providers/zitadelAuthProvider.ts - Zitadel flow]
- [Source: apis-dashboard/src/config.ts - Auth config fetching]
- [Source: apis-dashboard/src/types/auth.ts - Type definitions]
- [Source: _bmad-output/implementation-artifacts/13-5-retrofit-auth-provider-react.md - Story 13.5]
- [Source: _bmad-output/planning-artifacts/epic-13-dual-auth-mode.md - Epic requirements]
- [Source: CLAUDE.md - Project conventions]

## Test Criteria

- [ ] Mode detection: Fetches /api/auth/config on page load
- [ ] Loading state: Shows spinner while fetching config
- [ ] Local mode: Shows LoginForm with email/password fields and "Remember me" checkbox
- [ ] SaaS mode: Shows ZitadelLoginButton with "Sign in with Zitadel"
- [ ] Setup redirect: Navigates to /setup when setup_required is true (local mode)
- [ ] Form validation: Email format validated, password required
- [ ] Invalid credentials: Shows "Invalid email or password" error
- [ ] Rate limited: Shows rate limit message with retry suggestion
- [ ] Network error: Shows connection error message
- [ ] Error clearing: Error clears when user starts typing
- [ ] Success flow: Redirects to dashboard on successful login
- [ ] returnTo param: Redirects to returnTo URL after login if provided
- [ ] DEV_MODE: Bypasses auth and redirects directly to dashboard
- [ ] Footer text: Shows mode-appropriate authentication info
- [ ] Theme: Uses existing honey/bee theme colors and styling

## Implementation Deviations

### LoginForm Interface
**Spec:** `onSubmit`, `isLoading`, `error`, `onErrorClear`
**Actual:** `onSuccess` only

**Rationale:** The actual implementation manages loading and error state internally via Refine's `useLogin` hook. This is a cleaner approach because:
1. Reduces prop drilling and component complexity
2. Keeps login logic encapsulated within the component
3. Follows Refine's recommended patterns for authentication
4. The parent component (Login.tsx) doesn't need to manage login state

The component still exposes `onSuccess` callback to allow the parent to handle post-login navigation.

## Dev Agent Record

### Remediation Cycle 1 (2026-01-27)

**Review Status:** NEEDS_WORK -> PASS (after remediation)

**Issues Fixed:**
1. **Critical:** Added `onValuesChange` handler to clear error when user types
2. **Critical:** Created separate test files for LoginForm and ZitadelLoginButton
3. **High:** Guarded console.warn with `import.meta.env.DEV` check
4. **High:** Documented interface deviation (see above)
5. **High:** Added `finally` block to ZitadelLoginButton for loading state reset
6. **High:** Added returnTo validation to prevent open redirect attacks
7. **Medium:** Added `autoFocus` to email input
8. **Medium:** Replaced imperative hover styles with React state-controlled styles
9. **Medium:** Added DEV_MODE test placeholder (requires module re-init for proper test)
10. **Medium:** Added auth components to main barrel export (components/index.ts)
11. **Low:** Extracted hardcoded "15 minutes" to `RATE_LIMIT_RETRY_MESSAGE` constant
12. **Low:** Added aria-labels to email and password inputs
13. **Low:** Improved loading text from "Loading..." to "Checking authentication..."

**Files Modified:**
- `src/components/auth/LoginForm.tsx` - Error clearing, autoFocus, aria-labels, constant
- `src/components/auth/ZitadelLoginButton.tsx` - Finally block, hover state refactor, aria-label
- `src/pages/Login.tsx` - Console guard, returnTo validation, loading text
- `src/components/index.ts` - Added auth component exports
- `tests/components/auth/LoginForm.test.tsx` - Created new test file
- `tests/components/auth/ZitadelLoginButton.test.tsx` - Created new test file
- `tests/pages/Login.test.tsx` - Added error clearing test, DEV_MODE placeholder

## Change Log

- 2026-01-27: Remediation of code review issues (Cycle 1)
- 2026-01-27: Story created for dual-mode login page implementation
