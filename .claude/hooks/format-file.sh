#!/bin/sh
# PostToolUse(Edit|Write): format the touched file the way the project's formatter
# would, so nobody has to commit `style:` fixes on our branches.
#
# Prettier is a devDependency, so a missing binary means node_modules predates it —
# a silent skip there let unformatted files reach CI and fail `bun run lint`. The
# hook says so once per session (exit 2 shows stderr to the agent) and then stays
# quiet, so a stale checkout costs one line, not one per edit.
input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
[ -n "$file" ] && [ -f "$file" ] || exit 0

case "$file" in
  "$CLAUDE_PROJECT_DIR"/src/* | "$CLAUDE_PROJECT_DIR"/e2e/* | "$CLAUDE_PROJECT_DIR"/docs/*) ;;
  *) exit 0 ;;
esac
case "$file" in
  *.ts | *.svelte | *.css | *.json | *.md) ;;
  *) exit 0 ;;
esac

prettier="$CLAUDE_PROJECT_DIR/node_modules/.bin/prettier"
if [ ! -x "$prettier" ]; then
  session=$(printf '%s' "$input" | jq -r '.session_id // "unknown"')
  marker="${TMPDIR:-/tmp}/stella-prettier-missing-$session"
  [ -e "$marker" ] && exit 0
  : >"$marker"
  echo "prettier not installed — run \`bun install --frozen-lockfile\`" >&2
  exit 2
fi

cd "$CLAUDE_PROJECT_DIR" || exit 0
"$prettier" --write --log-level warn "$file" >/dev/null 2>&1
exit 0
