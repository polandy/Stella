#!/usr/bin/env bash
# Online backup of a running Stella: a consistent database snapshot plus the photos, as one
# archive laid out like the /data volume. The container keeps serving throughout.
#
#   scripts/backup.sh [--container stella] [--keep 14] <out-dir>
#
# Keeps the newest <keep> archives in <out-dir>; scripts/restore.sh reads one back in
# (docs/user/install.md, Backups).
set -euo pipefail

container=stella
keep=14
usage() {
	echo "usage: $0 [--container <name>] [--keep <n>] <out-dir>" >&2
	exit 2
}
while [[ $# -gt 0 ]]; do
	case "$1" in
	--container) container="${2:?}"; shift 2 ;;
	--keep) keep="${2:?}"; shift 2 ;;
	-*) usage ;;
	*) break ;;
	esac
done
[[ $# -eq 1 ]] || usage
[[ "$keep" =~ ^[1-9][0-9]*$ ]] || { echo "--keep must be a whole number of at least 1" >&2; exit 2; }
readonly out="$1"
mkdir -p "$out"

# VACUUM INTO reads one transaction, so the copy is consistent while the app keeps writing to
# the WAL; a byte copy of stella.db would not be.
readonly SNAPSHOT_JS='
const { Database } = require("bun:sqlite");
const { mkdirSync, rmSync } = require("node:fs");
if (process.env.DATABASE_PATH !== "/data/stella.db" || process.env.MEDIA_DIR !== "/data/media") {
	console.error("backup.sh expects the image layout: DATABASE_PATH=/data/stella.db, MEDIA_DIR=/data/media");
	process.exit(1);
}
rmSync("/data/.backup", { recursive: true, force: true });
mkdirSync("/data/.backup");
const live = new Database("/data/stella.db", { readwrite: true });
live.run("PRAGMA busy_timeout = 10000");
live.run("VACUUM INTO ?", ["/data/.backup/stella.db"]);
live.close();
const copy = new Database("/data/.backup/stella.db", { readonly: true });
const { integrity_check } = copy.query("PRAGMA integrity_check").get();
if (integrity_check !== "ok") {
	console.error("The snapshot failed its integrity check: " + integrity_check);
	process.exit(1);
}
'

readonly archive="$out/stella-backup-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
cleanup() {
	rm -f "$archive.partial"
	docker exec "$container" rm -rf /data/.backup >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker exec "$container" bun -e "$SNAPSHOT_JS"

# A household without photos yet has no media folder.
members=(-C /data/.backup stella.db)
if docker exec "$container" test -d /data/media; then members+=(-C /data media); fi
docker exec "$container" tar -czf - "${members[@]}" >"$archive.partial"
tar -tzf "$archive.partial" | grep -x 'stella.db' >/dev/null || { echo "The archive holds no stella.db" >&2; exit 1; }
mv "$archive.partial" "$archive"
echo "▶ $archive"

# Only after the new archive is in place, so a failed run never costs an old one.
find "$out" -maxdepth 1 -name 'stella-backup-*.tar.gz' -printf '%f\n' | sort -r | tail -n +"$((keep + 1))" |
	while read -r old; do rm -- "$out/$old"; done
