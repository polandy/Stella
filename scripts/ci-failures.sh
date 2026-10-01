#!/usr/bin/env bash
# Prints only the failures of a PR's latest CI run: each failed job's annotations (file, line,
# message) instead of `gh run view --log-failed`, whose full log is mostly passing output.
# Usage: scripts/ci-failures.sh <pr-number-or-branch>
set -euo pipefail

target="${1:?usage: scripts/ci-failures.sh <pr-number-or-branch>}"
repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
head_sha="$(gh pr view "$target" --json headRefOid --jq .headRefOid)"

failed_runs="$(gh api "repos/$repo/commits/$head_sha/check-runs" \
	--jq '.check_runs[] | select(.conclusion == "failure") | "\(.id)\t\(.name)"')"

if [[ -z "$failed_runs" ]]; then
	echo "No failed checks on $head_sha."
	exit 0
fi

while IFS=$'\t' read -r run_id run_name; do
	echo "== $run_name"
	annotations="$(gh api "repos/$repo/check-runs/$run_id/annotations" \
		--jq '.[] | select(.annotation_level == "failure" and .path != ".github") | "\(.path):\(.start_line)  \(.title // "")\n    \(.message | split("\n") | .[0:6] | join("\n    "))"')"
	if [[ -n "$annotations" ]]; then
		echo "$annotations"
	else
		# Only the runner's generic "exit code 1" annotation (a step that failed before any
		# test ran: install, build, type check). The log tail is then the shortest useful view.
		gh run view --job "$run_id" --log-failed | cut -f3- | sed -E 's/^[0-9T:.-]+Z //' | tail -n 40
	fi
done <<<"$failed_runs"
