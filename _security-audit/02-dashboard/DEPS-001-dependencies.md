# DEPS-001: Dashboard Dependency Vulnerabilities

**Severity:** HIGH
**OWASP Category:** A06:2021 - Vulnerable and Outdated Components
**Component:** apis-dashboard (React Frontend)
**Date:** 2026-01-31

---

## Executive Summary

Analysis of `/apis-dashboard/package.json` and `/apis-dashboard/package-lock.json` reveals a large dependency tree with multiple packages that have historical security concerns. While many direct dependencies are current, the transitive dependency chain includes packages requiring attention.

---

## Critical Findings

### 1. axios v1.13.2 (MEDIUM)

**Package:** `axios` (transitive via `@refinedev/simple-rest`)
**Current Version:** 1.13.2
**Status:** CURRENT but monitor

**Historical CVEs:**
- CVE-2023-45857: CSRF/SSRF via redirect handling (fixed in 1.6.0)
- CVE-2024-28849: Header exposure on redirect (fixed in 1.6.8)

**Current Status:** v1.13.2 includes all patches.

**Recommendation:**
- Ensure axios is configured with `maxRedirects` limit
- Validate redirect URLs in sensitive requests

---

### 2. follow-redirects v1.15.11 (MEDIUM)

**Package:** `follow-redirects` (transitive via axios)
**Current Version:** 1.15.11
**Status:** CURRENT

**Historical CVEs:**
- CVE-2024-28849: Proxy-Authorization header leak (fixed in 1.15.6)
- CVE-2023-26159: URL leak to target server (fixed in 1.15.4)

**Current Status:** v1.15.11 is patched.

**Recommendation:** Continue monitoring for updates.

---

### 3. semver Multiple Versions (MEDIUM)

**Package:** `semver`
**Observed Versions:** 5.7.2, 6.3.1, 7.5.2, 7.7.3

**Issue:** Multiple versions of semver in dependency tree indicates dependency confusion potential and increases attack surface.

**Historical CVEs:**
- CVE-2022-25883: ReDoS vulnerability (fixed in 7.5.2+ and 6.3.1+)

**Current Status:** All observed versions appear patched.

**Recommendation:**
- Run `npm dedupe` to reduce duplicate dependencies
- Consider adding overrides to force single version

---

### 4. marked v4.3.0 (HIGH)

**Package:** `marked` (transitive via `@refinedev/cli`)
**Current Version:** 4.3.0
**Latest Version:** 15.x+

**Historical CVEs:**
- CVE-2023-26115: ReDoS vulnerability (fixed in 4.3.0)
- CVE-2022-21681: ReDoS in heading parser
- Multiple XSS vulnerabilities in older versions

**Current Status:** v4.3.0 is significantly outdated (latest is 15.x).

**Recommendation:**
- This is a dev dependency via refine CLI
- Ensure marked is never used to render user-generated markdown in production
- Request refine to update their dependency

---

### 5. node-fetch v2.7.0 (MEDIUM)

**Package:** `node-fetch` (transitive via `@refinedev/cli`)
**Current Version:** 2.7.0
**Status:** Legacy version

**Issue:** node-fetch v2.x is in maintenance mode. v3.x is ESM-only.

**Historical CVEs:**
- CVE-2022-0235: Cookie header leak on redirect (fixed in 2.6.7)

**Current Status:** v2.7.0 is patched.

**Recommendation:**
- This is primarily a dev dependency
- Monitor for additional vulnerabilities

---

### 6. lodash v4.17.21 (LOW - Monitor)

**Package:** `lodash`
**Current Version:** 4.17.21
**Status:** CURRENT (final 4.x release)

**Historical CVEs:**
- CVE-2021-23337: Command injection in template() (fixed in 4.17.21)
- CVE-2020-8203: Prototype pollution (fixed in 4.17.19)
- CVE-2019-10744: Prototype pollution (fixed in 4.17.12)

**Current Status:** v4.17.21 includes all patches.

**Note:** Project uses `lodash-es` (v4.17.23) which is ESM-compatible. Both versions should be kept at latest.

**Recommendation:**
- Avoid using `lodash.template()` with user input
- Consider using native JS methods where possible

---

### 7. minimist v1.2.8 (LOW)

**Package:** `minimist` (transitive)
**Current Version:** 1.2.8
**Status:** CURRENT

**Historical CVEs:**
- CVE-2021-44906: Prototype pollution (fixed in 1.2.6)
- CVE-2020-7598: Prototype pollution (fixed in 1.2.3)

**Current Status:** v1.2.8 is patched.

---

### 8. postcss v8.5.6 and v8.4.49 (LOW)

**Package:** `postcss`
**Observed Versions:** 8.5.6, 8.4.49
**Status:** CURRENT

**Historical CVEs:**
- CVE-2023-44270: Line return injection (fixed in 8.4.31)

**Current Status:** Both versions are patched.

---

### 9. tough-cookie v6.0.0 (INFORMATIONAL)

**Package:** `tough-cookie` (dev dependency via jsdom)
**Current Version:** 6.0.0
**Status:** CURRENT

**Historical CVEs:**
- CVE-2023-26136: Prototype pollution (fixed in 4.1.3)

**Current Status:** v6.0.0 is fully patched.

---

### 10. json5 v2.2.3 (LOW)

**Package:** `json5` (transitive via babel)
**Current Version:** 2.2.3
**Status:** CURRENT

**Historical CVEs:**
- CVE-2022-46175: Prototype pollution (fixed in 2.2.2)

**Current Status:** v2.2.3 is patched.

---

### 11. decode-uri-component v0.2.2 (LOW)

**Package:** `decode-uri-component` (transitive via query-string)
**Current Version:** 0.2.2
**Status:** CURRENT

**Historical CVEs:**
- CVE-2022-38900: DoS via malformed input (fixed in 0.2.1)

**Current Status:** v0.2.2 is patched.

---

### 12. word-wrap v1.2.5 (LOW)

**Package:** `word-wrap` (dev dependency via optionator/eslint)
**Current Version:** 1.2.5
**Status:** CURRENT

**Historical CVEs:**
- CVE-2023-26115: ReDoS vulnerability (fixed in 1.2.4)

**Current Status:** v1.2.5 is patched.

---

## Dependency Health Summary

| Category | Count | Status |
|----------|-------|--------|
| Direct Dependencies | 22 | Good |
| Dev Dependencies | 19 | Good |
| Transitive (estimated) | 500+ | Requires Audit |
| Known Vulnerable | 0 | Current patches applied |
| Outdated (significant) | 1 | marked v4.3.0 |

---

## Development vs Production Concerns

### Production Dependencies (Higher Priority)
- `axios`, `lodash-es`, `react`, `antd` - All current
- These ship to users and must be kept updated

### Dev Dependencies (Lower Priority but Still Important)
- `marked`, `jsdom`, `eslint` - Run in dev/CI only
- Still require updates to prevent supply chain attacks

---

## Remediation Steps

### Immediate Actions (Within 1 Week)

1. **Run npm audit**
   ```bash
   cd apis-dashboard
   npm audit
   npm audit fix
   ```

2. **Update all patch versions**
   ```bash
   npm update
   ```

3. **Dedupe dependencies**
   ```bash
   npm dedupe
   ```

### Short-term Actions (Within 1 Month)

4. **Add npm audit to CI**
   ```yaml
   - name: Security Audit
     run: npm audit --audit-level=high
   ```

5. **Consider overrides for duplicate versions**
   ```json
   // package.json
   "overrides": {
     "semver": "^7.7.3"
   }
   ```

6. **Update major versions where safe**
   - Test thoroughly before merging

### Ongoing Actions

7. **Enable Dependabot/Renovate**
   - Automated PR creation for updates
   - Security-only updates as minimum

8. **Monthly full audit**
   ```bash
   npm audit
   npx npm-check-updates -u
   npm install
   npm test
   ```

---

## React/Vite Specific Security Notes

### Vite v5.4.7 (CURRENT)
- Vite is actively maintained
- HMR is dev-only, not a production concern
- Build output is static

### React v18.3.1 (CURRENT)
- React 18 includes improved security defaults
- JSX auto-escaping prevents most XSS

### Ant Design v5.21.0 (CURRENT)
- Enterprise-grade component library
- Regular security updates

---

## Acceptance Criteria

- [ ] `npm audit` returns 0 high/critical vulnerabilities
- [ ] `npm audit` added to CI pipeline with `--audit-level=high`
- [ ] No duplicate semver versions after `npm dedupe`
- [ ] Dependabot or Renovate enabled for automated updates
- [ ] All direct dependencies at latest minor version
- [ ] Quarterly review of dependency health scheduled

---

## Testing Commands

```bash
cd apis-dashboard

# Run security audit
npm audit

# Fix automatically fixable issues
npm audit fix

# Check for updates
npx npm-check-updates

# Update all to latest minor/patch
npm update

# Reduce duplicate packages
npm dedupe

# Verify build still works
npm run build

# Run tests
npm test
```

---

## Package.json Security Additions

Consider adding to `package.json`:

```json
{
  "scripts": {
    "audit": "npm audit --audit-level=high",
    "audit:fix": "npm audit fix",
    "outdated": "npm outdated"
  },
  "overrides": {
    "semver": "^7.7.3"
  }
}
```

---

## References

- [npm audit documentation](https://docs.npmjs.com/cli/commands/npm-audit)
- [OWASP A06:2021](https://owasp.org/Top10/A06_2021-Vulnerable_and_Outdated_Components/)
- [Snyk Vulnerability Database](https://snyk.io/vuln/)
- [GitHub Advisory Database](https://github.com/advisories)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
