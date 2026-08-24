#!/usr/bin/env bash
set -euo pipefail

action="${1:-start}"
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pid_file="$root_dir/.output/server.pid"
log_file="$root_dir/.output/server.log"
entry_file="$root_dir/.output/server/index.mjs"

get_running_pid() {
  if [[ ! -f "$pid_file" ]]; then
    return 1
  fi
  local pid
  pid="$(tr -d '[:space:]' < "$pid_file" || true)"
  if [[ -z "$pid" ]]; then
    return 1
  fi
  if ! kill -0 "$pid" >/dev/null 2>&1; then
    return 1
  fi
  printf "%s" "$pid"
}

start_server() {
  if [[ ! -f "$entry_file" ]]; then
    echo "Build output not found at $entry_file. Run rebuild first."
    exit 1
  fi
  # A direct server:start is also allowed to take over from maintenance mode.
  bash "$root_dir/scripts/maintenance.sh" release
  local pid
  if pid="$(get_running_pid)"; then
    echo "Server already running with PID $pid"
    return 0
  fi
  (
    cd "$root_dir"
    nohup node --env-file .env .output/server/index.mjs >> "$log_file" 2>&1 &
    echo $! > "$pid_file"
  )
  echo "Started server with PID $(cat "$pid_file")"
  sleep 1
  pid="$(cat "$pid_file")"
  if ! kill -0 "$pid" >/dev/null 2>&1; then
    rm -f "$pid_file"
    echo "Server failed to start. Recent log output:"
    tail -n 20 "$log_file" 2>/dev/null || true
    return 1
  fi
  if grep -Fq "[scheduler] started pid=$pid" "$log_file"; then
    echo "Scheduler: active (PID $pid)"
  else
    echo "Scheduler: not confirmed. Check $log_file"
  fi
}

stop_server() {
  local pid
  if ! pid="$(get_running_pid)"; then
    echo "No running server found."
    rm -f "$pid_file"
    return 0
  fi
  kill "$pid" || true
  for _ in {1..100}; do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      break
    fi
    sleep 0.1
  done
  if kill -0 "$pid" >/dev/null 2>&1; then
    echo "Server with PID $pid did not stop within 10 seconds."
    return 1
  fi
  rm -f "$pid_file"
  echo "Stopped server with PID $pid"
}

rebuild_server() {
  (cd "$root_dir" && npm run build)
}

status_server() {
  local pid
  if pid="$(get_running_pid)"; then
    echo "Server running with PID $pid"
  else
    echo "Server not running."
  fi
}

case "$action" in
  start) start_server ;;
  stop) stop_server ;;
  restart) stop_server; start_server ;;
  rebuild) rebuild_server ;;
  status) status_server ;;
  *)
    echo "Usage: $0 {start|stop|restart|rebuild|status}"
    exit 1
    ;;
esac
