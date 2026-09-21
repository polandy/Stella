#!/usr/bin/env bash
# Which e2e specs a feature touches: the specs the diff adds or changes, plus the specs that
# drive a screen the changed code reaches.
#
#   affected-specs.sh                     branch vs origin/main, plus uncommitted work
#   affected-specs.sh origin/main         branch vs another base
#   affected-specs.sh abc123^..abc123     an explicit range, e.g. a merged PR
#   affected-specs.sh --reach [...]       also the screens that render a changed shared component
#   affected-specs.sh --wide [...]        follow every import three hops, server code included
#
# How it decides. A route becomes a URL prefix; a spec is affected when it navigates there.
#   default  the specs the diff adds or changes, and the specs for the screens whose route files
#            the diff edits. That is "the screens this feature touched".
#   --reach  additionally follows a changed component or pure module two hops to the routes that
#            render it, for a change to shared UI whose *existing* behaviour moved (server code
#            is not followed: a use-case is imported by many routes its change does not touch).
#            Skip it for an additive change behind an opt-in prop; that is what the diff shows.
#   --wide   follows everything, server code included. For a cross-cutting change (visibility, a
#            shared repository). Generous: read the result knowing it is.
# It is a *candidate list*: read it, add or drop a spec by judgement. Stdout is the spec list,
# the reason for each goes to stderr.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

mode=default
case "${1:-}" in
  --reach) mode=reach; shift ;;
  --wide) mode=wide; shift ;;
esac
arg="${1:-origin/main}"
if [[ "$arg" == *..* ]]; then range="$arg"; else range="$arg...HEAD"; fi

changed="$(mktemp)"
trap 'rm -f "$changed"' EXIT
{
  git diff --name-only "$range"
  # A range asked for explicitly is history; otherwise the working tree counts as well.
  if [[ "$arg" != *..* ]]; then
    git diff --name-only HEAD
    git ls-files --others --exclude-standard
  fi
} | sort -u > "$changed"

specs=()
declare -A why
add_spec() { # spec, reason
  local spec="$1" reason="$2"
  [[ -f "$spec" ]] || return 0
  if [[ -z "${why[$spec]:-}" ]]; then specs+=("$spec"); why[$spec]="$reason"; fi
}

# 1. Specs the diff itself adds or changes.
while read -r f; do
  [[ "$f" == e2e/*.spec.ts ]] && add_spec "$f" "changed in this diff"
done < "$changed"

# 2. Source worth following: no tests, and no message catalogues — copy reaches every screen
#    through the translator, which says nothing about which screen a change is about.
mapfile -t sources < <(grep -E '^src/.*\.(ts|svelte)$' "$changed" \
  | grep -vE '\.test\.ts$|^src/lib/i18n/messages/' || true)

# Files under src/ that import `$1` — by the `$lib` alias, or relatively.
importers() {
  local file="$1" bare base
  bare="${file%.*}"
  base="$(basename "$bare")"
  {
    grep -rlE --include='*.ts' --include='*.svelte' \
      "\\\$lib/${bare#src/lib/}(\\.svelte|\\.ts)?['\"]" src 2>/dev/null || true
    grep -rlE --include='*.ts' --include='*.svelte' \
      "\\.\\.?/([^'\"]*/)?${base}(\\.svelte|\\.ts)?['\"]" src 2>/dev/null || true
  } | grep -vE '\.test\.ts$' | grep -vxF "$file" | sort -u
}

# A route file's URL prefix: groups dropped, cut at the first param (`[id]`).
route_prefix() {
  local dir prefix="" part
  dir="$(dirname "${1#src/routes/}")"
  IFS='/' read -ra parts <<< "$dir"
  for part in "${parts[@]}"; do
    [[ "$part" == "." || "$part" == \(*\) ]] && continue
    [[ "$part" == \[* ]] && break
    prefix+="/$part"
  done
  printf '%s' "$prefix"
}

budget_for() {
  case "$mode" in
    wide) echo 3 ;;
    reach) [[ "$1" == src/lib/server/* ]] && echo 0 || echo 2 ;;
    *) echo 0 ;;
  esac
}

declare -A budget
queue=()
for file in "${sources[@]}"; do
  budget["$file"]="$(budget_for "$file")"
  queue+=("$file")
done
while ((${#queue[@]})); do
  file="${queue[0]}"; queue=("${queue[@]:1}")
  remaining="${budget[$file]}"
  ((remaining > 0)) || continue
  while read -r importer; do
    [[ -n "$importer" ]] || continue
    if [[ -z "${budget[$importer]:-}" ]] || ((remaining - 1 > budget[$importer])); then
      budget["$importer"]=$((remaining - 1))
      queue+=("$importer")
    fi
  done < <(importers "$file")
done

# 3. Routes -> the specs that navigate there.
root_touched=0
for file in "${!budget[@]}"; do
  [[ "$file" == src/routes/* ]] || continue
  prefix="$(route_prefix "$file")"
  if [[ -z "$prefix" ]]; then root_touched=1; continue; fi
  while read -r spec; do
    add_spec "$spec" "drives $prefix (via ${file#src/routes/})"
  done < <(grep -lE "['\"\`]${prefix}([/?#'\"\`]|\$)" e2e/*.spec.ts 2>/dev/null || true)
done

for spec in "${specs[@]}"; do
  echo "$spec"
  echo "  $spec — ${why[$spec]}" >&2
done | sort -u
if [[ "$root_touched" == 1 ]]; then
  echo "note: the app shell or home route is reached (a root layout, or something every page shows)." >&2
  echo "      Run the whole suite (./e2e/run.sh) instead of trusting this list." >&2
fi
