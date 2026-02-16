# CSRF-001: Cross-Site Request Forgery Protection Issues

## Summary

This finding documents Cross-Site Request Forgery (CSRF) protection gaps in the APIS React dashboard. While the application relies on SameSite cookies and Bearer tokens for some protection, the absence of explicit CSRF tokens creates defense-in-depth gaps.

---

## Finding 1: Missing CSRF Token Implementation

**Severity:** MEDIUM
**OWASP Category:** A01:2021 - Broken Access Control
**CWE:** CWE-352 (Cross-Site Request Forgery)

### Affected Files

| File | Description |
|------|-------------|
| `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/providers/apiClient.ts` | No CSRF token in request headers |
| `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/providers/localAuthProvider.ts` | Login requests without CSRF token |

### Current Implementation

**apiClient.ts (lines 17-24):**
```typescript
export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
  // Enable cookies for cross-origin requests (needed for local auth)
  withCredentials: true,
});
```

The axios client is configured with `withCredentials: true` for cookie-based auth, but no CSRF token is included.

**localAuthProvider.ts (lines 37-44):**
```typescript
const response = await fetch(`${API_URL}/auth/login`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include', // Required for cookies
  body: JSON.stringify(params),
});
```

### Attack Vector

While SameSite=Strict cookies provide protection against cross-origin POST requests in modern browsers, CSRF tokens provide defense-in-depth:

1. **Legacy browsers:** Older browsers don't support SameSite
2. **Same-site attacks:** Attacker on a subdomain could bypass SameSite
3. **Cookie jar overflow:** Attackers could force cookies to be dropped
4. **Future vulnerabilities:** New bypass techniques may emerge

**Attack scenario:**
```html
<!-- Attacker's page (if SameSite fails) -->
<form action="https://apis.example.com/api/hives" method="POST" id="csrf-form">
  <input type="hidden" name="name" value="PWNED Hive" />
  <input type="hidden" name="site_id" value="attacker-controlled" />
</form>
<script>document.getElementById('csrf-form').submit();</script>
```

### Impact

- **Data manipulation:** Attacker could create/modify/delete hives, inspections, tasks
- **Account changes:** Modify user settings or preferences
- **Destructive actions:** Delete clips, clear offline data
- **Privilege escalation:** If admin endpoints lack CSRF, broader impact

### Remediation

Implement double-submit cookie pattern or synchronizer token pattern:

**Option 1: Double-Submit Cookie (Simpler)**

Backend sets a CSRF cookie:
```go
// Server sets on each response:
http.SetCookie(w, &http.Cookie{
    Name:     "csrf_token",
    Value:    generateCSRFToken(),
    HttpOnly: false,  // Must be readable by JS
    Secure:   true,
    SameSite: http.SameSiteStrictMode,
    Path:     "/",
})
```

Frontend reads and includes in header:
```typescript
// apiClient.ts
apiClient.interceptors.request.use((config) => {
  const csrfToken = getCookie('csrf_token');
  if (csrfToken) {
    config.headers['X-CSRF-Token'] = csrfToken;
  }
  return config;
});

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
}
```

**Option 2: Synchronizer Token (More Secure)**

Server embeds token in HTML or initial API response, frontend stores in memory (not storage).

### Acceptance Criteria

- [ ] CSRF token generation implemented on server
- [ ] CSRF token included in all state-changing requests (POST, PUT, DELETE)
- [ ] Server validates CSRF token on all protected endpoints
- [ ] Token refreshed on authentication state changes
- [ ] Tests verify CSRF rejection for missing/invalid tokens

---

## Finding 2: Open Redirect in Authentication Flow

**Severity:** MEDIUM
**OWASP Category:** A01:2021 - Broken Access Control
**CWE:** CWE-601 (URL Redirection to Untrusted Site)

### Affected Files

| File | Line Number |
|------|-------------|
| `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/auth/AuthGuard.tsx` | 69-70 |
| `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/pages/Login.tsx` | 44-46, 54-56 |

### Vulnerable Code

**AuthGuard.tsx (lines 67-71):**
```typescript
if (!data?.authenticated) {
  const returnTo = location.pathname + location.search;
  return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
}
```

**Login.tsx (lines 44-46):**
```typescript
const returnTo = searchParams.get("returnTo");
const decodedReturnTo = returnTo ? decodeURIComponent(returnTo) : undefined;
const safeReturnTo = decodedReturnTo?.startsWith("/") ? decodedReturnTo : undefined;
```

### Analysis

The Login.tsx implementation includes basic validation (`startsWith("/")`), which is good. However:

1. **AuthGuard.tsx** constructs the returnTo without validation
2. The validation only checks for leading slash, not for `//evil.com` or `javascript:` protocols
3. Attackers can craft URLs like `/login?returnTo=//evil.com` which passes validation

**Bypass examples:**
```
/login?returnTo=//evil.com              # Protocol-relative URL
/login?returnTo=/\evil.com              # Backslash (some browsers normalize)
/login?returnTo=/%2Fevil.com            # Double-encoded slash
/login?returnTo=/redirect?url=evil.com  # Chained redirect
```

### Impact

- **Phishing:** Redirect users to attacker-controlled login pages
- **Credential theft:** Capture credentials on fake login form
- **OAuth attacks:** Steal authorization codes in OAuth flows

### Remediation

Implement strict URL validation:

```typescript
// utils/urlValidation.ts
export function isValidReturnUrl(url: string | null | undefined): url is string {
  if (!url) return false;

  // Decode first
  let decoded: string;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    return false;
  }

  // Must start with single forward slash
  if (!decoded.startsWith('/')) return false;

  // Must not be protocol-relative (//example.com)
  if (decoded.startsWith('//')) return false;

  // Must not contain backslashes (normalize issue)
  if (decoded.includes('\\')) return false;

  // Must not contain javascript: protocol
  if (decoded.toLowerCase().includes('javascript:')) return false;

  // Must not contain data: protocol
  if (decoded.toLowerCase().includes('data:')) return false;

  // Must be a valid relative URL
  try {
    const testUrl = new URL(decoded, window.location.origin);
    // Ensure it's same-origin after resolution
    if (testUrl.origin !== window.location.origin) return false;
  } catch {
    return false;
  }

  return true;
}

// Usage in Login.tsx:
const safeReturnTo = isValidReturnUrl(returnTo) ? decodeURIComponent(returnTo) : '/';
```

### Acceptance Criteria

- [ ] URL validation function created with comprehensive checks
- [ ] Validation applied in AuthGuard.tsx and Login.tsx
- [ ] Tests cover bypass attempts (`//`, `\`, `javascript:`, etc.)
- [ ] Default fallback to `/` on invalid URLs
- [ ] No redirect to external domains possible

---

## Finding 3: Cookie Security Considerations

**Severity:** LOW (Informational)
**OWASP Category:** A02:2021 - Cryptographic Failures
**CWE:** CWE-614 (Sensitive Cookie in HTTPS Session Without 'Secure' Attribute)

### Affected Files

| File | Description |
|------|-------------|
| `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/providers/localAuthProvider.ts` | Cookie handling documentation |

### Current Implementation

The frontend relies on server-set cookies with the following expected attributes (from documentation):
- `HttpOnly: true`
- `Secure: true` (in production)
- `SameSite: Strict`

**Review notes from `/apis-dashboard/_bmad-output/implementation-artifacts/13-7-setup-wizard.md`:**
```
3. Cookie flags: HttpOnly, Secure (in prod), SameSite=Strict
```

### Verification Needed

While the documentation indicates proper cookie configuration, verification is needed:

1. **Development environment:** Cookies should have `Secure` even in dev with HTTPS proxy
2. **Cross-origin:** `SameSite=Strict` prevents all cross-origin cookie sending
3. **Cookie scope:** `Path=/` vs `Path=/api` affects exposure

### Recommendations

1. **Verify server implementation** sets cookie flags correctly
2. **Test in production** that Secure flag is present
3. **Consider `__Host-` prefix** for additional binding:
   ```go
   // Server-side cookie name:
   "__Host-session" // Requires Secure, Path=/, no Domain
   ```

### Acceptance Criteria

- [ ] Verify server sets HttpOnly, Secure, SameSite=Strict on all auth cookies
- [ ] Integration test validates cookie attributes
- [ ] Development environment uses HTTPS for cookie testing
- [ ] Security headers audit includes cookie verification

---

## Finding 4: State-Changing GET Requests

**Severity:** LOW
**OWASP Category:** A04:2021 - Insecure Design
**CWE:** CWE-352 (CSRF via GET)

### Affected Files

Review of all API calls shows no state-changing GET requests, but verification is recommended.

### Verification Needed

Ensure the server rejects state-changing operations on GET requests:

1. **Clips:** `/api/clips/{id}?download=1` - Should be GET for download (OK)
2. **Authentication:** No logout via GET (OK - uses POST)
3. **Delete operations:** Never via GET (verify)

### Recommendations

Server should return `405 Method Not Allowed` for state-changing GET requests:

```go
// Example middleware:
func RequireMethod(methods ...string) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            for _, method := range methods {
                if r.Method == method {
                    next.ServeHTTP(w, r)
                    return
                }
            }
            http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
        })
    }
}
```

### Acceptance Criteria

- [ ] API audit confirms no state-changing GET endpoints
- [ ] Server returns 405 for GET on POST/PUT/DELETE routes
- [ ] No `<img>` or `<script>` tags can trigger state changes

---

## Summary Table

| Finding | Severity | OWASP | Fix Priority |
|---------|----------|-------|--------------|
| Missing CSRF tokens | MEDIUM | A01:2021 | P1 |
| Open redirect in auth | MEDIUM | A01:2021 | P1 |
| Cookie security verification | LOW | A02:2021 | P2 |
| State-changing GET review | LOW | A04:2021 | P3 |

## Defense in Depth Recommendation

Implement multiple layers of CSRF protection:

1. **Layer 1:** SameSite=Strict cookies (existing)
2. **Layer 2:** CSRF tokens in headers (recommended)
3. **Layer 3:** Origin/Referer header validation (server-side)
4. **Layer 4:** Custom request headers that preflight cross-origin

```typescript
// apiClient.ts - Add custom header that triggers CORS preflight
apiClient.interceptors.request.use((config) => {
  // This header will cause browsers to send OPTIONS preflight
  // for cross-origin requests, which attackers can't trigger
  config.headers['X-Requested-With'] = 'XMLHttpRequest';
  return config;
});
```

## References

- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [OWASP Unvalidated Redirects and Forwards](https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html)
- [CWE-352: Cross-Site Request Forgery](https://cwe.mitre.org/data/definitions/352.html)
- [CWE-601: URL Redirection to Untrusted Site](https://cwe.mitre.org/data/definitions/601.html)
