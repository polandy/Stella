#!/usr/bin/env bash
# Report numbered feature headings not cited by any e2e spec's first block comment.
# Append <!-- coverage: unit --> to a heading intentionally covered by unit tests only.
# Findings do not affect the exit status; only usage or I/O errors fail the report.
set -euo pipefail

if (($# != 0)); then
  echo 'Usage: scripts/spec-coverage.sh' >&2
  exit 2
fi

cd "$(dirname "$0")/.."
export LC_ALL=C
shopt -s nullglob
for dir in e2e docs/dev/features; do
  if [[ ! -d "$dir" || ! -r "$dir" || ! -x "$dir" ]]; then
    echo "Cannot read directory: $dir" >&2
    exit 1
  fi
done

awk '
  function cite(text, ref, parts, prefix, n) {
    while (match(text, /§2(\.[0-9]+)+(–[0-9]+)?/)) {
      ref = substr(text, RSTART, RLENGTH)
      text = substr(text, RSTART + RLENGTH)
      sub(/^§/, "", ref)
      split(ref, parts, /–/)
      cited[parts[1]] = 1
      if (parts[2] != "") {
        match(parts[1], /[0-9]+$/)
        prefix = substr(parts[1], 1, RSTART - 1)
        for (n = substr(parts[1], RSTART) + 1; n <= parts[2] + 0; n++) {
          cited[prefix n] = 1
        }
      }
    }
  }

  FILENAME ~ /^e2e\// {
    if (FNR == 1) header = "before"
    if (header == "done") next
    if (header == "before") {
      start = index($0, "/*")
      if (!start) next
      $0 = substr($0, start + 2)
      header = "inside"
    }
    close_at = index($0, "*/")
    if (close_at) {
      $0 = substr($0, 1, close_at - 1)
      header = "done"
    }
    cite($0)
    next
  }

  # Specs are read first; citations cover only the exact section numbers they name.
  /^#{2,6}[[:blank:]]+2(\.[0-9]+)+[[:blank:]]+[^[:space:]]/ &&
    !/[[:blank:]]+<!-- coverage: unit -->[[:space:]]*$/ && !($2 in cited) {
    sub(/^#+[[:blank:]]+/, "")
    sub(/[[:space:]]+$/, "")
    print
  }
' e2e/*.spec.ts docs/dev/features/*.md </dev/null | sort -k1,1V
