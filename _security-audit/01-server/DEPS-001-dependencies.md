# DEPS-001: Server Dependency Vulnerabilities

**Severity:** MEDIUM
**OWASP Category:** A06:2021 - Vulnerable and Outdated Components
**Component:** apis-server (Go Backend)
**Date:** 2026-01-31

---

## Executive Summary

Analysis of `/apis-server/go.mod` and `/apis-server/go.sum` reveals generally well-maintained dependencies with recent versions. However, several areas warrant attention for security hardening.

---

## Findings

### 1. Go Version - Excellent (Informational)

**Current:** Go 1.24.0
**Status:** CURRENT

The project uses Go 1.24.0 which includes security improvements and the latest stdlib patches. This is positive.

---

### 2. Direct Dependencies Analysis

| Package | Version | Status | Notes |
|---------|---------|--------|-------|
| `github.com/go-chi/chi/v5` | v5.2.3 | CURRENT | Latest version, no known CVEs |
| `github.com/go-jose/go-jose/v4` | v4.0.5 | CURRENT | JOSE/JWT library, critical for auth |
| `github.com/google/uuid` | v1.6.0 | CURRENT | UUID generation, stable |
| `github.com/gorilla/websocket` | v1.5.3 | CURRENT | Latest, no known CVEs |
| `github.com/jackc/pgx/v5` | v5.8.0 | CURRENT | PostgreSQL driver, actively maintained |
| `github.com/microcosm-cc/bluemonday` | v1.0.27 | CURRENT | HTML sanitizer, critical for XSS prevention |
| `github.com/redis/go-redis/v9` | v9.17.3 | CURRENT | Latest version |
| `github.com/rs/cors` | v1.11.1 | CURRENT | CORS middleware |
| `github.com/rs/zerolog` | v1.33.0 | CURRENT | Structured logging |
| `github.com/shopspring/decimal` | v1.4.0 | CURRENT | Decimal arithmetic |
| `github.com/stretchr/testify` | v1.11.1 | CURRENT | Testing framework |
| `golang.org/x/crypto` | v0.45.0 | CURRENT | Go crypto extensions |
| `gopkg.in/yaml.v3` | v3.0.1 | CURRENT | YAML parsing |

---

### 3. Security-Relevant Observations

#### 3.1 go-jose/go-jose/v4 (MEDIUM - Monitor)

**Package:** `github.com/go-jose/go-jose/v4 v4.0.5`
**Risk:** JWT/JOSE libraries are historically targeted for cryptographic vulnerabilities

**Historical CVEs in go-jose:**
- CVE-2024-28180 (January 2024): Denial of Service via malformed JWE
- CVE-2023-50658 (December 2023): Key confusion in JWE

**Current Status:** v4.0.5 should include patches for known issues, but this library requires ongoing monitoring.

**Recommendation:**
- Ensure you are validating JWT claims properly (exp, iat, iss, aud)
- Subscribe to go-jose security advisories
- Run `govulncheck` regularly

---

#### 3.2 golang-jwt/jwt/v5 (MEDIUM - Monitor)

**Package:** `github.com/golang-jwt/jwt/v5 v5.3.0` (indirect dependency)
**Risk:** JWT libraries require careful configuration

**Historical Issues:**
- Algorithm confusion attacks if `alg` header is not validated
- Key type mismatches

**Recommendation:**
- Ensure explicit algorithm specification in JWT validation
- Never accept `none` algorithm
- Validate key types match expected algorithms

---

#### 3.3 gorilla/websocket (LOW - Informational)

**Package:** `github.com/gorilla/websocket v1.5.3`
**Note:** The Gorilla project was archived in late 2022 but has since been revived under community maintenance.

**Current Status:** v1.5.3 is actively maintained with security patches.

**Recommendation:**
- Continue monitoring for updates
- Consider migration to `nhooyr.io/websocket` for long-term if Gorilla maintenance lapses again

---

#### 3.4 YAML Parsing (LOW - Monitor)

**Package:** `gopkg.in/yaml.v3 v3.0.1`
**Risk:** YAML libraries can be vulnerable to deserialization attacks

**Current Status:** v3.0.1 is secure and actively maintained.

**Recommendation:**
- Avoid parsing untrusted YAML from user input
- If parsing user YAML, use strict mode and limit recursion

---

### 4. Indirect Dependencies of Note

| Package | Version | Concern |
|---------|---------|---------|
| `golang.org/x/net` | v0.47.0 | Network utilities, keep updated |
| `golang.org/x/text` | v0.31.0 | Text processing, keep updated |
| `golang.org/x/sync` | v0.18.0 | Concurrency primitives |
| `golang.org/x/sys` | v0.38.0 | System calls |

These `golang.org/x/*` packages are well-maintained by the Go team. Current versions appear up-to-date.

---

### 5. Missing Security Dependencies (Recommendations)

Consider adding:

1. **Rate Limiting Library**
   - Already using custom `middleware/ratelimit.go`
   - Consider `github.com/ulule/limiter` for distributed rate limiting if scaling

2. **Security Headers Middleware**
   - `github.com/unrolled/secure` for HSTS, CSP, etc.

3. **Vulnerability Scanning**
   - Add `govulncheck` to CI pipeline

---

## Remediation Steps

### Immediate Actions

1. **Add govulncheck to CI** (HIGH PRIORITY)
   ```yaml
   # In CI pipeline
   - name: Run govulncheck
     run: |
       go install golang.org/x/vuln/cmd/govulncheck@latest
       govulncheck ./...
   ```

2. **Verify JWT Configuration**
   - Review auth middleware for algorithm validation
   - Ensure no `none` algorithm acceptance

### Ongoing Actions

3. **Monthly Dependency Updates**
   ```bash
   go get -u ./...
   go mod tidy
   govulncheck ./...
   ```

4. **Subscribe to Security Advisories**
   - Go security mailing list
   - GitHub security alerts for go-jose, golang-jwt

---

## Acceptance Criteria

- [ ] `govulncheck` runs in CI and returns 0 vulnerabilities
- [ ] JWT auth code explicitly specifies allowed algorithms
- [ ] `go mod tidy` shows no unused dependencies
- [ ] No HIGH or CRITICAL CVEs present in dependency tree
- [ ] Security headers middleware added or equivalent custom implementation verified

---

## Testing Commands

```bash
# Check for known vulnerabilities
cd apis-server
go install golang.org/x/vuln/cmd/govulncheck@latest
govulncheck ./...

# Update all dependencies
go get -u ./...
go mod tidy

# Verify build
go build ./...
go test ./...
```

---

## References

- [Go Vulnerability Database](https://vuln.go.dev/)
- [OWASP A06:2021](https://owasp.org/Top10/A06_2021-Vulnerable_and_Outdated_Components/)
- [go-jose Security Advisories](https://github.com/go-jose/go-jose/security/advisories)
- [golang-jwt Security](https://github.com/golang-jwt/jwt/security)
