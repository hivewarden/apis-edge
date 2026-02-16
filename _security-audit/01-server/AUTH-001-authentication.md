# AUTH-001: Authentication Vulnerabilities

**Audit Date:** 2026-01-31
**Auditor:** Security Audit (Automated)
**Scope:** `/Users/jermodelaruelle/Projects/apis/apis-server/`

---

## Finding 1: Development Auth Bypass in Production Code

**Severity:** CRITICAL
**OWASP Category:** A07:2021 - Identification and Authentication Failures
**CWE:** CWE-287 (Improper Authentication)

### Location
- **File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/middleware/auth.go`
- **Lines:** 428-454

### Vulnerable Code
```go
// DevAuthMiddleware returns a middleware that bypasses authentication and injects mock claims.
// DEV MODE ONLY - This should NEVER be used in production!
// It allows accessing all protected endpoints without authentication setup.
func DevAuthMiddleware() func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            // DEV MODE: Injecting mock claims - authentication is bypassed!
            mockClaims := &Claims{
                UserID:   "dev-user-001",
                OrgID:    "dev-org-001",
                TenantID: "dev-org-001",
                Email:    "dev@apis.local",
                Name:     "Dev User",
                Role:     "admin",
                Roles:    []string{"admin"},
            }
            // ... bypasses all authentication
        })
    }
}
```

### Attack Vector
1. If `DISABLE_AUTH=true` environment variable is accidentally set (or can be influenced by an attacker in misconfigured deployments):
2. All API endpoints become accessible without any authentication
3. The mock claims grant **admin privileges** to all requests
4. Attacker gains full administrative access to the system

### Impact
- Complete authentication bypass
- Full admin access to all tenants
- Data exfiltration, modification, and deletion
- User impersonation capabilities

### Evidence of Risk
The middleware is activated in `main.go` lines 86-90 based on environment variable:
```go
// - DISABLE_AUTH=true: DevAuthMiddleware (bypasses all auth)
if config.IsAuthDisabled() {
    log.Warn().Msg("DEV MODE: Authentication is DISABLED - do not use in production!")
    return DevAuthMiddleware(), nil
}
```

### Remediation

1. **Remove DevAuthMiddleware entirely from production builds:**
```go
// Use build tags to exclude from production
// +build !production

func DevAuthMiddleware() func(http.Handler) http.Handler {
    // ... dev code
}
```

2. **Add additional safeguards in NewModeAwareAuthMiddleware:**
```go
func NewModeAwareAuthMiddleware(...) (func(http.Handler) http.Handler, error) {
    // NEVER allow DISABLE_AUTH in production
    if os.Getenv("GO_ENV") == "production" && config.IsAuthDisabled() {
        log.Fatal().Msg("CRITICAL: DISABLE_AUTH cannot be used in production")
    }

    // Require explicit acknowledgment
    if config.IsAuthDisabled() && os.Getenv("I_UNDERSTAND_AUTH_DISABLED") != "yes" {
        log.Fatal().Msg("DISABLE_AUTH requires I_UNDERSTAND_AUTH_DISABLED=yes")
    }
    // ...
}
```

3. **Log to external security monitoring when dev mode is active**

### Acceptance Criteria
- [ ] DevAuthMiddleware is not callable in production builds
- [ ] DISABLE_AUTH cannot be set when GO_ENV=production
- [ ] Security alert is triggered if dev mode is detected

---

## Finding 2: JWT Token Expiration Too Long

**Severity:** MEDIUM
**OWASP Category:** A07:2021 - Identification and Authentication Failures
**CWE:** CWE-613 (Insufficient Session Expiration)

### Location
- **File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/auth/local_jwt.go`
- **Lines:** 106-112

### Vulnerable Code
```go
const (
    // DefaultTokenExpiry is the default JWT expiration time (7 days).
    DefaultTokenExpiry = 7 * 24 * time.Hour
    // RememberMeTokenExpiry is the extended expiration for "remember me" sessions (30 days).
    RememberMeTokenExpiry = 30 * 24 * time.Hour
)
```

### Attack Vector
1. If a JWT token is stolen (via XSS, network interception, or device compromise)
2. Attacker has 7-30 days to use the token before it expires
3. No mechanism exists to invalidate tokens before expiration (no revocation list)

### Impact
- Prolonged unauthorized access if tokens are compromised
- Difficult to revoke access for terminated users
- Compliance issues with security policies requiring shorter session lifetimes

### Remediation

1. **Reduce default token expiration:**
```go
const (
    DefaultTokenExpiry = 24 * time.Hour  // 1 day
    RememberMeTokenExpiry = 7 * 24 * time.Hour  // 7 days
)
```

2. **Implement token refresh mechanism:**
```go
// Issue short-lived access tokens (15 min) with refresh tokens (7 days)
const (
    AccessTokenExpiry = 15 * time.Minute
    RefreshTokenExpiry = 7 * 24 * time.Hour
)
```

3. **Add token revocation list for immediate invalidation**

### Acceptance Criteria
- [ ] Access tokens expire within 1 hour
- [ ] Refresh token mechanism implemented
- [ ] Token revocation endpoint exists for logout/user deletion

---

## Finding 3: No JWT Token ID (JTI) for Revocation

**Severity:** MEDIUM
**OWASP Category:** A07:2021 - Identification and Authentication Failures
**CWE:** CWE-613 (Insufficient Session Expiration)

### Location
- **File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/auth/local_jwt.go`
- **Lines:** 138-151

### Vulnerable Code
```go
claims := LocalClaims{
    Claims: jwt.Claims{
        Subject:   userID,
        IssuedAt:  jwt.NewNumericDate(now),
        NotBefore: jwt.NewNumericDate(now),
        Expiry:    jwt.NewNumericDate(now.Add(expiry)),
        Issuer:    "apis-server",
        // MISSING: ID (jti) claim for token identification
    },
    // ...
}
```

### Attack Vector
1. When a user logs out, their token remains valid until expiration
2. If a user's account is deactivated, their existing tokens remain valid
3. When a password is changed, existing sessions are not invalidated

### Impact
- Cannot implement proper logout functionality
- Compromised sessions cannot be terminated
- Failed compliance with "logout should invalidate all sessions" requirements

### Remediation

1. **Add JTI claim to tokens:**
```go
import "github.com/google/uuid"

claims := LocalClaims{
    Claims: jwt.Claims{
        Subject:   userID,
        ID:        uuid.New().String(),  // Add unique token ID
        // ...
    },
}
```

2. **Implement token blacklist/revocation check in validation:**
```go
func ValidateLocalJWT(tokenString, secret string) (*LocalClaims, error) {
    // ... existing validation ...

    // Check if token is revoked
    if IsTokenRevoked(claims.ID) {
        return nil, ErrTokenRevoked
    }

    return &claims, nil
}
```

### Acceptance Criteria
- [ ] All JWTs include unique JTI claim
- [ ] Token revocation store implemented (Redis recommended)
- [ ] Logout invalidates token
- [ ] Password change invalidates all user tokens

---

## Finding 4: Missing Audience Validation in Local JWT

**Severity:** LOW
**OWASP Category:** A07:2021 - Identification and Authentication Failures
**CWE:** CWE-287 (Improper Authentication)

### Location
- **File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/auth/local_jwt.go`
- **Lines:** 138-151

### Vulnerable Code
```go
claims := LocalClaims{
    Claims: jwt.Claims{
        Subject:   userID,
        // ...
        Issuer:    "apis-server",
        // MISSING: Audience claim
    },
}
```

Contrast with Zitadel validation in `auth.go` line 326:
```go
expectedClaims := jwt.Expected{
    Issuer:      issuer,
    AnyAudience: jwt.Audience{clientID},  // Audience IS validated
    Time:        time.Now(),
}
```

### Attack Vector
1. If another service shares the same JWT secret
2. Tokens from that service could be accepted by APIS
3. Cross-service token confusion attacks

### Impact
- Tokens intended for other services might be accepted
- Reduced defense-in-depth

### Remediation

```go
// In CreateLocalJWT
claims := LocalClaims{
    Claims: jwt.Claims{
        Subject:   userID,
        Audience:  jwt.Audience{"apis-server"},
        // ...
    },
}

// In ValidateLocalJWT
expectedClaims := jwt.Expected{
    Issuer:   "apis-server",
    Audience: jwt.Audience{"apis-server"},
    Time:     time.Now(),
}
if err := claims.Claims.Validate(expectedClaims); err != nil {
    return nil, fmt.Errorf("%w: %v", ErrInvalidToken, err)
}
```

### Acceptance Criteria
- [ ] Audience claim added to local JWT creation
- [ ] Audience validated during token verification

---

## Finding 5: Rate Limiting Bypass via Email Case Variation

**Severity:** LOW
**OWASP Category:** A07:2021 - Identification and Authentication Failures
**CWE:** CWE-307 (Improper Restriction of Excessive Authentication Attempts)

### Location
- **File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/auth_local.go`
- **Lines:** 156-160 and 178-179

### Code Analysis
```go
// Line 160 - Email is normalized AFTER being used for some validation
req.Email = strings.TrimSpace(strings.ToLower(req.Email))

// Line 178-179 - Rate limiting uses the normalized email
checks := []ratelimit.LimiterWithKey{
    {Limiter: rateLimiters.EmailLimiter, Key: req.Email, Config: rateLimiters.EmailConfig},
```

This is actually **correct** - the email is normalized before rate limiting. However, the validation at line 156 happens BEFORE normalization, which could cause subtle inconsistencies.

### Remediation
Normalize email immediately after reading from request body (currently done correctly, just move the normalization earlier):

```go
req.Email = strings.TrimSpace(strings.ToLower(req.Email))
if req.Email == "" {
    respondError(w, "Email is required", http.StatusBadRequest)
    return
}
```

### Acceptance Criteria
- [ ] Email normalization happens immediately after parsing
- [ ] All email comparisons use normalized form

---

## Finding 6: Weak Password Minimum Length

**Severity:** LOW
**OWASP Category:** A07:2021 - Identification and Authentication Failures
**CWE:** CWE-521 (Weak Password Requirements)

### Location
- **File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/auth/password.go`
- **Line:** 38

### Vulnerable Code
```go
// MinPasswordLength is the minimum required password length.
const MinPasswordLength = 8
```

### Analysis
OWASP recommends 12+ characters for modern password policies. While 8 characters is the absolute minimum, longer passwords provide significantly better security.

### Remediation
```go
const MinPasswordLength = 12
```

### Acceptance Criteria
- [ ] Minimum password length increased to 12 characters
- [ ] Existing users prompted to update weak passwords

---

## Summary

| Finding | Severity | Status |
|---------|----------|--------|
| F1: Dev Auth Bypass | CRITICAL | Requires immediate attention |
| F2: JWT Expiration Too Long | MEDIUM | Should implement refresh tokens |
| F3: No JTI for Revocation | MEDIUM | Should implement token blacklist |
| F4: Missing Audience in Local JWT | LOW | Defense-in-depth improvement |
| F5: Rate Limit Email Normalization | LOW | Minor code ordering issue |
| F6: Weak Password Minimum | LOW | Policy improvement |

**Priority Recommendation:** Address Finding 1 (Dev Auth Bypass) immediately, as it represents a complete authentication bypass risk if misconfigured.
