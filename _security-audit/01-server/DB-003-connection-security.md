# DB-003: Database Connection Security Analysis

**Audit Date:** 2026-01-31
**Auditor:** Claude Opus 4.5 Security Audit
**Scope:** `/apis-server/internal/secrets/secrets.go`, `/apis-server/internal/storage/postgres.go`

---

## Executive Summary

The APIS server has a **CRITICAL** security vulnerability: SSL/TLS is disabled for database connections. This allows attackers on the network path to intercept database credentials and query data.

Additionally, database credentials may be logged in plain text, and the fallback to environment variables could expose secrets in process listings.

**Overall Connection Security Risk: CRITICAL**

---

## Findings

### Finding 1: SSL Disabled for Database Connections (CRITICAL)

**Severity:** CRITICAL
**OWASP Category:** A02:2021 - Cryptographic Failures
**Status:** REQUIRES IMMEDIATE REMEDIATION
**CVSSv3 Score:** 8.1 (High)

**Location:**
- `/apis-server/internal/secrets/secrets.go:98-101`

**Vulnerable Code:**
```go
// ConnectionString returns a PostgreSQL connection string.
func (d *DatabaseConfig) ConnectionString() string {
    return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable",
        d.User, d.Password, d.Host, d.Port, d.Name)
}
```

**Attack Vector:**
1. Attacker positions themselves on the network between application and database (ARP spoofing, rogue VM, compromised router)
2. Database traffic is sent in plaintext due to `sslmode=disable`
3. Attacker captures:
   - Database credentials (username/password in connection handshake)
   - All SQL queries including sensitive tenant data
   - All query results including PII, API keys, etc.
4. Attacker can replay captured credentials or modify queries in transit

**Impact:**
- Complete compromise of all database credentials
- Exposure of all tenant data (multi-tenant platform)
- Potential for SQL injection via MITM (query modification)
- Compliance violations (GDPR, SOC2, HIPAA if applicable)

**Remediation:**

```go
// ConnectionString returns a PostgreSQL connection string with TLS enabled.
func (d *DatabaseConfig) ConnectionString() string {
    // Production: require verified TLS
    // sslmode=verify-full ensures both encryption AND server identity verification
    return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=verify-full",
        d.User, d.Password, d.Host, d.Port, d.Name)
}
```

**SSL Mode Options (from least to most secure):**
| Mode | Encryption | Server Verify | Man-in-Middle Protection |
|------|------------|---------------|--------------------------|
| `disable` | No | No | None |
| `allow` | Optional | No | None |
| `prefer` | If available | No | Weak |
| `require` | Yes | No | Partial (encrypts but doesn't verify server) |
| `verify-ca` | Yes | CA only | Good |
| `verify-full` | Yes | CA + hostname | Full |

**Recommended Configuration:**
```go
// For production
sslmode=verify-full&sslrootcert=/etc/ssl/certs/ca-certificates.crt

// For development with self-signed certs
sslmode=verify-ca&sslrootcert=/path/to/ca.crt

// Absolute minimum for any environment (NOT recommended)
sslmode=require
```

**Acceptance Criteria:**
- [ ] Remove `sslmode=disable` from connection string
- [ ] Add `sslmode=verify-full` for production configuration
- [ ] Add SSL certificate configuration options to DatabaseConfig
- [ ] Add environment variable for SSL mode override (for dev environments)
- [ ] Document SSL certificate deployment in infrastructure docs
- [ ] Verify YugabyteDB cluster has TLS enabled

---

### Finding 2: Credentials in Connection String Logging Risk (MEDIUM)

**Severity:** MEDIUM
**OWASP Category:** A09:2021 - Security Logging and Monitoring Failures
**Status:** REQUIRES REVIEW

**Location:**
- `/apis-server/internal/storage/postgres.go:73-78`

**Potentially Risky Code:**
```go
log.Info().
    Str("host", config.ConnConfig.Host).
    Uint16("port", config.ConnConfig.Port).
    Str("database", config.ConnConfig.Database).
    Int32("max_conns", config.MaxConns).
    Msg("Database connection pool initialized")
```

**Concern:**
While this specific log statement doesn't include credentials, the connection string is parsed earlier. If debug logging is enabled or if the code changes, credentials could be logged.

**Verification:**
```bash
# Search for potential credential logging
grep -rn "databaseURL\|Password\|connStr" apis-server/internal/storage/
```

**Current Status:** The current code appears safe - password is not logged.

**Recommendation:**
Add explicit credential scrubbing:
```go
// Redact password before any logging
safeURL := regexp.MustCompile(`://[^:]+:[^@]+@`).ReplaceAllString(databaseURL, "://***:***@")
log.Debug().Str("url", safeURL).Msg("Connecting to database")
```

**Acceptance Criteria:**
- [ ] Add credential scrubbing function
- [ ] Verify no passwords appear in logs at any level
- [ ] Add log audit for credential exposure

---

### Finding 3: Fallback to Environment Variables (LOW)

**Severity:** LOW
**OWASP Category:** A05:2021 - Security Misconfiguration
**Status:** ACCEPTABLE WITH DOCUMENTATION

**Location:**
- `/apis-server/internal/secrets/secrets.go:83-86, 115-120`

**Code:**
```go
func (c *Client) GetDatabaseConfig() (*DatabaseConfig, error) {
    if c.config.Source == "env" {
        return c.getDatabaseConfigFromEnv(), nil
    }
    return c.getDatabaseConfigFromOpenBao()
}

func (c *Client) getDatabaseConfigFromOpenBao() (*DatabaseConfig, error) {
    data, err := c.readSecret("database")
    if err != nil {
        log.Warn().Err(err).Msg("Failed to read database secrets from OpenBao, falling back to env")
        return c.getDatabaseConfigFromEnv(), nil  // FALLBACK
    }
    // ...
}
```

**Concern:**
1. Environment variables are visible in `/proc/<pid>/environ`
2. Process listings (`ps auxe`) may show environment
3. Container orchestration logs may capture env vars
4. Fallback behavior could mask OpenBao connectivity issues

**Recommendation:**
1. Document the fallback behavior clearly
2. Add option to disable fallback in production:
```go
func (c *Client) getDatabaseConfigFromOpenBao() (*DatabaseConfig, error) {
    data, err := c.readSecret("database")
    if err != nil {
        if os.Getenv("STRICT_SECRETS") == "true" {
            return nil, fmt.Errorf("OpenBao unavailable and STRICT_SECRETS=true: %w", err)
        }
        log.Warn().Err(err).Msg("Falling back to environment variables")
        return c.getDatabaseConfigFromEnv(), nil
    }
    // ...
}
```

**Acceptance Criteria:**
- [ ] Document fallback behavior in SECRETS-MANAGEMENT.md
- [ ] Add STRICT_SECRETS environment variable option
- [ ] Log fallback events at WARN level (already done)

---

### Finding 4: Default Database URL (LOW)

**Severity:** LOW
**OWASP Category:** A05:2021 - Security Misconfiguration
**Status:** ACCEPTABLE FOR DEVELOPMENT

**Location:**
- `/apis-server/internal/storage/postgres.go:23, 43-46`

**Code:**
```go
// DefaultDatabaseURL is the default connection string for local development.
const DefaultDatabaseURL = "postgres://yugabyte:yugabyte@localhost:5433/apis"

if databaseURL == "" {
    databaseURL = DefaultDatabaseURL
    log.Warn().Msg("DATABASE_URL not set, using default: " + DefaultDatabaseURL)
}
```

**Concern:**
1. Hardcoded credentials in source code
2. Default credentials could be used accidentally in production
3. Warning message includes the full URL with credentials

**Current Mitigations:**
- WARNING level log alerts operators
- Production should always have DATABASE_URL or OpenBao configured

**Recommendation:**
1. Remove credentials from log message:
```go
log.Warn().Msg("DATABASE_URL not set, using default localhost configuration")
```

2. Add production safety check:
```go
if os.Getenv("ENV") == "production" && databaseURL == DefaultDatabaseURL {
    log.Fatal().Msg("Cannot use default database URL in production")
}
```

**Acceptance Criteria:**
- [ ] Remove credentials from warning log message
- [ ] Add production environment check

---

### Finding 5: Connection Pool Configuration (GOOD)

**Severity:** INFO
**OWASP Category:** N/A
**Status:** PROPERLY CONFIGURED

**Location:**
- `/apis-server/internal/storage/postgres.go:53-58`

**Secure Configuration:**
```go
// Configure pool settings
config.MaxConns = 25
config.MinConns = 5
config.MaxConnLifetime = time.Hour
config.MaxConnIdleTime = 30 * time.Minute
config.HealthCheckPeriod = time.Minute
```

**Why This Is Good:**
1. `MaxConns = 25` prevents connection exhaustion attacks
2. `MaxConnLifetime = time.Hour` rotates connections, refreshing TLS sessions
3. `HealthCheckPeriod = time.Minute` detects stale connections
4. pgx library handles connection validation automatically

---

### Finding 6: OpenBao Token in Environment (LOW)

**Severity:** LOW
**OWASP Category:** A07:2021 - Identification and Authentication Failures
**Status:** ACCEPTABLE FOR DEV, NEEDS PRODUCTION ALTERNATIVE

**Location:**
- `/apis-server/internal/secrets/secrets.go:59-61`

**Code:**
```go
config := Config{
    Source:     getEnv("SECRETS_SOURCE", "openbao"),
    Addr:       getEnv("OPENBAO_ADDR", "http://localhost:8200"),
    Token:      getEnv("OPENBAO_TOKEN", ""),
    SecretPath: getEnv("OPENBAO_SECRET_PATH", "secret/data/apis"),
}
```

**Concern:**
Long-lived tokens in environment variables are a security risk in production.

**Recommendation:**
For production, use:
1. Kubernetes service account authentication (if on K8s)
2. AppRole authentication with short-lived tokens
3. IAM authentication (if on AWS/GCP/Azure)

**Example AppRole Flow:**
```go
// At startup, authenticate and get token
roleID := os.Getenv("OPENBAO_ROLE_ID")
secretID := os.Getenv("OPENBAO_SECRET_ID")  // Short-lived, rotated
token, err := authenticateAppRole(roleID, secretID)
```

---

## Summary of Required Actions

### Critical Priority
1. **Fix sslmode=disable** - Enable TLS for database connections

### High Priority
2. **Review credential logging** - Ensure passwords never appear in logs

### Medium Priority
3. **Document fallback behavior** - Update docs about OpenBao fallback
4. **Remove credentials from logs** - Scrub default URL from warning message

### Low Priority
5. **Add production safety checks** - Prevent default credentials in production
6. **Consider AppRole authentication** - For production OpenBao authentication

---

## Acceptance Criteria Summary

### For sslmode Fix (Critical)
- [ ] Change `sslmode=disable` to `sslmode=verify-full` (or configurable)
- [ ] Add SSL certificate path configuration
- [ ] Add SSL mode environment variable for dev override
- [ ] Update docker-compose to configure database TLS
- [ ] Test connection with TLS enabled
- [ ] Document TLS configuration in deployment docs

### For Credential Logging
- [ ] Audit all log statements for credential exposure
- [ ] Add credential scrubbing function
- [ ] Remove default URL from warning message
- [ ] Add log audit to CI pipeline

### For Production Safety
- [ ] Add STRICT_SECRETS option to disable env fallback
- [ ] Add production environment check for default credentials
- [ ] Document security requirements for production deployment

---

## Appendix: Verification Commands

```bash
# Check current sslmode setting
grep -rn "sslmode" apis-server/

# Search for potential credential logging
grep -rn "Password\|password\|credential" apis-server/internal/

# Verify TLS support in YugabyteDB
# (Run on database server)
ysqlsh -c "SHOW ssl"

# Test connection with SSL
psql "postgres://user:pass@host:5433/apis?sslmode=require"
```
