# 08 — Coding Guidelines

How we write code for Stella. These are binding conventions, not suggestions. When a
rule and pragmatism genuinely conflict, favor readability and testability.

## 8.1 Core principles (agreed)

1. **Test-first (TDD).** Specify behavior with a failing test, then write the minimal
   implementation to make it pass, then refactor. No production logic without a test that
   described it first.
2. **Clean, readable code** over cleverness. Code is read far more often than written.
3. **Encapsulation & single responsibility.** Each unit owns its data and behavior and has
   one reason to change. Objects/modules hide their internals.
4. **Minimal exposure.** Export/expose as little as possible. Default to private; make
   things public deliberately.
5. **Descriptive names.** Prefer a longer, clear name over a short, cryptic one.
   `resolveReverseRelationshipLabel` beats `revLbl`.
6. **Well-sliced, testable units.** Small functions, low complexity, easy to test in
   isolation.
7. **Minimal dependencies.** Prefer the standard library and built-in platform APIs
   (Bun, Web APIs). Every new dependency must earn its place.

## 8.2 Additions we also follow

8. **Framework-agnostic domain layer.** Business logic lives in `src/lib/server/domain`
   and `src/lib/server/access` as plain TypeScript with no SvelteKit/HTTP imports. The
   framework (routes, hooks, `$env`, `$app`) stays at the edges and is thin. This is what
   makes domain logic unit-testable with `bun test` and no framework bootstrapping.
9. **Dependency injection over globals.** Domain functions receive their collaborators
   (a `db` handle/repository, a `clock`, an `idGenerator`) as arguments. No reaching into
   module-level singletons from within domain logic. The edge wires the real
   implementations; tests pass fakes.
10. **Determinism.** No `Date.now()` / `Math.random()` / `crypto.randomUUID()` buried in
    logic. Inject a `Clock` and an `IdGenerator` so tests are deterministic and fast. The
    edge is no exception: a route that needs today's date asks `todayFor(clock)`
    (`src/lib/dates/today.ts`) with the server's `systemClock`, so it and the use-cases agree
    on what day it is.
    Deliberately expensive work is injectable for the same reason — the demo seed takes its
    password hasher, so only the case that is about Argon2id pays for it. Where a test would
    otherwise wait and hope, the production code publishes the state instead: the explorer's
    canvas carries `data-layout="settled"` once its layout has stopped moving the nodes, so
    a click can be aimed rather than retried.
11. **Fail loud.** Validate at boundaries (Valibot) and throw on misconfiguration/invalid
    state rather than limping on with bad data. One shape, one schema: a form action that
    builds a command reads it with that command's schema (`fromFormData`, docs/04 §4.11.2)
    rather than declaring the fields again. No empty `catch {}` that swallows errors,
    and no `catch` that turns an unexpected error into a user message: only an expected,
    typed refusal (`TranslatableError`) is answered; everything else reaches `handleError`,
    which logs it with the request id (docs/04 §4.4).
12. **Strict typing.** `strict` TypeScript, no `any` (use `unknown` + narrowing). Make
    illegal states unrepresentable with the type system where practical.
13. **Test behavior, not implementation.** Assert observable outcomes through the public
    API. Avoid tests coupled to internal structure — they should survive refactors.
14. **Immutability & pure functions** where reasonable. Prefer returning new values over
    mutating arguments; isolate side effects.
15. **Comments explain _why_.** The code shows _what_. Comment intent, trade-offs, and
    non-obvious constraints — not the obvious.
16. **YAGNI.** Build what the current milestone needs. The specs leave doors open (e.g.
    multi-tenancy) without paying for them now.
17. **Consistency.** Follow existing patterns in the codebase over personal preference.
18. **Automated formatting & linting.** Formatting is not a code-review topic; a tool
    decides it. Prettier (`.prettierrc`: tabs, single quotes, width 100, with the Svelte and
    Tailwind plugins — the latter orders classes) formats; ESLint (`eslint.config.js`:
    `typescript-eslint`, `eslint-plugin-svelte`) lints. `bun run format` rewrites,
    `bun run lint` checks both and runs in CI. The lint also guards the architecture with
    `no-restricted-imports`: no `$app` / `$env` / `@sveltejs/kit` under
    `src/lib/server/{domain,access}` or a folder CLAUDE.md calls *pure*, and no
    `$lib/server/services` outside `src/routes/` and `src/hooks.server.ts` (§8.3). And it
    keeps the edge's boilerplate in one place: no hand-written `if (!locals.user) throw
    redirect(…)` (use `requireViewer` / `requireUser`, docs/04 §4.4), no `new Date(` in a
    route module (`todayFor(clock)`, item 10), no local `key()` helper (`messageKey()` from
    `$lib/i18n/translate`). A file that breaks a boundary today is listed, with the reason,
    in the config's exception lists — shrink them, never grow them without a reason.
    Markdown is not formatted. The one-time reformat is listed in `.git-blame-ignore-revs`
    (`git config blame.ignoreRevsFile .git-blame-ignore-revs`).
19. **Security by default.** Least privilege, validate all external input, no secrets in
    code or logs, central access-control (§3.7) as the only authorization path.

## 8.3 Ports & Adapters (how DI and encapsulation coexist)

Dependency injection and encapsulation act on **different axes** and reinforce each other
when applied as Ports & Adapters. Misused DI (injecting raw infrastructure everywhere)
*does* break encapsulation — these rules prevent that.

- **Encapsulation** hides a unit's internal state/implementation (its own data stays
  private). **DI** only changes *how a unit obtains its collaborators* — it declares what
  it needs instead of constructing it. Injected collaborators are **not** the unit's
  private data, so encapsulation is untouched.
- **A global singleton (`import { db }`) is _hidden_ coupling, not encapsulation.** It only
  looks clean; the dependency is invisible and untestable. DI makes the same dependency
  **explicit and honest**.
- **The domain owns the interface (the _port_); infrastructure implements it (the
  _adapter_).** Inject the narrow port, never the concrete DB/SQL. The domain must never
  learn it is backed by SQLite.

Layering and single responsibility:

1. **Pure logic** (entities, value objects, rules) takes **no** dependencies — maximum
   encapsulation. Prefer pushing logic here (e.g. `access/visibility.ts`, relationship
   reciprocity, partial-date handling).
2. **Use-cases / services** depend on **ports** the domain defines
   (`ContactRepository`, `Clock`, `IdGenerator`), passed as an explicit `deps` argument.
   They never import a singleton or concrete infrastructure.
3. **Adapters** implement ports over real infrastructure (Drizzle/`bun:sqlite`, system
   clock, ULID).
4. **Composition root** — `src/lib/server/services/` — is the **only** place that
   constructs concretes and wires them into use-cases' `deps`. It builds one typed
   `AppServices` per process, grouped by bounded context, and `hooks.server.ts` **hands** it
   to the edge as `locals.services`: a route reads `locals.services.auth.sessionDeps` rather
   than pulling from a registry, so a test can hand it an `AppServices` over fakes. In a
   group, a repository the edge reads directly sits under its plural noun (`accounts`), a
   use-case's deps under its type's name (`sessionDeps: SessionDeps`). The command handler
   table (`lib/server/commands/handlers.ts`) constructs nothing: the `offline` group builds it
   over the other groups' deps (docs/04 §4.11.2). Only edge
   code imports the module by value: the SvelteKit edge itself (`routes/`, `hooks.server.ts`).
   An action several pages share lives under `routes/(app)/_shared/` and takes the slices it
   reaches as arguments; anything else asks for a slice's type (`import type`) and is handed
   the deps (docs/04 §4.3).

```ts
// domain/contacts/contact-repository.ts — the DOMAIN owns this port
export interface ContactRepository {
	save(contact: NewContact): Promise<ContactId>;
}

// domain/contacts/create-contact.ts — knows nothing about SQLite
export async function createContact(
	input: CreateContactInput,
	deps: { contacts: ContactRepository; clock: Clock; ids: IdGenerator }
): Promise<ContactId> { /* … */ }

// src/lib/server/services/people.ts (composition root) — the only place wiring concretes
export const createPeopleServices = ({ db, clock, ids }: PeopleWiring) => ({
	contactDeps: { contacts: drizzleContactRepo(db), clock, ids }
});

// src/routes/… (the edge) — is handed the wired graph, never builds one
const id = await createContact(input, locals.services.people.contactDeps);
```

**Rules of thumb:** inject DI **only** for side-effect collaborators (I/O, time,
randomness/ids), never for plain values; always inject **narrow, domain-owned ports**;
assemble concretes **only in the composition root**.

**A context reports, activity words.** A use-case that leaves a trail in the activity log does
not phrase it: it hands an `ActivityEvent` — what happened, as data — to the write it belongs
to (`deleteVisibleTo(viewer, id, audit)`), and the adapter turns it into the row with
`activityEntry` from `domain/activity/`, in the same transaction (docs/04 ADR-120). A fake of
that port records the event, so a test asserts on what happened rather than on a sentence;
the sentence is `activity.test.ts`'s.

**Contexts depend one way.** The folders under `domain/` are bounded contexts, and an import
between two of them — `import type` included — runs in one direction only;
`src/lib/server/domain/context-cycles.test.ts` refuses a cycle. A context that reads another
asks for the narrow port that one exports (`ContactLookup` from `contacts`, not the
`ContactRepository`). Where the read context would have to import back, it declares the port it
needs itself and the other side's adapter fulfils it structurally: `contacts` reads the kinship
graph through its own `SurnameKinshipSource`, and unlinks a deleted person's photo files
through its own `PhotoFileCascade`, never through `relationships` or `media` (docs/04 ADR-121).
A new column pointing at a person is one line in `domain/contacts/merge-plan.ts` — moved by a
merge, or left behind on purpose; `db/merge-plan-coverage.test.ts` fails until it is.

**Repositories write, read models list.** A repository is an aggregate's write side plus the
one-record reads its writes rest on (`insert`, `update…`, `findByIdVisibleTo`); what a screen
lists or counts is a **read model** port of its own, named `…Reads` (`ContactDirectoryReads`,
`ContactNameReads`, `PeopleStampReads`). A list a new screen needs widens a read model, never
the repository. Each port has **one adapter** (`db/*-repository.ts`, `db/*-reads.ts`): a
factory declared to return `A & B` is one object with two reasons to change, and
`src/lib/server/adapter-ports.test.ts` refuses it. A use-case asks for exactly the methods it
calls (`Pick<ContactDirectoryReads, 'listVisibleTo'>`), as its own field of `deps`.

## 8.4 The TDD loop in practice

```
1. Write a test naming the behavior            (red)
2. Run `bun test` — watch it fail for the right reason
3. Write the least code to pass                (green)
4. Refactor with the test as a safety net      (refactor)
5. Repeat
```

- **Unit tests** (the majority): pure domain logic in `src/lib/server/{domain,access}`,
  run with `bun test`, no I/O, dependencies faked.
- **Integration tests**: domain against a real in-memory SQLite (`new Database(':memory:')`
  + migrations) to verify queries and constraints.
- **End-to-end** (Playwright): browser flows for user-facing features, in `e2e/*.spec.ts`,
  run with `bun run test:e2e` against the production build under Bun (not the dev server).

Test files are `*.test.ts`, colocated with the code under test (hence `bun test src`, which
keeps the Playwright specs out of Bun's runner).

**Shared test support** lives in `src/lib/server/domain/testing/`: `fixedClock(now)` (stands
still until the test calls `advance`), `sequentialIds(...first)`, one in-memory fake per
read-model port (`inMemoryContactDirectory`, `inMemoryCircleMemberships`, `inMemoryTagLists`,
`inMemoryGalleryPhotos`, `inMemoryKinshipGraph`, `inMemoryRelationshipTies`, … over
`somebody(id, name, fields)`, `membership(circleId, contactId, fields)`, `someTag(id, name,
fields)`, `someGalleryPhoto(id, fields)` or `someTie(id, otherContactId, fields)` rows) and
`contactRepositoryWith({...})` / `circleRepositoryWith` / `photoRepositoryWith` /
`relationshipRepositoryWith`,
which answer with the methods a test hands them and fail loud on any other. Reach for these before writing a fake. A fake models no visibility — the people it
holds are the ones the viewer may see; the adapter's scoping is covered against SQLite. Two
kinds of fake stay in their test: one that **records the calls** it receives to assert on them
(that is the behaviour under test), and one whose answers follow the test's own writes or
visibility rules. Only `*.test.ts` files import the folder (`testing.test.ts` holds that), so
Vite never reaches it and it is not built.

`bun run test:e2e` (`e2e/run.sh`) builds the app, starts it on `127.0.0.1:4173` against a
**fresh** `./data/e2e` database with `SEED_DEMO=true`, and drives it from the pinned
`mcr.microsoft.com/playwright` image with `--network host` — Chromium does not run on the
NixOS host. The image tag must match the `@playwright/test` version in `package.json`.

A `setup` project signs in through the one-click demo button once and stores the session; every
other spec starts from it, which is a page load and a form post saved per test (`signIn()` in
`e2e/app.ts` falls back to the button when `--grep` filtered the setup project out). All specs
in one run share one database, so they run serially and **must not depend on each other's
data** — CI enforces this by splitting the suite across five runners
(`bunx playwright test --shard`), each with its own freshly seeded server.

**Seed the setting, drive the step.** A case that needs a household's worth of people and
links before its first assertion brings them in through the archive restore (`seedHousehold`
in `e2e/seed.ts`, one request) rather than through the forms, which cost a page load and a
post per person and per link. The forms are covered where they are the subject; the step the
case is about is always driven through the UI.

**Assert what must still be there before asserting what is gone.** `toHaveCount(0)` is
satisfied on its first poll, so on its own it passes against a screen that has not rendered
yet — a helper returns as soon as its heading is up, and the element under test can still be
missing at that instant. Name a neighbour that must be present and assert it first: that wait
is what makes the screen the settled one, and a `data-testid` on the container keeps the
reading inside the element that owns the claim. Without that pair a case passes together with
its own inverse and says nothing, which is how one came to be withdrawn.
`e2e/tags.spec.ts` is the worked example.

A second, tiny server runs beside the app: `e2e/release-feed-stub.ts`, the stand-in for
GitHub's `releases/latest` that the About card reads (`UPDATE_CHECK=true` plus
`UPDATE_FEED_URL` in the `e2e:server` script). It exists so the card has a fixed release to
render instead of whatever is published today, and so the suite needs no network. Both
servers are declared in `playwright.config.ts`, so CI starts them itself; `run.sh` starts
them on the host, because the container has no Bun. One server means one release state per
run — the card's *current*, *unreachable* and *off* branches stay unit-covered only.

### 8.4.1 Feature delivery loop (implement → verify → e2e)

Unit/integration tests stay **test-first** (§8.1). The **e2e** test is written **after the
change is confirmed working**, so it locks in behaviour we've actually agreed on rather than a
guess. Each user-facing change follows:

1. **Implement** the change with its unit/integration tests (test-first, `bun test` green).
2. **Hand off for manual verification** — the change is exercised in the running app (rebuild
   the container / drive the flow) and the outcome reported.
3. **On the user's OK, add the Playwright e2e** for that flow (`e2e/*.spec.ts`), then run it.
   The e2e goes into the **feature's own PR**, and that PR is merged only once it is in and
   green — the OK is not the go-ahead to merge, so the change and the spec that locks it in
   land together.

Don't write the e2e in step 1: an unverified e2e can encode a wrong expectation and pass, giving
false confidence. Steps 1–2 are never skipped; step 3 waits for sign-off.

### 8.4.2 Determinism: a test may only fail for the behaviour

A test that can fail while the code is right is worse than no test: it teaches the team to
re-run instead of to read, and the day it catches something real nobody believes it. So a
test may not race — not in `bun test`, not in Playwright.

- **No sleeps, no fixed waits, no polling for an effect that only *probably* lands.**
  Playwright's web-first assertions (`await expect(locator)…`) retry until the deadline and
  are exactly right; `waitForTimeout` is a sleep wearing their clothes. In `bun test`, a
  bare `await` on something that dispatches work elsewhere is the same mistake.
- **The fix belongs in the production code, never in a longer wait.** If a test can only
  pass by waiting and hoping, the code is missing a seam: an injected `clock`, a completion
  signal, a settled state something can read. `src/lib/graph/cytoscape/motion.ts` is the
  worked example — it writes `data-layout="settled"` on the container when a layout stops,
  because the nodes' drawn positions mean nothing until then, and `settled()` in
  `e2e/graph-canvas.ts` waits on that attribute instead of guessing how long a layout takes.
- **A test asserting something did *not* happen needs a positive signal** — recorded calls,
  a settled state, a counter — or it is false-green by construction. §8.4's rule about
  asserting the neighbour before asserting the absence is this same rule on a screen.
- **Prove it can fail.** A test written against an already-working build has never been seen
  red. Break the behaviour it names — revert the fix, shift the value it renders — and watch
  that exact case go red and its neighbours stay green. A case that survives is not a test,
  whatever its name says. `e2e` rebuilds on every run, so a production-side edit is picked up.

**Motion is waited on, never timed.** What opens or closes in place glides (docs/05 §5.11), so
for a moment it is half there — and two alternatives crossing over each other are *both* there,
which a locator that finds one thing reports as an error rather than retrying. The suite
therefore runs with `prefers-reduced-motion: reduce` (`playwright.config.ts`), where every
disclosure switches at once. A spec about the motion itself opts back in
(`test.use({ contextOptions: { reducedMotion: 'no-preference' } })`) and waits on the end state — the box's
`data-motion="settled"`, the cursor where it lands, the element there or gone — never on 300 ms.

**The wall clock is a dependency like any other.** Two clocks are in play whenever a test
builds a date: the test's and the server's. They agree only because `TZ` is pinned — for the
CI jobs and for the container `e2e/run.sh` starts — so do not unpin it. And a run that steps
over midnight is a real case: where a test compares against "today", both sides of the write
are correct answers, and the assertion accepts either. `e2e/mentioned-in.spec.ts` is the
worked example. Widening it that far is not a weaker assertion; on any run that does not
cross midnight the two collapse into the one day it always checked.

## 8.5 What is and isn't unit-tested

- **Unit-tested (test-first, always):** access-control/visibility rules, session lifecycle
  logic, relationship reciprocity & guardrails, partial-date handling, OIDC claim→user
  mapping (group→role, allowlist), feed visibility filtering, input validation.
- **Thin edges (covered by integration/e2e, kept trivial):** SvelteKit `load`/actions,
  `hooks.server.ts`, adapter/config wiring, Svelte components’ markup. These contain no
  branching business logic worth unit-testing; if they grow logic, extract it into the
  domain layer and test it there.

## 8.6 Naming & structure conventions

- Files: `kebab-case.ts`. Types/classes: `PascalCase`. Functions/vars: `camelCase`.
  Constants: `UPPER_SNAKE_CASE` only for true compile-time constants.
- One primary concept per file; keep files small.
- Domain modules expose intention-revealing functions; keep DB/row shapes internal and map
  to domain types at the boundary.
- Errors: throw typed `Error` subclasses with actionable messages; never expose secrets.

## 8.7 Definition of Done

A change is done when:

- The behavior was driven by tests and all tests pass (`bun test`).
- No test in the change leans on a sleep, a fixed wait or the calendar, and each one
  has been seen red for the right reason (§8.4.2).
- Types check (`bun run check`) and formatting/lint pass (`bun run lint`).
- Public surface is minimal and documented where non-obvious.
- Access control is enforced through the central layer for any new data access.
- Accessibility basics hold for any UI (keyboard, contrast, labels).
- **No English in the interface.** Every string a person reads goes through the message
  catalogue in both languages (docs/02 §2.19): components call `t('…')` from `useI18n()`,
  routes call `say(locals, '…')`, and a domain refusal carries a `Phrase` instead of a
  sentence. `messages/de/*` is typed against `messages/en/*`, so a missing translation is a
  compile error rather than a screen half in English.
- Relevant docs (this suite) are updated if behavior or model changed.

### Adding a message

1. Add the key to the right area module in `src/lib/i18n/messages/en/`; a message that
   needs values is a function, so its parameters are checked at every call site.
2. Add the same key to `messages/de/` — the compiler insists.
3. A new area needs its module in both barrels (`messages/{en,de}/index.ts`); the parity
   spec in `messages/catalogs.test.ts` catches a barrel that forgot one.

## 8.8 Dependency policy

- **Exact, pinned versions only.** No `^` or `~` ranges in `package.json` — every
  dependency is a single fixed version.
- **Committed lockfile is authoritative.** `bun.lock` carries the exact resolved tree and
  per-package integrity hashes; it is always committed.
- **Enforced automatically:** `bunfig.toml` (`[install] exact = true`) and `.npmrc`
  (`save-exact=true`) make `bun add` write exact versions.
- **Reproducible installs:** CI and the Docker build use `bun install --frozen-lockfile`,
  which fails on any drift between `package.json` and `bun.lock`.
- **Adding a dependency is deliberate** (principle 7): prefer Bun/Web/standard-library
  APIs; weigh transitive cost before adding.
- **Upgrades are intentional:** bump the exact version on purpose, run `bun test`, and
  commit the resulting `bun.lock` change in the same commit.

## 8.9 Commits & releases

- **Conventional Commits** for every commit message:
  `type(optional-scope): summary`. Common types: `feat`, `fix`, `docs`, `refactor`,
  `test`, `chore`, `build`, `ci`, `perf`, `revert`.
  - Breaking changes: add `!` after the type/scope (`feat!: …`) or a `BREAKING CHANGE:`
    footer.
  - Keep the summary imperative and lower-case; explain the _why_ in the body when useful.
  - Examples: `feat(contacts): add quick-add sheet`, `fix(auth): reject expired sessions`,
    `test(access): cover private-contact visibility`, `docs: expand the explorer spec`.
- **Automated releases with [release-please](https://github.com/googleapis/release-please).**
  It watches the default branch, opens/maintains a release PR that bumps the version in
  `package.json` and updates `CHANGELOG.md` from the commit history, and tags a release when
  that PR is merged. So the commit type drives the version bump:
  - `fix:` → patch, `feat:` → minor, breaking → major (pre-1.0: minor, per config).
  - Non-release types (`docs`, `chore`, `test`, `ci`, …) still appear in the changelog
    where relevant but don't force a release on their own.
- **Practical rule:** write the commit type to match the change's user-facing impact — the
  changelog and version are generated from it, so an accurate type matters.
- Config lives in `release-please-config.json` + `.release-please-manifest.json`; the
  workflow is `.github/workflows/release-please.yml` (GitHub Actions).
- **The release PR runs CI like any other PR**, because release-please opens it with the
  maintainer's token, the repository secret `RELEASE_PLEASE_TOKEN`. Opened with the run's
  `GITHUB_TOKEN` instead, the PR is authored by `github-actions[bot]`, a `CONTRIBUTOR`: its
  run waits forever on "Approve and run" and is reported as a failure once the merge deletes
  the branch. (A workflow cannot skip it by branch name: `pull_request`'s `branches` filters
  match the PR's *base*, which is `main`.) The secret is a fine-grained personal access token
  for this repository only, with *Contents*, *Pull requests* and *Issues* set to read and
  write; renew it before it expires. Without it the workflow falls back to `GITHUB_TOKEN`,
  so releases still work and only that red run comes back.

## 8.10 Working agreement

How a change travels from idea to `main`. The global rules (no direct commits to `main`, no
magic literals, no timing-based tests) apply on top of this.

- **One git worktree per feature**, beside the checkout (`../Stella-<slug>`) — never under
  `.claude/`, where Vite's build breaks — branched from `origin/main` → PR → green CI → **wait
  for the merge go-ahead**. Merge as a squash with a hand-written Conventional Commit subject;
  release-please derives the changelog from it.
- **At most two feature PRs open at once.** Parallel PRs touching the same screens collide
  (two migrations with one number, the same component edited twice), and every merge then
  costs a catch-up and a second review. Get one tested and merged before starting a third.
- **A feature PR is complete**: the domain/access change, the UI that exposes it, the matching
  `docs/` page and `using-stella.md` when a user can see it. Never "UI in a follow-up", never
  "docs later".
- **Run `/pr-review` on your own PR before asking for the go-ahead** — every PR that touches
  code, and its verdict comment is the evidence it happened. A missing verdict is a blocker,
  not a formality. Its depth follows the PR's risk (the skill's *Depth* section): a full review
  for schema, access, offline-command or new-screen changes, a light one otherwise. A PR that
  touches only `docs/`, `.claude/` or `*.md` files needs no review — the owner reads it.
- **Agents**: implementation goes to the `stella-implementer` agent, reviews to
  `stella-reviewer` (`.claude/agents/`), which carry these rules so a brief only states scope,
  tier and decisions. Agents read doc *sections*, not whole docs; never run the whole
  `bun run test:e2e` (CI does, on every push) — but a PR that edits an existing
  `e2e/*.spec.ts` runs just the specs `.claude/skills/feature-review/affected-specs.sh` lists
  before the push; and read a red run with `scripts/ci-failures.sh <PR>` before reaching for
  the full log.
- **Model by tier.** The implementer inherits its model; the orchestrator picks it per brief
  with the Agent tool's `model` parameter, using the review's tiers: `opus` for **Full** (a
  schema or `drizzle/` change, access or visibility rules, the offline command path, a new
  dependency, a new screen), `sonnet` for **Light** (copy, styling, a contained component or
  pure-module change, docs). The brief names the tier. An orchestrator session that only
  delegates and relays runs on Sonnet too.
- **Session budget.** One session per PR or backlog row; `/clear` or a new session between
  tasks. A subagent past ~120k of context or ~150 turns stops, writes a hand-off (branch, done,
  open, the next command) and returns; the orchestrator starts a fresh agent with it rather than
  continuing the old one, and relays an agent's report instead of re-reading the diff it
  reviewed. Change an existing file with `Edit`; `Write` is for new files only — never a heredoc
  or script that rewrites a whole file.
- **A UI change ships a running Playwright case**, added after the owner's OK (§8.4.1). It
  asserts what is *rendered*, never only the URL, and never waits on a timeout: if nothing
  observable exists to wait on, that absence is the defect — give the production code a signal.
- **English throughout** — specs, code comments, commit messages and PR text. A request made in
  German is *translated*, never pasted in as a quote. German is fine only as **content**: UI copy
  being specified, sample and seed data.

## 8.11 Migrations

Every new migration is generated with a name that says what it does —
`bunx drizzle-kit generate --name <what_it_does>` (e.g. `0024_gift.sql`) — because the
`drizzle/` folder is read as the schema's history, and drizzle-kit's random names
(`0000_conscious_scream.sql` … `0019_volatile_wild_pack.sql`) say nothing; those twenty keep
their names, since renaming a migration breaks the journal that records it as applied.
