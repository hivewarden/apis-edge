# CONFIG-002: Environment Variable and Secrets Exposure Issues

## Summary

This audit identifies security vulnerabilities related to secrets management, environment variable handling, and credential exposure in deployment configurations.

---

## Finding 1: Hardcoded Database Credentials in Docker Compose

**Severity:** HIGH
**OWASP Category:** A07:2021 - Identification and Authentication Failures
**CWE:** CWE-798 (Use of Hard-coded Credentials)

### Location
- **File:** `/Users/jermodelaruelle/Projects/apis/docker-compose.yml`
- **Lines:** 14-17, 35-40, 56-59, 96-100

### Vulnerable Configuration
```yaml
# Line 14-17
environment:
  - YSQL_USER=${YSQL_USER:-yugabyte}
  - YSQL_PASSWORD=${YSQL_PASSWORD:-yugabyte}
  - YSQL_DB=${YSQL_DB:-yugabyte}

# Line 35-40
environment:
  - YSQL_USER=${YSQL_USER:-yugabyte}
  - YSQL_PASSWORD=${YSQL_PASSWORD:-yugabyte}
  - APIS_DB_USER=${APIS_DB_USER:-apis}
  - APIS_DB_PASSWORD=${APIS_DB_PASSWORD:-apisdev}

# Line 56-59
environment:
  - POSTGRES_USER=zitadel
  - POSTGRES_PASSWORD=zitadel
  - POSTGRES_DB=zitadel

# Line 94-100
environment:
  - ZITADEL_DATABASE_POSTGRES_ADMIN_USERNAME=zitadel
  - ZITADEL_DATABASE_POSTGRES_ADMIN_PASSWORD=zitadel
  - ZITADEL_DATABASE_POSTGRES_USER_USERNAME=zitadel
  - ZITADEL_DATABASE_POSTGRES_USER_PASSWORD=zitadel
```

### Attack Vector
1. **Version control exposure** - docker-compose.yml is committed to Git with default credentials visible
2. **Process listing** - credentials visible via `docker inspect` or `ps aux`
3. **Predictable defaults** - if .env file is missing, well-known defaults are used
4. **Zitadel DB credentials** - hardcoded with no variable substitution at all

### Remediation
1. Use Docker secrets for sensitive data:
```yaml
services:
  yugabytedb:
    environment:
      - YSQL_PASSWORD_FILE=/run/secrets/ysql_password
    secrets:
      - ysql_password

secrets:
  ysql_password:
    file: ./secrets/ysql_password.txt  # Not committed to git
```

2. Remove all hardcoded defaults from docker-compose.yml:
```yaml
environment:
  - YSQL_USER=${YSQL_USER:?YSQL_USER is required}
  - YSQL_PASSWORD=${YSQL_PASSWORD:?YSQL_PASSWORD is required}
```

3. Add secrets directory to .gitignore

### Acceptance Criteria
- [ ] No hardcoded credentials in docker-compose.yml
- [ ] Docker secrets used for sensitive values
- [ ] Missing required secrets cause startup failure with clear error
- [ ] secrets/ directory in .gitignore

---

## Finding 2: Weak Default Credentials in .env.example

**Severity:** HIGH
**OWASP Category:** A07:2021 - Identification and Authentication Failures
**CWE:** CWE-1393 (Use of Default Credentials)

### Location
- **File:** `/Users/jermodelaruelle/Projects/apis/.env.example`
- **Lines:** 22-24, 35-42, 48-49

### Vulnerable Configuration
```bash
# Line 22-24
OPENBAO_TOKEN=apis-dev-token
OPENBAO_SECRET_PATH=secret/data/apis
OPENBAO_DEV_TOKEN=apis-dev-token

# Line 35-42
YSQL_USER=yugabyte
YSQL_PASSWORD=yugabyte
YSQL_DB=yugabyte
APIS_DB_USER=apis
APIS_DB_PASSWORD=apisdev

# Line 48-49
ZITADEL_MASTERKEY=MasterkeyNeedsToHave32Chars!!!!!
ZITADEL_ADMIN_PASSWORD=Admin123!
```

### Attack Vector
1. **Copy-paste deployment** - developers may copy .env.example to .env without changing values
2. **Predictable credentials** - attackers can try these known defaults in production
3. **Weak passwords** - "Admin123!" and "apisdev" are easily guessable
4. **Token exposure** - OpenBao dev token is visible and static

### Remediation
1. Replace real values with clear placeholders:
```bash
# OpenBao Configuration
# IMPORTANT: Generate a secure token for production
OPENBAO_TOKEN=<generate-secure-token>
OPENBAO_DEV_TOKEN=<for-dev-only-change-in-prod>

# Database - CHANGE THESE IN PRODUCTION
YSQL_USER=<your-db-admin-user>
YSQL_PASSWORD=<generate-secure-password-min-20-chars>
APIS_DB_USER=<your-app-db-user>
APIS_DB_PASSWORD=<generate-secure-password-min-20-chars>

# Zitadel - MUST BE CHANGED
# Masterkey: Exactly 32 characters, use: openssl rand -base64 32 | head -c 32
ZITADEL_MASTERKEY=<run-openssl-rand-base64-32>
# Admin password: Minimum 12 chars, mixed case, numbers, symbols
ZITADEL_ADMIN_PASSWORD=<strong-admin-password>
```

2. Add a validation script that checks for placeholder values:
```bash
#!/bin/bash
# scripts/validate-env.sh
if grep -q '<' .env; then
    echo "ERROR: .env contains placeholder values. Please configure all variables."
    exit 1
fi
```

### Acceptance Criteria
- [ ] .env.example uses placeholder syntax, not real values
- [ ] Comments explain security requirements for each secret
- [ ] Validation script prevents starting with placeholder values
- [ ] Password complexity requirements documented

---

## Finding 3: Secrets Logged in Bootstrap Scripts

**Severity:** MEDIUM
**OWASP Category:** A09:2021 - Security Logging and Monitoring Failures
**CWE:** CWE-532 (Insertion of Sensitive Information into Log File)

### Location
- **File:** `/Users/jermodelaruelle/Projects/apis/scripts/bootstrap-openbao.sh`
- **Lines:** 74-95

### Vulnerable Configuration
```bash
# Line 74-80 - Secrets written with interpolated values
write_secret "${SECRET_PATH}/database" '{
    "host": "yugabytedb",
    "port": "5433",
    "name": "apis",
    "user": "'"${APIS_DB_USER}"'",
    "password": "'"${APIS_DB_PASSWORD}"'"
}'

# Line 83-87 - More secrets with interpolation
write_secret "${SECRET_PATH}/zitadel" '{
    "masterkey": "MasterkeyNeedsToHave32Chars!!",
    "admin_username": "admin",
    "admin_password": "Admin123!"
}'

# Line 178 - Verification command printed with token
echo "  curl -H \"X-Vault-Token: \\$OPENBAO_TOKEN\" ${OPENBAO_ADDR}/v1/${SECRET_PATH}/database"
```

### Attack Vector
1. If `set -x` is enabled for debugging, all secrets are logged to stdout
2. Container logs (`docker logs apis-openbao-bootstrap`) may contain secrets
3. CI/CD systems often capture and store all command output
4. The hardcoded Zitadel credentials (line 83-87) expose real secret values

### Remediation
1. Never echo secrets, even in debug mode:
```bash
# Use --silent for curl calls
curl -sf --silent \
    -H "X-Vault-Token: ${OPENBAO_TOKEN}" \
    ...

# Don't print verification commands with real paths
log_info "Secrets written. Verify with: bao kv get secret/apis/database"
```

2. Remove hardcoded secrets from bootstrap script:
```bash
write_secret "${SECRET_PATH}/zitadel" "{
    \"masterkey\": \"${ZITADEL_MASTERKEY:?ZITADEL_MASTERKEY required}\",
    \"admin_username\": \"${ZITADEL_ADMIN_USER:-admin}\",
    \"admin_password\": \"${ZITADEL_ADMIN_PASSWORD:?ZITADEL_ADMIN_PASSWORD required}\"
}"
```

3. Add log sanitization:
```bash
# Redirect sensitive operations to /dev/null
write_secret "${SECRET_PATH}/database" "${db_json}" 2>/dev/null
```

### Acceptance Criteria
- [ ] No hardcoded credentials in bootstrap scripts
- [ ] Secrets not printed to stdout/stderr
- [ ] Container logs do not contain credential values
- [ ] Verification commands use environment variable syntax

---

## Finding 4: Database Credentials in Init Script Command Line

**Severity:** MEDIUM
**OWASP Category:** A07:2021 - Identification and Authentication Failures
**CWE:** CWE-214 (Invocation of Process Using Visible Sensitive Information)

### Location
- **File:** `/Users/jermodelaruelle/Projects/apis/scripts/init-yugabytedb.sh`
- **Lines:** 15, 24-30, 34-48

### Vulnerable Configuration
```bash
# Line 15 - Password in environment variable passed to psql
until PGPASSWORD="$YSQL_PASSWORD" psql -h "$YSQL_HOST" ...

# Lines 24-30 - Password visible in process listing
PGPASSWORD="$YSQL_PASSWORD" psql -h "$YSQL_HOST" -p "$YSQL_PORT" -U "$YSQL_USER" -d yugabyte -c "
    SELECT 'User ${APIS_DB_USER} exists' ...
PGPASSWORD="$YSQL_PASSWORD" psql ... -c "CREATE USER ${APIS_DB_USER} WITH PASSWORD '${APIS_DB_PASSWORD}';"
```

### Attack Vector
1. **Process listing** - `ps aux` shows PGPASSWORD environment variable and the CREATE USER command with plaintext password
2. **Container inspection** - `docker inspect` reveals environment variables
3. **Shell history** - if run manually, commands may be in shell history
4. **Log aggregation** - CREATE USER statements often logged by PostgreSQL

### Remediation
1. Use .pgpass file instead of PGPASSWORD:
```bash
# Create temporary pgpass file
echo "${YSQL_HOST}:${YSQL_PORT}:*:${YSQL_USER}:${YSQL_PASSWORD}" > ~/.pgpass
chmod 600 ~/.pgpass

# psql will automatically use .pgpass
psql -h "$YSQL_HOST" -p "$YSQL_PORT" -U "$YSQL_USER" -d yugabyte -c "..."

# Clean up
rm -f ~/.pgpass
```

2. Use ALTER USER with password file for app user:
```bash
# Store password in file
echo "${APIS_DB_PASSWORD}" > /tmp/app_password

# Use \password or ALTER with file
psql ... -c "ALTER USER ${APIS_DB_USER} WITH PASSWORD '$(cat /tmp/app_password)';"

# Secure delete
shred -u /tmp/app_password 2>/dev/null || rm -f /tmp/app_password
```

3. Disable PostgreSQL logging of DDL statements containing passwords

### Acceptance Criteria
- [ ] Passwords not visible in process listings
- [ ] .pgpass used instead of PGPASSWORD where possible
- [ ] Temporary password files securely deleted
- [ ] CREATE/ALTER USER with passwords not logged

---

## Finding 5: OpenBao Token Passed via Environment Variable

**Severity:** HIGH
**OWASP Category:** A07:2021 - Identification and Authentication Failures
**CWE:** CWE-522 (Insufficiently Protected Credentials)

### Location
- **File:** `/Users/jermodelaruelle/Projects/apis/docker-compose.yml`
- **Lines:** 166-168, 257, 262, 281-284

### Vulnerable Configuration
```yaml
# apis-server (lines 166-168)
environment:
  - OPENBAO_ADDR=${OPENBAO_ADDR:-http://openbao:8200}
  - OPENBAO_TOKEN=${OPENBAO_TOKEN:-apis-dev-token}
  - OPENBAO_SECRET_PATH=${OPENBAO_SECRET_PATH:-secret/data/apis}

# openbao (lines 257, 262)
command: server -dev -dev-root-token-id=${OPENBAO_DEV_TOKEN:-apis-dev-token}
environment:
  - OPENBAO_DEV_ROOT_TOKEN_ID=${OPENBAO_DEV_TOKEN:-apis-dev-token}

# openbao-bootstrap (lines 281-284)
environment:
  - OPENBAO_ADDR=http://openbao:8200
  - OPENBAO_TOKEN=${OPENBAO_TOKEN:-apis-dev-token}
```

### Attack Vector
1. **Container inspection** - `docker inspect apis-server` reveals the token
2. **/proc access** - processes can read environment variables from /proc/1/environ
3. **Core dumps** - environment variables may be included in crash dumps
4. **Orchestrator exposure** - Kubernetes secrets mounted as env vars are less secure than file mounts
5. **Child process inheritance** - any forked process inherits all env vars including the token

### Remediation
1. Use Docker secrets (Swarm) or file-based secrets:
```yaml
apis-server:
  secrets:
    - openbao_token
  environment:
    - OPENBAO_TOKEN_FILE=/run/secrets/openbao_token

secrets:
  openbao_token:
    file: ./secrets/openbao_token.txt
```

2. For production, use OpenBao's AppRole authentication:
```yaml
apis-server:
  environment:
    - OPENBAO_ADDR=${OPENBAO_ADDR}
    - OPENBAO_ROLE_ID=${OPENBAO_ROLE_ID}
    # Secret ID should be injected at runtime, not stored
```

3. Application code reads from file:
```go
func getOpenBaoToken() (string, error) {
    tokenFile := os.Getenv("OPENBAO_TOKEN_FILE")
    if tokenFile != "" {
        data, err := os.ReadFile(tokenFile)
        if err != nil {
            return "", err
        }
        return strings.TrimSpace(string(data)), nil
    }
    return os.Getenv("OPENBAO_TOKEN"), nil
}
```

### Acceptance Criteria
- [ ] Tokens not passed via environment variables in production
- [ ] Docker secrets or file mounts used for sensitive credentials
- [ ] AppRole or similar dynamic authentication considered
- [ ] Application supports reading secrets from files

---

## Finding 6: Zitadel Master Key in Environment Variable

**Severity:** CRITICAL
**OWASP Category:** A02:2021 - Cryptographic Failures
**CWE:** CWE-321 (Use of Hard-coded Cryptographic Key)

### Location
- **File:** `/Users/jermodelaruelle/Projects/apis/docker-compose.yml`
- **Line:** 89

### Vulnerable Configuration
```yaml
zitadel:
  environment:
    - ZITADEL_MASTERKEY=${ZITADEL_MASTERKEY}
```

And in `.env.example`:
```bash
ZITADEL_MASTERKEY=MasterkeyNeedsToHave32Chars!!!!!
```

### Attack Vector
The Zitadel masterkey is used to encrypt all sensitive data in the database including:
- User passwords (if stored)
- OIDC client secrets
- Service account keys
- Refresh tokens

If the masterkey is compromised:
1. All encrypted data can be decrypted
2. An attacker can forge authentication tokens
3. Complete identity system compromise

The masterkey being in an environment variable means:
- Visible in `docker inspect`
- May be logged by orchestrators
- Accessible via /proc/PID/environ
- Included in container crash dumps

### Remediation
1. Use Zitadel's file-based masterkey:
```yaml
zitadel:
  command: start-from-init --masterkeyFile /run/secrets/masterkey --tlsMode disabled
  secrets:
    - zitadel_masterkey

secrets:
  zitadel_masterkey:
    file: ./secrets/zitadel_masterkey.txt
```

2. Generate a secure masterkey:
```bash
# Generate exactly 32 bytes, base64 encoded
openssl rand 32 | base64 > secrets/zitadel_masterkey.txt
```

3. Ensure secrets directory is properly protected:
```bash
chmod 700 secrets/
chmod 600 secrets/*
```

### Acceptance Criteria
- [ ] Masterkey not in environment variables
- [ ] Masterkey read from file with restricted permissions
- [ ] Masterkey generated with sufficient entropy (256 bits)
- [ ] secrets/ directory has 700 permissions, files have 600

---

## Finding 7: Authentication Bypass Flag in Production Configuration

**Severity:** CRITICAL
**OWASP Category:** A07:2021 - Identification and Authentication Failures
**CWE:** CWE-306 (Missing Authentication for Critical Function)

### Location
- **File:** `/Users/jermodelaruelle/Projects/apis/docker-compose.yml`
- **Lines:** 163-164, 227-228

### Vulnerable Configuration
```yaml
# apis-server (lines 163-164)
environment:
  # DEV MODE: Set DISABLE_AUTH=true to bypass Zitadel authentication
  - DISABLE_AUTH=${DISABLE_AUTH:-false}

# apis-dashboard (lines 227-228)
environment:
  # DEV MODE: Set VITE_DEV_MODE=true to bypass authentication (matches DISABLE_AUTH on server)
  - VITE_DEV_MODE=${DISABLE_AUTH:-false}
```

### Attack Vector
1. If `DISABLE_AUTH=true` is accidentally set in production, all endpoints become unauthenticated
2. The environment variable is easily set via .env file with no guards
3. No mechanism prevents this flag from being enabled in production
4. Both frontend and backend authentication disabled with same variable

### Remediation
1. Add runtime checks that prevent this in production:
```go
func init() {
    if os.Getenv("DISABLE_AUTH") == "true" {
        if os.Getenv("ENVIRONMENT") == "production" ||
           os.Getenv("GO_ENV") == "production" {
            log.Fatal("DISABLE_AUTH cannot be true in production environment")
        }
        log.Warn("WARNING: Authentication is DISABLED - development mode only")
    }
}
```

2. Use a more explicit development-only flag:
```yaml
environment:
  # Only works when ENVIRONMENT != production
  - UNSAFE_DEV_DISABLE_AUTH=${UNSAFE_DEV_DISABLE_AUTH:-false}
  - ENVIRONMENT=${ENVIRONMENT:-development}
```

3. Remove from production compose file entirely:
```yaml
# docker-compose.prod.yml - no DISABLE_AUTH variable at all
apis-server:
  environment:
    - ENVIRONMENT=production
    # DISABLE_AUTH not present
```

### Acceptance Criteria
- [ ] Authentication bypass impossible in production environment
- [ ] Runtime check prevents DISABLE_AUTH=true with production indicators
- [ ] Warning logged when auth is disabled
- [ ] Production compose file has no auth bypass options

---

## Summary Table

| Finding | Severity | Issue | Status |
|---------|----------|-------|--------|
| 1 | HIGH | Hardcoded database credentials in docker-compose | Open |
| 2 | HIGH | Weak default credentials in .env.example | Open |
| 3 | MEDIUM | Secrets logged in bootstrap scripts | Open |
| 4 | MEDIUM | Database credentials in process command line | Open |
| 5 | HIGH | OpenBao token via environment variable | Open |
| 6 | CRITICAL | Zitadel master key in environment variable | Open |
| 7 | CRITICAL | Authentication bypass flag in production config | Open |

---

## References

- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [Docker Secrets Documentation](https://docs.docker.com/engine/swarm/secrets/)
- [12-Factor App: Config](https://12factor.net/config)
- [CWE-798: Use of Hard-coded Credentials](https://cwe.mitre.org/data/definitions/798.html)
- [OpenBao Authentication Methods](https://openbao.org/docs/auth/)
- [Zitadel Production Setup](https://zitadel.com/docs/self-hosting/deploy/overview)
