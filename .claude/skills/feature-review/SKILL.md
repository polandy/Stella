---
name: feature-review
description: Fast, feature-scoped review while a feature is still being built — checks only the diff of the feature in hand (docs sync, project standards, test coverage per changed file), finds the screens it touches, and runs just the new and affected Playwright e2e specs locally. Follows the delivery loop (no new e2e before the owner's OK). Use during development, before the full /pr-review; does not wait for CI, merge, or run the whole suite.
argument-hint: [--reach | --wide] [base ref or PR number]
---

# Feature Review

A short-cycle review for **one feature in progress** in Stella (repo `ross`): the same standards as
`pr-review`, applied to the feature's diff only, plus a *local* e2e run of only the specs for the
screens it touched. Use it to get quick feedback while developing; `pr-review` stays the full gate
before merge. Arguments: `$ARGUMENTS` — an optional `--reach` / `--wide` (see §3) and an optional
base ref (default `origin/main`).

**What it deliberately skips** (that is where the time goes in `pr-review`): waiting for CI,
merging the base branch in, the decision-log deep check, the whole e2e suite. It never merges.

## 0. Scope and phase

- `git diff --stat origin/main...HEAD` plus uncommitted work (`git status --short`), and
  `git log --oneline origin/main..HEAD`. If a PR exists (`gh pr view`), read its description: the
  review checks the implementation against its stated intent. Nothing else in the repo is in scope.
- Decide the **phase** — it decides what may happen to the e2e (`docs/08` §8.4.1):
  - **pre-sign-off**: the owner has not yet confirmed the behaviour in the running app. Run the
    *existing* affected specs as a regression check. **Do not write the new e2e.**
  - **post-sign-off**: the owner has said the behaviour is right ("OK", "weiter mit dem e2e", …).
    Write or extend the spec now.
  If it is unclear which, ask once. An unverified e2e encodes a guess and passes.

## 1. Standards, against the diff only

`CLAUDE.md` (Golden rules, Non-negotiables) and `docs/08-coding-guidelines.md` are the standard —
apply them to the changed lines rather than re-deriving them. The highest-signal checks:

- **Docs move with behaviour**: `docs/02` (owning section), `docs/03` (model), `docs/05` (a new
  screen / component / interaction pattern — select modes, bars, pickers), `docs/using-stella.md`
  (anything a user does differently), `docs/07` + `docs/install.md` (operators). A stale sentence
  about behaviour this feature changed is a finding.
- **English and German both** for every new user-visible string (`useI18n()` in components,
  `say(locals, …)` in routes); no raw strings, no emoji, icons from `Icon.svelte`.
- **Layering**: domain/access stay framework-free and take `deps`; every read/write goes through
  `src/lib/server/access/` (a rule that filters by visibility belongs in the use-case, where a unit
  test reaches it — not in a route); decision logic lives in a pure module, not in a `.svelte` file.
- **UI**: semantic tokens only, both themes, labelled controls, visible focus.
- Run `bun run check` (0 errors **and** 0 warnings) and `bun run test`.

**The table (required in the report).** For every changed file under `src/`, name the test that
drives *its changed lines* (file + case name). A row you cannot fill is a finding. A write half and
a read half are two behaviours; a negative assertion needs a positive control; a helper that
tolerates both states is not an assertion.

## 2. Test-first for anything you fix

If the review finds a behaviour gap, fix it test-first (failing test seen red → minimal change →
green), commit with a Conventional Commit chosen by user-facing impact, and note it as 🔧 in the
report. Push only when a PR already exists.

## 3. Which specs

```
.claude/skills/feature-review/affected-specs.sh [--reach|--wide] [base]
```

Stdout is the spec list, stderr the reason for each. It is a **candidate list — read it**:

| Mode | Adds | Use it when |
|---|---|---|
| *(default)* | the specs the diff adds/changes + the specs for the screens whose route files the diff edits | the feature lives on the screens it edited (the usual case; an additive change behind an opt-in prop of a shared component belongs here too) |
| `--reach` | + the screens that render a changed shared component / pure module | a shared component's **existing** behaviour moved |
| `--wide` | + everything reached, server code included | cross-cutting change (visibility, a shared repository) — generous, prune it |

If it says the app shell or home route is reached (a root layout changed), run the whole suite
(`./e2e/run.sh`) instead. Add a spec the script cannot know about (a graph spec for a change that
feeds the graph); drop one that plainly is not about the feature.

## 4. Run the e2e locally

Preflight — each of these has cost an hour before:

- **Work in a worktree outside any hidden directory** (`git worktree add ../Stella-<slug> …`).
  Under `.claude/worktrees/…` Vite's bundler (rolldown) fails with *"Could not resolve
  'node:module' … Tsconfig not found"* for `dev`, `build` and `test:e2e` alike.
- `bun install --frozen-lockfile` in that worktree; `bun` must be on `PATH`.
- Use a **free port**: `E2E_PORT=4183` (the script refuses a port already serving something, and
  stops instead of testing another branch's build). The first run **pulls the pinned Playwright
  image** (several GB) — run it in the background with a long timeout and be patient once.

```
E2E_PORT=4183 ./e2e/run.sh e2e/<spec>.spec.ts e2e/<other>.spec.ts
```

It builds, starts a server on a fresh demo-seeded database, and drives it from the container. The
database is **shared by every spec in the run**: a case that needs people or circles invents its
own names (a surname no other case uses) — two cases both creating "Aurel Hofstetter" leave the
second unable to say which one it means.

- **Pre-sign-off**: run the existing affected specs only; report them as regression.
- **Post-sign-off**: write/extend `e2e/<feature>.spec.ts` (assert rendered content, web-first
  assertions, no sleeps or fixed waits, a positive signal for every "did not happen"). Then
  **mutation-prove** it: commit, break the production code the case owns, run just that case
  (`--grep`) and watch it go red for the right reason, restore with `git checkout -- <files>`.
  Do this for each case, batching mutations that cannot mask each other. Finally run the new spec
  together with the affected ones, green.

Read a failure from the top: a *strict mode violation* means the data is not unique; an element
that "intercepts pointer events" is a real overlap in the UI — treat it as a finding, not a test
flake (an open suggestion list covering a switch below it was one).

## 5. Hand-off for manual verification (pre-sign-off)

When the owner should look at the screens, give them a running instance with data already in it —
never make them create a household.

- Demo data comes from the seed: `SEED_DEMO=true` creates the Brunner household (plus the Widmer and
  Steiner families and a dozen circles with roles) and a **"Sign in as demo user"** button. Use a
  database of its own so their real data is untouched: `DATABASE_PATH=./data/demo.db`.
- From a tablet or another machine the **dev server is unreliable** (HMR and dependency
  re-optimisation reload the page mid-click, Safari included). Serve a **production build**:

  ```
  bun run build
  HOST=0.0.0.0 PORT=4173 ORIGIN=http://<lan-ip>:4173 STELLA_URL=http://<lan-ip>:4173 \
    DATABASE_PATH=./data/demo.db SEED_DEMO=true bun ./build/index.js
  ```

  `ORIGIN` must be the address the browser uses, or the login POST is refused as cross-site. Run
  it in the background and tell them the URL. Any code change needs a rebuild and a restart.
- Tell them **which demo data exercises the feature**, as a short table of *scenario → circle /
  person → what to do*. Reset = stop the server, delete `data/demo.db*`, start again.
- Stop the server when they are done.

## 6. Report

Print it; do not post it unless asked (`--comment`, or "post it" → `gh pr comment`, prefixed
`## 🤖 Feature review`, English).

1. **Scope** — what the feature does, one paragraph, and the phase.
2. **The §1 table** — changed `src/` file → driving test.
3. **Findings** — ✅ ok / ⚠️ issue (`file:line`) / 🔧 fixed by me (commit).
4. **E2E** — the specs run and why (from the script), pass/fail counts, and for post-sign-off the
   mutation results. Say plainly what was **not** run.
5. **Blockers** — pending sign-off, an unfilled table row, a red spec.
6. **Next** — this review is not the merge gate: run `/pr-review <PR>` before merge; the owner
   merges, on their own command.
