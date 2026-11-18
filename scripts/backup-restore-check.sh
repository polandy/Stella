#!/usr/bin/env bash
# Proves a backup restores: backs up a running, demo-seeded container with scripts/backup.sh,
# restores the archive with scripts/restore.sh into a fresh volume, starts a fresh container on
# it and checks /healthz and that every table and the photos came back unchanged.
#
#   scripts/backup-restore-check.sh <image-ref>   (CI runs it on the image it just built)
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ $# -ne 1 ]]; then
	echo "usage: $0 <image-ref>" >&2
	exit 2
fi
readonly image="$1"
readonly run_id="stella-backup-check-$$"
readonly source="$run_id-source" restored="$run_id-restored"
work="$(mktemp -d)"
readonly work

cleanup() {
	docker rm -f "$source" "$restored" >/dev/null 2>&1 || true
	docker volume rm -f "$source" "$restored" >/dev/null 2>&1 || true
	rm -rf "$work"
}
trap cleanup EXIT

readonly COUNT_ROWS_JS='
const { Database } = require("bun:sqlite");
const db = new Database("/data/stella.db", { readonly: true });
const tables = db.query("SELECT name FROM sqlite_master WHERE type = '"'table'"' AND name NOT LIKE '"'sqlite_%'"' ORDER BY name").all();
for (const { name } of tables) {
	const { n } = db.query(`SELECT count(*) AS n FROM "${name}"`).get();
	console.log(name + " " + n);
}
'

start() { # <name> [extra docker run args…]
	local name="$1"
	shift
	docker run -d --name "$name" -v "$name":/data \
		-e SESSION_SECRET="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')" \
		-e UPDATE_CHECK=false "$@" "$image" >/dev/null
}

healthy() { # <name> — waits for /healthz to answer 200, or fails with the log
	local name="$1"
	for _ in $(seq 1 60); do
		if docker exec "$name" bun -e \
			"fetch('http://localhost:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
			2>/dev/null; then
			return 0
		fi
		sleep 1
	done
	echo "$name never answered /healthz with 200:" >&2
	docker logs "$name" >&2
	return 1
}

snapshot() { # <name> <file> — row count of every table, and the photos' checksums
	docker exec "$1" bun -e "$COUNT_ROWS_JS" >"$2"
	docker exec "$1" sh -c 'cd /data/media && find . -type f -print0 | sort -z | xargs -0 sha256sum' >>"$2"
}

start "$source" -e SEED_DEMO=true
healthy "$source"
docker exec "$source" sh -c 'mkdir -p /data/media && echo probe >/data/media/backup-check.txt'

scripts/backup.sh --container "$source" "$work/out"
snapshot "$source" "$work/before"
docker stop "$source" >/dev/null

scripts/restore.sh "$work"/out/stella-backup-*.tar.gz "$restored"
start "$restored"
healthy "$restored"
snapshot "$restored" "$work/after"

if ! diff -u "$work/before" "$work/after"; then
	echo "The restored database or photos differ from the backed-up ones (diff above)." >&2
	exit 1
fi
grep -q '^contact [1-9]' "$work/after" || { echo "The restored database holds no people." >&2; exit 1; }
echo "▶ backup restored: /healthz ok, $(grep -c . "$work/after") tables and files unchanged"
