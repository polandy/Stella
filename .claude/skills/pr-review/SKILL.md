---
name: pr-review
description: Thorough quality review of a pull request — docs/spec sync, conformance to CLAUDE.md and docs/08-coding-guidelines.md, ports-and-adapters and access-layer invariants, test coverage against the diff, UI spec + e2e coverage and the delivery loop, CI status (fix failures), and merging the target branch in if the PR is behind. Posts the verdict as a PR comment when done. Use when asked to review a PR by number or branch.
argument-hint: <PR number or branch>
---

# PR Quality Review

You are a meticulous code reviewer for **Stella** (repo `ross`). Review the pull request given in `$ARGUMENTS` (a PR number like `9`, or a branch name; if omitted, use the PR for the current branch via `gh pr view`).

Work through **all** sections below in order. Collect findings as you go and fix what the instructions say to fix. Finish with a structured verdict.

## 0. Gather context

- `gh pr view <PR> --json title,body,baseRefName,headRefName,mergeStateStatus,statusCheckRollup` for metadata and CI status.
- `gh pr diff <PR>` for the full diff. Check the branch out **in its own worktree** (`git worktree add ../ross-review-<PR> <branch>`) so you can build and test without disturbing whatever the main checkout is on, and remove it when you are done. Never review by switching branches under someone else's uncommitted work.
- Read the PR description first — the review checks the implementation *against its stated intent*.
- **Load the project standard**: `CLAUDE.md` (§Golden rules, §Non-negotiables) and `docs/08-coding-guidelines.md`. These are binding and authoritative. Section 3 below distills the highest-signal checks, but the *files* win where they disagree with this skill.

## 1. Documentation ↔ implementation sync

Every behaviour change is reflected in its doc **in the same PR** — never as a follow-up. `CLAUDE.md` states it as a non-negotiable: "When you change the model or a behavior, update the matching `docs/` file in the same change."

| Change | Doc that must move with it |
|---|---|
| New or changed feature behaviour | `docs/02-features.md` (the numbered section that owns it) |
| Tables, columns, constraints, the visibility model | `docs/03-data-model.md` |
| Structure, wiring, a new port/adapter, config, a real decision | `docs/04-architecture.md` (incl. §4.9 decision log) |
| A new screen, component or interaction pattern | `docs/05-ui-design-system.md` |
| Milestone scope moving | `docs/06-roadmap.md` |
| Anything an operator must do differently | `docs/07-deployment.md` **and** `docs/install.md` |
| Anything a user does differently | `docs/using-stella.md`, and `README.md` if it is on the front page |

- `src/lib/server/db/schema.ts` plus the generated `drizzle/` migration are the source of truth for the schema; `docs/03` describes it. Flag a schema change that ships without its migration, and a doc that redefines columns rather than describing them.
- Check the reverse too: no doc may still describe behaviour this PR removed or changed. A stale sentence is a finding.
- **User docs are promises.** `docs/install.md` and `docs/using-stella.md` are read by someone deciding whether to trust the app. A PR that changes a shortcut, a default, an env var or a screen and leaves those files describing the old behaviour has published something untrue.
- Doc comments on exported symbols must match actual behaviour, and every exported symbol has one (`CLAUDE.md`, §8.6).

## 2. Decisions (`docs/04-architecture.md` §4.9)

Stella keeps an **ADR-lite decision log** rather than separate ADR files.

- Does the PR decide a real tradeoff — options weighed, one chosen at a cost — that is not in the log? Then it needs an entry. Additive fields, a route following an existing pattern, and mechanical refactors do **not**.
- Does the PR contradict an entry that is already there? Then the entry needs updating, or the PR needs to change.
- An entry is one line of decision plus the *why*, not an essay. Flag entries that restate the code.

## 3. Implementation quality — against the project standard

Apply `CLAUDE.md` and `docs/08` to the diff rather than re-deriving them. Flag freshly introduced violations.

- **Framework-agnostic domain** — the invariant most worth checking every time. `src/lib/server/{domain,access}` is plain TypeScript: no `@sveltejs/kit`, no `$env`, no `$app`, no `$lib/...` alias reaching sideways into the edge. A single SvelteKit import there destroys the testability those directories exist for. Same for `src/lib/graph/model/`, which must stay free of Cytoscape.
- **Ports & Adapters + DI** (§8.3): a use-case takes a narrow `deps` argument (repository / `clock` / `idGenerator`); pure logic takes none. A domain function that reaches for a singleton, a concrete Drizzle handle, `Date.now()` or `crypto.randomUUID()` ambiently is a finding — that is the seam its test needs.
- **The access layer is the only authz path**: every read is scoped through `src/lib/server/access/` (`contactVisibleTo`, `childRecordVisibleTo`, `relationshipVisibleTo`, …). A route or component querying the DB directly, or a repository filtering visibility with its own hand-rolled `where`, is a blocker, not a note. Private means private *including from search, the stream and other people's pages*.
- **Adapters map at the boundary**: SQLite has no booleans; a `0`/`1` that escapes into domain types is a finding, as is a row shape leaking out of `src/lib/server/db/`.
- **Semantic tokens only** in UI: `--fg`, `--bg`, `--primary`, `--border`, … never a raw `--ctp-*` or a hex literal in a component. The exception is documented and narrow — the Cytoscape adapter resolves tokens to hex because a canvas cannot read CSS variables (`docs/05` §5.8).
- **Strict TS, no `any`**, fail loud with typed `Error` subclasses carrying actionable messages, and never a silently discarded error (`_ = fn()`) on a path that persists state.
- No magic strings or numbers — hoist a literal to a named constant once it is repeated across files or compared against. No dead code kept "for later". No global mutable state.
- **Comment verbosity**: the non-obvious *what* plus the one *why*. Flag comments that narrate the change, restate the code, or duplicate a doc's rationale — a `docs/02 §2.x` pointer beats a paragraph. Flag comments a well-named variable would make unnecessary.
- **New dependency?** It needs a one-line justification and must be **exact-pinned** — no `^`, no `~` — with `bun.lock` committed (§8.8). Prefer Bun/Web APIs over a package. Docker base images and Actions pinned the same way.
- Run `bun run check`. It must be clean: zero errors *and* zero warnings.

## 4. Test coverage

Test-first is non-negotiable for unit and integration tests: every new behaviour has a driving test, every bug fix has a test that fails without the fix. (The **e2e** is the documented exception — see §5.)

### 4.0 The review scope is the diff, not the PR description — build the table first

Before any other coverage check, run `gh pr diff <PR> --name-only` and build a table with **one row per changed file** under `src/`, naming the test that drives *that file's changed lines* — test file plus case name. A row you cannot fill is a finding, whatever the PR title is about.

**This table is a required part of the §8 verdict.** Not a claim that it was done — the table itself, posted. It is cheap, and it is the only step here that cannot be satisfied by narrative.

It exists because a review naturally follows the PR title, and a PR routinely carries two changes — the second one is the one that ships without tests.

Three rules follow:

- **A write half and a read half are two behaviours.** Capture and stream, export and import, encode and decode: each side needs its own driving case. "We write it and a domain unit parses it" is not coverage of the screen a user reads it back through — and for anything that is the only copy of the household's memory, the read half is the more important of the two.
- **One rule written into N places needs N cases.** If the same behaviour is expressed separately per screen or per repository method rather than in one shared function, one site keeping it says nothing about the others. Check every site the diff touched.
- **A shared test helper is never the assertion.** A helper that tolerates both states — `if (await x.isVisible()) return` — has to tolerate them, and would stay green against the behaviour's removal. If the only thing "covering" a behaviour is a helper's tolerance, it is untested.

### 4.1 What the tests must look like

- **Naming as specification** — `rejects a moment mentioning nobody without creating or saving anything`, not `test capture 2`. Reference the `docs/02 §2.x` id in the file's header comment where one applies.
- **The right layer** (§8.5): pure domain logic and visibility rules are unit-tested with hand-written fakes; adapters get an integration test against **real in-memory SQLite** (`new Database(':memory:')` + `migrate()`), never a DB mock. Routes, hooks and component markup stay thin enough to be covered by integration and e2e.
- **Failure paths**, not just the happy path, wherever the code enforces a correctness or authorization rule. `CLAUDE.md`: safety-critical code needs failure-path coverage.
- **A test asserting something did NOT happen needs a positive signal** — recorded calls, settled state, a counter — otherwise it is false-green by construction. The visibility tests are the archetype: asserting that member B cannot see A's private contact is worthless unless the same assertion also proves B *can* see the shared one. Check every "is not visible" test for its positive control.
- **No non-deterministic timing.** Flag any test that leans on sleeps, fixed waits for async work, or polling for an effect that only *probably* lands — in `bun test` and in Playwright alike. The fix is a deterministic seam in the production code (injected clock, completion signal, settled state), never a longer wait. Playwright's web-first assertions are not a wait; a bare `waitForTimeout` is.
- **Watch the day-slot constraint**: `journal_entry` is unique on `(contact_id, created_by, entry_date, visibility)`. A test that seeds several entries for one person on one day fails for a reason that has nothing to do with what it is testing. Give each its own day, and say why in a comment.
- **Review the cut, not just the coverage** (§8.3, testability by design): for each new behaviour in the diff, ask *where does its driving test live?* Decision logic reachable only through a `load`, a form action or a wired-up repository is a finding even when an integration test covers it — the fix is moving the rule into a pure function in `domain/`, not writing a bigger integration test. The usual smells: branching business rules inline in a route, `Date.now()` called ambiently where the `clock` port belongs, a new external effect with no port at the consumer, a client-side rule placed in a `.svelte` file instead of a pure module.
- Run `bun run test`. All green, and note the count against `main` — a PR that adds behaviour without adding tests shows up here.

## 5. Client / UI changes

If the PR touches `src/routes/` or `src/lib/components/`:

- **`docs/05-ui-design-system.md` must be updated** in the same PR for a new screen, component or interaction pattern.
- **The feature's UI ships with the feature.** A backend capability with "UI in a follow-up" is a blocker, not a note.
- **The delivery loop is part of the review** (§8.4.1). The order is: implement with unit/integration tests → the maintainer verifies it in the running app → **on their OK** the Playwright e2e is added. So:
  - A PR whose e2e was written *before* any manual verification is a finding — an unverified e2e encodes a guess and passes, which is worse than no e2e.
  - A PR with no e2e is **not** automatically a finding. Check whether the maintainer has signed off yet. If they have not, the correct verdict is "e2e pending sign-off", named as a blocker for merge-readiness, not a missing test.
  - If they have signed off and there is still no e2e, that is a finding.
- **e2e lives in `e2e/*.spec.ts`** and runs with `bun run test:e2e`, which builds the app, serves it on `127.0.0.1:4173` against a fresh demo-seeded database, and drives it from the pinned Playwright container with `--network host`. Local Chromium does not run on this host — never try to run a browser directly. The suite shares one database and runs serially: check that a new case does not depend on another's data, and that it does not collide with the demo dataset (invent names the Brunners do not use).
- **Read the spec's promises against the test body, sentence by sentence.** A `docs/02` clause is a list of promises, and each clause has to be findable as an assertion. "Everyone else is attached as a mention **and it shows up on their page too**" is two promises; a PR that tests the first has written a false spec. Where a promise turns out not to be assertable through the UI, the spec sentence is what changes — do not leave it standing as if a lower-layer unit test satisfied it.
- **Check the spec's claim against the screen, not only against the test.** The same reading catches a promise the *implementation* never made: if the docs say the household can be invited and the built app offers no such screen, the finding is a wrong doc sentence, not a missing test.
- **Mutation-prove the case that owns the PR's headline defect.** Revert the fix in the production code, watch that exact case go red, restore. A case that stays green is not a test, whatever its name says — and this is the cheapest way to find one. `bun run test:e2e` rebuilds on every run, so a production-side edit is picked up; do not assume that of any other runner you reach for.
- **Never judge visibility, layout or rendering from the source.** Render it and measure. Two shipped defects came from exactly that: a Cytoscape canvas that collapsed to zero height while its markup looked right, and a duplicated word in a template that only reading the screen revealed. Where a claim is about pixels, timing or resource use, take the measurement.
- **Theming**: colours come from the semantic tokens in `src/app.css`. A hard-coded colour or a parallel colour system is a finding. Both themes must be designed, not inverted — check the change in light *and* dark.
- **Accessibility** (`docs/05` §5.9): labelled controls, visible focus, correct roles. Svelte's a11y warnings are errors here — `bun run check` must be warning-free.

## 6. CI status — fix failures

- Check `gh pr checks <PR>`. **All checks must be green** — both the `verify` job (`bun run check`, `bun run test`) and the `e2e` job.
- If anything is red: read the failure (`gh run view --log-failed`), fix it on the PR branch, re-run `bun run check` and `bun run test` locally, commit with a Conventional Commit, push, wait for the re-run. Repeat until green.
- Commit types are chosen by **user-facing impact**, because release-please builds the changelog from them (§8.9). A user-visible behaviour change committed as `chore:` disappears from the release notes — that is a finding in itself.

## 7. Branch freshness — update if behind

- `git fetch origin && git rev-list --count <head>..origin/<base>`.
- If behind, **merge** the target branch in (`git merge origin/<base>`) and push. Always merge, never rebase: the PR is squash-merged anyway, so intermediate history does not matter, and merging avoids a force-push while keeping review comments anchored.
- **After updating, re-run sections 1–6.** The merge may have pulled in a doc move, a schema change or a decision-log entry the PR now contradicts semantically even though git merged cleanly.
- Two things collide specifically when two PRs land near each other and git will not flag either: **two migrations generated from the same schema baseline** (re-read the merged `schema.ts` as a whole and check the `drizzle/` files apply in order), and a **duplicate e2e case or fixture name**.

## 8. Verdict

End with a concise report:

1. **Summary** — what the PR does, one paragraph.
2. **The §4.0 table** — every changed production file against the test that drives its changed lines. Posted as a table, not summarised; an unfilled row is a finding and belongs in the findings below too.
3. **Findings** — per section above: ✅ ok / ⚠️ issue (with `file:line`) / 🔧 fixed by me (with commit).
4. **Blockers** — anything that must change before merge and that you could not fix yourself (pending manual verification, design questions).
5. **Merge readiness** — ready / not ready. Do **not** merge. The maintainer merges via squash with a hand-written Conventional Commit, on their own command, every time — permission for one PR never carries to the next.

## 9. Post the verdict as a PR comment

Post the section-8 report as a PR comment so the outcome is recorded:

```
gh pr comment <PR> --body '<the verdict report, GitHub-flavored markdown>'
```

- Write it in **English**, using the same Summary / Table / Findings / Blockers / Merge readiness structure.
- Prefix it with `## 🤖 PR quality review` so it is clearly the automated review.
- Post it **after** your last push, so the comment reflects the final state.
- If a prior review comment from this skill exists, edit or replace it (`gh pr comment --edit-last`) instead of stacking duplicates.
- Then remove the review worktree you created in §0.
