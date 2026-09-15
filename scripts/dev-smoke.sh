#!/usr/bin/env bash
# Prove the dev server actually renders a page.
#
# It is the one runtime nothing else in CI covers: Vite's module runner under Bun, where a
# module resolution that works in the built server and in `bun test` can still be dead. It
# was — `getDb`'s bare `require` left every page 500ing while both other runtimes stayed
# green (docs/04 §4.9).
#
#   ./scripts/dev-smoke.sh          # defaults to port 5199
#   DEV_SMOKE_PORT=5300 ./scripts/dev-smoke.sh
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${DEV_SMOKE_PORT:-5199}"
LOG="$(mktemp)"

# Bound explicitly: Vite's default host resolves to ::1 on some machines, and the check
# would then fail against a server that is perfectly fine.
bun run dev --host 127.0.0.1 --port "$PORT" >"$LOG" 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true' EXIT

# The server is either up, dead, or still starting; the loop ends on the first two and
# gives up on the third rather than hanging a CI job.
for _ in $(seq 1 60); do
  if ! kill -0 "$server" 2>/dev/null; then
    echo "The dev server exited before it served anything:" >&2
    cat "$LOG" >&2
    exit 1
  fi
  # Redirects are followed on purpose: with no account on file the login page sends the
  # visitor to /setup, and both ends of that prove what this checks — the page rendered,
  # which it cannot do without a database handle. Only a 500 (or nothing) is the failure.
  code=$(curl -sS -L -m 30 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/login" 2>>"$LOG" || true)
  echo "[smoke] /login -> ${code:-no answer}" >>"$LOG"
  if [ "$code" = "200" ]; then
    echo "▶ dev server rendered the login page on port $PORT"
    exit 0
  fi
  sleep 2
done

echo "The dev server never rendered the login page. Last state:" >&2
ss -ltnp 2>/dev/null | grep ":$PORT" >&2 || echo "[smoke] nothing listening on $PORT" >&2
cat "$LOG" >&2
exit 1
