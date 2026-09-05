#!/usr/bin/env bash
# Run the Playwright e2e suite.
#
# Chromium cannot run on the NixOS host, so the browser runs inside the pinned Playwright
# image (`--network host`) while the app server runs here under Bun. Every run starts from a
# fresh database seeded with the demo dataset, so the suite is deterministic.
#   ./e2e/run.sh                 run everything
#   ./e2e/run.sh --grep moment   pass any Playwright flag through
#   E2E_PORT=4183 ./e2e/run.sh   use another port, so two worktrees can run side by side
set -euo pipefail
cd "$(dirname "$0")/.."

# Must match the @playwright/test version in package.json.
IMAGE="mcr.microsoft.com/playwright:v1.62.1-noble"
PORT="${E2E_PORT:-4173}"
BASE_URL="http://127.0.0.1:$PORT"
export E2E_PORT="$PORT"

# A server already on this port belongs to somebody else — very likely another worktree's
# build. Reusing it would run this branch's specs against that branch's app and pass, so
# stop instead of testing the wrong thing.
if curl -sf "$BASE_URL/healthz" >/dev/null 2>&1; then
  echo "Port $PORT is already serving something. Run with E2E_PORT=<free port>." >&2
  exit 1
fi

echo "▶ Building and starting the test server…"
bun run e2e:server &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT

for _ in $(seq 1 90); do
  if curl -sf "$BASE_URL/healthz" >/dev/null; then break; fi
  if ! kill -0 "$server_pid" 2>/dev/null; then echo "Test server died before becoming healthy." >&2; exit 1; fi
  sleep 2
done
curl -sf "$BASE_URL/healthz" >/dev/null || { echo "Test server never became healthy." >&2; exit 1; }
echo "▶ Server healthy at $BASE_URL"

# Run as the invoking user, otherwise Playwright's report/trace output lands in the
# working tree owned by root and the worktree can only be cleaned up with sudo.
docker run --rm --network host \
  --user "$(id -u):$(id -g)" \
  -v "$PWD:/work" -w /work \
  -e HOME=/tmp \
  -e CI=1 \
  -e E2E_PORT="$PORT" \
  "$IMAGE" npx playwright test "$@"
