#!/usr/bin/env bash
# Reports the feature subsections no e2e spec pins: every numbered heading in
# docs/dev/features/*.md whose number no e2e header cites and whose heading carries no
# **[unit]** mark. The list is the raw material for TODO.md's "e2e gaps" — read it, pick a
# row; it is a report, not a gate.
#
#   scripts/spec-coverage.sh
#
# A spec cites a section in its header comment — the first block comment of e2e/*.spec.ts
# that opens `/*` (the `/** … */` doc comments on helpers sit before or after it and don't
# count); what the code below the header cites does not count either. The header names a
# feature section as `§2.26`; `§2.26.6–7` (en dash) names 2.26.6 and 2.26.7. Matching is
# exact: §2.26 does not cover 2.26.1, and §2.2 does not match 2.20. Citations of other
# documents (§4.4, §8.4.1) and numbers no heading carries are ignored. *Marked unit* is the
# `**[unit]**` tag on a features heading (docs/dev/08 §8.5): the subsection's behaviour is
# pinned by `bun test`, so it is no e2e gap. The tag sits on the one heading it speaks for,
# never the file.
#
# Report-only: it prints the list and always exits 0; only a usage or I/O error exits
# non-zero.
set -euo pipefail
cd "$(dirname "$0")/.."

# Everything downstream matches bytes, not characters — § is two of them, the en dash three
# — and sorts numerically only because the keys are zero-padded. Overriding the locale here
# is what makes the report the same under LC_ALL=C and under a UTF-8 terminal; no slicing by
# character position, which flips meaning between the two.
export LC_ALL=C

if [[ $# -ne 0 ]]; then
	echo "usage: $0" >&2
	exit 2
fi

if [[ ! -d e2e || ! -d docs/dev/features ]]; then
	echo "no e2e/ or docs/dev/features/ here; run the script from a checkout of the repo" >&2
	exit 1
fi

shopt -s nullglob
readonly specs=(e2e/*.spec.ts)
shopt -u nullglob
if (( ${#specs[@]} == 0 )); then
	echo "no e2e/*.spec.ts to read the headers of" >&2
	exit 1
fi

readonly work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
readonly cited="$work/cited" headings="$work/headings" gaps="$work/gaps"

# What the headers cite: awk reads only the header of each spec — its first `/* … */` block,
# skipping the `/** … */` doc comments on helpers, which some specs park above the header and
# others below it, where their citations count as little as the code's — and prints every
# §2.… number in it, an en-dash suffix counting as its second section (§2.26.6–7 prints
# 2.26.6 and 2.26.7; a wrapped `§2.24.1–` / `§2.24.3` carries its own § on each side and
# needs none of this). The byte arithmetic is safe because LC_ALL=C is in force: only ASCII
# digits and dots ever sit between the § and the dash.
awk '
	FNR == 1 { inhead = 0; done = 0; header = "" }
	done { next }
	!inhead {
		if ((p = index($0, "/*")) && substr($0, p, 3) != "/**")
			inhead = 1
	}
	inhead {
		header = header "\n" $0
		if (index($0, "*/")) {
			done = 1
			cite(header)
		}
	}
	function cite(text,    ref, high, part) {
		while (match(text, /§[0-9]+(\.[0-9]+)*(–[0-9]+)?/)) {
			ref = substr(text, RSTART, RLENGTH)
			text = substr(text, RSTART + RLENGTH)
			sub(/^§/, "", ref)
			high = ""
			if (match(ref, /–[0-9]+$/)) {
				high = substr(ref, RSTART, RLENGTH)
				sub(/^–/, "", high)
				ref = substr(ref, 1, RSTART - 1)
			}
			split(ref, part, ".")
			if (part[1] != 2)
				continue
			print ref
			if (high != "") {
				sub(/\.[0-9]+$/, "", ref)
				print ref "." high
			}
		}
	}
' "${specs[@]}" | sort -u >"$cited"

# The subsections the docs define: every numbered heading, keyed by its number with each
# component zero-padded, so sorting the key puts 2.2 before 2.10 whatever the locale says.
awk '
	/^##+ 2\.[0-9]/ {
		head = $0
		sub(/[ \t]+$/, "", head)
		rest = head
		sub(/^#+ /, "", rest)
		num = rest
		sub(/ .*$/, "", num)
		title = rest
		sub(/^[^ ]+ /, "", title)
		unit = (head ~ /\*\*\[unit\]\*\*/) ? 1 : 0
		n = split(num, part, ".")
		key = ""
		for (i = 1; i <= n; i++)
			key = key sprintf("%03d", part[i]) (i < n ? "." : "")
		printf "%s\t%d\t%s\t%s\n", key, unit, num, title
	}
' docs/dev/features/*.md | sort -t$'\t' -k1,1 >"$headings"

# The report: the unmarked headings whose number no header cited, number first, then title.
awk -F'\t' -v citedfile="$cited" '
	BEGIN {
		while ((getline n < citedfile) > 0)
			is_cited[n] = 1
		close(citedfile)
	}
	$2 == 0 && !($3 in is_cited) { printf "%s  %s\n", $3, $4 }
' "$headings" >"$gaps"

total=$(awk 'END { print NR }' "$headings")
uncovered=$(awk 'END { print NR }' "$gaps")

if (( uncovered == 0 )); then
	echo "▶ every one of the $total feature subsections is cited by an e2e header or marked unit"
else
	echo "▶ $uncovered of the $total feature subsections no e2e header cites and nothing marks unit:"
	sed 's/^/  /' "$gaps"
fi
