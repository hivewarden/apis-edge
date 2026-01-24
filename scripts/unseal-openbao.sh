#!/bin/sh
# Unseal OpenBao using keys stored in SOPS
# Usage: ./scripts/unseal-openbao.sh
#
# Prerequisites:
# - SOPS and age installed
# - secrets/openbao-keys.enc.yaml exists (encrypted with your age key)
# - OpenBao container running (apis-openbao)

set -e

OPENBAO_CONTAINER="${OPENBAO_CONTAINER:-apis-openbao}"
KEYS_FILE="${KEYS_FILE:-secrets/openbao-keys.enc.yaml}"
KEY_THRESHOLD="${KEY_THRESHOLD:-2}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo_info() { echo "${GREEN}[INFO]${NC} $1"; }
echo_warn() { echo "${YELLOW}[WARN]${NC} $1"; }
echo_error() { echo "${RED}[ERROR]${NC} $1"; }

# Check prerequisites
if ! command -v sops >/dev/null 2>&1; then
    echo_error "sops not found. Install with: brew install sops"
    exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
    echo_error "docker not found."
    exit 1
fi

if [ ! -f "$KEYS_FILE" ]; then
    echo_error "Keys file not found: $KEYS_FILE"
    echo_info "To create it:"
    echo "  1. Initialize OpenBao: docker exec $OPENBAO_CONTAINER bao operator init"
    echo "  2. Save keys to secrets/openbao-keys.dec.yaml"
    echo "  3. Encrypt: sops --encrypt secrets/openbao-keys.dec.yaml > $KEYS_FILE"
    exit 1
fi

# Check if OpenBao is running
if ! docker ps --format '{{.Names}}' | grep -q "^${OPENBAO_CONTAINER}$"; then
    echo_error "OpenBao container not running: $OPENBAO_CONTAINER"
    echo_info "Start with: docker compose up -d openbao"
    exit 1
fi

# Check seal status
SEALED=$(docker exec "$OPENBAO_CONTAINER" bao status -format=json 2>/dev/null | grep -o '"sealed":[^,}]*' | cut -d: -f2 || echo "unknown")

if [ "$SEALED" = "false" ]; then
    echo_info "OpenBao is already unsealed!"
    exit 0
fi

if [ "$SEALED" = "unknown" ]; then
    echo_warn "Could not determine seal status. Attempting unseal anyway..."
fi

echo_info "OpenBao is sealed. Decrypting unseal keys..."

# Decrypt and extract keys
KEYS=$(sops --decrypt "$KEYS_FILE" | grep -A 10 'unseal_keys:' | grep '^ *- ' | sed 's/^ *- *"*//;s/"*$//' | head -n "$KEY_THRESHOLD")

if [ -z "$KEYS" ]; then
    echo_error "Could not extract unseal keys from $KEYS_FILE"
    exit 1
fi

echo_info "Unsealing OpenBao with $KEY_THRESHOLD keys..."

COUNT=0
echo "$KEYS" | while read -r KEY; do
    if [ -n "$KEY" ]; then
        COUNT=$((COUNT + 1))
        echo_info "Applying unseal key $COUNT/$KEY_THRESHOLD..."
        docker exec "$OPENBAO_CONTAINER" bao operator unseal "$KEY" >/dev/null
    fi
done

# Verify unsealed
sleep 1
SEALED=$(docker exec "$OPENBAO_CONTAINER" bao status -format=json 2>/dev/null | grep -o '"sealed":[^,}]*' | cut -d: -f2 || echo "unknown")

if [ "$SEALED" = "false" ]; then
    echo_info "OpenBao successfully unsealed!"
else
    echo_error "OpenBao is still sealed. Check your keys."
    exit 1
fi
