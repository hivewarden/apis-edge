#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-check}"
KCFG_DEFAULT="/tmp/ssik-breakglass-kubeconfig.yaml"
SSIK_KCFG_ENC="/Users/jermodelaruelle/Projects/SSIK-A/secrets/break-glass-kubeconfig.enc.yaml"
OPENBAO_PID_FILE="/tmp/apis-openbao-pf.pid"
FORGEJO_PID_FILE="/tmp/apis-forgejo-pf.pid"

ensure_kubeconfig() {
  if [[ -n "${KUBECONFIG:-}" && -f "${KUBECONFIG}" ]]; then
    return 0
  fi

  if [[ -f "${KCFG_DEFAULT}" ]]; then
    export KUBECONFIG="${KCFG_DEFAULT}"
    return 0
  fi

  if [[ -f "${SSIK_KCFG_ENC}" ]]; then
    if ! command -v sops >/dev/null 2>&1; then
      echo "sops is required to decrypt break-glass kubeconfig" >&2
      exit 1
    fi
    sops --decrypt "${SSIK_KCFG_ENC}" > "${KCFG_DEFAULT}"
    export KUBECONFIG="${KCFG_DEFAULT}"
    return 0
  fi

  echo "No kubeconfig available. Set KUBECONFIG or provide SSIK break-glass kubeconfig." >&2
  exit 1
}

check_public() {
  for host in bao.ratetheplate.dev forgejo.ratetheplate.dev; do
    code="$(curl -sk --max-time 5 -o /dev/null -w '%{http_code}' "https://${host}" || true)"
    echo "${host} https_http=${code}"
  done
}

check_local() {
  local ob_code fg_code
  ob_code="$(curl -s --max-time 3 -o /dev/null -w '%{http_code}' http://127.0.0.1:18200/v1/sys/health || true)"
  fg_code="$(curl -s --max-time 3 -o /dev/null -w '%{http_code}' http://127.0.0.1:13000/api/v1/version || true)"
  echo "openbao_local http=${ob_code}"
  echo "forgejo_local http=${fg_code}"
}

start_tunnels() {
  ensure_kubeconfig

  if [[ -f "${OPENBAO_PID_FILE}" ]]; then
    old_pid="$(cat "${OPENBAO_PID_FILE}" || true)"
    if [[ -n "${old_pid}" ]] && kill -0 "${old_pid}" 2>/dev/null; then
      kill "${old_pid}" || true
    fi
  fi
  if [[ -f "${FORGEJO_PID_FILE}" ]]; then
    old_pid="$(cat "${FORGEJO_PID_FILE}" || true)"
    if [[ -n "${old_pid}" ]] && kill -0 "${old_pid}" 2>/dev/null; then
      kill "${old_pid}" || true
    fi
  fi

  kubectl -n ssik-core port-forward svc/ssik-core-openbao 18200:8200 >/tmp/apis-openbao-pf.log 2>&1 &
  echo $! > "${OPENBAO_PID_FILE}"

  kubectl -n ssik-cicd port-forward svc/forgejo 13000:3000 >/tmp/apis-forgejo-pf.log 2>&1 &
  echo $! > "${FORGEJO_PID_FILE}"

  sleep 2
  check_local

  cat <<'EOF'
Set this for local OpenBao validation:
  export OPENBAO_ADDR=http://127.0.0.1:18200

Local Forgejo API endpoint:
  http://127.0.0.1:13000/api/v1
EOF
}

stop_tunnels() {
  for pid_file in "${OPENBAO_PID_FILE}" "${FORGEJO_PID_FILE}"; do
    if [[ -f "${pid_file}" ]]; then
      pid="$(cat "${pid_file}" || true)"
      if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
        kill "${pid}" || true
      fi
      rm -f "${pid_file}"
    fi
  done
  echo "stopped"
}

case "${MODE}" in
  check)
    check_public
    check_local
    ;;
  start)
    start_tunnels
    ;;
  stop)
    stop_tunnels
    ;;
  *)
    echo "Usage: $0 [check|start|stop]" >&2
    exit 1
    ;;
esac
