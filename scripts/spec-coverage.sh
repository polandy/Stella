#!/usr/bin/env bash
# Lists the docs/dev/features subsections that no e2e header cites and that are not marked unit
# (docs/dev/08 §8.4). Report only: it never fails a build.
#
#   ./scripts/spec-coverage.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if [ $# -gt 0 ]; then
	echo "spec-coverage.sh takes no arguments, got: $*" >&2
	exit 2
fi
exec bun scripts/spec-coverage.ts
