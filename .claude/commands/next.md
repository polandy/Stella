Identify the next task to work on:

1. Check what is already in flight first: `gh pr list` and `git worktree list`. The open-PR limit
   is the one in `docs/dev/08` §8.10; an open PR waiting on a merge go-ahead comes before new work.
2. The sources of open work, in order:
   - whatever the owner has just asked for
   - the open items of the current milestone in `docs/dev/06-roadmap.md` (a milestone is worked top
     to bottom; "Explicitly later / maybe-never" is not a candidate list)
   - features `docs/dev/02-features.md` specifies but the app does not have yet
3. Read ONLY the doc sections that item references (`docs/dev/02` for behaviour, `docs/dev/03` for the
   model, `docs/dev/05` for UI), not the full suite.
4. Propose a concrete implementation plan with small, committable steps.

Keep the plan short — max 5 steps. Each step is one Conventional Commit with `bun test` and
`bun run check` green. The final step updates the matching `docs/` file (and `using-stella.md`
when the change is user-visible) and ticks the roadmap item. The Playwright e2e comes **after**
the owner has verified the change in the app (`docs/dev/08` §8.4.1), never before.
