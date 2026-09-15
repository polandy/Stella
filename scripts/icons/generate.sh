#!/usr/bin/env bash
# Regenerate the installable app icons (docs/02 §2.18) into `static/icons/`.
#
# The art and its geometry live in `src/lib/pwa/icon-art.ts`, where they are unit-tested;
# this only turns them into PNGs. Chromium cannot run on the NixOS host, so the rasterising
# happens inside the pinned Playwright image — the same one the e2e suite uses.
#
# The output is committed: it changes only when the mark does, and neither a build nor CI
# should need a container to produce an icon.
set -euo pipefail
cd "$(dirname "$0")/../.."

# Must match the @playwright/test version in package.json.
IMAGE="mcr.microsoft.com/playwright:v1.62.1-noble"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "▶ Drawing the SVG sources…"
ICON_WORK_DIR="$WORK" ICON_OUT_DIR="$PWD/static/icons" bun scripts/icons/plan.ts > "$WORK/plan.json"
# The plan is written in host paths; rewrite them to the mounts the container sees.
sed -i -e "s|$WORK|/scratch|g" -e "s|$PWD|/work|g" "$WORK/plan.json"

echo "▶ Rasterising in $IMAGE…"
# Run as the invoking user, or the PNGs land in the working tree owned by root.
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "$PWD:/work" -v "$WORK:/scratch" -w /work \
  -e HOME=/tmp \
  "$IMAGE" node scripts/icons/render.mjs /scratch/plan.json

echo "▶ Done — commit the result in static/icons/"
