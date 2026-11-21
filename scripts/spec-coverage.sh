#!/usr/bin/env bash
# Usage: scripts/spec-coverage.sh
# List numbered feature headings not cited in an e2e spec's first block comment.
# Append <!-- coverage: unit --> to a heading covered by unit tests alone. The
# marker exempts only that heading. Gaps are informational, not a failing check.
set -euo pipefail

if [[ $# -ne 0 ]]; then
	echo "usage: $0" >&2
	exit 2
fi
CDPATH= cd "$(dirname "$0")/.."
export LC_ALL=C

for dir in e2e docs/dev/features; do
	if [[ ! -d "$dir" || ! -r "$dir" || ! -x "$dir" ]]; then
		echo "$0: cannot read $dir" >&2
		exit 1
	fi
done
shopt -s nullglob

# Read the spec files first so exact citations are known before reporting headings.
# /dev/null keeps awk from reading stdin if both globs are empty.
awk '
	function cite(header,    section, prefix, endpoint, last, number) {
		while (match(header, /§2(\.[0-9]+)+/)) {
			section = substr(header, RSTART, RLENGTH)
			sub(/^§/, "", section)
			cited[section] = 1
			header = substr(header, RSTART + RLENGTH)

			# Both §2.26.6–7 and §2.24.1– §2.24.3 are sibling ranges.
			if (!match(header, /^[[:space:]]*–[[:space:]]*(§2(\.[0-9]+)+|[0-9]+)/)) continue
			endpoint = substr(header, 1, RLENGTH)
			sub(/^[[:space:]]*–[[:space:]]*/, "", endpoint)
			prefix = section
			sub(/[0-9]+$/, "", prefix)
			if (endpoint ~ /^§/) {
				sub(/^§/, "", endpoint)
				if (substr(endpoint, 1, length(prefix)) != prefix) continue
				endpoint = substr(endpoint, length(prefix) + 1)
				if (endpoint !~ /^[0-9]+$/) continue
			}
			header = substr(header, RLENGTH + 1)
			last = substr(section, length(prefix) + 1)
			for (number = last + 1; number <= endpoint + 0; number++) cited[prefix number] = 1
		}
	}

	FNR == 1 { in_header = done = 0; header = "" }
	FILENAME ~ /^e2e\// {
		if (done) next
		line = $0
		if (!in_header) {
			start = index(line, "/*")
			if (!start) next
			in_header = 1
			line = substr(line, start + 2)
		}
		end = index(line, "*/")
		if (end) line = substr(line, 1, end - 1)
		sub(/^[[:space:]]*\*[[:space:]]*/, "", line)
		header = header " " line
		if (end) {
			cite(header)
			done = 1
		}
		next
	}

	/^#{2,6}[[:space:]]+2(\.[0-9]+)+[[:space:]]+[^[:space:]]/ {
		if ($2 in cited || /[[:space:]]<!-- coverage: unit -->[[:space:]]*$/) next
		sub(/^#+[[:space:]]+/, "")
		sub(/[[:space:]]+$/, "")
		print
	}
' /dev/null e2e/*.spec.ts docs/dev/features/*.md | sort -k1,1V
