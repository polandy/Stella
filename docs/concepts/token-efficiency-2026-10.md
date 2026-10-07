# Token-efficiency review — October 2026

**Scope:** how much model context the agent workflow on this repository consumes, and why.
Measured on 2026-10-07 from the 77 main-session and 133 subagent transcripts on the owner's
machine (`~/.claude/projects/-home-andy-dev-Stella/`), the last 40 CI runs, the sizes of
`docs/`, `CLAUDE.md`, `.claude/` and a run of `bun run test` / `bun run check`.
**Purpose:** a backlog to be worked off **one row per session** (§3), each row an Opus session
that reads only its finding and the files it names. Nothing here changes what the app does.

Each finding has an id (`TE-nn`), an effort (S = under an hour, M = one focused PR) and the
evidence behind it. §3 orders them so each step makes the next cheaper.

---

## 1. Where the tokens go

| Measure | Main sessions | Subagents |
|---|---|---|
| Turns | 15 804 | 13 719 |
| Cache-read input tokens | 2.40 bn | 1.87 bn |
| Cache-write input tokens | 43 m | 48 m |
| Output tokens | 12.6 m | 0.4 m |
| Average context per turn | 155k | 140k |
| Context on the first turn (median) | 46k | 34k |

The shape of the cost, in order of weight:

1. **Context length × turn count.** 66 % of all cache-read tokens were spent while the
   context was above 150k, 48 % above 200k. 17 sessions ran past 300 turns, one to 973; one
   subagent reached 599k of context over 658 turns. Every turn re-reads the whole context.
2. **Model.** 83 % of turns ran on Opus: the global default is `model: opus` and the
   implementer agent pins Opus; only the reviewer runs on Sonnet.
3. **Fixed context per turn.** 46k tokens before the first word of work: system prompt, tool
   schemas, MCP connectors (Google Drive, Claude Docs, Gmail, Calendar), `CLAUDE.md` (≈ 2.4k),
   `MEMORY.md` (≈ 1k), skill descriptions. Multiplied by every turn of every session.
4. **Reviews.** 47 `/pr-review` invocations plus 37 `stella-reviewer` runs; the skill file
   alone is ≈ 5k tokens per load.
5. **Whole-file reads.** The *open only the section* contract fails on the largest docs
   because they have no headings to grep for (TE-04).
6. **Output.** 70 % of output tokens are Bash tool inputs, among them 2 590 whole-file
   rewrites through Python heredocs and 388 `Write` calls averaging 6.3 KB.

Not worth touching: `bun run test` prints 63 lines, `bun run check` three; CI's
`scripts/ci-failures.sh` already keeps red runs short.

---

## 2. Findings

### TE-01 · No budget bounds a session or a subagent
**Effort: S**

Evidence: §1 item 1. The agent definitions say *report back short* but nothing about when to
stop; a subagent kept going to 599k of context. Orchestrator sessions carry whole task
histories across several PRs.

Why it hurts: past ~150k every turn costs more than the work it does, and compaction (43
times in 15 sessions) throws away exactly the detail the next step needs.

Proposal, in `docs/08` §8.10 and both `.claude/agents/*.md`:
- one session per PR or backlog row; `/clear` or a new session between tasks;
- a subagent that passes ~120k of context (or ~150 turns) stops, writes a hand-off (branch,
  what is done, what is open, the next command) and returns; the orchestrator starts a fresh
  agent with that hand-off instead of continuing the old one;
- the orchestrator never re-reads a diff its agent already reviewed; it relays the report;
- `Edit` for changes to existing files, `Write` only for new files, never a heredoc or
  Python script that rewrites a whole file.

Done when: the three files carry the rules in a few lines each, nothing else.

### TE-02 · Every implementation runs on Opus
**Effort: S**

Evidence: §1 item 2; `.claude/agents/stella-implementer.md` has `model: opus`.

Why it hurts: Light-tier work (copy, styling, a contained component or pure-module change,
docs) does not need Opus, and that is most PRs.

Proposal: route the model by the same tier the review uses (`.claude/skills/pr-review/SKILL.md`
§Depth). The implementer's frontmatter becomes `model: inherit`; the orchestrator passes the
Agent tool's `model` parameter — `sonnet` for Light, `opus` for Full (schema, access,
offline commands, new screen, new dependency). Document the rule in `docs/08` §8.10 next to
the review tiers, and recommend Sonnet for orchestrator sessions that only delegate.

Done when: the frontmatter and §8.10 agree, and the brief template names the tier.

### TE-03 · Every PR gets the full review procedure loaded
**Effort: M**

Evidence: §1 item 4. `.claude/skills/pr-review/SKILL.md` is 20 KB; the Light tier still loads
all of it. Three of four open PRs are docs-only and still owe a verdict comment.

Why it hurts: a docs-only PR costs a reviewer run that can find nothing the owner would not
see by reading it.

Proposal:
- `docs/08` §8.10: a PR that touches only `docs/`, `*.md` or `.claude/` needs no
  `/pr-review`; the owner reads it;
- split the skill: `SKILL.md` keeps the tier choice, §0, the §4.0 table, §6–§9 and the Light
  checks (≈ 6 KB); the Full-tier sections (§1–§5 in depth) move to
  `.claude/skills/pr-review/references/full-tier.md`, which the skill opens only when the tier
  is Full. No check is deleted, only moved;
- `stella-reviewer` reads `SKILL.md` first and the reference only for Full.

Done when: a Light review loads about a third of today's text and the check list is unchanged.

### TE-04 · The largest docs have no sections to open
**Effort: M**

Evidence: `docs/features/2.4-relationships.md` 42 KB with three headings;
`docs/architecture/4.9-decision-log.md` 64 KB with one; `docs/design/5.7-components.md` 31 KB
with one heading and 29 bold run-in titles; `docs/design/5.5-5.6-key-screens-and-color-semantics.md`
36 KB with two; `docs/features/2.2-contacts.md` 28 KB with five. `CLAUDE.md`, both agents
and the review skill tell the agent to `grep -n '^##'` and read the range — on these files
that range is the whole file, 10–16k tokens per visit.

Why it hurts: these are the most-visited docs (relationships, components, decisions).

Proposal: add `###` headings over the existing paragraphs, no rewording: one per subsection
in 2.2, 2.4, 5.5–5.6 and 5.7 (turn the bold run-in titles into headings); one `### ADR-nnn ·
title` per entry in 4.9 plus an index table at the top (id, title, date). Keep every existing
`§` reference valid; the index files (`docs/02-features.md`, `docs/05-ui-design-system.md`)
need no change.

Done when: no file under `docs/` exceeds 25 KB without a heading every ~5 KB.

### TE-05 · `CLAUDE.md` repeats `docs/08` and lists every folder
**Effort: S**

Evidence: 9.5 KB ≈ 2.4k tokens on every turn of every session and subagent. The *Golden
rules* restate `docs/08` §8.3–§8.10; the code map has 30 rows, half of them *pure, test-first*
variations; the *Commands* block repeats `package.json`.

Proposal: cut to ≈ 4 KB: golden rules become one line each with the `docs/08` § to read;
the code map lists directories with one short clause each and sends detail to `docs/04`;
commands keep only `scripts/ci-failures.sh` and the two `test` variants worth knowing. Add one
line: *a concept under `docs/concepts/` whose status says "built" is history — read the
feature doc instead.* In the same session, prune the owner's `MEMORY.md`: drop entries marked
done, merge the two worktree notes (outside the repo, no PR).

Done when: `wc -c CLAUDE.md` is under 4 500 and every rule still has a home.

### TE-06 · The format hook fails silently
**Effort: S**

Evidence: `.claude/hooks/format-file.sh` exits 0 when `node_modules/.bin/prettier` is
missing, with a comment that says Prettier is not wired yet — it has been since #259.
`node_modules` on the owner's checkout predates that PR, so the hook has been a no-op; one CI
run already failed on `bun run lint`.

Proposal: when Prettier is missing, print one line to stderr (*prettier not installed — run
`bun install --frozen-lockfile`*) and exit 2 so the agent sees it once; rewrite the comment;
add *run `bun install --frozen-lockfile` after any `package.json` change on main* to the
agents' worktree step.

Done when: the hook formats on a fresh install and complains on a stale one.

### TE-07 · A changed e2e spec is only run in CI
**Effort: S**

Evidence: of the last fifteen failed CI runs, every one but five failed in an e2e shard; each
costs a read–fix–push–wait round. `.claude/skills/feature-review/affected-specs.sh` already
computes the specs a diff touches.

Proposal: the implementer runs `affected-specs.sh` before the push **only** when the PR edits
an existing `e2e/*.spec.ts`, and runs just those specs. The *never run the whole suite
locally* rule stays.

Done when: the implementer agent and `docs/08` §8.10 say so in one sentence each.

### TE-08 · Connectors that coding sessions never use
**Effort: S · owner, outside the repo**

Evidence: Google Drive, Gmail and Calendar tool schemas load into every session on this
project and are part of the 46k fixed context.

Proposal: disable them for the Stella project in the claude.ai connector settings; keep Claude
Docs only if concept papers are still written there. Not a PR.

Done when: the first turn of a fresh session is measurably smaller.

---

## 3. Work order

One row per session. The session reads this file's row, its `TE-nn` finding above and the
files named there — nothing else — opens one PR, ticks the row **in the same PR**, and ends by
handing the owner the prompt for the next row.

| # | Finding | Effort | Status | Why now |
|---|---|---|---|---|
| 1 | TE-05 `CLAUDE.md` to ≈ 4 KB; prune `MEMORY.md` | S | ☑ | Every later session pays less from the first turn |
| 2 | TE-01 session budget, hand-off, Edit-over-Write in `docs/08` §8.10 + both agents | S | ☑ | Bounds the largest cost before anything else changes |
| 3 | TE-03 docs-only PRs skip review; split the review skill | M | ☑ | Cuts the second-largest recurring cost |
| 4 | TE-02 model by tier (`model: inherit`, Agent `model` param) | S | ☑ | Needs the tier wording from row 3 |
| 5 | TE-04 headings in the five largest docs; ADR index | M | ☑ | Makes the *read only the section* rule true |
| 6 | TE-06 format hook complains instead of no-op | S | ☐ | Removes a lint round per stale checkout |
| 7 | TE-07 run the edited e2e specs before the push | S | ☐ | Removes an e2e round per edited spec |
| 8 | TE-08 disable unused connectors | S | ☐ | Owner setting, no PR; do when convenient |

Paste-ready prompt for a row:

> Work off row *N* of `docs/concepts/token-efficiency-2026-10.md` §3. Read that row's finding
> in §2 and only the files it names. One PR (`chore:` or `docs:`), Conventional Commit in
> English, no attribution lines. Tick the row in the same PR. Finish with the prompt for the
> next row.

---

## 4. Out of scope here

- The auto-mode harness instruction that prefers Bash over `Edit`/`Read` is a Claude Code
  setting, not a project one; TE-01 counters it at the agent level only.
- The e2e suite's size (94 specs, 700 KB) costs CI minutes, not model tokens; see the
  architecture review's §7.
