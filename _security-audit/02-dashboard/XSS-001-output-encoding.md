# XSS-001: Output Encoding and DOM-Based XSS Vulnerabilities

## Summary

This finding documents Cross-Site Scripting (XSS) and output encoding vulnerabilities discovered in the APIS React dashboard. While React provides automatic XSS protection for most rendering scenarios, several patterns bypass these protections and introduce potential attack vectors.

---

## Finding 1: Unsafe innerHTML Usage in Map Components

**Severity:** MEDIUM
**OWASP Category:** A03:2021 - Injection
**CWE:** CWE-79 (Improper Neutralization of Input During Web Page Generation)

### Affected Files

| File | Line Number |
|------|-------------|
| `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/SiteMapThumbnail.tsx` | 92-96 |
| `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/SiteMapView.tsx` | 83-88 |

### Vulnerable Code

**SiteMapThumbnail.tsx (lines 86-98):**
```typescript
onError={(e) => {
  // Fallback to placeholder if map fails to load
  const target = e.target as HTMLImageElement;
  target.style.display = 'none';
  if (target.parentElement) {
    target.parentElement.innerHTML = `
      <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: rgba(0,0,0,0.45); font-size: 11px;">
        <span>${latitude.toFixed(4)}, ${longitude.toFixed(4)}</span>
      </div>
    `;
  }
}}
```

**SiteMapView.tsx (lines 78-90):**
```typescript
onError={(e) => {
  const target = e.target as HTMLImageElement;
  target.style.display = 'none';
  if (target.parentElement) {
    target.parentElement.innerHTML = `
      <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; flex-direction: column; color: rgba(0,0,0,0.45);">
        <span style="font-size: 24px; margin-bottom: 8px;">&#128205;</span>
        <span>${latitude.toFixed(6)}, ${longitude.toFixed(6)}</span>
      </div>
    `;
  }
}}
```

### Attack Vector

While the `latitude` and `longitude` values are typed as `number`, the data originates from the server (Site records). If an attacker can manipulate the database or intercept API responses, they could inject malicious payloads:

1. A compromised database could store non-numeric strings in GPS coordinate fields
2. A man-in-the-middle attack could modify API responses
3. Type coercion in JavaScript could allow string injection

**Example payload:**
```javascript
// If latitude somehow becomes a string like:
latitude = "<img src=x onerror=alert('XSS')>";
// The innerHTML assignment would execute JavaScript
```

### Impact

- **Session Hijacking:** Attacker could steal session cookies or tokens
- **Credential Theft:** Capture form inputs including passwords
- **UI Spoofing:** Display fake UI elements to trick users
- **Data Exfiltration:** Access and transmit sensitive offline data from IndexedDB

### Remediation

Replace `innerHTML` with React state-based rendering:

```typescript
// SiteMapThumbnail.tsx
const [showFallback, setShowFallback] = useState(false);

// In the render:
return (
  <div style={{ width, height, borderRadius: 4, overflow: 'hidden', backgroundColor: '#f0f0f0' }}>
    {showFallback ? (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'rgba(0,0,0,0.45)',
        fontSize: 11
      }}>
        <span>{latitude.toFixed(4)}, {longitude.toFixed(4)}</span>
      </div>
    ) : (
      <img
        src={mapUrl}
        alt={`Map at ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`}
        onError={() => setShowFallback(true)}
        // ... rest of props
      />
    )}
  </div>
);
```

### Acceptance Criteria

- [ ] All `innerHTML` assignments removed from SiteMapThumbnail.tsx
- [ ] All `innerHTML` assignments removed from SiteMapView.tsx
- [ ] Fallback content rendered using React components
- [ ] Unit tests verify fallback renders correctly on image error
- [ ] No `innerHTML` or `outerHTML` usage in component files (grep verification)

---

## Finding 2: Dynamic Style Injection via CSS-in-JS

**Severity:** LOW
**OWASP Category:** A03:2021 - Injection
**CWE:** CWE-79 (Cross-site Scripting)

### Affected Files

| File | Line Number |
|------|-------------|
| `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/VoiceInputButton.tsx` | 98-123 |
| `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/ConfettiAnimation.tsx` | 146-... |

### Vulnerable Code

**VoiceInputButton.tsx (lines 98-123):**
```typescript
useEffect(() => {
  const styleId = 'voice-button-pulse-style';
  if (document.getElementById(styleId)) {
    return;
  }
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @keyframes voicePulse {
      0%, 100% { opacity: 0.6; }
      50% { opacity: 1; }
    }
    // ... more CSS
  `;
  document.head.appendChild(style);
}, []);
```

### Attack Vector

The style injection itself uses hardcoded CSS, so the immediate risk is low. However, this pattern of injecting styles directly into the DOM:

1. Bypasses Content Security Policy (CSP) `style-src` restrictions
2. Sets a precedent that could be copied with dynamic values
3. Could be exploited if the CSS content is later made dynamic

### Impact

- Enables CSS injection attacks if pattern is extended
- Complicates CSP implementation
- Can be used for data exfiltration via CSS selectors (e.g., `input[value^="a"]`)

### Remediation

Use CSS modules or styled-components with the build system:

```typescript
// VoiceInputButton.module.css
@keyframes voicePulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

.pulseRing {
  animation: voicePulse 2s ease-in-out infinite;
}

// VoiceInputButton.tsx
import styles from './VoiceInputButton.module.css';
// Then use: className={styles.pulseRing}
```

Or add animations to the global CSS in `index.html` which is already being used for similar patterns.

### Acceptance Criteria

- [ ] Dynamic style injection moved to CSS files or CSS modules
- [ ] No `document.createElement('style')` calls in components
- [ ] Animations work correctly after refactor
- [ ] CSP can restrict `style-src` to `'self'`

---

## Finding 3: Uncontrolled User-Provided URLs in Image Sources

**Severity:** MEDIUM
**OWASP Category:** A03:2021 - Injection
**CWE:** CWE-601 (URL Redirection to Untrusted Site)

### Affected Files

| File | Line Number |
|------|-------------|
| `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/MilestonesGallery.tsx` | 70, 233 |
| `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/ClipCard.tsx` | 114 |

### Vulnerable Code

**MilestonesGallery.tsx (lines 44, 70, 233):**
```typescript
const thumbnailUrl = photo.thumbnail_path || photo.file_path;
// ...
background: `url(${thumbnailUrl}) center/cover no-repeat`,
// ...
<Image src={viewingPhoto.file_path} alt={...} />
```

### Attack Vector

If an attacker can control `file_path` or `thumbnail_path` values (via database compromise or API manipulation), they could:

1. **Track users:** `http://attacker.com/tracking-pixel.png?user=<id>`
2. **Phishing:** Display misleading images to social engineer users
3. **Content injection:** Load offensive or inappropriate content

While image tags generally have limited XSS risk in modern browsers, SVG images can contain JavaScript.

### Impact

- User tracking and information disclosure
- Phishing attacks via spoofed imagery
- Potential script execution via SVG files

### Remediation

Validate and sanitize URLs before rendering:

```typescript
function isValidImageUrl(url: string): boolean {
  // Only allow relative paths or specific trusted domains
  if (url.startsWith('/api/') || url.startsWith('/uploads/')) {
    return true;
  }

  try {
    const parsed = new URL(url, window.location.origin);
    // Only allow same-origin URLs
    return parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}

// Usage:
const safeUrl = isValidImageUrl(thumbnailUrl) ? thumbnailUrl : '/images/placeholder.png';
```

Add server-side validation to reject external URLs in `file_path` fields.

### Acceptance Criteria

- [ ] URL validation function created for image sources
- [ ] All user-provided image URLs validated before rendering
- [ ] Server-side validation prevents external URLs in file paths
- [ ] Test cases cover malicious URL patterns
- [ ] SVG files are served with `Content-Type: image/svg+xml` and not inline

---

## Finding 4: JSON.parse Without Try-Catch in Critical Paths

**Severity:** LOW
**OWASP Category:** A03:2021 - Injection
**CWE:** CWE-20 (Improper Input Validation)

### Affected Files

| File | Line Numbers |
|------|--------------|
| `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/services/offlineInspection.ts` | 210, 217, 302, 336, 384 |
| `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/services/offlineTasks.ts` | 342, 421, 456, 490, 518 |
| `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/services/backgroundSync.ts` | 222, 246, 397, 408, 488 |
| `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/config.ts` | 72, 127 |

### Vulnerable Code

**offlineInspection.ts (line 210):**
```typescript
const syncEntries = await db.sync_queue
  .where('table')
  .equals('inspections')
  .filter(entry => {
    const payload = JSON.parse(entry.payload);  // No try-catch
    return payload.local_id === localId;
  })
  .toArray();
```

### Attack Vector

While IndexedDB data is same-origin protected, corrupted or maliciously crafted data could cause:

1. **Application crash:** Invalid JSON causes unhandled exception
2. **Denial of Service:** Repeated crashes prevent app usage
3. **Prototype pollution:** Crafted JSON with `__proto__` keys

Example of prototype pollution:
```javascript
const maliciousJson = '{"__proto__": {"isAdmin": true}}';
JSON.parse(maliciousJson);  // Could pollute Object.prototype
```

### Impact

- Application instability
- Potential prototype pollution attacks
- Poor user experience with unhandled errors

### Remediation

Wrap all JSON.parse calls in try-catch and validate the parsed structure:

```typescript
function safeJsonParse<T>(json: string, defaultValue: T): T {
  try {
    const parsed = JSON.parse(json);
    // Prevent prototype pollution
    if (typeof parsed === 'object' && parsed !== null) {
      delete parsed.__proto__;
      delete parsed.constructor;
    }
    return parsed as T;
  } catch {
    console.error('[safeJsonParse] Invalid JSON:', json.slice(0, 100));
    return defaultValue;
  }
}

// Usage:
const payload = safeJsonParse(entry.payload, { local_id: null });
if (payload.local_id === localId) { ... }
```

### Acceptance Criteria

- [ ] All JSON.parse calls wrapped in try-catch
- [ ] Error handling logs corruption but continues gracefully
- [ ] Prototype pollution prevention in place
- [ ] Unit tests cover malformed JSON handling
- [ ] Application doesn't crash on corrupted IndexedDB data

---

## Summary Table

| Finding | Severity | OWASP | Fix Priority |
|---------|----------|-------|--------------|
| innerHTML in map components | MEDIUM | A03:2021 | P1 |
| Dynamic style injection | LOW | A03:2021 | P3 |
| Unvalidated image URLs | MEDIUM | A03:2021 | P2 |
| JSON.parse without try-catch | LOW | A03:2021 | P2 |

## References

- [OWASP XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [React Security Best Practices](https://react.dev/reference/react-dom/components/common#dangerously-setting-the-inner-html)
- [CWE-79: Improper Neutralization of Input During Web Page Generation](https://cwe.mitre.org/data/definitions/79.html)
