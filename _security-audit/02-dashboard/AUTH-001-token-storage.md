# AUTH-001: Token Storage and Authentication Flow Vulnerabilities

**Severity:** HIGH (multiple issues, some MEDIUM individually)
**OWASP Category:** A07:2021 - Identification and Authentication Failures
**Audit Date:** 2026-01-31
**Auditor:** Security Audit Agent

---

## Executive Summary

The APIS dashboard authentication implementation contains several security vulnerabilities related to token storage, session management, and credential handling. The most critical issues involve OIDC tokens stored in browser storage (XSS-vulnerable), orphaned auth token references in localStorage, incomplete logout procedures, and potential token exposure through error messages.

---

## Finding 1: OIDC Tokens Stored in Browser Session Storage (XSS Vulnerable)

**Severity:** HIGH
**OWASP:** A07:2021 - Identification and Authentication Failures, A03:2021 - Injection

### Location
- **File:** `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/providers/zitadelAuthProvider.ts`
- **Lines:** 44-73, 89

### Vulnerable Code

```typescript
// zitadelAuthProvider.ts:44-73
function createConfig(): ZitadelConfig {
  const { authority, clientId } = getZitadelConfig();

  return {
    authority,
    client_id: clientId,
    redirect_uri: `${window.location.origin}/callback`,
    post_logout_redirect_uri: `${window.location.origin}/login`,
    scope: "openid profile email offline_access",
    automaticSilentRenew: true,
    accessTokenExpiringNotificationTimeInSeconds: 120,
  };
}

export const zitadelAuth = createZitadelAuth(createConfig());
```

The `@zitadel/react` library (which wraps `oidc-client-ts`) uses **sessionStorage** by default to store OIDC tokens including:
- Access tokens
- ID tokens
- Refresh tokens (due to `offline_access` scope)

### Attack Vector

1. Attacker injects malicious JavaScript via XSS vulnerability (stored XSS in user input fields, reflected XSS via URL parameters, or compromised third-party script)
2. Malicious script executes: `JSON.parse(sessionStorage.getItem('oidc.user:https://zitadel.example.com:client_id'))`
3. Attacker exfiltrates access token, refresh token, and user identity
4. With refresh token, attacker maintains persistent access even after session ends
5. Access token allows API access impersonating the victim

### Impact
- Complete account takeover
- Persistent access via stolen refresh token
- All API operations performed as victim user
- Data exfiltration of all hive/inspection data

### Remediation

Configure oidc-client-ts to use in-memory storage with a backend-for-frontend (BFF) pattern, or at minimum use HttpOnly cookies:

**Option A: In-Memory Token Storage (Recommended)**

```typescript
// zitadelAuthProvider.ts
import { InMemoryWebStorage } from 'oidc-client-ts';

function createConfig(): ZitadelConfig {
  return {
    authority,
    client_id: clientId,
    redirect_uri: `${window.location.origin}/callback`,
    post_logout_redirect_uri: `${window.location.origin}/login`,
    scope: "openid profile email offline_access",
    automaticSilentRenew: true,
    accessTokenExpiringNotificationTimeInSeconds: 120,
    // Use in-memory storage - tokens cleared on page refresh but secure from XSS
    userStore: new WebStorageStateStore({ store: new InMemoryWebStorage() }),
  };
}
```

**Option B: Backend-for-Frontend Pattern (Most Secure)**

Implement token exchange on the server side where tokens are stored in HttpOnly, Secure, SameSite=Strict cookies. The frontend never sees raw tokens.

### Acceptance Criteria
- [ ] OIDC tokens are NOT stored in sessionStorage or localStorage
- [ ] XSS attack simulation cannot extract valid tokens from browser storage
- [ ] Token refresh works correctly with new storage mechanism
- [ ] Silent token renewal functions after implementation change

---

## Finding 2: Orphaned Token Reference in Whisper Transcription Service

**Severity:** MEDIUM
**OWASP:** A07:2021 - Identification and Authentication Failures

### Location
- **File:** `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/services/whisperTranscription.ts`
- **Lines:** 215-216

### Vulnerable Code

```typescript
// whisperTranscription.ts:214-234
export async function transcribeAudio(audioBlob: Blob, language?: string): Promise<TranscriptionResult> {
  // Get auth token from localStorage (set by auth provider)
  const authToken = localStorage.getItem('apis_auth_token');

  // Create form data with audio file
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.webm');

  // Include language hint if provided
  if (language) {
    formData.append('language', language);
  }

  // Send to server
  const response = await fetch('/api/transcribe', {
    method: 'POST',
    headers: authToken
      ? { Authorization: `Bearer ${authToken}` }
      : {},
    body: formData,
  });
  // ...
}
```

### Issue Description

1. **No code sets `apis_auth_token` in localStorage** - This appears to be dead/orphaned code referencing a token that is never stored
2. **Inconsistent with auth architecture** - The rest of the app uses:
   - Local mode: HttpOnly session cookies (correct)
   - Zitadel mode: OIDC tokens from `userManager.getUser()`
3. **Bypasses proper auth flow** - Does not use `apiClient.ts` which properly handles authentication

### Attack Vector

1. If code were updated to actually store tokens in localStorage, it would be XSS-vulnerable
2. Currently, transcription requests may fail authentication silently
3. Inconsistent auth patterns increase attack surface and maintenance burden

### Impact
- Potential authentication bypass for transcription endpoint
- Code confusion may lead to future vulnerabilities
- Transcription feature may not work in production

### Remediation

Replace direct localStorage access with proper authentication through apiClient:

```typescript
// whisperTranscription.ts
import { apiClient } from '../providers/apiClient';

export async function transcribeAudio(audioBlob: Blob, language?: string): Promise<TranscriptionResult> {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.webm');

  if (language) {
    formData.append('language', language);
  }

  // Use apiClient which handles authentication automatically
  const response = await apiClient.post('/transcribe', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return {
    text: response.data?.data?.text || response.data?.text || '',
    language: response.data?.data?.language || response.data?.language,
    duration: response.data?.data?.duration || response.data?.duration,
  };
}
```

### Acceptance Criteria
- [ ] Remove `localStorage.getItem('apis_auth_token')` reference
- [ ] Use `apiClient` for authenticated transcription requests
- [ ] Verify transcription works in both local and Zitadel auth modes
- [ ] No references to `apis_auth_token` exist in codebase

---

## Finding 3: Incomplete Server-Side Session Invalidation on Logout (Zitadel Mode)

**Severity:** MEDIUM
**OWASP:** A07:2021 - Identification and Authentication Failures

### Location
- **File:** `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/providers/zitadelAuthProvider.ts`
- **Lines:** 144-153

### Vulnerable Code

```typescript
// zitadelAuthProvider.ts:144-153
logout: async () => {
  try {
    await zitadelAuth.signout();
    return { success: true, redirectTo: "/login" };
  } catch {
    // Even on error, remove local user and redirect
    await userManager.removeUser();
    return { success: true, redirectTo: "/login" };
  }
},
```

### Issue Description

The logout implementation has several weaknesses:

1. **No backend notification** - The server's `apis-server` is never informed of logout in Zitadel mode
2. **Silent failure** - If `zitadelAuth.signout()` fails, only client-side cleanup occurs
3. **Token remains valid** - Access tokens remain valid until expiration (potentially hours)
4. **No revocation** - Refresh tokens are not explicitly revoked with Zitadel

### Attack Vector

1. User clicks logout on a shared/public computer
2. Logout fails silently or only removes client-side session
3. Attacker accesses browser storage before tokens expire
4. Attacker uses still-valid access token to impersonate user
5. If refresh token was captured, attacker has extended access

### Impact
- Sessions remain valid after user believes they've logged out
- Shared computer scenarios expose accounts
- Stolen tokens usable until natural expiration

### Remediation

Implement comprehensive logout with server notification and token revocation:

```typescript
// zitadelAuthProvider.ts
logout: async () => {
  const errors: string[] = [];

  try {
    // 1. Notify backend to invalidate any server-side session state
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    }).catch(e => errors.push(`Backend logout failed: ${e.message}`));

    // 2. Revoke tokens with Zitadel (if supported)
    const user = await userManager.getUser();
    if (user?.access_token) {
      try {
        await userManager.revokeTokens();
      } catch (e) {
        errors.push(`Token revocation failed: ${e instanceof Error ? e.message : 'Unknown'}`);
      }
    }

    // 3. Sign out from Zitadel (end SSO session)
    await zitadelAuth.signout();

    return { success: true, redirectTo: "/login" };
  } catch (error) {
    // Always clear client-side state even if server operations fail
    await userManager.removeUser();

    // Clear any remaining storage
    sessionStorage.clear(); // Remove any OIDC artifacts

    // Log errors for debugging but don't expose to user
    if (errors.length > 0) {
      console.error('[Logout] Partial failures:', errors);
    }

    return { success: true, redirectTo: "/login" };
  }
},
```

### Acceptance Criteria
- [ ] Backend receives logout notification to clear any server-side session
- [ ] Token revocation attempted with identity provider
- [ ] All browser storage cleared on logout
- [ ] Logout completes successfully even if network fails
- [ ] Error logging captures failed logout operations

---

## Finding 4: Auth Config Cached in Session Storage Without Integrity Check

**Severity:** MEDIUM
**OWASP:** A07:2021 - Identification and Authentication Failures

### Location
- **File:** `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/config.ts`
- **Lines:** 68-77, 90-95, 119-133

### Vulnerable Code

```typescript
// config.ts:68-77
// Check sessionStorage for persistence across page reloads
try {
  const cached = sessionStorage.getItem(AUTH_CONFIG_CACHE_KEY);
  if (cached) {
    authConfigCache = JSON.parse(cached) as AuthConfig;
    return authConfigCache;
  }
} catch {
  // sessionStorage may not be available in some contexts
}

// config.ts:90-95
// Cache in sessionStorage for persistence
try {
  sessionStorage.setItem(AUTH_CONFIG_CACHE_KEY, JSON.stringify(config));
} catch {
  // sessionStorage may not be available or full
}
```

### Issue Description

1. **Auth config stored in sessionStorage** - Attacker can modify auth mode
2. **No integrity verification** - Cached config accepted without validation
3. **Could force wrong auth provider** - Modified cache could bypass intended auth flow

### Attack Vector

1. Attacker gains XSS access to page
2. Attacker modifies sessionStorage: `sessionStorage.setItem('apis_auth_config', '{"mode":"local"}')`
3. App uses modified config, potentially bypassing Zitadel OIDC security
4. User authenticates via weaker local auth when Zitadel was intended

### Impact
- Authentication downgrade attack possible
- Could bypass multi-factor auth enforced by Zitadel
- Policy bypass if local auth has weaker requirements

### Remediation

Add integrity verification and time-based expiration:

```typescript
// config.ts
interface CachedAuthConfig {
  config: AuthConfig;
  timestamp: number;
  hash: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function computeConfigHash(config: AuthConfig): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(config));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function fetchAuthConfig(): Promise<AuthConfig> {
  if (authConfigCache) {
    return authConfigCache;
  }

  // Check sessionStorage with validation
  try {
    const cached = sessionStorage.getItem(AUTH_CONFIG_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as CachedAuthConfig;
      const now = Date.now();

      // Validate TTL
      if (now - parsed.timestamp < CACHE_TTL_MS) {
        // Verify integrity
        const expectedHash = await computeConfigHash(parsed.config);
        if (parsed.hash === expectedHash) {
          authConfigCache = parsed.config;
          return authConfigCache;
        }
      }
      // Invalid cache - remove it
      sessionStorage.removeItem(AUTH_CONFIG_CACHE_KEY);
    }
  } catch {
    sessionStorage.removeItem(AUTH_CONFIG_CACHE_KEY);
  }

  // Fetch fresh config
  const response = await fetch(`${API_URL}/auth/config`);
  if (!response.ok) {
    throw new Error(`Failed to fetch auth config: ${response.status}`);
  }

  const config = await response.json() as AuthConfig;
  authConfigCache = config;

  // Cache with integrity hash
  try {
    const hash = await computeConfigHash(config);
    const cacheEntry: CachedAuthConfig = {
      config,
      timestamp: Date.now(),
      hash,
    };
    sessionStorage.setItem(AUTH_CONFIG_CACHE_KEY, JSON.stringify(cacheEntry));
  } catch {
    // Ignore storage errors
  }

  return config;
}
```

### Acceptance Criteria
- [ ] Auth config cache includes integrity hash
- [ ] Tampered cache detected and discarded
- [ ] Cache has reasonable TTL (5 minutes recommended)
- [ ] Fresh config fetched when cache invalid

---

## Finding 5: DEV_MODE Bypass Persists in Production Bundle

**Severity:** HIGH
**OWASP:** A07:2021 - Identification and Authentication Failures

### Location
- **File:** `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/config.ts`
- **Line:** 29
- **File:** `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/auth/AuthGuard.tsx`
- **Lines:** 44-46
- **File:** `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/providers/refineAuthProvider.ts`
- **Lines:** 32-52, 66-71

### Vulnerable Code

```typescript
// config.ts:29
export const DEV_MODE = import.meta.env.VITE_DEV_MODE === "true";

// AuthGuard.tsx:44-46
if (DEV_MODE) {
  return <>{children}</>;
}

// refineAuthProvider.ts:32-52
const devAuthProvider: AuthProvider = {
  login: async () => {
    console.warn("DEV MODE: Authentication bypassed");
    return { success: true };
  },
  logout: async () => {
    return { success: true, redirectTo: "/login" };
  },
  check: async () => {
    return { authenticated: true };
  },
  getIdentity: async () => {
    return DEV_USER;
  },
  // ...
};
```

### Issue Description

1. **DEV_MODE code ships to production** - Auth bypass logic present in bundle
2. **Environment variable controllable** - If attacker can manipulate env, auth bypassed
3. **Client-side check only** - Server may not have corresponding DISABLE_AUTH enabled
4. **Hard-coded dev credentials** - `DEV_USER` object with tenant_id visible

### Attack Vector

1. Attacker analyzes production JavaScript bundle
2. Finds DEV_MODE check and hard-coded dev user
3. If attacker can control environment (supply chain attack, CDN compromise):
   - Modifies served JavaScript to set DEV_MODE = true
   - All authentication bypassed
4. Alternative: If index.html can be modified, inject `window.VITE_DEV_MODE = 'true'`

### Impact
- Complete authentication bypass
- Access to all tenant data without credentials
- Trivial to exploit if any script injection possible

### Remediation

Use build-time dead code elimination and never include dev auth in production:

```typescript
// vite.config.ts
export default defineConfig(({ mode }) => ({
  define: {
    // Completely remove DEV_MODE in production builds
    '__DEV_MODE__': mode === 'development',
  },
  esbuild: {
    // Remove console.warn in production
    drop: mode === 'production' ? ['console'] : [],
  },
}));

// config.ts - Production safe
export const DEV_MODE = __DEV_MODE__ && import.meta.env.VITE_DEV_MODE === "true";

// Or better - completely separate files:
// src/providers/authProvider.dev.ts - only included in dev build
// src/providers/authProvider.prod.ts - production auth only
```

**Alternative: Conditional Import (Recommended)**

```typescript
// vite.config.ts
export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      '@auth-provider': mode === 'development'
        ? './src/providers/refineAuthProvider.dev.ts'
        : './src/providers/refineAuthProvider.prod.ts',
    },
  },
}));
```

### Acceptance Criteria
- [ ] Production bundle contains NO dev auth bypass code
- [ ] `grep -r "DEV_MODE" dist/` returns no results in production build
- [ ] No hard-coded dev users in production bundle
- [ ] Build fails if DEV_MODE accidentally enabled for production

---

## Finding 6: Token Exposure in Console Logs and Error Messages

**Severity:** LOW
**OWASP:** A09:2021 - Security Logging and Monitoring Failures

### Location
- **File:** `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/hooks/useAuth.ts`
- **Lines:** 117-119
- **File:** `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/providers/apiClient.ts`
- **Lines:** 98-103

### Vulnerable Code

```typescript
// useAuth.ts:117-119
} catch (error) {
  console.error("Failed to get/refresh access token:", error);
  return null;
}

// apiClient.ts:98-103
const errorMessage =
  error.response?.data?.error ||
  error.message ||
  "An unexpected error occurred";

message.error(errorMessage);
```

### Issue Description

1. **Error objects may contain tokens** - OIDC errors sometimes include token snippets
2. **Console logs accessible** - Browser dev tools expose all console output
3. **Error messages displayed to user** - Could inadvertently show sensitive data

### Attack Vector

1. Attacker gains access to victim's browser (shoulder surfing, screen share)
2. Opens developer console
3. Triggers auth errors by manipulating network/storage
4. Token fragments visible in error stack traces
5. Attacker extracts enough information for replay attack

### Impact
- Token fragments may be exposed in dev tools
- Screen sharing/recording could capture sensitive data
- Support screenshots may contain tokens

### Remediation

Sanitize errors before logging:

```typescript
// utils/errorSanitizer.ts
const SENSITIVE_PATTERNS = [
  /access_token['":\s]+['"][^'"]+['"]/gi,
  /bearer\s+[a-zA-Z0-9\-._~+/]+=*/gi,
  /refresh_token['":\s]+['"][^'"]+['"]/gi,
];

export function sanitizeError(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error);

  for (const pattern of SENSITIVE_PATTERNS) {
    message = message.replace(pattern, '[REDACTED]');
  }

  return message;
}

// useAuth.ts
import { sanitizeError } from '../utils/errorSanitizer';

} catch (error) {
  console.error("Failed to get/refresh access token:", sanitizeError(error));
  return null;
}
```

### Acceptance Criteria
- [ ] Console logs do not contain tokens
- [ ] Error messages displayed to users contain no sensitive data
- [ ] Automated scan of console output finds no token patterns

---

## Finding 7: Missing CSRF Protection for Local Auth Mode

**Severity:** MEDIUM
**OWASP:** A01:2021 - Broken Access Control

### Location
- **File:** `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/providers/localAuthProvider.ts`
- **Lines:** 36-45

### Vulnerable Code

```typescript
// localAuthProvider.ts:36-45
const response = await fetch(`${API_URL}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include', // Required for cookies
  body: JSON.stringify({
    email,
    password,
    remember_me: rememberMe,
  }),
});
```

### Issue Description

1. **No CSRF token** - Login request lacks CSRF protection
2. **Credentials auto-sent** - `credentials: 'include'` sends cookies automatically
3. **Login CSRF** - Attacker can force victim to log into attacker's account

### Attack Vector (Login CSRF)

1. Attacker creates account on APIS
2. Attacker hosts malicious page with hidden form pointing to `/api/auth/login`
3. Victim visits attacker's page while on same network
4. Hidden form auto-submits with attacker's credentials
5. Victim now logged into attacker's account without knowing
6. Victim adds sensitive hive data thinking it's their account
7. Attacker logs in and accesses victim's data

### Impact
- Login CSRF enables account confusion attacks
- Victim's data stored in attacker's account
- Privacy breach of hive inspection data

### Remediation

Implement CSRF token for state-changing requests:

```typescript
// localAuthProvider.ts
login: async (params: LocalLoginParams) => {
  const { email, password, rememberMe } = params;

  try {
    // First, get CSRF token
    const csrfResponse = await fetch(`${API_URL}/auth/csrf`, {
      credentials: 'include',
    });
    const { csrf_token } = await csrfResponse.json();

    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrf_token,
      },
      credentials: 'include',
      body: JSON.stringify({
        email,
        password,
        remember_me: rememberMe,
      }),
    });
    // ...
  }
}
```

**Server-side requirement:**
- Add `GET /api/auth/csrf` endpoint returning double-submit cookie token
- Validate `X-CSRF-Token` header on all POST/PUT/DELETE requests

### Acceptance Criteria
- [ ] All state-changing requests include CSRF token
- [ ] Server validates CSRF token on protected endpoints
- [ ] Login CSRF attack simulation fails
- [ ] CSRF token rotated on authentication state change

---

## Summary Table

| Finding | Severity | Issue | Status |
|---------|----------|-------|--------|
| AUTH-001-1 | HIGH | OIDC tokens in sessionStorage (XSS vulnerable) | Open |
| AUTH-001-2 | MEDIUM | Orphaned localStorage token reference | Open |
| AUTH-001-3 | MEDIUM | Incomplete logout/session invalidation | Open |
| AUTH-001-4 | MEDIUM | Auth config cache without integrity | Open |
| AUTH-001-5 | HIGH | DEV_MODE bypass in production bundle | Open |
| AUTH-001-6 | LOW | Token exposure in logs/errors | Open |
| AUTH-001-7 | MEDIUM | Missing CSRF protection (local auth) | Open |

---

## Recommended Priority

1. **Immediate (0-7 days):**
   - Fix DEV_MODE bypass (AUTH-001-5) - Complete auth bypass possible
   - Move OIDC tokens to in-memory storage (AUTH-001-1) - XSS token theft

2. **Short-term (7-30 days):**
   - Fix orphaned token reference (AUTH-001-2)
   - Implement proper logout flow (AUTH-001-3)
   - Add CSRF protection (AUTH-001-7)

3. **Medium-term (30-90 days):**
   - Add auth config integrity (AUTH-001-4)
   - Sanitize error logging (AUTH-001-6)

---

## References

- OWASP Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP Session Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- oidc-client-ts Security Best Practices: https://github.com/authts/oidc-client-ts/blob/main/docs/security.md
- CSRF Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
