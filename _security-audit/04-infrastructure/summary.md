# APIS Infrastructure Security Audit Summary

**Audit Date:** 2026-01-31
**Auditor:** Claude Opus 4.5 Security Audit
**Scope:** Docker Compose, Scripts, Environment Configuration
**Files Analyzed:** `docker-compose.yml`, `.env.example`, `scripts/*.sh`

---

## Executive Summary

The APIS infrastructure configuration has **critical security vulnerabilities** that would allow complete system compromise if deployed as-is. The most severe issues are hardcoded credentials, authentication bypass flags, and TLS disabled across all services.

The current configuration is suitable only for local development. **A production-hardened configuration is required before deployment.**

**Overall Security Posture: CRITICAL - NOT PRODUCTION READY**

---

## Risk Summary

| Severity | Count | Key Issues |
|----------|-------|------------|
| Critical | 3 | Zitadel masterkey in env, Auth bypass flag, Hardcoded credentials |
| High | 7 | OpenBao dev mode, TLS disabled, Root containers, Database exposure |
| Medium | 5 | chmod 777, Volume mounts, Resource limits, Secrets in logs |
| Low | 0 | - |

**Total Findings: 15**

---

## Findings by Category

### Docker Security (CONFIG-001)

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| CONFIG-001-1 | HIGH | Dashboard container runs as root | Open |
| CONFIG-001-2 | MEDIUM | Excessive port exposure on YugabyteDB | Open |
| CONFIG-001-3 | HIGH | OpenBao dev mode with static token | Open |
| CONFIG-001-4 | HIGH | Zitadel TLS disabled | Open |
| CONFIG-001-5 | MEDIUM | Missing read-only filesystem for server | Open |
| CONFIG-001-6 | MEDIUM | Missing security options and resource limits | Open |
| CONFIG-001-7 | MEDIUM | Volume mount exposes entire source directory | Open |
| CONFIG-001-8 | MEDIUM | Bootstrap init container chmod 777 | Open |

### Secrets Exposure (CONFIG-002)

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| CONFIG-002-1 | HIGH | Hardcoded database credentials in docker-compose | Open |
| CONFIG-002-2 | HIGH | Weak default credentials in .env.example | Open |
| CONFIG-002-3 | MEDIUM | Secrets logged in bootstrap scripts | Open |
| CONFIG-002-4 | MEDIUM | Database credentials in process command line | Open |
| CONFIG-002-5 | HIGH | OpenBao token via environment variable | Open |
| CONFIG-002-6 | CRITICAL | Zitadel master key in environment variable | Open |
| CONFIG-002-7 | CRITICAL | Authentication bypass flag in config | Open |

---

## Critical Remediation Priorities

### Immediate (P0 - Block Production)

1. **CONFIG-002-7: Remove auth bypass capability from production**
   ```yaml
   # Production compose must NOT have DISABLE_AUTH
   # Add runtime check that fails if set in production
   ```

2. **CONFIG-002-6: Move Zitadel masterkey to file-based secret**
   ```yaml
   command: start-from-init --masterkeyFile /run/secrets/masterkey
   secrets:
     - zitadel_masterkey
   ```

3. **CONFIG-002-1, CONFIG-002-2: Remove all default credentials**
   ```yaml
   # Use Docker secrets or fail with clear error
   - YSQL_PASSWORD=${YSQL_PASSWORD:?YSQL_PASSWORD required}
   ```

### High Priority (P1 - Before Production)

4. **CONFIG-001-4: Enable TLS for Zitadel**
5. **CONFIG-001-3: Configure OpenBao in production mode** (not `-dev`)
6. **CONFIG-001-1: Add non-root user to dashboard Dockerfile**
7. **CONFIG-002-5: Use Docker secrets for OpenBao token**

### Medium Priority (P2)

8. **CONFIG-001-5**: Enable read-only filesystem for containers
9. **CONFIG-001-6**: Add resource limits and drop capabilities
10. **CONFIG-001-2**: Bind database ports to localhost only
11. **CONFIG-002-3**: Remove credentials from bootstrap script logs

---

## Production Configuration Checklist

Before deploying to production, ensure:

### Authentication & Authorization
- [ ] `DISABLE_AUTH` not present in any configuration
- [ ] All services require authentication
- [ ] JWT secrets are randomly generated (not defaults)
- [ ] Super-admin access restricted

### Secrets Management
- [ ] No credentials in docker-compose.yml
- [ ] All secrets via Docker secrets or OpenBao
- [ ] .env file not committed to git
- [ ] Masterkeys stored in files, not env vars

### Network Security
- [ ] TLS enabled for all services (Zitadel, OpenBao, Database)
- [ ] Database ports not exposed to host (or localhost only)
- [ ] Admin UIs not publicly accessible
- [ ] Firewall rules restrict access

### Container Security
- [ ] All containers run as non-root
- [ ] Read-only filesystems where possible
- [ ] Resource limits defined (CPU, memory)
- [ ] Unnecessary capabilities dropped
- [ ] `no-new-privileges` enabled

### Monitoring & Logging
- [ ] No secrets in log output
- [ ] Audit logging enabled
- [ ] Failed auth attempts tracked
- [ ] Container health checks configured

---

## Development vs Production Split

Create separate compose files:

```
docker-compose.yml          # Local development only
docker-compose.prod.yml     # Production configuration
docker-compose.override.yml # Developer-specific overrides
```

### docker-compose.prod.yml Changes Required

```yaml
# Production differences:
services:
  yugabytedb:
    ports: []  # No host port mapping

  openbao:
    command: server -config=/config/openbao.hcl  # Not -dev
    ports:
      - "127.0.0.1:8200:8200"

  zitadel:
    command: start-from-init --masterkeyFile /run/secrets/masterkey --tlsMode external
    environment:
      - ZITADEL_EXTERNALSECURE=true
      - ZITADEL_DATABASE_POSTGRES_ADMIN_SSL_MODE=require

  apis-server:
    read_only: true
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    # No DISABLE_AUTH

  apis-dashboard:
    user: "1001:1001"
    # No VITE_DEV_MODE
```

---

## Secrets File Structure

Create a secrets directory (gitignored):

```
secrets/
├── ysql_password.txt
├── apis_db_password.txt
├── openbao_token.txt
├── zitadel_masterkey.txt
├── jwt_secret.txt
└── README.md  # Instructions for generating secrets
```

Generate secrets:
```bash
# Generate all required secrets
openssl rand -base64 32 > secrets/ysql_password.txt
openssl rand -base64 32 > secrets/apis_db_password.txt
openssl rand -base64 32 > secrets/openbao_token.txt
openssl rand 32 | base64 > secrets/zitadel_masterkey.txt
openssl rand -base64 48 > secrets/jwt_secret.txt
chmod 600 secrets/*.txt
```

---

## Environment Variable Security

### Allowed in Environment
- Non-sensitive configuration (hostnames, ports, feature flags)
- References to secret files (`_FILE` suffix pattern)

### MUST NOT be in Environment
- Passwords
- API keys
- Encryption keys (masterkey, JWT secret)
- Tokens

### Pattern for Secret Files

```go
// Server code pattern
func getSecret(name string) (string, error) {
    // First check for file
    fileEnv := os.Getenv(name + "_FILE")
    if fileEnv != "" {
        data, err := os.ReadFile(fileEnv)
        if err != nil {
            return "", err
        }
        return strings.TrimSpace(string(data)), nil
    }
    // Fall back to env var (dev only)
    return os.Getenv(name), nil
}
```

---

## Files Reviewed

| Category | Files |
|----------|-------|
| Docker | `docker-compose.yml`, `apis-server/Dockerfile`, `apis-dashboard/Dockerfile.dev` |
| Environment | `.env.example`, `.env` (observed in git status) |
| Scripts | `scripts/bootstrap-openbao.sh`, `scripts/init-yugabytedb.sh` |
| Documentation | `docs/SECRETS-MANAGEMENT.md`, `docs/INFRASTRUCTURE-INTEGRATION.md` |

---

## Revision History

| Date | Change |
|------|--------|
| 2026-01-31 | Initial infrastructure security audit |
