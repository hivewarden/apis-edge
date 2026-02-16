# CONFIG-001: Docker and Container Security Issues

## Summary

This audit identifies security vulnerabilities in Docker configurations including container privileges, image security, network exposure, and runtime protections.

---

## Finding 1: Dashboard Container Runs as Root

**Severity:** HIGH
**OWASP Category:** A05:2021 - Security Misconfiguration
**CWE:** CWE-250 (Execution with Unnecessary Privileges)

### Location
- **File:** `/Users/jermodelaruelle/Projects/apis/apis-dashboard/Dockerfile.dev`
- **Lines:** 1-16 (entire file)

### Vulnerable Configuration
```dockerfile
# Development Dockerfile for React dashboard
FROM node:20-alpine

WORKDIR /app

# Install dependencies first for caching
COPY package.json package-lock.json* ./
RUN npm install

# Copy source (will be overridden by volume mount in docker-compose)
COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev"]
```

### Attack Vector
The container runs as root by default (no USER directive). If an attacker exploits a vulnerability in the Node.js application or any npm dependency:
1. They gain root access within the container
2. Volume mounts (line 221-223 in docker-compose.yml) map the entire source directory, allowing root-level file modification
3. Container escape vulnerabilities are more impactful when running as root

### Evidence
Unlike `apis-server/Dockerfile` which properly creates and uses a non-root user:
```dockerfile
RUN adduser -D -H appuser
USER appuser
```
The dashboard Dockerfile has no such protection.

### Remediation
```dockerfile
# Development Dockerfile for React dashboard
FROM node:20-alpine

# Create non-root user
RUN addgroup -g 1001 appgroup && \
    adduser -u 1001 -G appgroup -D appuser

WORKDIR /app

# Change ownership of workdir
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Install dependencies first for caching
COPY --chown=appuser:appgroup package.json package-lock.json* ./
RUN npm install

# Copy source
COPY --chown=appuser:appgroup . .

EXPOSE 5173

CMD ["npm", "run", "dev"]
```

### Acceptance Criteria
- [ ] Dockerfile.dev includes non-root user creation
- [ ] USER directive switches to non-root before COPY/RUN commands
- [ ] Container starts successfully with non-root user
- [ ] npm install and dev server work correctly

---

## Finding 2: Excessive Port Exposure on YugabyteDB

**Severity:** MEDIUM
**OWASP Category:** A05:2021 - Security Misconfiguration
**CWE:** CWE-284 (Improper Access Control)

### Location
- **File:** `/Users/jermodelaruelle/Projects/apis/docker-compose.yml`
- **Lines:** 8-11

### Vulnerable Configuration
```yaml
yugabytedb:
  ports:
    - "5433:5433"   # YSQL (PostgreSQL-compatible)
    - "9000:9000"   # YugabyteDB UI
    - "7100:7000"   # Master UI (mapped to 7100 to avoid macOS AirPlay conflict)
```

### Attack Vector
1. Port 5433 exposes the database directly to the host network, allowing any local process or attacker with host access to connect
2. Port 9000 exposes the YugabyteDB admin UI which can reveal cluster information and potentially allow configuration changes
3. Port 7100 exposes the Master UI with additional administrative capabilities

In a production or shared development environment, these exposed ports could be accessed by:
- Other users on the same machine
- Network attackers if the host has a public IP
- Malware scanning local ports

### Remediation
For development, bind to localhost only. For production, remove host port mappings entirely:

```yaml
yugabytedb:
  ports:
    - "127.0.0.1:5433:5433"   # YSQL - localhost only
    # Remove admin UIs from production, or bind to localhost for dev:
    # - "127.0.0.1:9000:9000"   # YugabyteDB UI - localhost only
    # - "127.0.0.1:7100:7000"   # Master UI - localhost only
```

### Acceptance Criteria
- [ ] Database ports bound to 127.0.0.1 or removed in production compose file
- [ ] Admin UI ports (9000, 7100) not exposed in production
- [ ] Services within Docker network can still communicate via service names

---

## Finding 3: OpenBao Dev Mode with Static Token

**Severity:** HIGH
**OWASP Category:** A07:2021 - Identification and Authentication Failures
**CWE:** CWE-798 (Use of Hard-coded Credentials)

### Location
- **File:** `/Users/jermodelaruelle/Projects/apis/docker-compose.yml`
- **Lines:** 254-272

### Vulnerable Configuration
```yaml
openbao:
  image: quay.io/openbao/openbao:2.4.4
  container_name: apis-openbao
  command: server -dev -dev-root-token-id=${OPENBAO_DEV_TOKEN:-apis-dev-token}
  ports:
    - "8200:8200"
  environment:
    - OPENBAO_ADDR=http://0.0.0.0:8200
    - OPENBAO_DEV_ROOT_TOKEN_ID=${OPENBAO_DEV_TOKEN:-apis-dev-token}
```

### Attack Vector
1. **Dev mode** runs OpenBao unsealed with in-memory storage - secrets are not persisted and encryption is bypassed
2. **Static token** `apis-dev-token` is hardcoded as a default, making it trivial to access all secrets
3. **Port 8200** exposed to host allows any local process to retrieve secrets with the known token:
   ```bash
   curl -H "X-Vault-Token: apis-dev-token" http://localhost:8200/v1/secret/data/apis/database
   ```
4. The token appears in multiple locations (docker-compose.yml, .env.example, bootstrap scripts), increasing exposure

### Remediation
1. Create a production-ready docker-compose.prod.yml:
```yaml
openbao:
  image: quay.io/openbao/openbao:2.4.4
  command: server -config=/config/openbao.hcl
  ports:
    - "127.0.0.1:8200:8200"  # Localhost only
  volumes:
    - ./config/openbao.hcl:/config/openbao.hcl:ro
    - openbao_data:/openbao/data
  cap_add:
    - IPC_LOCK
  # No environment variables with tokens
```

2. Add clear warnings in docker-compose.yml:
```yaml
# WARNING: Dev mode only - DO NOT use in production
# For production, use docker-compose.prod.yml with proper OpenBao configuration
```

3. Remove default token values from .env.example

### Acceptance Criteria
- [ ] Production compose file does not use -dev mode
- [ ] Token not hardcoded in any production configuration
- [ ] Port 8200 not exposed or bound to localhost only
- [ ] Clear documentation separating dev vs production configurations

---

## Finding 4: Zitadel TLS Disabled

**Severity:** HIGH
**OWASP Category:** A02:2021 - Cryptographic Failures
**CWE:** CWE-319 (Cleartext Transmission of Sensitive Information)

### Location
- **File:** `/Users/jermodelaruelle/Projects/apis/docker-compose.yml`
- **Lines:** 85-104

### Vulnerable Configuration
```yaml
zitadel:
  command: start-from-init --masterkeyFromEnv --tlsMode disabled
  environment:
    - ZITADEL_DATABASE_POSTGRES_ADMIN_SSL_MODE=disable
    - ZITADEL_DATABASE_POSTGRES_USER_SSL_MODE=disable
    - ZITADEL_EXTERNALSECURE=false
```

### Attack Vector
1. **TLS disabled** means authentication tokens (including JWTs and session cookies) are transmitted in plaintext
2. **SSL disabled for database** means database credentials and queries are transmitted unencrypted between containers
3. On shared networks or with container network inspection, an attacker could:
   - Intercept user authentication tokens
   - Capture database credentials
   - Perform session hijacking
   - Extract the master key from network traffic

### Remediation
For production environments:
```yaml
zitadel:
  command: start-from-init --masterkeyFromEnv --tlsMode external
  environment:
    - ZITADEL_DATABASE_POSTGRES_ADMIN_SSL_MODE=require
    - ZITADEL_DATABASE_POSTGRES_USER_SSL_MODE=require
    - ZITADEL_EXTERNALSECURE=true
    - ZITADEL_TLS_ENABLED=true
  volumes:
    - ./certs/zitadel.crt:/certs/zitadel.crt:ro
    - ./certs/zitadel.key:/certs/zitadel.key:ro
```

### Acceptance Criteria
- [ ] Production configuration enables TLS for Zitadel
- [ ] Database connections use SSL in production
- [ ] Certificate management documented
- [ ] Development vs production configurations clearly separated

---

## Finding 5: Missing Read-Only Filesystem for Server Container

**Severity:** MEDIUM
**OWASP Category:** A05:2021 - Security Misconfiguration
**CWE:** CWE-732 (Incorrect Permission Assignment for Critical Resource)

### Location
- **File:** `/Users/jermodelaruelle/Projects/apis/docker-compose.yml`
- **Lines:** 153-211

### Vulnerable Configuration
The `apis-server` container has no read-only filesystem directive:
```yaml
apis-server:
  build:
    context: ./apis-server
    dockerfile: Dockerfile
  # ... no read_only: true
  # ... no tmpfs mounts
```

### Attack Vector
If an attacker gains code execution within the container (e.g., via dependency vulnerability, deserialization attack):
1. They can write malicious files to the container filesystem
2. They can modify the application binary
3. They can plant persistence mechanisms
4. They can potentially overwrite configuration files

### Remediation
```yaml
apis-server:
  build:
    context: ./apis-server
    dockerfile: Dockerfile
  read_only: true
  tmpfs:
    - /tmp:noexec,nosuid,size=100m
  security_opt:
    - no-new-privileges:true
  # ... rest of configuration
```

### Acceptance Criteria
- [ ] Server container runs with read-only root filesystem
- [ ] Temporary directories use tmpfs with size limits
- [ ] no-new-privileges security option enabled
- [ ] Application starts and functions correctly with restrictions

---

## Finding 6: Missing Security Options and Resource Limits

**Severity:** MEDIUM
**OWASP Category:** A05:2021 - Security Misconfiguration
**CWE:** CWE-770 (Allocation of Resources Without Limits)

### Location
- **File:** `/Users/jermodelaruelle/Projects/apis/docker-compose.yml`
- **Lines:** All service definitions

### Vulnerable Configuration
No containers define security options or resource limits:
```yaml
apis-server:
  # Missing:
  # - security_opt
  # - deploy.resources.limits
  # - cap_drop
```

### Attack Vector
1. **No capability dropping** - containers retain default Linux capabilities that could be exploited
2. **No resource limits** - a compromised container could consume all host CPU/memory (DoS)
3. **No security options** - missing protections like seccomp profiles, AppArmor, no-new-privileges

### Remediation
Add to each service:
```yaml
apis-server:
  cap_drop:
    - ALL
  cap_add:
    - NET_BIND_SERVICE  # Only if binding to ports < 1024
  security_opt:
    - no-new-privileges:true
    - seccomp:unconfined  # Or use a custom seccomp profile
  deploy:
    resources:
      limits:
        cpus: '1.0'
        memory: 512M
      reservations:
        cpus: '0.25'
        memory: 128M
```

### Acceptance Criteria
- [ ] All containers drop unnecessary capabilities
- [ ] Resource limits defined for CPU and memory
- [ ] no-new-privileges enabled on all containers
- [ ] Application functions correctly with restricted capabilities

---

## Finding 7: Volume Mount Exposes Entire Source Directory

**Severity:** MEDIUM
**OWASP Category:** A05:2021 - Security Misconfiguration
**CWE:** CWE-552 (Files or Directories Accessible to External Parties)

### Location
- **File:** `/Users/jermodelaruelle/Projects/apis/docker-compose.yml`
- **Lines:** 221-224

### Vulnerable Configuration
```yaml
apis-dashboard:
  volumes:
    - ./apis-dashboard:/app
    - /app/node_modules
    - zitadel_bootstrap:/bootstrap:ro
```

### Attack Vector
The entire `apis-dashboard` directory is mounted into the container, including:
1. `.git` directory with repository history
2. `.env` files with potential secrets
3. `node_modules` with all dependencies (though excluded via anonymous volume)
4. Any IDE configuration files with potential credentials

If the container is compromised, the attacker has full read/write access to the host source directory.

### Remediation
1. Use more specific mounts in development:
```yaml
apis-dashboard:
  volumes:
    - ./apis-dashboard/src:/app/src:ro
    - ./apis-dashboard/public:/app/public:ro
    - ./apis-dashboard/vite.config.ts:/app/vite.config.ts:ro
    - /app/node_modules
    - zitadel_bootstrap:/bootstrap:ro
```

2. Add a `.dockerignore` file in `apis-dashboard/`:
```
.git
.env*
*.md
tests/
.vscode/
.idea/
```

### Acceptance Criteria
- [ ] Volume mounts are as restrictive as possible
- [ ] .dockerignore excludes sensitive files
- [ ] Read-only mounts where write access not needed
- [ ] Hot-reload still functions correctly

---

## Finding 8: Bootstrap Init Container with chmod 777

**Severity:** MEDIUM
**OWASP Category:** A05:2021 - Security Misconfiguration
**CWE:** CWE-732 (Incorrect Permission Assignment for Critical Resource)

### Location
- **File:** `/Users/jermodelaruelle/Projects/apis/docker-compose.yml`
- **Lines:** 71-80

### Vulnerable Configuration
```yaml
zitadel-bootstrap-init:
  image: alpine:3.20
  entrypoint: ["/bin/sh", "-c", "chmod 777 /bootstrap"]
```

### Attack Vector
Setting permissions to 777 on the bootstrap volume means:
1. Any container with access to this volume can read/write/execute files
2. The PAT (Personal Access Token) written to this volume is world-readable
3. Any container compromise could lead to Zitadel API access via the exposed PAT

### Remediation
Use more restrictive permissions and specific user ownership:
```yaml
zitadel-bootstrap-init:
  image: alpine:3.20
  entrypoint: ["/bin/sh", "-c", "chmod 750 /bootstrap && chown 1000:1000 /bootstrap"]
```

Or better, use Docker secrets or a more secure mechanism for passing the PAT.

### Acceptance Criteria
- [ ] Bootstrap volume has restrictive permissions (750 or less)
- [ ] Only authorized containers can read the PAT
- [ ] PAT is not world-readable
- [ ] Bootstrap process still functions correctly

---

## Summary Table

| Finding | Severity | Issue | Status |
|---------|----------|-------|--------|
| 1 | HIGH | Dashboard runs as root | Open |
| 2 | MEDIUM | Excessive port exposure on YugabyteDB | Open |
| 3 | HIGH | OpenBao dev mode with static token | Open |
| 4 | HIGH | Zitadel TLS disabled | Open |
| 5 | MEDIUM | Missing read-only filesystem | Open |
| 6 | MEDIUM | Missing security options and resource limits | Open |
| 7 | MEDIUM | Volume exposes entire source directory | Open |
| 8 | MEDIUM | Bootstrap init chmod 777 | Open |

---

## References

- [Docker Security Best Practices](https://docs.docker.com/engine/security/)
- [CIS Docker Benchmark](https://www.cisecurity.org/benchmark/docker)
- [OWASP Docker Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html)
- [OpenBao Production Hardening](https://openbao.org/docs/internals/security/)
