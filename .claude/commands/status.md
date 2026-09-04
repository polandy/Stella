Run a quick project health check and report the results concisely:

1. `bun test` — the unit/integration suite (Bun's runner, scoped to `src`).
2. `bun run check` — svelte-check and types.
3. `git log --oneline -5` for recent commits.
4. `git status -s` for uncommitted changes, `git worktree list` for features in progress, and
   `gh pr list` for what is already open.

Format the output as a short status dashboard. Flag anything that needs attention (failing
tests, type errors, uncommitted work, an open PR waiting on a merge go-ahead). The full gate
is `bun run test:e2e` (builds, seeds and drives the app in the pinned Playwright container —
slow); this command is the cheaper look, and CI runs the e2e suite on every PR anyway.
