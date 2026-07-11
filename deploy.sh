#!/usr/bin/env bash
# Rebuild and (re)deploy the current working tree as a local Docker container so the
# running app reflects the latest code. Idempotent — run it again after any change.
#   ./deploy.sh          rebuild + restart, wait until healthy
#   ./deploy.sh logs     follow the container logs
#   ./deploy.sh down     stop and remove the container
set -euo pipefail
cd "$(dirname "$0")"

compose() { docker compose "$@"; }

case "${1:-up}" in
  logs) exec docker compose logs -f stella ;;
  down) compose down; echo "stella stopped."; exit 0 ;;
esac

if [[ ! -f .env ]]; then
  echo "No .env found — copy .env.example to .env and set SESSION_SECRET / STELLA_URL first." >&2
  exit 1
fi

echo "▶ Building image from the current tree…"
compose build

echo "▶ Starting container…"
compose up -d

# Read the published URL straight from .env so the message always matches config.
url="$(grep -E '^STELLA_URL=' .env | cut -d= -f2- || true)"
url="${url:-http://localhost:3000}"

echo -n "▶ Waiting for health"
for _ in $(seq 1 30); do
  status="$(docker inspect -f '{{.State.Health.Status}}' stella 2>/dev/null || echo unknown)"
  if [[ "$status" == "healthy" ]]; then
    echo " — healthy ✓"
    echo "✅ Stella is live at ${url}  (first run → open ${url}/setup to create the admin)"
    exit 0
  fi
  echo -n "."
  sleep 2
done

echo " — still not healthy. Recent logs:" >&2
compose logs --tail=40 stella >&2
exit 1
