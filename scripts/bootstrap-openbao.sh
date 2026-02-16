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
# SECURITY NOTE: This script intentionally suppresses output that could
# expose secrets. Do not add echo/log statements that print credential values.
# =============================================================================

set -euo pipefail

# Configuration - read from environment variables (do not log these values)
# Defaults are for local development only - production should use explicit values
OPENBAO_ADDR="${OPENBAO_ADDR:-http://localhost:8200}"
OPENBAO_TOKEN="${OPENBAO_TOKEN:-apis-dev-token}"
SECRET_PATH="${OPENBAO_SECRET_PATH:-secret/data/apis}"
SECRETS_DIR="$(dirname "$0")/../secrets"
APIS_DB_USER="${APIS_DB_USER:-apis}"
APIS_DB_PASSWORD="${APIS_DB_PASSWORD:-apisdev}"

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
# SECURITY: Suppress all output to avoid leaking secrets in logs
write_secret() {
    local path="$1"
    local data="$2"

    # Suppress stdout/stderr to prevent secret leakage in logs
    if curl -sf \
        -H "X-Vault-Token: ${OPENBAO_TOKEN}" \
        -H "Content-Type: application/json" \
        -X POST \
        -d "{\"data\": ${data}}" \
        "${OPENBAO_ADDR}/v1/${path}" >/dev/null 2>&1; then
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
        "user": "'"${APIS_DB_USER}"'",
        "password": "'"${APIS_DB_PASSWORD}"'"
    }'

    # Keycloak secrets
    write_secret "${SECRET_PATH}/keycloak" '{
        "admin_username": "admin",
        "admin_password": "Admin123!",
        "client_id": "apis-dashboard"
    }'

    # API configuration
    write_secret "${SECRET_PATH}/api" '{
        "port": "3000",
        "keycloak_issuer": "http://keycloak:8080/realms/honeybee"
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

    # Extract and write Keycloak secrets
    local kc_admin_user kc_admin_pass kc_client_id
    kc_admin_user=$(echo "$dec_content" | grep -A10 "^keycloak:" | grep "admin_username:" | awk '{print $2}')
    kc_admin_pass=$(echo "$dec_content" | grep -A10 "^keycloak:" | grep "admin_password:" | awk '{print $2}')
    kc_client_id=$(echo "$dec_content" | grep -A10 "^keycloak:" | grep "client_id:" | awk '{print $2}')

    write_secret "${SECRET_PATH}/keycloak" "{
        \"admin_username\": \"${kc_admin_user:-admin}\",
        \"admin_password\": \"${kc_admin_pass}\",
        \"client_id\": \"${kc_client_id:-apis-dashboard}\"
    }"

    # API config (non-sensitive, can use defaults)
    write_secret "${SECRET_PATH}/api" '{
        "port": "3000",
        "keycloak_issuer": "http://keycloak:8080/realms/honeybee"
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
    # SECURITY: Do not include example commands that could expose tokens in shell history
    echo "To verify secrets were written, check OpenBao UI or use bao CLI with appropriate auth."
}

main "$@"
