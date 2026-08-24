#!/usr/bin/env bash
set -euo pipefail

action="${1:-status}"
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime_dir="$root_dir/.maintenance"
pid_file="$runtime_dir/server.pid"
log_file="$runtime_dir/server.log"
entry_file="$root_dir/.output/server/index.mjs"

process_is_running() {
  local pid="$1"
  local state
  if ! kill -0 "$pid" >/dev/null 2>&1; then
    return 1
  fi
  state="$(ps -o stat= -p "$pid" 2>/dev/null | tr -d '[:space:]' || true)"
  [[ -n "$state" && "${state:0:1}" != "Z" ]]
}

process_is_maintenance() {
  local pid="$1"
  local command_line
  [[ -r "/proc/$pid/cmdline" ]] || return 1
  command_line="$(tr '\0' ' ' < "/proc/$pid/cmdline")"
  [[ "$command_line" == *"scripts/maintenance-server.mjs"* ]]
}

read_env_value() {
  local key="$1"
  local value
  value="$(
    grep -E "^${key}=" "$root_dir/.env" 2>/dev/null \
      | tail -n 1 \
      | cut -d '=' -f 2- \
      || true
  )"
  value="${value#\"}"
  value="${value%\"}"
  value="${value#\'}"
  value="${value%\'}"
  printf "%s" "$value"
}

maintenance_port() {
  local port="${NITRO_PORT:-${PORT:-}}"
  if [[ -z "$port" ]]; then
    port="$(read_env_value NITRO_PORT)"
  fi
  if [[ -z "$port" ]]; then
    port="$(read_env_value PORT)"
  fi
  printf "%s" "${port:-3000}"
}

maintenance_page_is_ready() {
  local port
  port="$(maintenance_port)"
  node -e '
    const port = process.argv[1];
    fetch(`http://127.0.0.1:${port}/`)
      .then(async (response) => {
        const body = await response.text();
        if (response.status !== 200 || !body.includes("TSL Silesia Collab")) {
          process.exit(1);
        }
      })
      .catch(() => process.exit(1));
  ' "$port" >/dev/null 2>&1
}

get_running_pid() {
  if [[ ! -f "$pid_file" ]]; then
    return 1
  fi

  local pid
  pid="$(tr -d '[:space:]' < "$pid_file" || true)"
  if [[ -z "$pid" ]] || ! process_is_running "$pid" || ! process_is_maintenance "$pid"; then
    return 1
  fi
  printf "%s" "$pid"
}

start_maintenance_server() {
  local pid
  if pid="$(get_running_pid)"; then
    echo "Maintenance mode is already active with PID $pid"
    return 0
  fi

  mkdir -p "$runtime_dir"
  rm -f "$pid_file"
  (
    cd "$root_dir"
    nohup node --env-file .env scripts/maintenance-server.mjs >> "$log_file" 2>&1 &
    echo $! > "$pid_file"
  )

  pid="$(tr -d '[:space:]' < "$pid_file")"
  for _ in {1..20}; do
    if process_is_running "$pid" && maintenance_page_is_ready; then
      echo "Maintenance mode enabled with PID $pid"
      return 0
    fi
    sleep 0.25
  done

  if process_is_running "$pid"; then
    kill -KILL "$pid" || true
  fi
  rm -f "$pid_file"
  echo "Maintenance server failed to serve its HTML page. Recent log output:"
  tail -n 20 "$log_file" 2>/dev/null || true
  return 1
}

stop_maintenance_server() {
  local pid
  if ! pid="$(get_running_pid)"; then
    rm -f "$pid_file"
    echo "Maintenance mode is not active."
    return 0
  fi

  kill -TERM "$pid" || true
  for _ in {1..30}; do
    if ! process_is_running "$pid"; then
      break
    fi
    sleep 0.1
  done
  if process_is_running "$pid"; then
    kill -KILL "$pid" || true
    for _ in {1..20}; do
      if ! process_is_running "$pid"; then
        break
      fi
      sleep 0.1
    done
  fi
  if process_is_running "$pid"; then
    echo "Maintenance server with PID $pid could not be stopped."
    return 1
  fi
  rm -f "$pid_file"
  echo "Maintenance mode stopped (PID $pid)"
}

enable_maintenance() {
  if [[ ! -f "$root_dir/.env" ]]; then
    echo ".env not found at $root_dir/.env. Application was not stopped."
    return 1
  fi
  if ! command -v node >/dev/null 2>&1; then
    echo "node is not installed or is not available in PATH. Application was not stopped."
    return 1
  fi
  if ! node --check "$root_dir/scripts/maintenance-server.mjs"; then
    echo "Maintenance server validation failed. Application was not stopped."
    return 1
  fi

  bash "$root_dir/scripts/server.sh" stop
  if ! start_maintenance_server; then
    echo "Could not enable maintenance mode; restarting the application."
    bash "$root_dir/scripts/server.sh" start
    return 1
  fi
}

handoff_to_application() {
  if [[ ! -f "$entry_file" ]]; then
    echo "Build output not found at $entry_file. Maintenance mode remains active."
    echo "Run npm run server:rebuild before disabling maintenance mode."
    return 1
  fi

  stop_maintenance_server
  if ! bash "$root_dir/scripts/server.sh" start; then
    echo "Application failed to start; restoring maintenance mode."
    start_maintenance_server
    return 1
  fi
}

status_maintenance() {
  local pid
  if pid="$(get_running_pid)"; then
    echo "Maintenance mode is active with PID $pid"
  else
    echo "Maintenance mode is not active."
  fi
}

case "$action" in
  run) enable_maintenance ;;
  stop) handoff_to_application ;;
  release) stop_maintenance_server ;;
  status) status_maintenance ;;
  *)
    echo "Usage: $0 {run|stop|status}"
    exit 1
    ;;
esac
