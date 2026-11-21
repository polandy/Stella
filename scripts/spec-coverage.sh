#!/usr/bin/env bash
# Lists the feature subsections no e2e header cites.
#
# Every e2e/*.spec.ts opens with a header comment that cites the feature sections it covers
# (docs/dev/02 §2.x, e.g. "docs/dev/02 §2.24.8"). This prints the numbered headings in
# docs/dev/features/*.md that no such header cites and that do not carry the **[unit]** tag —
# the subsections pinned by unit/integration tests instead of a browser case (docs/dev/02-features.md).
#
# A citation is matched by its exact number: §2.2 does not stand for §2.20, and a parent does not
# cover its children (§2.26 does not cover §2.26.1). An en-dash range is expanded (§2.26.6–7 is
# §2.26.6 and §2.26.7), and only the leading header comment counts, not later citations in the code.
#
# Report-only: the list goes to stdout and the exit code is 0. A usage or I/O error is the only
# non-zero exit.
#
#   scripts/spec-coverage.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ $# -ne 0 ]]; then
	echo "usage: $0" >&2
	exit 2
fi

readonly features_dir=docs/dev/features
readonly e2e_dir=e2e
shopt -s nullglob

specs=("$e2e_dir"/*.spec.ts)
files=("$features_dir"/*.md)
if [[ ${#specs[@]} -eq 0 ]]; then
	echo "$0: no e2e specs under $e2e_dir/" >&2
	exit 1
fi
if [[ ${#files[@]} -eq 0 ]]; then
	echo "$0: no feature docs under $features_dir/" >&2
	exit 1
fi

# The spec's header: the first /* … */ block, which the file's opening comment is.
header_of() {
	awk '
		found && /\*\// { exit }
		found { print }
		/\/\*/ { found = 1; if ($0 ~ /\*\//) exit }
	' "$1"
}

# One number per line, the leading § stripped: §2.24.8 -> 2.24.8, §2.26.6–7 -> 2.26.6 and 2.26.7.
# The digits are matched after the § (never sliced by position, which would depend on the locale),
# and the en-dash is U+2013. It runs the same under LC_ALL=C.
expand_ref() {
	local ref="$1" base tail
	base="${ref%%–*}"
	printf '%s\n' "$base"
	[[ "$base" == "$ref" ]] && return 0
	tail="${ref#*–}"
	if [[ "$tail" == *.* ]]; then
		printf '%s\n' "$tail"
	else
		printf '%s.%s\n' "${base%.*}" "$tail"
	fi
}

declare -A cited=()
while IFS= read -r ref; do
	[[ -n "$ref" ]] || continue
	while IFS= read -r number; do
		cited["$number"]=1
	done < <(expand_ref "${ref#§}")
done < <(for spec in "${specs[@]}"; do header_of "$spec" | grep -oE '§2\.[0-9]+(\.[0-9]+)*(–[0-9]+)?' || true; done)

# One "number<TAB>title" line per numbered heading that is neither cited nor tagged **[unit]**.
while IFS= read -r line; do
	[[ "$line" == *'**[unit]**'* ]] && continue
	[[ "$line" =~ ^#{2,4}[[:space:]]+([0-9]+(\.[0-9]+)*)[[:space:]]+(.*)$ ]] || continue
	number="${BASH_REMATCH[1]}"
	[[ -n "${cited[$number]:-}" ]] && continue
	printf '%s\t%s\n' "$number" "${BASH_REMATCH[3]}"
done < <(cat "${files[@]}") |
	sort -t $'\t' -k1,1V |
	while IFS=$'\t' read -r number title; do
		printf '%s %s\n' "$number" "$title"
	done
