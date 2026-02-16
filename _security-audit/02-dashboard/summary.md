# APIS Dashboard Security Audit Summary

**Audit Date:** 2026-01-31
**Auditor:** Claude Opus 4.5 Security Audit
**Scope:** `/Users/jermodelaruelle/Projects/apis/apis-dashboard/`
**LOC Analyzed:** ~63,000

---

## Executive Summary

The APIS React dashboard has several security vulnerabilities primarily in authentication token handling, XSS prevention, CSRF protection, and PWA offline security. The most critical issues involve OIDC tokens stored in browser storage (XSS-vulnerable), a development mode bypass that ships to production bundles, and missing Content Security Policy headers.

**Overall Security Posture: REQUIRES IMPROVEMENT**

---

## Risk Summary

| Severity | Count | Key Issues |
|----------|-------|------------|
| Critical | 0 | - |
| High | 3 | DEV_MODE bypass in production, OIDC tokens in sessionStorage, Missing CSP |
| Medium | 9 | CSRF protection, logout flow, auth config cache, localStorage tokens, XSS via innerHTML |
| Low | 4 | Token exposure in logs, dynamic style injection, JSON.parse error handling |

**Total Findings: 16**

---

## Findings by Category

### Authentication (AUTH-001)

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| AUTH-001-1 | HIGH | OIDC tokens stored in sessionStorage (XSS vulnerable) | Open |
| AUTH-001-2 | MEDIUM | Orphaned localStorage token reference | Open |
| AUTH-001-3 | MEDIUM | Incomplete logout/session invalidation | Open |
| AUTH-001-4 | MEDIUM | Auth config cache without integrity check | Open |
| AUTH-001-5 | HIGH | DEV_MODE bypass persists in production bundle | Open |
| AUTH-001-6 | LOW | Token exposure in console logs/errors | Open |
| AUTH-001-7 | MEDIUM | Missing CSRF protection (local auth mode) | Open |

### Cross-Site Scripting (XSS-001)

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| XSS-001-1 | MEDIUM | Unsafe innerHTML in map components | Open |
| XSS-001-2 | LOW | Dynamic style injection via CSS-in-JS | Open |
| XSS-001-3 | MEDIUM | Unvalidated image URLs from user data | Open |
| XSS-001-4 | LOW | JSON.parse without try-catch in critical paths | Open |

### CSRF Protection (CSRF-001)

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| CSRF-001-1 | MEDIUM | Missing CSRF token implementation | Open |
| CSRF-001-2 | MEDIUM | Open redirect in authentication flow | Open |
| CSRF-001-3 | LOW | Cookie security verification needed | Open |
| CSRF-001-4 | LOW | State-changing GET review needed | Open |

### PWA Security (PWA-001)

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| PWA-001-1 | MEDIUM | Sensitive data in IndexedDB without encryption | Open |
| PWA-001-2 | HIGH | Missing Content Security Policy | Open |
| PWA-001-3 | MEDIUM | Service worker cache poisoning risk | Open |
| PWA-001-4 | MEDIUM | Auth token reference in localStorage | Open |
| PWA-001-5 | MEDIUM | Insufficient data cleanup on logout | Open |

### Dependencies (DEPS-001)

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| DEPS-001-1 | MEDIUM | axios v1.13.2 - monitor for updates | Monitor |
| DEPS-001-2 | HIGH | marked v4.3.0 significantly outdated | Open |
| DEPS-001-3 | MEDIUM | Multiple semver versions in tree | Open |

---

## Critical Remediation Priorities

### Immediate (0-7 days)

1. **AUTH-001-5: Remove DEV_MODE from production builds**
   - Use build-time dead code elimination
   - Ensure dev auth code is not shipped to production
   - Verify with `grep -r "DEV_MODE" dist/` returns nothing

2. **AUTH-001-1: Move OIDC tokens to in-memory storage**
   - Configure oidc-client-ts with InMemoryWebStorage
   - Tokens cleared on page refresh but secure from XSS

3. **PWA-001-2: Implement Content Security Policy**
   - Add CSP header via server or meta tag
   - Block inline scripts, limit external resources

### Short-term (7-30 days)

4. **AUTH-001-2, AUTH-001-3**: Fix orphaned token reference, implement proper logout
5. **AUTH-001-7, CSRF-001-1**: Implement CSRF token protection
6. **XSS-001-1**: Replace innerHTML with React state-based rendering
7. **PWA-001-5**: Ensure complete data cleanup on logout

### Medium-term (30-90 days)

8. **AUTH-001-4**: Add integrity verification to auth config cache
9. **PWA-001-1**: Consider encrypting sensitive IndexedDB data
10. **DEPS-001**: Update outdated dependencies, add npm audit to CI

---

## Positive Observations

1. **React XSS Protection**: JSX automatic escaping prevents most XSS attacks
2. **Refine Framework**: Uses secure patterns for data fetching
3. **TypeScript**: Strong typing helps prevent injection vulnerabilities
4. **HttpOnly Cookies**: Local auth uses server-set HttpOnly cookies (correct)
5. **SameSite Cookies**: Cookies configured with SameSite=Strict
6. **Ant Design**: Mature component library with secure defaults

---

## Security Headers Checklist

Required headers for production deployment:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; ...
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(self), microphone=(self)
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

---

## Files Reviewed

| Category | Files |
|----------|-------|
| Auth Providers | `localAuthProvider.ts`, `zitadelAuthProvider.ts`, `refineAuthProvider.ts` |
| Components | `AuthGuard.tsx`, `SiteMapThumbnail.tsx`, `SiteMapView.tsx`, `VoiceInputButton.tsx` |
| Services | `whisperTranscription.ts`, `offlineInspection.ts`, `offlineCache.ts`, `db.ts` |
| Configuration | `config.ts`, `apiClient.ts`, `vite.config.ts`, `index.html` |
| Pages | `Login.tsx` and 30+ page components |

---

## Revision History

| Date | Change |
|------|--------|
| 2026-01-31 | Initial dashboard security audit |
