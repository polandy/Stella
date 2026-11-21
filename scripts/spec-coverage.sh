#!/usr/bin/env bash
# Which feature subsections the end-to-end suite does not name.
#
# Each `e2e/*.spec.ts` opens with a header comment citing the feature sections it locks in
# (e.g. `docs/dev/02 §2.26.6–7`). This lists every numbered heading under
# `docs/dev/features/*.md` that no such header cites — behaviour no Playwright case claims.
# A subsection whose behaviour is pinned by `bun test` alone, with no e2e of its own, ends its
# heading with `**[unit]**`; the marker is per heading, so a marked one never hides its
# siblings, and a spec that later covers it drops the marker (docs/dev/08 §8.5). A citation
# range expands, so `§2.26.6–7` covers 2.26.6 and 2.26.7, and matching is by the whole number,
# so `§2.2` never covers 2.20.
#
# Report-only: it prints the gaps and always exits 0. Only a bad invocation or unreadable
# input is an error.
#
#   ./scripts/spec-coverage.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# Byte-wise throughout, so the answer does not depend on the locale: `§` is two bytes and only
# the digits after it are read, never a character position.
export LC_ALL=C

if [[ $# -gt 1 ]] || { [[ $# -eq 1 ]] && [[ "$1" != "-h" && "$1" != "--help" ]]; }; then
	echo "usage: $0" >&2
	exit 2
fi
if [[ $# -eq 1 ]]; then
	echo "Lists the feature subsections no e2e header cites (docs/dev/08 §8.5)."
	exit 0
fi

readonly features='docs/dev/features'
for dir in "$features" e2e; do
	if [[ ! -d "$dir" ]]; then
		echo "missing $dir/ — run from a Stella checkout" >&2
		exit 1
	fi
done

# The numbers cited by the header comment of every spec, one per line. The header is the first
# plain `/*` block — a leading `/**` const doc is not it — and the three specs that open with a
# `//` line use that. An en dash is normalized to a hyphen before a range is read, so
# `§2.26.6–7`, `§2.27.9–10` and `§2.24.1–§2.24.3` all expand to one number per line.
cited="$(
	for spec in e2e/*.spec.ts; do
		awk '
			{ line[NR] = $0 }
			END {
				for (i = 1; i <= NR; i++) if (line[i] ~ /^\/\*[[:space:]]*$/) { first = i; break }
				if (first) {
					for (i = first; i <= NR; i++) { print line[i]; if (line[i] ~ /\*\//) break }
				} else {
					for (i = 1; i <= NR; i++) if (line[i] ~ /^\/\//) { print line[i]; break }
				}
			}
		' "$spec"
	done | awk '
		function emit(number) { print number }
		# A token like `2.26.6-7` or `2.24.1-2.24.3` becomes every number it spans.
		function expand(token,   dash, base, end, i, sep, prefix, start, esep, stop) {
			dash = index(token, "-")
			if (dash == 0) { emit(token); return }
			base = substr(token, 1, dash - 1)
			end = substr(token, dash + 1)
			sep = 0
			for (i = length(base); i > 0; i--) if (substr(base, i, 1) == ".") { sep = i; break }
			if (sep == 0) { emit(base); emit(end); return }
			prefix = substr(base, 1, sep - 1)
			start = substr(base, sep + 1)
			if (end ~ /\./) {
				esep = 0
				for (i = length(end); i > 0; i--) if (substr(end, i, 1) == ".") { esep = i; break }
				stop = (esep ? substr(end, esep + 1) : end)
			} else stop = end
			if (start !~ /^[0-9]+$/ || stop !~ /^[0-9]+$/) { emit(base); emit(end); return }
			if (stop + 0 < start + 0) { emit(base); emit(end); return }
			for (i = start + 0; i <= stop + 0; i++) emit(prefix "." i)
		}
		{
			line = $0
			sub(/^[[:space:]]*\/\//, "", line)
			sub(/^[[:space:]]*\/\*/, "", line)
			sub(/^[[:space:]]*\*/, "", line)
			sub(/[[:space:]]*\*\/[[:space:]]*$/, "", line)
			# Fold the two multi-byte separators to single bytes: gawk matches a multi-byte
			# literal against an optional group differently under LC_ALL=C, so the whole
			# citation grammar below must stay ASCII. An en dash becomes a hyphen (a range),
			# and `§` (U+00A7) becomes \001, a marker no prose carries.
			gsub(/\342\200\223/, "-", line)
			gsub(/\302\247/, "\001", line)
			header = header " " line
		}
		END {
			while (match(header, /\0012\.[0-9]+(\.[0-9]+)*(-[[:space:]]*\001?[0-9]+(\.[0-9]+)*)?/)) {
				token = substr(header, RSTART, RLENGTH)
				gsub(/[[:space:]]/, "", token)
				gsub(/\001/, "", token)
				expand(token)
				header = substr(header, RSTART + RLENGTH)
			}
		}
	' | sort -u
)"

# Every numbered heading as `<sort key>\t<number>\t<title>`. A missing component reads as zero,
# so 2.2 sorts before 2.2.1, and the key is fixed width, so 2.2 sorts before 2.10. Headings
# without a number (prose subheadings) are not subsections and are skipped.
awk -v cited="$cited" '
	BEGIN {
		n = split(cited, lines, "\n")
		for (i = 1; i <= n; i++) if (lines[i] != "") seen[lines[i]] = 1
	}
	/^#{2,4}[[:space:]]+[0-9]/ {
		line = $0
		sub(/^#+[[:space:]]+/, "", line)
		split(line, parts, " ")
		number = parts[1]
		if (number !~ /^[0-9]+(\.[0-9]+)*$/) next
		if (index($0, "**[unit]**") > 0) next
		if (number in seen) next
		title = substr(line, length(number) + 1)
		sub(/^[[:space:]]+/, "", title)
		count = split(number, segment, ".")
		key = ""
		for (i = 1; i <= 4; i++) key = key sprintf("%04d.", (i <= count ? segment[i] : 0))
		printf "%s\t%s\t%s\n", key, number, title
	}
' "$features"/*.md | LC_ALL=C sort | cut -f2- | sed 's/\t/ /'
