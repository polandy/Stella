---
name: pr-review
description: Risk-tiered quality review of a pull request — docs sync, the project standard and access-layer invariants, test coverage against the diff, the UI delivery loop, CI (fix failures) and branch freshness. Posts the verdict as a PR comment. Use when asked to review a PR by number or branch.
argument-hint: <PR number or branch>
---

# PR Quality Review

You are a meticulous code reviewer for **Stella** (repo `ross`). Review the pull request given in `$ARGUMENTS` (a PR number like `9`, or a branch name; if omitted, use the PR for the current branch via `gh pr view`).

Work through the sections your tier names, in order. Collect findings as you go and fix what the instructions say to fix. Finish with a structured verdict.

## Depth: pick the tier first

A review costs as much as what it reads, so its depth follows the PR's risk, not a fixed recipe.
Decide the tier from `gh pr diff <PR> --name-only` and say which one you used in the verdict.

- **None** — every changed file is under `docs/` or `.claude/`, or is a `*.md`: the owner reads
  it, no review is owed (`docs/08` §8.10). Unless the review was asked for explicitly, say so
  and stop.
- **Full** — any of: a schema or `drizzle/` change, anything under `src/lib/server/access/`, a
  visibility or authz rule, the offline command path (`src/lib/commands/`,
  `src/lib/server/domain/commands/`), a new dependency, or a new screen. §0, then
  `references/full-tier.md` (§1–§5 in depth, building the §4.0 table below on the way), then
  §6–§9.
- **Light** — everything else (copy, styling, a contained component or pure-module change).
  §0 without a worktree (read `gh pr diff`; open a whole file only where the diff is not enough),
  the §4.0 table, the *Light checks*, §6–§9. Do not open the reference.

In both tiers:

- **Trust a green CI for `bun run check` and `bun run test`** — they ran on the PR's head. Run them
  locally only when you push a fix, or when CI is red or has not run on the current head.
- **Read the diff before any file**, and open the doc *section* the PR touches (`grep -n` for its
  heading, then read that range), never a whole `docs/` file.
- **Red CI**: read `scripts/ci-failures.sh <PR>` first — failure annotations only. Reach for
  `gh run view --log-failed` only when that is not enough.
- **Never run the whole `bun run test:e2e` locally** — CI runs it on every push. A spec the PR
  adds or changes, or one a fix of yours touches, runs alone locally first
  (`./e2e/run.sh e2e/<spec>.spec.ts`) and is pushed once green. Render with a throwaway script
  only when a claim is about pixels.

## 0. Gather context

- `gh pr view <PR> --json title,body,baseRefName,headRefName,mergeStateStatus,statusCheckRollup` for metadata and CI status.
- `gh pr diff <PR>`. Where the tier needs a checkout, use the author's clean worktree, else **its own worktree** (`git worktree add ../Stella-review-<PR> <branch>`, never under `.claude/`); never switch branches under someone else's uncommitted work.
- Read the PR description first — the review checks the implementation *against its stated intent*.
- `CLAUDE.md` and `docs/08` are binding; these checks distill them, and the *files* win where they disagree.

## 4.0 The review scope is the diff, not the PR description — build the table first

One row per changed file under `src/`, naming the test that drives *that file's changed lines* — test file plus case name. A row you cannot fill is a finding, whatever the PR title is about. The table itself goes into the §8 verdict, not a claim that it was built: a PR routinely carries two changes, and the second ships without tests.

- **A write half and a read half are two behaviours** (capture/stream, export/import): each needs its own driving case, and the read half matters more for the household's only copy.
- **One rule written into N places needs N cases** — check every site the diff touched.
- **A shared test helper is never the assertion.** One that tolerates both states (`if (await x.isVisible()) return`) stays green when the behaviour is removed.

## Light checks

One line per check; `references/full-tier.md` §1–§5 holds each in depth for the Full tier.

- **Docs move with the change** (§1): a behaviour change updates its section file (`docs/02`,
  `03`, `04`, `05` via their indexes; `07` + `install.md` for operators; `using-stella.md` for
  users) in the same PR; no doc still describes removed behaviour; a schema change ships its
  `drizzle/` migration; exported symbols keep an accurate doc comment.
- **Decision log** (§2) only when the diff weighs a real tradeoff or contradicts an entry.
- **Project standard** (§3): framework-agnostic `domain/`/`access/`; `deps` injected, no ambient
  clock or ids; access layer is the only authz path (a bypass is a blocker); no row shape or
  `0`/`1` leaking past the adapter; semantic tokens
  only; strict TS, typed errors, no swallowed error; no magic literal, dead code or narrating
  comment; a new dependency exact-pinned with a reason.
- **Tests** (§4.1): spec-like names, the right layer (real in-memory SQLite for adapters),
  failure paths, a positive control for every "not visible", no timing waits, one day per
  `journal_entry` seed, rules in pure functions rather than inline in a route.
- **UI** (§5): its `docs/design/` file updated; no "UI in a follow-up"; the delivery loop — an
  e2e before the owner's OK is a finding, none before it is "e2e pending sign-off"; theming in
  light and dark; a11y warning-free. Render, measure and mutation-prove only when the PR's
  headline is visual.

## 6. CI status — fix failures

- `gh pr checks <PR>`: **all green** — the `verify` job (`bun run check`, `bun run test`) and `e2e`.
- Red: fix it on the PR branch, re-run `bun run check` and `bun run test` locally, commit, push, wait for the re-run; repeat until green.
- Commit types follow **user-facing impact** (release-please, §8.9): a user-visible change committed as `chore:` vanishes from the release notes — a finding.

## 7. Branch freshness — update if behind

- `git fetch origin && git rev-list --count <head>..origin/<base>`.
- If behind, **merge** `origin/<base>` in and push — never rebase (the PR is squash-merged; merging avoids a force-push and keeps comments anchored).
- **Then re-run your tier's checks and §6**: the merge may bring a doc move, schema change or decision the PR now contradicts.
- Git flags neither of these: **two migrations from the same schema baseline** (re-read the merged `db/schema/`, check `drizzle/` applies in order) and a **duplicate e2e case or fixture name**.

## 8. Verdict

1. **Summary** — what the PR does, one paragraph, and the tier used.
2. **The §4.0 table** — posted as a table; an unfilled row is also a finding.
3. **Findings** — per check: ✅ ok / ⚠️ issue (`file:line`) / 🔧 fixed by me (commit).
4. **Blockers** — what must change before merge that you could not fix (pending manual verification, design questions).
5. **Merge readiness** — ready / not ready. Do **not** merge: the maintainer squash-merges on their own command, every time.

## 9. Post the verdict as a PR comment

`gh pr comment <PR> --body '…'` — in **English**, headed `## 🤖 PR quality review`, posted **after** your last push. Replace a prior comment from this skill (`gh pr comment --edit-last`) rather than stacking. Then remove the review worktree from §0.
