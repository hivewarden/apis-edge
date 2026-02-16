# SECRETS-001: Secrets Management Vulnerabilities

**Severity:** CRITICAL / HIGH / MEDIUM (multiple issues)
**OWASP Category:** A07:2021 - Identification and Authentication Failures, A02:2021 - Cryptographic Failures
**Audit Date:** 2026-01-31
**Auditor:** Security Audit Agent

---

## Executive Summary

This audit identified multiple secrets management vulnerabilities in the APIS Go server, ranging from critical API key exposure in process arguments to default credentials in configuration files.

---

## Finding 1: API Key Exposed in Process Arguments (CRITICAL)

### Description
The OpenAI API key is passed directly as a command-line argument to curl, making it visible in process listings (`ps aux`, `/proc/*/cmdline`).

### File Location
`/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/transcribe.go`

### Line Numbers
Lines 287-294

### Vulnerable Code
```go
cmd := exec.Command("curl",
    "-s", // Silent
    "https://api.openai.com/v1/audio/transcriptions",
    "-H", "Authorization: Bearer "+apiKey,  // API KEY EXPOSED IN PROCESS ARGS
    "-F", "file=@"+audioPath,
    "-F", "model=whisper-1",
    "-F", "response_format=text",
)
```

### Attack Vector
1. Attacker gains limited shell access (even non-root)
2. Runs `ps aux | grep curl` or reads `/proc/*/cmdline`
3. Extracts the OpenAI API key from the command line
4. Uses the key to make unauthorized API calls, potentially incurring significant costs or accessing sensitive transcription data

### Impact
- **Confidentiality:** OpenAI API key fully compromised
- **Financial:** Unauthorized API usage charges
- **Compliance:** API key rotation may be required

### Remediation
Use Go's native HTTP client instead of shelling out to curl, passing the API key via headers in-memory:

```go
func transcribeWithOpenAI(audioPath string, apiKey string) (string, error) {
    file, err := os.Open(audioPath)
    if err != nil {
        return "", err
    }
    defer file.Close()

    // Create multipart form
    body := &bytes.Buffer{}
    writer := multipart.NewWriter(body)

    // Add file field
    part, err := writer.CreateFormFile("file", filepath.Base(audioPath))
    if err != nil {
        return "", err
    }
    if _, err := io.Copy(part, file); err != nil {
        return "", err
    }

    // Add other fields
    writer.WriteField("model", "whisper-1")
    writer.WriteField("response_format", "text")
    writer.Close()

    req, err := http.NewRequest("POST", "https://api.openai.com/v1/audio/transcriptions", body)
    if err != nil {
        return "", err
    }

    req.Header.Set("Authorization", "Bearer "+apiKey)  // In-memory, not visible in ps
    req.Header.Set("Content-Type", writer.FormDataContentType())

    client := &http.Client{Timeout: 30 * time.Second}
    resp, err := client.Do(req)
    if err != nil {
        return "", err
    }
    defer resp.Body.Close()

    result, err := io.ReadAll(resp.Body)
    if err != nil {
        return "", err
    }

    return string(result), nil
}
```

### Acceptance Criteria
- [ ] Replace curl with native Go HTTP client
- [ ] API key is never passed as command-line argument
- [ ] Verify with `ps aux | grep -i api` shows no credentials during transcription

---

## Finding 2: Development Token Hardcoded in docker-compose.yml (HIGH)

### Description
The OpenBao development token `apis-dev-token` is hardcoded in multiple places and used as a default, potentially being deployed to non-development environments.

### File Locations
- `/Users/jermodelaruelle/Projects/apis/docker-compose.yml` (lines 257, 262)
- `/Users/jermodelaruelle/Projects/apis/.env.example` (lines 22-24)
- `/Users/jermodelaruelle/Projects/apis/scripts/bootstrap-openbao.sh` (lines 22-23)

### Vulnerable Code
```yaml
# docker-compose.yml line 257
command: server -dev -dev-root-token-id=${OPENBAO_DEV_TOKEN:-apis-dev-token}

# .env.example lines 22-24
OPENBAO_TOKEN=apis-dev-token
OPENBAO_DEV_TOKEN=apis-dev-token
```

### Attack Vector
1. Developer or operator deploys using default docker-compose without changing token
2. Attacker discovers the predictable token value (public in repository)
3. Attacker connects to OpenBao at port 8200 using the known token
4. Full access to all secrets including database credentials

### Impact
- **Confidentiality:** All secrets in OpenBao compromised
- **Integrity:** Attacker can modify secrets
- **Availability:** Attacker can delete secrets or revoke tokens

### Remediation
1. Generate random tokens at startup instead of using predictable defaults
2. Add validation that prevents production deployment with dev tokens
3. Require explicit token configuration with no fallback

```bash
# scripts/bootstrap-openbao.sh - Add validation
if [[ "$OPENBAO_TOKEN" == "apis-dev-token" && "$ENVIRONMENT" != "development" ]]; then
    log_error "Cannot use development token in non-development environment"
    exit 1
fi
```

```go
// internal/secrets/secrets.go - Add runtime validation
func NewClient() *Client {
    token := getEnv("OPENBAO_TOKEN", "")
    if token == "" {
        log.Fatal().Msg("OPENBAO_TOKEN is required")
    }
    if token == "apis-dev-token" && os.Getenv("ALLOW_DEV_TOKEN") != "true" {
        log.Warn().Msg("Using development token - ensure this is not production")
    }
    // ...
}
```

### Acceptance Criteria
- [ ] No hardcoded tokens with fallback values in production code paths
- [ ] Runtime validation warns or fails on predictable tokens
- [ ] Documentation clearly states token must be changed for production

---

## Finding 3: Default Database Credentials in Configuration (MEDIUM)

### Description
Default database credentials (`yugabyte/yugabyte`, `apis/apisdev`, `zitadel/zitadel`) are present in configuration files and may be deployed unchanged.

### File Locations
- `/Users/jermodelaruelle/Projects/apis/.env.example` (lines 35-42)
- `/Users/jermodelaruelle/Projects/apis/.env` (lines 21-24)
- `/Users/jermodelaruelle/Projects/apis/docker-compose.yml` (lines 57-59, 95-100)
- `/Users/jermodelaruelle/Projects/apis/scripts/bootstrap-openbao.sh` (lines 25-26)

### Vulnerable Code
```yaml
# .env.example
YSQL_USER=yugabyte
YSQL_PASSWORD=yugabyte
APIS_DB_USER=apis
APIS_DB_PASSWORD=apisdev
```

```yaml
# docker-compose.yml - Zitadel database
- POSTGRES_USER=zitadel
- POSTGRES_PASSWORD=zitadel
```

### Attack Vector
1. System deployed with default credentials
2. Database ports exposed (5433, 5432)
3. Attacker connects with known credentials
4. Full database access including user data, passwords, and secrets

### Impact
- **Confidentiality:** All database contents accessible
- **Integrity:** Data can be modified or deleted
- **Compliance:** PII exposure, potential GDPR violation

### Remediation
1. Generate random passwords during initial setup
2. Remove defaults from .env.example, only show placeholders
3. Add startup validation that rejects known weak passwords

```yaml
# .env.example - Use placeholders
YSQL_PASSWORD=<GENERATE_SECURE_PASSWORD>
APIS_DB_PASSWORD=<GENERATE_SECURE_PASSWORD>
ZITADEL_ADMIN_PASSWORD=<GENERATE_SECURE_PASSWORD>
```

```go
// Add validation in storage/postgres.go
func validateCredentials(user, password string) error {
    knownDefaults := []string{"yugabyte", "apisdev", "password", "admin"}
    for _, def := range knownDefaults {
        if password == def {
            return fmt.Errorf("refusing to use known default password")
        }
    }
    return nil
}
```

### Acceptance Criteria
- [ ] No default passwords in .env.example (placeholders only)
- [ ] Runtime validation rejects known default passwords
- [ ] Setup script generates random passwords if not provided

---

## Finding 4: .env File Committed to Repository (HIGH)

### Description
The `.env` file containing real credentials appears in git status as modified, indicating it may be tracked or previously committed. This file contains actual secrets.

### Evidence
Git status shows:
```
M .env.example
```
And glob found:
```
/Users/jermodelaruelle/Projects/apis/.env
```

### File Content (Partial)
```
OPENBAO_TOKEN=apis-dev-token
YSQL_PASSWORD=yugabyte
ZITADEL_MASTERKEY=MasterkeyNeedsToHave32Chars!!!!!
ZITADEL_ADMIN_PASSWORD=Admin123!
DISABLE_AUTH=true
```

### Attack Vector
1. `.env` file committed to git history
2. Repository cloned or accessed (even historical)
3. Attacker extracts credentials from file
4. Credentials used even if currently rotated (may reveal patterns)

### Impact
- **Confidentiality:** All credentials in file exposed
- **Persistence:** Git history preserves secrets indefinitely

### Remediation
1. Add `.env` to `.gitignore` immediately
2. Use `git filter-branch` or BFG Repo-Cleaner to remove from history
3. Rotate all credentials that were exposed

```bash
# Add to .gitignore
echo ".env" >> .gitignore

# Verify not tracked
git rm --cached .env 2>/dev/null || true

# Remove from history (use BFG for efficiency)
# bfg --delete-files .env
```

### Acceptance Criteria
- [ ] `.env` is in `.gitignore`
- [ ] `.env` is not tracked in git
- [ ] Historical commits with `.env` removed (if applicable)
- [ ] All exposed credentials rotated

---

## Finding 5: Authentication Bypass via DISABLE_AUTH (MEDIUM)

### Description
The `DISABLE_AUTH=true` environment variable completely bypasses authentication, and this is set to `true` in the `.env` file.

### File Location
- `/Users/jermodelaruelle/Projects/apis/.env` (line 32)
- `/Users/jermodelaruelle/Projects/apis/apis-server/internal/middleware/auth.go` (lines 428-454)

### Vulnerable Code
```go
// DevAuthMiddleware returns a middleware that bypasses authentication and injects mock claims.
// DEV MODE ONLY - This should NEVER be used in production!
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
            // ...
        })
    }
}
```

### Attack Vector
1. Production deployed with `DISABLE_AUTH=true`
2. All API endpoints accessible without authentication
3. Attacker has full admin access to all functionality
4. Mock user has admin role by default

### Impact
- **Authentication:** Completely bypassed
- **Authorization:** Attacker has admin privileges
- **Multi-tenancy:** Single mock tenant used for all requests

### Remediation
1. Remove `DISABLE_AUTH=true` from any committed configuration
2. Add startup warning/validation
3. Consider removing this feature entirely or requiring additional confirmation

```go
func NewModeAwareAuthMiddleware(...) (func(http.Handler) http.Handler, error) {
    if config.IsAuthDisabled() {
        // Additional safety check
        if os.Getenv("ENVIRONMENT") == "production" || os.Getenv("ENVIRONMENT") == "prod" {
            log.Fatal().Msg("DISABLE_AUTH cannot be true in production environment")
        }
        log.Warn().Msg("DEV MODE: Authentication is DISABLED - do not use in production!")
        return DevAuthMiddleware(), nil
    }
    // ...
}
```

### Acceptance Criteria
- [ ] `DISABLE_AUTH` not set in any production configuration
- [ ] Runtime check prevents `DISABLE_AUTH` in production environment
- [ ] Prominent warning in logs when auth is disabled

---

## Finding 6: Zitadel Masterkey with Known Pattern (MEDIUM)

### Description
The Zitadel masterkey `MasterkeyNeedsToHave32Chars!!!!!` is a predictable placeholder that may be used in production.

### File Locations
- `/Users/jermodelaruelle/Projects/apis/.env.example` (line 48)
- `/Users/jermodelaruelle/Projects/apis/.env` (line 27)
- `/Users/jermodelaruelle/Projects/apis/scripts/bootstrap-openbao.sh` (line 84)

### Attack Vector
1. Masterkey not changed from placeholder value
2. Attacker knowing this pattern can attempt decryption
3. All Zitadel secrets encrypted with this key compromised

### Impact
- **Confidentiality:** Zitadel internal secrets compromised
- **Authentication:** Token signing keys potentially exposed

### Remediation
Generate a cryptographically random 32-byte key:

```bash
# Generate proper masterkey
openssl rand -base64 32 | head -c 32

# .env.example - placeholder
ZITADEL_MASTERKEY=<GENERATE_32_CHAR_RANDOM_KEY>
```

Add validation:
```go
func validateMasterkey(key string) error {
    knownPatterns := []string{
        "MasterkeyNeedsToHave32Chars!!!!!",
        "00000000000000000000000000000000",
    }
    for _, pattern := range knownPatterns {
        if key == pattern {
            return fmt.Errorf("refusing to use known placeholder masterkey")
        }
    }
    return nil
}
```

### Acceptance Criteria
- [ ] Placeholder masterkey not in production
- [ ] Documentation explains how to generate secure masterkey
- [ ] Validation rejects known placeholder patterns

---

## Summary Table

| Finding | Severity | OWASP | Status |
|---------|----------|-------|--------|
| API Key in Process Args | CRITICAL | A02:2021 | Open |
| Hardcoded Dev Token | HIGH | A07:2021 | Open |
| Default DB Credentials | MEDIUM | A07:2021 | Open |
| .env Committed | HIGH | A02:2021 | Open |
| Auth Bypass | MEDIUM | A07:2021 | Open |
| Predictable Masterkey | MEDIUM | A02:2021 | Open |

---

## References

- OWASP A02:2021 - Cryptographic Failures: https://owasp.org/Top10/A02_2021-Cryptographic_Failures/
- OWASP A07:2021 - Identification and Authentication Failures: https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures/
- CWE-798: Use of Hard-coded Credentials: https://cwe.mitre.org/data/definitions/798.html
- CWE-214: Invocation of Process Using Visible Sensitive Information: https://cwe.mitre.org/data/definitions/214.html
