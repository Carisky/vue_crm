#!/usr/bin/env bash
set -euo pipefail

action="${1:-start}"
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pid_file="$root_dir/.output/server.pid"
log_file="$root_dir/.output/server.log"
entry_file="$root_dir/.output/server/index.mjs"
staging_dir="$root_dir/.output-build"
backup_dir="$root_dir/.output-previous"

remove_deployment_dir() {
  local target="$1"
  case "$target" in
    "$staging_dir"|"$backup_dir") rm -rf -- "$target" ;;
    *)
      echo "Refusing to remove unexpected deployment directory: $target"
      return 1
      ;;
  esac
}

process_is_running() {
  local pid="$1"
  local state
  if ! kill -0 "$pid" >/dev/null 2>&1; then
    return 1
  fi
  state="$(ps -o stat= -p "$pid" 2>/dev/null | tr -d '[:space:]' || true)"
  [[ -n "$state" && "${state:0:1}" != "Z" ]]
}

process_is_application() {
  local pid="$1"
  local command_line
  [[ -r "/proc/$pid/cmdline" ]] || return 1
  command_line="$(tr '\0' ' ' < "/proc/$pid/cmdline")"
  [[ "$command_line" == *".output/server/index.mjs"* ]]
}

get_running_pid() {
  if [[ ! -f "$pid_file" ]]; then
    return 1
  fi
  local pid
  pid="$(tr -d '[:space:]' < "$pid_file" || true)"
  if [[ -z "$pid" ]]; then
    return 1
  fi
  if ! process_is_running "$pid" || ! process_is_application "$pid"; then
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
  if ! process_is_running "$pid"; then
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
  kill -TERM "$pid" || true
  for _ in {1..30}; do
    if ! process_is_running "$pid"; then
      break
    fi
    sleep 0.1
  done
  if process_is_running "$pid"; then
    echo "Server did not finish graceful shutdown; forcing PID $pid to stop."
    kill -KILL "$pid" || true
    for _ in {1..20}; do
      if ! process_is_running "$pid"; then
        break
      fi
      sleep 0.1
    done
  fi
  if process_is_running "$pid"; then
    echo "Server with PID $pid could not be stopped."
    return 1
  fi
  rm -f "$pid_file"
  echo "Stopped server with PID $pid"
}

rebuild_server() {
  local running_pid
  local build_status

  if running_pid="$(get_running_pid)"; then
    echo "Application is still running with PID $running_pid."
    echo "Enable maintenance mode before rebuilding: npm run maintenance:run"
    return 1
  fi

  cd "$root_dir"
  npx prisma generate

  remove_deployment_dir "$staging_dir"

  set +e
  NITRO_OUTPUT_DIR="$staging_dir" npm run build
  build_status=$?
  set -e

  if [[ "$build_status" -ne 0 ]]; then
    echo "Build failed with exit code $build_status. The previous .output was not changed."
    if [[ "$build_status" -eq 137 ]]; then
      echo "The build was killed by the OS, usually because the server ran out of memory."
      echo "Add or increase swap, then run npm run server:rebuild again."
    fi
    remove_deployment_dir "$staging_dir"
    return "$build_status"
  fi

  if [[ ! -f "$staging_dir/server/index.mjs" ]]; then
    echo "Build completed without $staging_dir/server/index.mjs. The previous .output was not changed."
    remove_deployment_dir "$staging_dir"
    return 1
  fi

  remove_deployment_dir "$backup_dir"
  if [[ -d "$root_dir/.output" ]]; then
    mv -- "$root_dir/.output" "$backup_dir"
  fi

  if ! mv -- "$staging_dir" "$root_dir/.output"; then
    echo "Could not activate the new build. Restoring the previous .output."
    if [[ -d "$backup_dir" ]]; then
      mv -- "$backup_dir" "$root_dir/.output"
    fi
    return 1
  fi

  remove_deployment_dir "$backup_dir"
  echo "New build activated at $root_dir/.output"
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
