# APIS Secrets Management

This document describes how to manage secrets in APIS for both development and production environments.

## Overview

APIS uses a two-tier secrets management approach:

1. **SOPS + age** - For encrypting secrets locally (commitable to git)
2. **OpenBao** - For runtime secrets access (Vault-compatible)

```
┌─────────────────────────────────────────────────────────────────┐
│                    SECRETS ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  LOCAL DEV                           PRODUCTION                  │
│  ─────────                           ──────────                  │
│  ┌─────────────┐                     ┌─────────────┐            │
│  │   .env      │                     │   SOPS      │            │
│  │  (defaults) │                     │ (encrypted) │            │
│  └─────┬───────┘                     └─────┬───────┘            │
│        │                                   │                     │
│        ▼                                   ▼                     │
│  ┌─────────────┐                     ┌─────────────┐            │
│  │  OpenBao    │                     │  OpenBao    │            │
│  │  (dev mode) │                     │  (sealed)   │            │
│  └─────┬───────┘                     └─────┬───────┘            │
│        │                                   │                     │
│        ▼                                   ▼                     │
│  ┌─────────────┐                     ┌─────────────┐            │
│  │ apis-server │                     │ apis-server │            │
│  └─────────────┘                     └─────────────┘            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Local Development (Default)

For local development, OpenBao runs in **dev mode**:
- Automatically unsealed
- Uses a simple dev token (`apis-dev-token`)
- Data is ephemeral (lost on container restart)

**Setup:**
```bash
# Just start the stack - no configuration needed
docker compose up

# OpenBao is automatically seeded with default dev secrets (via `openbao-bootstrap`)
# and `apis-server` reads runtime DB credentials from OpenBao by default.
```

## Team Development (Shared Secrets)

For shared development environments, use SOPS to encrypt secrets:

### 1. Ensure Tools are Installed

```bash
# macOS
brew install sops age

# Verify
which sops age-keygen
```

### 2. Generate Your age Key (if not already done)

```bash
mkdir -p ~/.config/sops/age
age-keygen -o ~/.config/sops/age/keys.txt
# Note your public key (starts with "age1...")
```

### 3. Add Your Key to .sops.yaml

Add your public key to `.sops.yaml` so you can decrypt:

```yaml
creation_rules:
  - path_regex: secrets/.*\.yaml$
    age: >-
      age1abc123...(existing keys)
      age1your-new-key...(your key)
```

### 4. Work with Encrypted Secrets

```bash
# Decrypt to view/edit
sops secrets/secrets.enc.yaml
# This opens in your $EDITOR with decrypted content
# Saves automatically re-encrypted when you exit

# Or decrypt to file (temporary)
sops --decrypt secrets/secrets.enc.yaml > secrets/secrets.dec.yaml
# Edit, then re-encrypt
sops --encrypt secrets/secrets.dec.yaml > secrets/secrets.enc.yaml
rm secrets/secrets.dec.yaml  # Clean up!
```

## Production Deployment

### Option A: External OpenBao (Recommended)

Connect to your existing infrastructure's OpenBao:

```bash
# Remove local OpenBao and set environment variables
export OPENBAO_ADDR=https://openbao.yourinfra.com:8200
export OPENBAO_TOKEN=hvs.your-production-token
export OPENBAO_SECRET_PATH=secret/data/apis

# Start without local OpenBao
docker compose up apis-server apis-dashboard yugabytedb keycloak
```

### Option B: Self-Hosted OpenBao (Production Mode)

For self-hosted production, OpenBao must run in **sealed mode** with proper initialization.

#### Step 1: Configure OpenBao for Production

Create `openbao-config.hcl`:

```hcl
# OpenBao Production Configuration
storage "file" {
  path = "/openbao/data"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = "true"  # Enable TLS in production!
}

api_addr = "http://openbao:8200"
cluster_addr = "https://openbao:8201"

disable_mlock = true
ui = true
```

Update `docker-compose.yml`:

```yaml
openbao:
  # Pin the OpenBao image (avoid :latest in production)
  image: quay.io/openbao/openbao:2.4.4
  container_name: apis-openbao
  command: server -config=/etc/openbao/config.hcl
  volumes:
    - ./openbao-config.hcl:/etc/openbao/config.hcl:ro
    - openbao_data:/openbao/data
  # Remove -dev flags
```

#### Step 2: Initialize OpenBao

```bash
# Start OpenBao (will be sealed)
docker compose up -d openbao

# Initialize with key shares
docker exec apis-openbao bao operator init \
  -key-shares=3 \
  -key-threshold=2

# CRITICAL: Save the output! It contains:
# - 3 unseal keys
# - 1 root token
```

**Example output:**
```
Unseal Key 1: abc123...
Unseal Key 2: def456...
Unseal Key 3: ghi789...

Initial Root Token: hvs.abcdef...
```

#### Step 3: Store Keys in SOPS

Create `secrets/openbao-keys.dec.yaml`:

```yaml
# OpenBao unsealer keys - NEVER commit unencrypted!
openbao:
  unseal_keys:
    - "abc123..."
    - "def456..."
    - "ghi789..."
  root_token: "hvs.abcdef..."
```

Encrypt with SOPS:

```bash
sops --encrypt secrets/openbao-keys.dec.yaml > secrets/openbao-keys.enc.yaml
rm secrets/openbao-keys.dec.yaml  # Critical!
```

#### Step 4: Unseal OpenBao

Use the provided script:

```bash
# This decrypts keys from SOPS and unseals OpenBao
./scripts/unseal-openbao.sh
```

#### Step 5: Seed Application Secrets

```bash
# Bootstrap application secrets into OpenBao
./scripts/bootstrap-openbao.sh
```

## Unsealing Procedure

After a restart, OpenBao will be sealed. Unseal it with:

```bash
# Using the script (recommended)
./scripts/unseal-openbao.sh

# Or manually (need 2 of 3 keys with threshold=2)
docker exec apis-openbao bao operator unseal <key1>
docker exec apis-openbao bao operator unseal <key2>
```

## Security Best Practices

### DO:
- ✅ Store age private key securely (`~/.config/sops/age/keys.txt`)
- ✅ Use separate keys for different environments
- ✅ Rotate OpenBao tokens periodically
- ✅ Use TLS for OpenBao in production
- ✅ Limit token capabilities (least privilege)
- ✅ Audit secret access logs

### DON'T:
- ❌ Commit `secrets.dec.yaml` (decrypted secrets)
- ❌ Commit age private keys
- ❌ Use dev mode in production
- ❌ Share unsealer keys via insecure channels
- ❌ Store unsealer keys unencrypted

## Troubleshooting

### "Permission denied" when encrypting

```bash
# Ensure SOPS knows where your key is
export SOPS_AGE_KEY_FILE=~/.config/sops/age/keys.txt
```

### "Failed to decrypt" error

```bash
# Your key might not be in .sops.yaml recipients
# Ask a team member to re-encrypt with your key added
```

### OpenBao is sealed after restart

```bash
# Normal - just unseal it
./scripts/unseal-openbao.sh

# Or manually with 2 keys
docker exec apis-openbao bao operator unseal <key1>
docker exec apis-openbao bao operator unseal <key2>
```

### Can't connect to external OpenBao

```bash
# Check network connectivity
curl -v $OPENBAO_ADDR/v1/sys/health

# Verify token has correct permissions
docker exec apis-openbao bao token lookup
```

## References

- [SOPS Documentation](https://github.com/getsops/sops)
- [age Encryption](https://github.com/FiloSottile/age)
- [OpenBao Documentation](https://openbao.org/docs/)
- [APIS Architecture - Secrets Section](../CLAUDE.md)
