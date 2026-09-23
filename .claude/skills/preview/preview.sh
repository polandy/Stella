#!/usr/bin/env bash
set -euo pipefail

# Stella preview server: a demo-seeded production build for manual testing —
# from this machine or from another device (tablet, phone) on the same
# network. The dev server's HMR is unreliable for that: another device sees
# "Importing a module script failed" and a form POST can abort mid-request
# (its websocket client script reconnects against a host it can't reach).
# A production build has no HMR, so it doesn't have that problem.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

# Not 4190: it's the reserved ManageSieve mail port, and some routers/security boxes
# silently drop it while everything else on the LAN gets through fine. 5173 is `vite dev`'s
# own default and known reachable on this LAN, so it's the safer default to preview on.
PORT="${PORT:-5173}"
DATA_DIR="${DATA_DIR:-$ROOT/.claude/skills/preview/data}"
PID_FILE="$DATA_DIR/preview.pid"
LOG_FILE="$DATA_DIR/preview.log"

lan_ip() {
	ip route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i <= NF; i++) if ($i == "src") print $(i + 1)}'
}

running_pid() {
	[ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null && cat "$PID_FILE"
}

print_urls() {
	echo "  local:      http://localhost:$PORT"
	local ip
	ip="$(lan_ip)"
	[ -n "$ip" ] && echo "  network:    http://$ip:$PORT   <- use this from a tablet/phone"
	echo "  demo login: demo@stella.local / stella-demo-1234"
	echo "  data:       $DATA_DIR (delete to reset; never touches ./data/stella.db)"
}

stop() {
	local pid
	pid="$(running_pid)" || { echo "no preview server running"; return 0; }
	kill "$pid"
	rm -f "$PID_FILE"
	echo "stopped preview server (pid $pid)"
}

if [ "${1:-}" = "--stop" ]; then
	stop
	exit 0
fi

if pid="$(running_pid)"; then
	echo "preview server already running (pid $pid)"
	print_urls
	exit 0
fi

mkdir -p "$DATA_DIR/media"

bun run build

IP="$(lan_ip)"
ORIGIN_URL="http://${IP:-localhost}:$PORT"

# ORIGIN must equal exactly what the browser opens (docs/07 §7.6): adapter-node
# checks it against every POST's Origin header and refuses a mismatch with
# "Cross-site POST form submissions are forbidden" — including the login form.
SEED_DEMO=true \
DATABASE_PATH="$DATA_DIR/stella.db" \
MEDIA_DIR="$DATA_DIR/media" \
HOST=0.0.0.0 \
PORT="$PORT" \
ORIGIN="$ORIGIN_URL" \
STELLA_URL="$ORIGIN_URL" \
nohup bun ./build/index.js >"$LOG_FILE" 2>&1 &
disown
echo $! >"$PID_FILE"

sleep 2
if ! kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
	echo "preview server failed to start — see $LOG_FILE"
	tail -n 40 "$LOG_FILE"
	rm -f "$PID_FILE"
	exit 1
fi

echo "preview server running (pid $(cat "$PID_FILE"))"
print_urls
