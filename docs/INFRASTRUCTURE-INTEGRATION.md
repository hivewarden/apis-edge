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
│  │  - Zitadel      │      │  - APIS Dashboard   │             │
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
│   │   ├── zitadel
│   │   └── api
│   │
│   └── apis/          # APIS application secrets (THIS APP)
│       ├── database   # APIS-specific DB credentials
│       ├── zitadel    # Shared Zitadel? Or APIS-specific?
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

# Create APIS Zitadel secrets (if separate from RTP)
bao kv put secret/apis/zitadel \
  issuer=http://localhost:8080 \
  client_id=apis-dashboard \
  client_secret=your-client-secret

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

## Shared vs Dedicated Zitadel

Two options:

### Option A: Shared Zitadel (Recommended for simplicity)

- APIS uses the same Zitadel instance as RTP
- Create a separate "APIS" project in Zitadel
- Users can SSO between RTP and APIS

```yaml
# In APIS .env
ZITADEL_ISSUER=http://zitadel.yourdomain.com
ZITADEL_CLIENT_ID=apis-dashboard
```

### Option B: Dedicated Zitadel

- APIS runs its own Zitadel instance
- Complete isolation
- More infrastructure to manage

## Docker Compose Profiles

For local development, APIS docker-compose supports two profiles:

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

# Start only APIS services (not DB or OpenBao)
docker compose --profile integrated up
```

## Network Configuration

### Phase 1-2: Cloud VPS

APIS runs on `rtp-app-01` alongside RTP:

```
10.0.1.10 (rtp-app-01)
├── BunkerWeb (WAF)
├── RTP API
├── Zitadel
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
- [ ] Zitadel project/client configured (if using shared Zitadel)
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
docker compose stop yugabytedb zitadel openbao

# 3. Start only APIS services
docker compose up apis-server apis-dashboard
```
