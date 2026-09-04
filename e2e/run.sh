#!/usr/bin/env bash
# Run the Playwright e2e suite.
#
# Chromium cannot run on the NixOS host, so the browser runs inside the pinned Playwright
# image (`--network host`) while the app server runs here under Bun. Every run starts from a
# fresh database seeded with the demo dataset, so the suite is deterministic.
#   ./e2e/run.sh                 run everything
#   ./e2e/run.sh --grep moment   pass any Playwright flag through
set -euo pipefail
cd "$(dirname "$0")/.."

# Must match the @playwright/test version in package.json.
IMAGE="mcr.microsoft.com/playwright:v1.62.1-noble"
BASE_URL="http://127.0.0.1:4173"

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

docker run --rm --network host \
  -v "$PWD:/work" -w /work \
  -e CI=1 \
  "$IMAGE" npx playwright test "$@"
