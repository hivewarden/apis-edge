# APIS Infrastructure Integration

This document describes how APIS integrates with the shared infrastructure stack (YugabyteDB, OpenBao, VyOS, etc.) defined in the RTP scaling architecture.

## Architecture Overview

APIS runs alongside RTP on the same infrastructure:

```
┌─────────────────────────────────────────────────────────────────┐
│                    SHARED INFRASTRUCTURE                        │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   VyOS      │  │  OpenBao    │  │      YugabyteDB         │ │
│  │  (firewall) │  │  (secrets)  │  │     (database)          │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│         │               │                    │                  │
│         │    ┌──────────┴──────────┐        │                  │
│         │    │                     │        │                  │
│         ▼    ▼                     ▼        ▼                  │
│  ┌─────────────────┐      ┌─────────────────────┐             │
│  │   RTP Stack     │      │    APIS Stack       │             │
│  │                 │      │                     │             │
│  │  - RTP API      │      │  - APIS Server      │             │
│  │  - Keycloak     │      │  - APIS Dashboard   │             │
│  │  - BunkerWeb    │      │  - (Edge devices)   │             │
│  └─────────────────┘      └─────────────────────┘             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Connecting to Shared OpenBao

### Environment Variables

To connect APIS to the shared OpenBao instance:

```bash
# Point to shared OpenBao (e.g., on rtp-sec-01)
OPENBAO_ADDR=http://10.0.1.20:8200    # Or https:// with TLS
OPENBAO_TOKEN=hvs.your-token          # From OpenBao admin
OPENBAO_SECRET_PATH=secret/data/apis  # Dedicated path for APIS
```

### Secret Path Convention

APIS uses a dedicated path under the shared OpenBao:

```
secret/
├── data/
│   ├── rtp/           # RTP application secrets
│   │   ├── database
│   │   └── api
│   │
│   └── apis/          # APIS application secrets (THIS APP)
│       ├── database   # APIS-specific DB credentials
│       ├── keycloak   # Keycloak OIDC config (SaaS mode)
│       └── api        # APIS server config
```

### Creating APIS Secrets in Shared OpenBao

```bash
# Authenticate to shared OpenBao
export VAULT_ADDR=http://10.0.1.20:8200
export VAULT_TOKEN=hvs.admin-token

# Create APIS database secrets
bao kv put secret/apis/database \
  host=yugabytedb \
  port=5433 \
  name=apis \
  user=apis \
  password=your-secure-password

# Keycloak OIDC (non-secret config)
# OIDC client ID is configured in the Keycloak honeybee realm.
# - Local dev: auto-imported from keycloak/realm-honeybee.json (docker compose)
# - Shared infra: create the client once in Keycloak and set KEYCLOAK_ISSUER + KEYCLOAK_CLIENT_ID

# Create APIS API config
bao kv put secret/apis/api \
  port=3000
```

## Connecting to Shared YugabyteDB

### Database Isolation

APIS uses a **separate database** on the shared YugabyteDB cluster:

```sql
-- Run on YugabyteDB as admin
CREATE DATABASE apis;
CREATE USER apis WITH PASSWORD 'from-openbao';
GRANT ALL PRIVILEGES ON DATABASE apis TO apis;
```

### Connection String

The APIS server builds the connection string from OpenBao secrets:

```
postgres://apis:password@yugabytedb:5433/apis?sslmode=disable
```

Or for production with TLS:

```
postgres://apis:password@10.0.1.31:5433/apis?sslmode=require
```

## Shared vs Dedicated Keycloak

Two options:

### Option A: Shared Keycloak (Recommended for simplicity)

- APIS uses a dedicated realm (`honeybee`) in the shared Keycloak instance
- Users can SSO between applications via the shared Keycloak
- Managed by Keycloak Operator in K3s (SSIK infrastructure)

```yaml
# In APIS .env
KEYCLOAK_ISSUER=https://auth.yourdomain.com/realms/honeybee
KEYCLOAK_CLIENT_ID=apis-dashboard
```

### Option B: Dedicated Keycloak

- APIS runs its own Keycloak instance
- Complete isolation
- More infrastructure to manage

## Docker Compose Modes

### Isolated Mode (Default)

Runs all services locally including OpenBao and YugabyteDB:

```bash
docker compose up
```

### Integrated Mode

Connects to external shared infrastructure:

```bash
# Set environment to point to shared services
export OPENBAO_ADDR=http://10.0.1.20:8200
export OPENBAO_TOKEN=hvs.your-token
export SECRETS_SOURCE=openbao

# Start only APIS services (avoid starting local infra services)
docker compose up apis-server apis-dashboard
```

## Network Configuration

### Phase 1-2: Cloud VPS

APIS runs on `rtp-app-01` alongside RTP:

```
10.0.1.10 (rtp-app-01)
├── BunkerWeb (WAF)
├── RTP API
├── Keycloak
├── APIS Server      ← NEW
├── APIS Dashboard   ← NEW
└── Valkey (shared cache)
```

### Phase 3+: Dedicated App Server

APIS may get its own server:

```
10.0.1.12 (apis-app-01)
├── APIS Server
├── APIS Dashboard
└── Fluent Bit (logs)
```

## Firewall Rules (VyOS)

Add rules for APIS traffic:

```
# Allow APIS dashboard (if separate from BunkerWeb)
set nat destination rule 20 destination port 5173
set nat destination rule 20 inbound-interface eth0
set nat destination rule 20 translation address 10.0.1.10
set nat destination rule 20 protocol tcp

# Allow APIS server API
set nat destination rule 21 destination port 3001
set nat destination rule 21 inbound-interface eth0
set nat destination rule 21 translation address 10.0.1.10
set nat destination rule 21 protocol tcp
```

## Monitoring Integration

APIS exports metrics to shared VictoriaMetrics:

```yaml
# In APIS server config
metrics:
  enabled: true
  endpoint: /metrics
  port: 3000
```

Add scrape target to VictoriaMetrics:

```yaml
# vmagent scrape config
scrape_configs:
  - job_name: 'apis-server'
    static_configs:
      - targets: ['10.0.1.10:3000']
```

## Checklist for Integration

When deploying APIS to shared infrastructure:

- [ ] OpenBao secrets created at `secret/data/apis/*`
- [ ] YugabyteDB database and user created
- [ ] Keycloak realm/client configured (if using shared Keycloak)
- [ ] VyOS firewall rules added
- [ ] VictoriaMetrics scrape target added
- [ ] BunkerWeb upstream configured (if routing through WAF)
- [ ] DNS records created (apis.yourdomain.com)
- [ ] TLS certificates provisioned (via Cloudflare or manual)

## Quick Start: Connect to Existing Stack

```bash
# 1. Update .env with shared infrastructure addresses
cat > .env << 'EOF'
SECRETS_SOURCE=openbao
OPENBAO_ADDR=http://10.0.1.20:8200
OPENBAO_TOKEN=hvs.your-token
OPENBAO_SECRET_PATH=secret/data/apis
EOF

# 2. Remove local infrastructure services from docker-compose
docker compose stop yugabytedb keycloak openbao

# 3. Start only APIS services
docker compose up apis-server apis-dashboard
```
