#!/usr/bin/env bash
# =============================================================================
# APIS OpenBao Bootstrap Script
# =============================================================================
# Seeds OpenBao with secrets from SOPS-encrypted file or default dev values.
#
# Usage:
#   ./scripts/bootstrap-openbao.sh              # Use defaults for local dev
#   ./scripts/bootstrap-openbao.sh --from-sops  # Decrypt and use secrets.enc.yaml
#
# Requirements:
#   - OpenBao running (docker compose up openbao)
#   - bao CLI or curl
#   - sops + age (only if using --from-sops)
#
# =============================================================================

set -euo pipefail

# Configuration
OPENBAO_ADDR="${OPENBAO_ADDR:-http://localhost:8200}"
OPENBAO_TOKEN="${OPENBAO_TOKEN:-apis-dev-token}"
SECRET_PATH="${OPENBAO_SECRET_PATH:-secret/data/apis}"
SECRETS_DIR="$(dirname "$0")/../secrets"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if OpenBao is reachable
check_openbao() {
    log_info "Checking OpenBao at ${OPENBAO_ADDR}..."
    if ! curl -sf "${OPENBAO_ADDR}/v1/sys/health" > /dev/null 2>&1; then
        log_error "OpenBao not reachable at ${OPENBAO_ADDR}"
        log_error "Make sure OpenBao is running: docker compose up -d openbao"
        exit 1
    fi
    log_info "OpenBao is healthy"
}

# Write secrets to OpenBao using curl (no bao CLI needed)
write_secret() {
    local path="$1"
    local data="$2"

    curl -sf \
        -H "X-Vault-Token: ${OPENBAO_TOKEN}" \
        -H "Content-Type: application/json" \
        -X POST \
        -d "{\"data\": ${data}}" \
        "${OPENBAO_ADDR}/v1/${path}" > /dev/null

    if [ $? -eq 0 ]; then
        log_info "Written: ${path}"
    else
        log_error "Failed to write: ${path}"
        return 1
    fi
}

# Bootstrap with default dev values
bootstrap_defaults() {
    log_info "Bootstrapping OpenBao with default dev secrets..."

    # Database secrets
    write_secret "${SECRET_PATH}/database" '{
        "host": "yugabytedb",
        "port": "5433",
        "name": "apis",
        "user": "apis",
        "password": "apisdev"
    }'

    # Zitadel secrets
    write_secret "${SECRET_PATH}/zitadel" '{
        "masterkey": "MasterkeyNeedsToHave32Chars!!",
        "admin_username": "admin",
        "admin_password": "Admin123!"
    }'

    # API configuration
    write_secret "${SECRET_PATH}/api" '{
        "port": "3000",
        "zitadel_issuer": "http://localhost:8080"
    }'

    log_info "Default secrets written successfully"
}

# Bootstrap from SOPS-encrypted file
bootstrap_from_sops() {
    local enc_file="${SECRETS_DIR}/secrets.enc.yaml"

    if [ ! -f "$enc_file" ]; then
        log_error "SOPS encrypted file not found: ${enc_file}"
        log_error "Create it first: sops --encrypt secrets/secrets.dec.yaml > secrets/secrets.enc.yaml"
        exit 1
    fi

    # Check for sops
    if ! command -v sops &> /dev/null; then
        log_error "sops not found. Install with: brew install sops"
        exit 1
    fi

    log_info "Decrypting secrets from SOPS..."

    # Decrypt and parse YAML to JSON for OpenBao
    # This requires yq or similar - fallback to simple extraction
    local dec_content
    dec_content=$(sops --decrypt "$enc_file")

    # Extract and write database secrets
    local db_user db_pass db_name db_host db_port
    db_user=$(echo "$dec_content" | grep -A10 "^database:" | grep "user:" | awk '{print $2}')
    db_pass=$(echo "$dec_content" | grep -A10 "^database:" | grep "password:" | awk '{print $2}')
    db_name=$(echo "$dec_content" | grep -A10 "^database:" | grep "name:" | awk '{print $2}')
    db_host=$(echo "$dec_content" | grep -A10 "^database:" | grep "host:" | awk '{print $2}')
    db_port=$(echo "$dec_content" | grep -A10 "^database:" | grep "port:" | awk '{print $2}')

    write_secret "${SECRET_PATH}/database" "{
        \"host\": \"${db_host:-yugabytedb}\",
        \"port\": \"${db_port:-5433}\",
        \"name\": \"${db_name:-apis}\",
        \"user\": \"${db_user:-apis}\",
        \"password\": \"${db_pass}\"
    }"

    # Extract and write Zitadel secrets
    local zit_masterkey zit_admin_user zit_admin_pass
    zit_masterkey=$(echo "$dec_content" | grep -A10 "^zitadel:" | grep "masterkey:" | awk '{print $2}')
    zit_admin_user=$(echo "$dec_content" | grep -A10 "^zitadel:" | grep "admin_username:" | awk '{print $2}')
    zit_admin_pass=$(echo "$dec_content" | grep -A10 "^zitadel:" | grep "admin_password:" | awk '{print $2}')

    write_secret "${SECRET_PATH}/zitadel" "{
        \"masterkey\": \"${zit_masterkey}\",
        \"admin_username\": \"${zit_admin_user:-admin}\",
        \"admin_password\": \"${zit_admin_pass}\"
    }"

    # API config (non-sensitive, can use defaults)
    write_secret "${SECRET_PATH}/api" '{
        "port": "3000",
        "zitadel_issuer": "http://localhost:8080"
    }'

    log_info "SOPS secrets written successfully"
}

# Main
main() {
    echo "============================================="
    echo "  APIS OpenBao Bootstrap"
    echo "============================================="
    echo ""

    check_openbao

    if [ "${1:-}" = "--from-sops" ]; then
        bootstrap_from_sops
    else
        bootstrap_defaults
    fi

    echo ""
    log_info "Bootstrap complete!"
    log_info "Secrets are available at: ${SECRET_PATH}/*"
    echo ""
    echo "To verify:"
    echo "  curl -H \"X-Vault-Token: ${OPENBAO_TOKEN}\" ${OPENBAO_ADDR}/v1/${SECRET_PATH}/database"
}

main "$@"
