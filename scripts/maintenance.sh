#!/usr/bin/env bash
set -euo pipefail

action="${1:-status}"
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime_dir="$root_dir/.maintenance"
pid_file="$runtime_dir/server.pid"
log_file="$runtime_dir/server.log"
entry_file="$root_dir/.output/server/index.mjs"

get_running_pid() {
  if [[ ! -f "$pid_file" ]]; then
    return 1
  fi

  local pid
  pid="$(tr -d '[:space:]' < "$pid_file" || true)"
  if [[ -z "$pid" ]] || ! kill -0 "$pid" >/dev/null 2>&1; then
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

  sleep 1
  pid="$(tr -d '[:space:]' < "$pid_file")"
  if ! kill -0 "$pid" >/dev/null 2>&1; then
    rm -f "$pid_file"
    echo "Maintenance server failed to start. Recent log output:"
    tail -n 20 "$log_file" 2>/dev/null || true
    return 1
  fi

  echo "Maintenance mode enabled with PID $pid"
}

stop_maintenance_server() {
  local pid
  if ! pid="$(get_running_pid)"; then
    rm -f "$pid_file"
    echo "Maintenance mode is not active."
    return 0
  fi

  kill "$pid" || true
  for _ in {1..50}; do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      break
    fi
    sleep 0.1
  done
  if kill -0 "$pid" >/dev/null 2>&1; then
    echo "Maintenance server with PID $pid did not stop within 5 seconds."
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
