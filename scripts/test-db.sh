#!/usr/bin/env bash
# Throwaway MariaDB for integration tests: 127.0.0.1:3307, root, no password.
set -euo pipefail

DIR="${TMPDIR:-/tmp}/mbmc-qrawb-test-db"
PORT=3307
ADMIN=(mariadb-admin --protocol=tcp -h127.0.0.1 -P"$PORT" -uroot)

case "${1:-}" in
  start)
    if "${ADMIN[@]}" ping >/dev/null 2>&1; then echo "already running on $PORT"; exit 0; fi
    mkdir -p "$DIR"
    if [ ! -d "$DIR/data" ]; then
      mariadb-install-db --no-defaults --datadir="$DIR/data" \
        --auth-root-authentication-method=normal --skip-test-db >"$DIR/install.log" 2>&1
    fi
    nohup mariadbd --no-defaults --datadir="$DIR/data" --port="$PORT" \
      --bind-address=127.0.0.1 --socket="$DIR/mysqld.sock" --pid-file="$DIR/mysqld.pid" \
      >"$DIR/server.log" 2>&1 &
    for _ in $(seq 1 30); do
      if "${ADMIN[@]}" ping >/dev/null 2>&1; then echo "started on $PORT"; exit 0; fi
      sleep 1
    done
    echo "server did not start; see $DIR/server.log" >&2
    exit 1
    ;;
  stop)
    "${ADMIN[@]}" shutdown 2>/dev/null && echo "stopped" || echo "not running"
    ;;
  status)
    "${ADMIN[@]}" ping
    ;;
  *)
    echo "usage: $0 start|stop|status" >&2
    exit 2
    ;;
esac
