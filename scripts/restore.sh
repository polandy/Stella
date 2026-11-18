#!/usr/bin/env bash
# Puts an archive from scripts/backup.sh back into Stella's data volume, replacing the
# database and the photos there. Stop Stella first; start it again afterwards.
#
#   scripts/restore.sh <archive> <volume-name-or-host-dir>
set -euo pipefail

# Pinned by digest, like the scanner in scan-image.sh: this one gets write access to the data.
readonly HELPER_IMAGE='alpine:3.22@sha256:49340b346798875b5592e5d420241f2f9cfba5f47e62ebb1446a1b34734e898f'

if [[ $# -ne 2 ]]; then
	echo "usage: $0 <archive> <volume-name-or-host-dir>" >&2
	exit 2
fi
readonly archive="$1" target="$2"

tar -tzf "$archive" | grep -x 'stella.db' >/dev/null || { echo "$archive is not a Stella backup: no stella.db in it" >&2; exit 1; }
if [[ -n "$(docker ps -q --filter "volume=$target")" ]]; then
	echo "A running container uses $target. Stop Stella first (./deploy.sh down)." >&2
	exit 1
fi

# The old -wal and -shm go too: SQLite would replay a stale WAL onto the restored database.
docker run --rm -i -v "$target":/data "$HELPER_IMAGE" sh -euc '
	rm -rf /data/stella.db /data/stella.db-wal /data/stella.db-shm /data/media
	tar -xzf - -C /data
	chown -R 1000:1000 /data
' <"$archive"
echo "▶ restored $archive into $target"
