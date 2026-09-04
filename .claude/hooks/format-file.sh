#!/bin/sh
# PostToolUse(Edit|Write): format the touched file the way the project's formatter
# would, so nobody has to commit `style:` fixes on our branches.
#
# Prettier is not wired into Stella yet (docs/08 §8.2 #18 still says "to be wired"),
# and the tree is not Prettier-clean, so this hook is a deliberate no-op until
# node_modules/.bin/prettier exists. Once Prettier lands (its own PR: config +
# repo-wide reformat), the hook starts formatting without further changes here.
file=$(jq -r '.tool_input.file_path // empty')
[ -n "$file" ] && [ -f "$file" ] || exit 0

prettier="$CLAUDE_PROJECT_DIR/node_modules/.bin/prettier"
[ -x "$prettier" ] || exit 0

case "$file" in
  "$CLAUDE_PROJECT_DIR"/src/* | "$CLAUDE_PROJECT_DIR"/e2e/* | "$CLAUDE_PROJECT_DIR"/docs/*)
    case "$file" in
      *.ts | *.svelte | *.css | *.json | *.md)
        cd "$CLAUDE_PROJECT_DIR" || exit 0
        "$prettier" --write --log-level warn "$file" >/dev/null 2>&1
        ;;
    esac
    ;;
esac
exit 0
