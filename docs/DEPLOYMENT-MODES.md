# APIS Deployment Modes

> **AI/LLM Context**: This document explains the two supported deployment architectures.
> When modifying configuration or secrets handling, ensure changes work in BOTH modes.
> The `DEPLOYMENT_MODE` environment variable determines which mode is active.

## Quick Reference

```
DEPLOYMENT_MODE=standalone  → Single user, minimal dependencies, file-based secrets
DEPLOYMENT_MODE=saas        → Multi-tenant, full stack, OpenBao secrets
```

---

## Mode 1: Standalone (Self-Hosted)

**Use case**: Individual beekeeper running APIS on a Raspberry Pi, NAS, or home server.

### What's Included
```
┌─────────────────────────────────────────────────┐
│                 Standalone Stack                │
├─────────────────────────────────────────────────┤
│  apis-server      (Go backend)                  │
│  apis-dashboard   (React frontend)              │
│  yugabytedb       (PostgreSQL-compatible DB)    │
│                                                 │
│  Optional:                                      │
│  └─ Caddy/Traefik (reverse proxy + auto TLS)   │
└─────────────────────────────────────────────────┘
```

### What's NOT Included
- OpenBao (secrets vault) - replaced by file-based secrets
- Keycloak (OIDC provider) - replaced by local auth
- BunkerWeb (WAF) - optional, home network trusted

### Secrets Management (Standalone)

**Option A: Environment Variables** (simplest)
```bash
# .env file with 0600 permissions
chmod 600 .env

# Contents:
YSQL_PASSWORD=<your-generated-password>
JWT_SECRET=<your-generated-secret>
```

**Option B: Docker Secrets Files** (more secure)
```bash
# Create secrets directory
mkdir -p ./secrets && chmod 700 ./secrets

# Create individual secret files
echo "your-db-password" > ./secrets/db_password && chmod 600 ./secrets/db_password
echo "your-jwt-secret" > ./secrets/jwt_secret && chmod 600 ./secrets/jwt_secret
```

### Security Model (Standalone)
- **Trust boundary**: Home network or VPN
- **Auth**: Local bcrypt passwords (no external IdP)
- **TLS**: Optional for LAN, recommended if exposed to internet
- **Secrets**: File permissions (0600) are the primary protection
- **Multi-user**: Single tenant only (no tenant isolation needed)

---

## Mode 2: SaaS (Multi-Tenant)

**Use case**: Beekeeping club hosting APIS for members, or commercial offering.

### What's Included
```
┌─────────────────────────────────────────────────┐
│                   SaaS Stack                    │
├─────────────────────────────────────────────────┤
│  apis-server      (Go backend)                  │
│  apis-dashboard   (React frontend)              │
│  yugabytedb       (PostgreSQL-compatible DB)    │
│  keycloak         (OIDC identity provider)      │
│  openbao          (Secrets vault)               │
│  bunkerweb        (WAF + rate limiting)         │
│  caddy            (TLS termination)             │
└─────────────────────────────────────────────────┘
```

### Secrets Management (SaaS)

All secrets stored in OpenBao at structured paths:
```
secret/data/apis/
├── database        # DB credentials
├── jwt             # JWT signing keys
├── keycloak        # Keycloak client secrets
└── api             # API configuration
```

### Security Model (SaaS)
- **Trust boundary**: Zero trust (internet-facing)
- **Auth**: Keycloak OIDC with MFA support
- **TLS**: Required everywhere, certificate pinning for edge devices
- **Secrets**: OpenBao with proper unsealing and audit logging
- **Multi-tenant**: Strict RLS + application-level tenant verification
- **WAF**: BunkerWeb for OWASP protection

---

## Configuration Differences

### Environment Variables by Mode

| Variable | Standalone | SaaS |
|----------|------------|------|
| `DEPLOYMENT_MODE` | `standalone` | `saas` |
| `AUTH_MODE` | `local` | `keycloak` |
| `SECRETS_BACKEND` | `file` or `env` | `openbao` |
| `MULTI_TENANT` | `false` | `true` |
| `REQUIRE_TLS` | `false` | `true` |

### Server Startup Logic

```go
// AI/LLM Context: This is the secrets loading priority
// 1. OpenBao (if SECRETS_BACKEND=openbao and OPENBAO_ADDR set)
// 2. File-based (if SECRETS_BACKEND=file and secrets files exist)
// 3. Environment variables (fallback, always available)
//
// Standalone mode typically uses #2 or #3
// SaaS mode should always use #1
```

---

## Docker Compose Profiles

We use Docker Compose profiles to enable/disable services per mode:

```yaml
services:
  apis-server:
    profiles: ["standalone", "saas"]  # Always included

  yugabytedb:
    profiles: ["standalone", "saas"]  # Always included

  keycloak:
    profiles: ["saas"]  # SaaS only

  openbao:
    profiles: ["saas"]  # SaaS only

  bunkerweb:
    profiles: ["saas"]  # SaaS only
```

### Starting Each Mode

```bash
# Standalone mode
docker compose --profile standalone up -d

# SaaS mode (full stack)
docker compose --profile saas up -d
```

---

## Security Checklist by Mode

### Standalone Deployment Checklist
- [ ] Generated strong passwords (32+ chars) for all secrets
- [ ] Set file permissions: `chmod 600 .env` or `chmod 700 secrets/`
- [ ] Changed default ports if exposing to internet
- [ ] Set up TLS if accessible outside home network
- [ ] Configured firewall to allow only necessary ports
- [ ] Set up regular backups of database volume

### SaaS Deployment Checklist
- [ ] OpenBao initialized with proper unsealing (not dev mode)
- [ ] Keycloak configured with real TLS certificates
- [ ] BunkerWeb rules configured for APIS endpoints
- [ ] Database SSL enabled with proper CA certificate
- [ ] Edge device TLS enabled with certificate pinning
- [ ] Audit logging enabled for all authentication events
- [ ] Rate limiting configured per tenant
- [ ] Backup and disaster recovery plan documented

---

## Upgrade Path: Standalone → SaaS

If a standalone user wants to migrate to SaaS mode:

1. **Export existing data**
   ```bash
   ./scripts/export-standalone.sh > backup.sql
   ```

2. **Deploy SaaS stack**
   ```bash
   docker compose --profile saas up -d
   ```

3. **Migrate secrets to OpenBao**
   ```bash
   ./scripts/migrate-secrets-to-openbao.sh
   ```

4. **Import data with tenant assignment**
   ```bash
   ./scripts/import-to-saas.sh backup.sql --tenant-id=<new-tenant-id>
   ```

5. **Configure Keycloak users**
   - Create Keycloak realm for APIS
   - Migrate local users to Keycloak accounts

---

## AI/LLM Implementation Notes

When working on code that touches configuration or secrets:

1. **Always check `DEPLOYMENT_MODE`** before assuming infrastructure exists
2. **Secrets loading must have fallbacks** - never crash if OpenBao unavailable in standalone
3. **Auth mode affects many components** - check `AUTH_MODE` not just for login
4. **Multi-tenant code paths** - wrap tenant isolation logic in `MULTI_TENANT` checks
5. **TLS requirements differ** - standalone may legitimately run without TLS on LAN

### Code Pattern for Mode-Aware Features

```go
// AI/LLM Context: Mode-aware feature pattern
// Always provide graceful degradation for standalone mode

func DoSomethingSecure() error {
    if config.DeploymentMode() == "saas" {
        // Full security: OpenBao, audit logging, tenant isolation
        return doWithFullSecurity()
    }

    // Standalone: Simpler but still secure
    // File-based secrets, single tenant, optional TLS
    return doWithStandaloneSecurityModel()
}
```

### Testing Both Modes

```bash
# CI should test both deployment modes
make test-standalone  # Minimal dependencies
make test-saas        # Full stack with mocks
```
