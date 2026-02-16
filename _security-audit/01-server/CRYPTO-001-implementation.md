# CRYPTO-001: Cryptographic Implementation Review

**Severity:** LOW / INFORMATIONAL (with some MEDIUM concerns)
**OWASP Category:** A02:2021 - Cryptographic Failures
**Audit Date:** 2026-01-31
**Auditor:** Security Audit Agent

---

## Executive Summary

The APIS server implements several cryptographic mechanisms including password hashing, JWT signing, API key generation, and API key encryption. This review examines the implementation quality and identifies areas for improvement.

---

## Finding 1: Proper Password Hashing Implementation (POSITIVE)

### Description
The password hashing implementation uses bcrypt with an appropriate cost factor and includes validation.

### File Location
`/Users/jermodelaruelle/Projects/apis/apis-server/internal/auth/password.go`

### Implementation
```go
// BcryptCost is the cost factor for bcrypt hashing.
// Cost factor 12 is recommended for production because:
// - Takes ~250ms on modern hardware, providing good protection against brute force
// - Balances security with acceptable login latency
// - OWASP recommends cost 10+ for general applications
const BcryptCost = 12

func HashPassword(password string) (string, error) {
    if password == "" {
        return "", ErrPasswordRequired
    }
    hash, err := bcrypt.GenerateFromPassword([]byte(password), BcryptCost)
    if err != nil {
        return "", fmt.Errorf("auth: failed to hash password: %w", err)
    }
    return string(hash), nil
}
```

### Assessment
- **Algorithm:** bcrypt (appropriate for password hashing)
- **Cost Factor:** 12 (meets OWASP recommendation of 10+)
- **Input Validation:** Password cannot be empty
- **Length Limits:** Properly enforces 8-72 character range (bcrypt limitation)
- **Common Password Check:** Implemented via `IsCommonPassword()` function

### Status: SECURE

---

## Finding 2: JWT Implementation Review (POSITIVE with minor concern)

### Description
The JWT implementation uses appropriate algorithms and includes algorithm confusion attack prevention.

### File Location
`/Users/jermodelaruelle/Projects/apis/apis-server/internal/auth/local_jwt.go`

### Implementation
```go
// ValidateLocalJWT validates a local mode JWT token and extracts claims.
// Only HS256 algorithm is accepted to prevent algorithm confusion attacks.
func ValidateLocalJWT(tokenString, secret string) (*LocalClaims, error) {
    // Parse the JWT token with HS256 algorithm only
    // This prevents algorithm confusion attacks
    token, err := jwt.ParseSigned(tokenString, []jose.SignatureAlgorithm{jose.HS256})
    if err != nil {
        // Check if this is an algorithm mismatch
        tokenAny, parseErr := jwt.ParseSigned(tokenString, []jose.SignatureAlgorithm{jose.RS256, jose.ES256, jose.HS384, jose.HS512})
        if parseErr == nil && tokenAny != nil {
            return nil, ErrInvalidAlgorithm
        }
        return nil, fmt.Errorf("%w: %v", ErrInvalidToken, err)
    }
    // ...
}
```

### Assessment
- **Algorithm Selection:** HS256 for local mode, RS256/ES256 for Zitadel (appropriate)
- **Algorithm Confusion Prevention:** Explicitly restricts accepted algorithms
- **Expiration Validation:** Properly validates exp claim
- **Required Claims:** Validates sub, tenant_id, email presence

### Minor Concern: JWT Secret Length Validation
The secret minimum length is validated in config (32 chars), but could be enforced more strictly:

```go
// config/auth.go line 80
if cfg.jwtSecret != "" && len(cfg.jwtSecret) < minJWTSecretLength {
    return fmt.Errorf("config: JWT_SECRET must be at least %d characters (got %d)", minJWTSecretLength, len(cfg.jwtSecret))
}
```

**Recommendation:** Consider requiring 256 bits (32 bytes) of entropy, not just 32 characters. A 32-character password may have less entropy than needed for HS256.

### Status: SECURE (with minor improvement opportunity)

---

## Finding 3: AES-256-GCM Encryption for API Keys (POSITIVE)

### Description
The BeeBrain API key encryption uses AES-256-GCM, which provides both confidentiality and authenticity.

### File Location
`/Users/jermodelaruelle/Projects/apis/apis-server/internal/services/encryption.go`

### Implementation
```go
// EncryptAPIKey encrypts a plaintext API key using AES-256-GCM.
func (s *EncryptionService) EncryptAPIKey(plaintext string) (string, error) {
    block, err := aes.NewCipher(s.key)
    if err != nil {
        return "", fmt.Errorf("failed to create cipher: %w", err)
    }

    gcm, err := cipher.NewGCM(block)
    if err != nil {
        return "", fmt.Errorf("failed to create GCM: %w", err)
    }

    // Create a random nonce
    nonce := make([]byte, gcm.NonceSize())
    if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
        return "", fmt.Errorf("failed to generate nonce: %w", err)
    }

    // Encrypt and prepend nonce to ciphertext
    ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
    return base64.StdEncoding.EncodeToString(ciphertext), nil
}
```

### Assessment
- **Algorithm:** AES-256-GCM (AEAD - provides confidentiality + integrity)
- **Key Length:** Requires 32 bytes minimum
- **Nonce Generation:** Uses `crypto/rand` (cryptographically secure)
- **Nonce Handling:** Nonce prepended to ciphertext (correct approach)
- **No Nonce Reuse:** Fresh random nonce per encryption

### Status: SECURE

---

## Finding 4: Unit API Key Generation (MEDIUM Concern)

### Description
The unit API key generation approach should be verified to ensure sufficient entropy.

### File Location
API keys are generated in the storage layer. Based on patterns observed:

```go
// storage/units.go (inferred from handler usage)
unit, rawKey, err := storage.CreateUnit(r.Context(), conn, tenantID, input)
```

### Concern
The API key generation method was not directly visible in reviewed files. The implementation should:
1. Use `crypto/rand` for generation
2. Generate at least 256 bits of entropy
3. Use URL-safe base64 encoding

### Recommended Implementation
```go
import (
    "crypto/rand"
    "encoding/base64"
)

func GenerateAPIKey() (string, error) {
    bytes := make([]byte, 32) // 256 bits
    if _, err := rand.Read(bytes); err != nil {
        return "", err
    }
    return base64.URLEncoding.EncodeToString(bytes), nil
}
```

### Acceptance Criteria
- [ ] Verify API key uses `crypto/rand`
- [ ] Verify at least 256 bits of entropy
- [ ] Ensure keys are stored hashed (not plaintext) after initial display

### Status: NEEDS VERIFICATION

---

## Finding 5: Database Connection String in Memory (INFORMATIONAL)

### Description
The database connection string (including password) is constructed in memory and potentially logged.

### File Location
`/Users/jermodelaruelle/Projects/apis/apis-server/internal/secrets/secrets.go`

### Code
```go
func (d *DatabaseConfig) ConnectionString() string {
    return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable",
        d.User, d.Password, d.Host, d.Port, d.Name)
}
```

And logging at connection time:
```go
log.Info().
    Str("host", config.ConnConfig.Host).
    Uint16("port", config.ConnConfig.Port).
    Str("database", config.ConnConfig.Database).
    // Note: Password NOT logged - good!
    Msg("Database connection pool initialized")
```

### Assessment
- **Logging:** Password is NOT logged (correct)
- **Memory:** Password exists in memory as string (unavoidable for DB connection)
- **SSL Mode:** `sslmode=disable` may be a concern for production

### Recommendation
Consider enabling SSL for production database connections:
```go
func (d *DatabaseConfig) ConnectionString() string {
    sslMode := "disable"
    if os.Getenv("DB_SSL_MODE") != "" {
        sslMode = os.Getenv("DB_SSL_MODE")
    }
    return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=%s",
        d.User, d.Password, d.Host, d.Port, d.Name, sslMode)
}
```

### Status: ACCEPTABLE (with production SSL recommendation)

---

## Finding 6: OpenBao Token Transmission (INFORMATIONAL)

### Description
The OpenBao token is transmitted via HTTP header, which is the correct approach.

### File Location
`/Users/jermodelaruelle/Projects/apis/apis-server/internal/secrets/secrets.go`

### Code
```go
func (c *Client) readSecret(subpath string) (map[string]any, error) {
    url := fmt.Sprintf("%s/v1/%s/%s", c.config.Addr, c.config.SecretPath, subpath)
    req, err := http.NewRequest("GET", url, nil)
    if err != nil {
        return nil, fmt.Errorf("secrets: failed to create request: %w", err)
    }
    req.Header.Set("X-Vault-Token", c.config.Token) // Token in header, not URL
    // ...
}
```

### Assessment
- **Token Location:** Header (correct - not URL query parameter)
- **Logging:** Token not logged
- **Transport:** Should use HTTPS in production (currently http://localhost for dev)

### Status: SECURE (ensure HTTPS in production)

---

## Finding 7: Session Cookie Security (POSITIVE)

### Description
The session cookie implementation includes appropriate security flags.

### File Location
`/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/setup.go`

### Code
```go
func setSessionCookie(w http.ResponseWriter, r *http.Request, token string, rememberMe bool) {
    secure := r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https"

    // Check for explicit override
    if os.Getenv("SECURE_COOKIES") == "true" {
        secure = true
    }

    cookie := &http.Cookie{
        Name:     SessionCookieName,
        Value:    token,
        Path:     "/",
        HttpOnly: true,      // Prevents XSS access
        Secure:   secure,    // HTTPS only when appropriate
        SameSite: http.SameSiteStrictMode, // CSRF protection
        MaxAge:   maxAge,
    }
    http.SetCookie(w, cookie)
}
```

### Assessment
- **HttpOnly:** Set (prevents JavaScript access)
- **Secure:** Automatically set for HTTPS (prevents transmission over HTTP)
- **SameSite:** Strict (prevents CSRF attacks)
- **Path:** Root path (appropriate for session cookie)

### Status: SECURE

---

## Summary Table

| Finding | Category | Severity | Status |
|---------|----------|----------|--------|
| Password Hashing | Authentication | - | SECURE |
| JWT Implementation | Authentication | - | SECURE |
| AES-256-GCM Encryption | Cryptography | - | SECURE |
| API Key Generation | Cryptography | MEDIUM | NEEDS VERIFICATION |
| DB Connection | Configuration | INFO | ACCEPTABLE |
| OpenBao Token | Secrets | INFO | SECURE |
| Session Cookies | Authentication | - | SECURE |

---

## Recommendations Summary

1. **Verify API Key Entropy:** Confirm unit API keys use `crypto/rand` with sufficient entropy
2. **Enable DB SSL:** Configure SSL for production database connections
3. **JWT Secret Entropy:** Consider requiring measured entropy, not just character length
4. **HTTPS for OpenBao:** Ensure production OpenBao connections use HTTPS

---

## References

- OWASP Password Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- OWASP JWT Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html
- NIST SP 800-132 (Password-Based Key Derivation): https://csrc.nist.gov/publications/detail/sp/800-132/final
- RFC 8446 (TLS 1.3): https://tools.ietf.org/html/rfc8446
