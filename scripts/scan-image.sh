#!/usr/bin/env bash
# Fails when a built image carries a vulnerability at the gate's severity that already has a
# fix — one a rebuild or a dependency bump would remove. Unfixed findings are reported by
# upstream too and would only block every build until they ship, so they do not count.
#
# Usage: scripts/scan-image.sh <image-ref>   (the image must be in the local Docker daemon)
#
# CI and the publish workflow run this before an image may be pushed; run it locally the same
# way after `docker build -t stella:local .`.
set -euo pipefail

# Pinned by digest: a scanner that can be swapped under its tag is no gate.
readonly TRIVY_IMAGE='aquasec/trivy:0.76.2@sha256:8f6bb947dbc528902e11f2f5be52f7b519f6a39d5d148f41166f2040499768fb'
readonly GATE_SEVERITY='CRITICAL'

if [[ $# -ne 1 ]]; then
	echo "usage: $0 <image-ref>" >&2
	exit 2
fi
readonly image="$1"

# The vulnerability database is cached between runs on the same machine.
readonly cache_dir="${XDG_CACHE_HOME:-$HOME/.cache}/trivy"
mkdir -p "$cache_dir"

docker run --rm \
	-v /var/run/docker.sock:/var/run/docker.sock:ro \
	-v "$cache_dir:/root/.cache/trivy" \
	"$TRIVY_IMAGE" image \
	--scanners vuln \
	--severity "$GATE_SEVERITY" \
	--ignore-unfixed \
	--exit-code 1 \
	--no-progress \
	"$image"
