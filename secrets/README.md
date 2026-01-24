# APIS Secrets Management

This directory contains encrypted secrets for local development using SOPS + age.

## Quick Start (Local Dev)

For simple local development, you don't need SOPS. Just use the defaults in `.env` - OpenBao runs in dev mode with a known token.

## Setting Up SOPS (For Team/Shared Secrets)

### 1. Install Tools

```bash
# macOS
brew install sops age

# Linux
# See: https://github.com/getsops/sops#install
# See: https://github.com/FiloSottile/age#installation
```

### 2. Generate Your Key

```bash
mkdir -p ~/.config/sops/age
age-keygen -o ~/.config/sops/age/keys.txt
# Note the public key (starts with "age1...")
```

### 3. Add Your Public Key to .sops.yaml

Edit `../.sops.yaml` and add your public key to the `age:` field.

### 4. Create Encrypted Secrets

```bash
cp secrets.template.yaml secrets.dec.yaml
# Edit secrets.dec.yaml with real values
sops --encrypt secrets.dec.yaml > secrets.enc.yaml
rm secrets.dec.yaml  # Clean up unencrypted file
```

### 5. Bootstrap OpenBao

```bash
# Start services
docker compose up -d openbao

# Run bootstrap script
./scripts/bootstrap-openbao.sh
```

## Connecting to External OpenBao

To use your existing OpenBao instance instead of the local one:

1. **Remove or stop local OpenBao** (optional):
   ```bash
   docker compose stop openbao
   ```

2. **Update `.env`**:
   ```bash
   OPENBAO_ADDR=https://your-openbao.example.com:8200
   OPENBAO_TOKEN=hvs.your-actual-token
   OPENBAO_SECRET_PATH=secret/data/apis  # Adjust path as needed
   ```

3. **Remove the `depends_on: openbao` from docker-compose.yml** (or the service will fail to start)

That's it! The Go server will now read secrets from your external OpenBao.

## Files

| File | Committed? | Purpose |
|------|------------|---------|
| `secrets.template.yaml` | Yes | Template showing secret structure |
| `secrets.enc.yaml` | Yes | SOPS-encrypted secrets (safe to commit) |
| `secrets.dec.yaml` | **NO** | Decrypted secrets (add to .gitignore) |
| `README.md` | Yes | This file |
