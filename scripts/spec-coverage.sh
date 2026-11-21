#!/usr/bin/env bash
# Report-only: which feature subsections does no e2e header cite?
#
# Lists every numbered heading of docs/dev/features/*.md ("## 2.26 …", "### 2.26.1 …",
# "#### 2.2.4.7 …") that
#   - no header comment of an e2e spec cites — the header is the first block comment of
#     e2e/*.spec.ts, and a citation matches exactly that number (§2.26.1); an en-dash range
#     (§2.26.6–7) counts for every subsection it spans — and that
#   - carries no **[unit]** marker. **[unit]** on a heading says the subsection's behaviour is
#     pinned by unit tests, so an e2e is not expected of it; it is decided per heading, so one
#     marked subsection hides neither its siblings nor its parent (docs/dev/08 §8.5).
#
# Prints the list sorted by section number (2.2 before 2.10) and always exits 0; a non-zero
# exit means the script was used wrongly or could not read the tree.
#
#   scripts/spec-coverage.sh
set -euo pipefail
# Byte locale on purpose: § and the en-dash are matched as the byte sequences they are, so the
# answer does not depend on the caller's locale.
export LC_ALL=C
cd "$(dirname "$0")/.."

usage() {
	echo "usage: scripts/spec-coverage.sh" >&2
	exit 2
}
fail() {
	echo "spec-coverage: $*" >&2
	exit 1
}

[[ $# -eq 0 ]] || usage
[[ -d docs/dev/features && -d e2e ]] || fail "no docs/dev/features or no e2e beside the repository root"

shopt -s nullglob
specs=(e2e/*.spec.ts)
features=(docs/dev/features/*.md)
shopt -u nullglob
(( ${#specs[@]} )) || fail "no e2e/*.spec.ts in the repository"
(( ${#features[@]} )) || fail "no docs/dev/features/*.md in the repository"

# §number, or an en-dash range §number–number; numbers stop at a character that is neither
# digit nor dot, so prose like "§8.4. Without" yields 8.4, never 8.4..
citation_re='§[0-9]+(\.[0-9]+)*(–[0-9]+(\.[0-9]+)*)?'

# Only the first block comment counts: citations in the code below it are not the header.
read -r -d '' header_awk <<'AWK' || true
/^\/\*/ {
	print
	if ($0 ~ /\/\*.*\*\//) exit
	on = 1
	next
}
on {
	print
	if ($0 ~ /^ *\*\//) exit
}
AWK

# The numbered headings: number <TAB> title, title verbatim after the number.
read -r -d '' heading_awk <<'AWK' || true
/^#{2,4} 2\.[0-9.]+ / {
	head = $0
	sub(/^#+ /, "", head)
	num = head
	sub(/ .*$/, "", num)
	title = head
	sub(/^[^ ]+ /, "", title)
	sub(/\.$/, "", num)
	print num "\t" title
}
AWK

# Sections a header cites, as one flat stream (headers joined with spaces, so a citation whose
# "docs/dev/02" and whose §number sit on different lines is still found).
mapfile -t tokens < <(
	for spec in "${specs[@]}"; do
		awk "$header_awk" "$spec"
	done | tr '\n' ' ' | grep -Eo "$citation_re" || true
)

points=()
range_starts=()
range_ends=()
for token in "${tokens[@]}"; do
	token="${token#§}" # strip the mark by pattern, never by byte position
	if [[ $token != *–* ]]; then
		points+=("${token%.}")
		continue
	fi
	start="${token%%–*}"
	end="${token##*–}"
	# A short right side repeats the left's parent: §2.26.6–7 means 2.26.6 and 2.26.7.
	[[ $end == *.* ]] || end="${start%.*}.$end"
	range_starts+=("${start%.}")
	range_ends+=("${end%.}")
done

# num_le a b — a ≤ b, dot-separated numbers compared component by component, numerically, so
# 2.2 sorts before 2.10 and a cited §2.26 range cannot swallow 2.13.
num_le() {
	local -a a b
	IFS=. read -r -a a <<<"$1"
	IFS=. read -r -a b <<<"$2"
	local i part
	for i in "${!a[@]}"; do
		(( i < ${#b[@]} )) || return 1 # a is longer, so a > b
		part=${b[i]}
		if (( 10#${a[i]} != 10#${part:-0} )); then
			(( 10#${a[i]} < 10#${part:-0} )) || return 1
		fi
	done
	return 0 # a exhausted: a is a prefix of b, so a ≤ b
}

# pad n — every component to a fixed width, so C-locale byte order on the key is numeric
# order and sort stays right under any locale.
pad() {
	local out="" part
	local -a parts
	IFS=. read -r -a parts <<<"$1"
	for part in "${parts[@]}"; do
		out+="$(printf '%03d' "$((10#$part))")"
	done
	printf '%s' "$out"
}

cited_by_a_header() {
	local num="$1" point i
	for point in "${points[@]}"; do
		[[ $point == "$num" ]] && return 0
	done
	for i in "${!range_starts[@]}"; do
		if num_le "${range_starts[i]}" "$num" && num_le "$num" "${range_ends[i]}"; then
			return 0
		fi
	done
	return 1
}

mapfile -t headings < <(awk "$heading_awk" "${features[@]}")

report=()
total=0
for line in "${headings[@]}"; do
	num=${line%%$'\t'*}
	title=${line#*$'\t'}
	total=$((total + 1))
	if [[ $title == *'[unit]'* ]]; then
		continue
	fi
	if cited_by_a_header "$num"; then
		continue
	fi
	report+=("$(pad "$num")"$'\t'"$num"$'\t'"$title")
done

if (( ${#report[@]} == 0 )); then
	echo "▶ every one of the $total numbered feature subsections is cited by an e2e header or marked **[unit]**"
	exit 0
fi

echo "▶ ${#report[@]} of the $total numbered feature subsections no e2e header cites and none marks unit:"
printf '%s\n' "${report[@]}" | sort | while IFS=$'\t' read -r _ num title; do
	echo "    $num $title"
done
