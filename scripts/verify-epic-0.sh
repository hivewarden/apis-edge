#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:3000}"
DASHBOARD_URL="${DASHBOARD_URL:-http://localhost:5173}"
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8081}"
OPENBAO_URL="${OPENBAO_URL:-http://localhost:8200}"

red() { printf "\033[0;31m%s\033[0m\n" "$*"; }
green() { printf "\033[0;32m%s\033[0m\n" "$*"; }

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    red "Missing required command: $1"
    exit 1
  fi
}

check_health() {
  local name="$1"
  local url="$2"
  local expect="${3:-200}"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' "$url" || true)"
  if [ "$code" != "$expect" ]; then
    red "FAIL $name: $url (expected $expect, got $code)"
    exit 1
  fi
  green "OK   $name: $url ($code)"
}

check_container_health() {
  local container="$1"
  local status
  status="$(docker inspect -f '{{.State.Health.Status}}' "$container" 2>/dev/null || true)"
  if [ "$status" != "healthy" ]; then
    red "FAIL container health: $container ($status)"
    exit 1
  fi
  green "OK   container health: $container ($status)"
}

main() {
  require_cmd curl
  require_cmd docker
  require_cmd python3

  check_container_health apis-server
  check_container_health apis-dashboard
  check_container_health apis-openbao
  check_container_health apis-yugabytedb

  check_health "APIS health" "${API_URL}/api/health" 200
  check_health "APIS auth config" "${API_URL}/api/auth/config" 200
  check_health "Dashboard" "${DASHBOARD_URL}/" 200
  check_health "Keycloak discovery" "${KEYCLOAK_URL}/realms/honeybee/.well-known/openid-configuration" 200
  check_health "OpenBao health" "${OPENBAO_URL}/v1/sys/health" 200

  client_id="$(curl -sf "${API_URL}/api/auth/config" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("client_id",""))')"
  if [ -z "${client_id}" ]; then
    red "FAIL client id: ${API_URL}/api/auth/config returned empty client_id"
    exit 1
  fi
  green "OK   Keycloak client_id is set (${client_id})"

  printf "\nManual auth verification (still required):\n"
  printf "  1) Open %s\n" "${DASHBOARD_URL}"
  printf "  2) Log in via Keycloak (default user: admin)\n"
  printf "  3) Confirm the dashboard can call a protected endpoint (e.g. /api/me)\n"
}

main "$@"
