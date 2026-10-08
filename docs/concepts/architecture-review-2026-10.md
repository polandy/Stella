# Architecture & code review — October 2026

**Scope:** the whole of `src/` on `main` at `dfaef79` (feat(immich): add people from Immich
names, #252), read against `docs/08-coding-guidelines.md` and `docs/04-architecture.md`.
**Lens:** maintainability, traceability, understandability, extensibility, high cohesion,
separation of concerns, Domain-Driven Design, loose coupling.
**Purpose:** a backlog of structural improvements to be picked up one at a time in later
sessions. Nothing here is a bug report; the app works and is well tested. This is about the
cost of the *next* hundred features.

Each finding has an id (`AR-nn`), a severity (how much it slows change today), an effort
(S = one PR of an hour or two, M = one focused PR, L = a series of PRs) and file references
as evidence. §6 orders them into a suggested sequence.

---

## 1. Snapshot

| Measure | Value |
|---|---|
| Production TypeScript files / Svelte components | 497 / 123 |
| Unit test files (`bun test src`) / Playwright specs | 317 / 90 |
| Non-test source lines | ~72 000 |
| Domain tests that open SQLite | **0** (all fake-driven); DB adapter tests on `:memory:` | 41 |
| Route-level unit tests | 3 (`person-view`, `story-view`, `graph/center`) |
| Exported factories in `src/lib/server/services.ts` | 79, over 844 lines, 30 module-level singletons |
| Domain-owned ports (`*Repository`, `*Source`, `*Reads`, `*Store`, `*Gateway`) | 48 |
| Widest port | `ContactRepository` — 15 methods (`domain/contacts/contacts.ts:129`) |
| `TranslatableError` subclasses | 40 |
| Top-level folders under `src/lib/` (excluding `server/`, `components/`) | 33, nine of them single-file |
| `if (!locals.user) throw redirect(302, '/login')` in routes | 77 |
| `{ id: locals.user.id, householdId: locals.user.householdId }` literals in routes | 67 |
| `dispatchCommand(…).catch(() => null)` in routes | 16 |
| `$effect(` in components | 53 |
| ESLint / Prettier configuration | none (docs/08 §8.2 item 18 still says "to be wired in M0") |
| Git churn leaders (commits touching the file) | `contacts/[id]/+page.svelte` 67 · `contacts/[id]/+page.server.ts` 52 · `services.ts` 52 · `GraphExplorer.svelte` 33 |

---

## 2. What is genuinely good — keep it

These are not platitudes; they are the load-bearing walls every proposal below leans on.

- **The domain really is framework-free.** No file under `src/lib/server/domain` or
  `src/lib/server/access` imports `$env`, `$app`, `@sveltejs/kit`, Drizzle or `bun:sqlite`
  (the one Drizzle import in `access/query-scoping.ts` is by design — it *is* the SQL face of
  the rules). Every domain test runs on hand-written fakes; not one opens a database. That is
  rare and is the single biggest reason the codebase is still changeable at 72k lines.
- **Access control is one path.** `access/visibility.ts` states the rules as pure predicates;
  `access/query-scoping.ts` restates them as SQL fragments; every visibility-bearing repository
  composes those fragments rather than writing its own `WHERE`. The eight adapters that do not
  import `access/` (`account`, `api-token`, `session`, `member`, `import`, `restore`,
  `command-receipt`, `entry-ownership`) are household- or owner-scoped, not visibility-scoped,
  which is correct.
- **Pure-core / thin-adapter is applied consistently on the client too.** Graph (`model/`,
  `layout/` pure; `cytoscape/` adapter), PWA (`cache-policy.ts` pure; `service-worker.ts`
  obeys), suggestions (`engine.ts` + `rules/`), motion, surnames, outbox. The "settled" signals
  written for tests (`data-layout="settled"`, `data-motion="settled"`) are the right fix for
  timing flakiness and are documented as such.
- **Errors carry meaning, not sentences.** 40 typed `TranslatableError`s with a `Phrase`; the
  edge says them in the request's language. The German catalogue is typed against the English
  one, so a missing translation is a compile error.
- **Decisions are written down.** `docs/architecture/4.9-decision-log.md` is an honest ADR
  log with reasons and reversals. The `docs/` suite is unusually complete for a solo project.
- **The person page already shows the target shape for a large route:** `load.ts` +
  `person-view.ts` / `story-view.ts` (tested) + `actions/<card>.ts` spread into one `actions`
  object (`contacts/[id]/+page.server.ts`). This pattern should be the norm, not the exception.
- **Commands are a real seam.** One vocabulary (`src/lib/commands/commands.ts`) is shared by
  the phone's outbox, the form actions and the dispatcher, and the dispatcher's handler map
  (`domain/commands/dispatch.ts:168`) is exhaustive over `CommandType`, so a forgotten handler
  is a type error.

---

## 3. Findings — structure and coupling

### AR-01 · `services.ts` has become a service locator, not a composition root
**Severity: high · Effort: L**

Evidence: `src/lib/server/services.ts` — 844 lines, 79 exported `get*()` factories, 30
`let x: X | null = null` singletons, and it is the third most-changed file in the repository
(52 commits). Every route imports two to eight of these factories and assembles its own deps
(`contacts/[id]/load.ts:33-52` imports eighteen of them). `getCommandDeps()` (`services.ts:595`)
is a second, 100-line composition root nested inside the first, wiring sixteen command handlers
with `{ ...getRelationshipDeps(), contacts: getContacts() }` spreads.

Why it hurts: docs/08 §8.3 names the edge as "the only place that constructs concretes", and
that is still true — but the edge now *pulls* from a global registry instead of being *handed*
a wired graph. Every new use-case needs (a) a `XDeps` interface, (b) a `getXDeps()` factory,
(c) a singleton for any new repository, and (d) each route re-assembling the pieces. The deps
interfaces overlap heavily (`{ photos, media, ids, clock }` appears five times as five
different types: `AvatarDeps`, `ImportedPhotoDeps`, `GalleryDeps`, `GalleryUploadDeps`,
`JournalPhotoDeps`, `services.ts:552-576`). The file has no internal order a reader can predict,
so it is searched, never read.

Proposal:
1. Build the object graph **once per process** into a typed `AppServices` value (one function,
   `createServices(config, db)`), grouped by bounded context (`auth`, `people`, `relationships`,
   `circles`, `media`, `immich`, `offline`, `release`). Keep laziness only where the build's
   route analysis needs it (the `getDb()` guard), not per factory.
2. Hand that value to the edge through `event.locals.services` from `hooks.server.ts`, so a
   route reads `locals.services.people.contacts` instead of importing the registry. This also
   makes a test-wired edge possible (an `AppServices` over fakes) — today a route cannot be
   unit-tested at all because the registry is global.
3. Collapse structurally identical `*Deps` interfaces into one per collaborator set (a
   `PhotoDeps` shared by the five gallery use-cases) — the domain does not lose narrowness,
   because each use-case's *parameter* type can still be a `Pick<>`.
4. Move the command handler table (`getCommandDeps`) into its own module
   (`server/commands/handlers.ts`) that takes `AppServices` as input. Add a test that the
   table covers `COMMAND_TYPES` — today the type system does it, but a separate module makes
   the extension point findable.

Do this in slices (per bounded context), never as one PR; the file is touched by every
feature branch.

Progress: **`auth`** is grouped (#296; sessions, accounts, API tokens, the API import, OIDC) —
`services/app-services.ts` holds `AppServices` and `createServices`, `services/auth.ts` the
group's builder, `services/index.ts` the hook's `getServices()` and the factories still
left; `services/boundary.test.ts` pins the edge-helper allow-list and the retired factories.
**`people`** is grouped (#298; contacts, names and last names, the surname review, person and
namesake context, the people stamp, the self contact, quick-add suggestions, deleting a
contact) — `services/people.ts`, built over `auth`'s accounts; the relationship repository and
the media store it reads come in as wiring from `index.ts` until their contexts move in.
**`relationships`** is grouped (#299; the relationship repository and the relationship types it
also serves, the map's graph repository, the suggestion review and its dismissals, the family
cards' read) — `services/relationships.ts`; `people` now reads the relationship repository off
the graph, and so does the command handler table, so it exists once. The last shared edge
helper (`relationships/suggestion-answers.ts`) reads `locals.services` too, so the boundary
test's edge-helper list is empty.
**`circles`** is grouped (#300; the circle, circle photo and cut repositories, the circle,
circle photo, role rename and cut use-cases' deps) — `services/circles.ts`, built over
`people`'s contacts; the media store still comes in as wiring from `index.ts`, so
`ServicesWiring.media` is now the whole store. The command handler table's circle handlers read
the group off the graph.
**`media`** is grouped (#301; the photo repository, the file media store under `MEDIA_DIR`,
the avatar, imported photo, gallery, framing, gallery upload, journal photo and home stream
use-cases' deps) — `services/media.ts`. `createServices` builds it before `people` and
`circles`, which read its store off the graph, so `ServicesWiring.media` is gone and the
directory comes in as `config.mediaDir`. The command handler table, the journal and
archive-restore factories and the Immich photo path read the same graph. Capturing a moment
stays a factory: it reads `people`'s contacts while `people` reads `media`'s store, so it moves
with the journal it writes.
**`story`** is grouped (#302; the journal and interaction repositories, the journal,
interaction, capture-moment and story-timeline deps) — `services/story.ts`. `createServices`
builds it after `people` and `media` and hands it their contacts and store off the graph, so
capturing a moment moves in without a cycle: nothing earlier reads `story`. The command handler
table's `moment.capture`, `interaction.log` and `journal.write` handlers read the group off the
graph; `moment.photo` keeps reading `media`'s journal photo deps and the entry ownership, which
stays with `offline`.
**`notes`** is grouped (#304; the note repository and the "Mentioned in" read, with their
deps) — `services/notes.ts`. It reads no other context, so `createServices` builds it from the
wiring alone; the "Mentioned in" read stays here although it also reads journal entries,
because it is one repository with no collaborator from `story`. The command handler table's
`note.add` handler reads the group's note deps off the graph, and keeps reading `people`'s
contacts and namesake context, which stay with `people`.
**`records`** is grouped (#305; the contact field, important date and tag repositories, with
their deps) — `services/records.ts`. It reads no other context, so `createServices` builds it
from the wiring alone; the home page reads the important date repository's upcoming-date
sources straight off the group. The command handler table's `tag.assign`, `field.add` and
`date.add` handlers read the group's deps off the graph, and keep checking the person through
`people`'s contacts.
**`household`** is grouped (#306; the member, search and attention repositories, with the
member and search deps) — `services/household.ts`. It reads no other context and no command
handler uses it, so `createServices` builds it from the wiring alone; the People list and the
first-name-only settings read the attention repository straight off the group, the import
API's people lookup shares the search deps with the search page.
**`archive`** is grouped (#308; the archive, restore and Monica import deps) —
`services/archive.ts`. The restore writes its images through `media`'s store, so
`createServices` hands it that one; the export and the restore read the raw `bun:sqlite` handle,
which joins the wiring as `sqlite`. No command handler uses it; the export, the restore and the
import wizard read the deps straight off the group.
**`immich`** is grouped (#311; the gateway, connection and signer, the link, ignore and
name-ignore repositories and every Immich deps) — `services/immich.ts`. The whole group is
`null` without a configured Immich, as the factories were, so the feature still appears
nowhere; the edge reads `locals.services.immich?.…` where it read `get…()`. `createServices`
hands it `people`'s contacts, contact deps and context reads and `media`'s avatar deps; the
configuration it reads joins the wiring's `config` as `immich` and `sessionSecret`. No command
handler uses it.
**`release`** is grouped (#312; the update check) — `services/release.ts`. Built once with the
graph, so the answer it caches is still shared by every request; `updateCheck` is null when the
instance makes no check, as the factory was. The configuration it reads joins the wiring's
`config` as `updateCheck` and `updateFeedUrl`, and the build's version joins the wiring as
`version`. No command handler uses it; Settings reads it straight off the group.
**`offline`** is grouped (#314; the command receipt repository and entry ownership, with the
dispatcher's `commandDeps`) — `services/offline.ts` — and item 4 came with it: the command
handler table is `server/commands/handlers.ts`, built by the group over the contexts its
handlers call, with a test that it covers `COMMAND_TYPES`. `index.ts` keeps only
`getServices()`; every context is grouped, and the series is done.

### AR-02 · The composition root leaks below the edge
**Severity: medium · Effort: S**

Evidence: two modules in `src/lib/server/` outside `routes/` import `./services` and perform
edge work: `src/lib/server/relationships/suggestion-answers.ts:13` and
`src/lib/server/last-names-actions.ts:9` (the latter also imports `@sveltejs/kit`'s `fail` and
`redirect`). Both exist for a good reason — one rule, several screens — but their location
says "server library" while their content is "shared route action".

Why it hurts: docs/04 §4.3 draws the line at `routes/`; a reader who trusts the docs will not
look in `lib/server/` for form actions, and the `services.ts` import means these modules cannot
be tested without the real wiring.

Proposal: move them to `src/routes/(app)/_shared/` (or `src/lib/server/edge/`), name the
folder in docs/04 §4.3 as "actions shared by several pages", and have them take deps as a
parameter so the route (which has `locals.services` after AR-01) passes them in.

### AR-03 · Edge boilerplate is copied, not shared
**Severity: medium · Effort: S**

Evidence: 77 copies of `if (!locals.user) throw redirect(302, '/login')`; 67 copies of the
`viewer` literal; `function today()` in `(app)/+page.server.ts:40` and
`contacts/[id]/journal/+page.server.ts` reading `new Date()` directly in the edge (the wall
clock docs/08 §8.2 item 10 says to inject); `function key(name: MessageKey)` three times. A
guard module exists (`server/auth/guards.ts`) but only for `requireAdmin`.

Why it hurts: each copy is a place to get the status code, the path or the household wrong,
and the `(app)/+layout.server.ts` guard already ensures `locals.user` — the 77 checks are
TypeScript narrowing dressed up as authorisation. The `today()` copies silently disagree with
the server's `clock` and with the TZ pinning rule in docs/08 §8.4.2.

Proposal: `requireViewer(locals): Viewer` beside `requireAdmin` (one line per route);
`todayFor(clock)` in `src/lib/dates/`; a `messageKey()` helper exported from `i18n`. Then a
unit test over the routes' source that counts the old pattern and fails above zero, so it
cannot creep back.

### AR-04 · One input shape is parsed in up to three places
**Severity: medium · Effort: M**

Evidence: 165 `formData.get(...)` calls across routes; 24 route files declare their own Valibot
schemas; `server/commands/parse.ts` declares the command payload schemas again; `api/v1/*`
and `server/import/api-document.ts` a third time. In `contacts/[id]/actions/relationships.ts:
87-105` the action parses the form with `AddRelationshipSchema`, then hands the result to
`parseCommand` which parses it again with its own schema, then refuses with the same message
if the second parse fails.

Why it hurts: when a field is added to a command (say `relationship.add` gains `status`),
the form schema, the command schema, the payload interface in `commands.ts`, the outbox and
the API importer each have to learn it, and nothing but a runtime 400 tells you which one you
forgot.

Proposal: make the command payload schema the **single** definition (`src/lib/commands/`
already owns the types; let it own the Valibot schemas too, they are isomorphic) and derive
the form reader from it: a tiny `fromFormData(schema, form)` that maps `FormData` to the
schema's keys. The form action then does `parseCommand(fromForm(...))` once. The JSON API
reuses the same schema directly. Any field that exists only for the form (`commandId`,
`return`) stays in the route.

### AR-05 · Swallowed dispatch errors break "fail loud"
**Severity: medium · Effort: S**

Evidence: 16 occurrences of `dispatchCommand(...).catch(() => null)` in routes
(`contacts/[id]/actions/circles.ts:32`, `contacts/new/+page.server.ts:79`,
`(app)/+page.server.ts:207`, …). A thrown error anywhere under a handler — a constraint
violation, a bug, a disk full — becomes a generic 400 with the field-validation message
(`errors.relationship.needPersonAndType`), and nothing is logged (four `console.error` calls in
the whole server, no logger module).

Why it hurts: traceability. The one place a family member sees "could not add" is the one
place the developer has no trace of what happened; docs/08 §8.2 item 11 forbids exactly this.

Proposal: `dispatchCommand` already returns a `CommandAnswer` union (`applied | refused | …`);
let it catch *domain* refusals itself and map them, and let everything else propagate to
SvelteKit's `handleError` (add one in `hooks.server.ts` that logs with the request id and the
command type). Delete the sixteen `.catch`es. One PR.

### AR-06 · Cross-context imports inside the domain
**Severity: medium · Effort: M**

Evidence — the import graph between `domain/*` folders (a → b means a imports from b):

```
contacts     → activity, household, media, relationships
commands     → circles, contacts, media, moments
archive      → activity, immich, media
immich       → activity, contacts, media
journal      → contacts, media, mentions
moments      → contacts, journal, mentions
relationships, tags, mentions, media, interactions → contacts
```

`contacts` imports `relationships` (for deletion/merge) and `relationships` imports
`contacts`: a cycle between the two central contexts. `contacts.ts:7-11` imports
`describeContactDeletion` / `describeContactMerge` from `activity`, i.e. the aggregate knows
how the activity feed words it. `db/contact-merge.ts` (216 lines) decides the *order* and the
*conflict rule* of a merge (`UPDATE OR IGNORE`, "survivor keeps its row") inside the adapter.

Why it hurts: DDD's point about bounded contexts is that a change in one should not require
reading another. Today adding a table that references `contact` means editing
`db/contact-merge.ts` *and* `domain/contacts/contacts.ts` *and* `domain/activity`, and a
reader of `contacts.ts` has to understand relationships, media and activity to follow a
delete.

Proposal:
- Treat *activity* as an outbound port: `contacts` emits `{ kind: 'contact.deleted', … }` to an
  `ActivityLog` port; the activity context owns the wording. Same for `immich` and `archive`.
- Break the `contacts ↔ relationships` cycle with a `ContactLifecycle` port that relationships
  (and media, tags, mentions) *subscribe to* for cascade behaviour, or at minimum move the
  cascade into a dedicated `domain/contacts/remove-contact.ts` that depends on narrow
  `*Cascade` ports instead of the sibling modules.
- Keep `db/contact-merge.ts` as the adapter it is but lift the two decisions (table order,
  conflict rule) into `domain/contacts/merge-plan.ts` as data (a list the adapter walks), so a
  new table is one line in the domain and tested there.

### AR-07 · "Contact" vs "person", and the other synonyms — no ubiquitous language
**Severity: medium · Effort: M (mostly docs + renames over time)**

Evidence: the table and the route are `contact` / `/contacts`; the UI, the lib folder and
the API say *people* (`src/lib/people/`, `/api/v1/people`, `listPeopleEnoughForFirstRun` in
`domain/contacts/contacts.ts:487`). `src/lib/contacts/` holds the person page's section
anchors; `src/lib/people/` holds display-name, gender, job, namesakes. Journal *entry*, *note*,
*moment*, *story*, *stream*, *activity log*, *touchpoint*/*interaction* all name overlapping
things, and `domain/story` imports `journal` + `interactions` to produce the *story*, while
`domain/stream` reads `activity_log` to produce the *stream*. Domain terms invented for
features — *stamp* (`people-stamp.ts`), *cut* (`cuts.ts`), *glimpse* (`immich/glimpse.ts`),
*newcomer*, *namesake*, *attention*, *holder* — are precise once learned but are defined only
in file-head comments, scattered across 24 feature docs.

Why it hurts: DDD asks that the code, the docs and the conversation use one word per concept.
Today a new contributor (or a new agent session) cannot tell whether `people/` or `contacts/`
is where a person-related helper goes, or whether a "note" on the person page is a journal
entry. The CLAUDE.md map lists `contacts/` and not `people/`.

Proposal:
1. Add `docs/03` **§3.0 Glossary** — one line per term, the table/folder it maps to, and the
   synonyms that are *not* used. Include: person (= `contact` table, kept for history),
   household member, circle, relationship / kin (derived), journal entry, note, moment
   (= a journal entry captured from Home), story (a person's timeline), stream (the
   household's), activity (the log row behind the stream), interaction/touchpoint, stamp,
   cut, framing, glimpse, newcomer, namesake, attention.
2. Decide the lib-folder rule and apply it: either `people/` absorbs `contacts/` (and the
   server folder stays `domain/contacts` with a note), or the reverse. Not both.
3. Rename in small `refactor:` PRs as files are touched anyway; do not rename the table.

### AR-08 · Ports widen into query interfaces; one adapter serves several ports
**Severity: low-medium · Effort: M**

Evidence: `ContactRepository` has 15 methods (`domain/contacts/contacts.ts:129-187`) and the
Drizzle adapter returns `ContactRepository & NameCandidateSource & NameRepository`
(`db/contact-repository.ts:105`); `photoAdapter()` returns `PhotoRepository & FramingRepository`
(`services.ts:544`); `getMediaStore()` returns `MediaStore & MediaStreamSource`. `CircleRepository`
and `TagRepository` have 10 methods each. Most methods are *reads for a screen*
(`listNamesVisibleTo`, `listArchivedVisibleTo`, `countKnownByAFirstNameOnly`), not aggregate
operations.

Why it hurts: a port with 15 methods needs a 15-method fake in every test that touches the
aggregate (there are 14 `function fakeRepo` and 10 `function fakes` in the tests, each
hand-rolled), and widening it is always the path of least resistance. The intersection types
hide that one adapter has three reasons to change.

Proposal: separate **repositories** (write side: `insert`, `update`, `findById…`) from
**read models** (`ContactDirectoryReads`, `NamesReads`) the way `people-stamp-reads.ts` and
`person-context-reads.ts` already do in `db/`. Use-cases take the narrow one. Offer one shared
in-memory fake per read model in a `src/lib/server/domain/testing/` folder so tests stop
re-implementing them (see AR-14).

### AR-09 · Value objects exist as conventions, not types
**Severity: low · Effort: M**

Evidence: a birth date is `birthDate: string | null` plus `birthDatePrecision` as a sibling
field (`contacts.ts:63-64, 207`); a `since` date, a `takenAt` and a `metDate` are strings with
format rules in comments; `Visibility` is a union (good) but `Viewer` is a structural `{ id,
householdId }` built by hand 67 times; relationship endpoints are two strings that
`canonicalEndpoints` must be remembered for (used in five modules plus the seed).

Why it hurts: the rule lives wherever the string is handled. `photo-dated-at.ts` reimplements
`takenAtMs` from `src/lib/media/taken-at.ts` in SQL and the comment says "the same rule" —
that is two places that must agree by discipline.

Proposal: not a sweeping change. Introduce value types where a rule already exists in two
places: `PartialDate` (`value`, `precision`, `compare`, `format`) shared by birth/met/since
dates; `RelationshipPair` whose constructor canonicalises. Leave the storage columns alone.

---

## 4. Findings — client, components and modules

### AR-10 · `src/lib/` is 33 flat folders with no taxonomy
**Severity: medium · Effort: M (mostly moves, zero logic)**

Evidence: beside `server/` and `components/` there are 33 folders; nine hold a single file
(`async`, `combobox`, `contact-fields`, `errors`, `interactions`, `menu`, `onboarding`,
`palette`, `shell`). Three folders cover images (`image/`, `media/`, `server/media/`); three
cover colour (`design/`, `palette/`, `app.css`); `ui/` is a grab bag (`focus-return`,
`fullscreen`, `keep-place`, `leaving`, `photo-walk`). Client folders mirror server folder names
(`circles`, `contacts`, `relationships`, `immich`, `media`, `mentions`, `story`, `stream`,
`archive`, `dates`) but hold different things — `lib/relationships/` is 17 files of picker and
label logic, `domain/relationships/` is the aggregate. CLAUDE.md's code map names 17 of the 33.

Why it hurts: discoverability. The pure-module discipline is excellent, but "where does this
pure function go" has no answer a newcomer can derive, so folders get created per feature and
never merged. Agents (per `docs/08` §8.10 they read sections, not trees) are told the map in
CLAUDE.md and will miss half the folders.

Proposal — pick one, document it in docs/04 §4.3:
- **Option A (feature slices):** `src/lib/<context>/{model,view,client}` mirroring the server's
  bounded contexts; cross-cutting pure modules (`motion`, `pwa`, `i18n`, `design`,
  `graph`) stay top-level. `people/` + `contacts/` merge (AR-07).
- **Option B (layers):** keep flat but prefix: `shared/` for isomorphic domain vocabulary that
  the server also imports (`commands`, `kinship`, `suggestions`, `people`, `dates`,
  `relationships/types`), `ui/` for browser-only pure logic, `adapters/` for `*.svelte.ts`.
Either way: fold the single-file folders into their neighbour, and generate the CLAUDE.md map
from the tree rather than by hand.

### AR-11 · Four components carry state machines that belong in pure modules
**Severity: medium · Effort: M each**

Evidence: `GraphExplorer.svelte` — 676 of 828 lines are `<script>`, 33 commits; it owns the
selected node, the peek panel, the path prompt, filters, arrangement, density, saved views,
fullscreen and keyboard focus (`components/graph/GraphExplorer.svelte:1-120` imports 30 pure
modules and orchestrates them). `MomentComposer.svelte` — 452 script lines: mention resolution,
namesake disambiguation, photo processing, outbox, reachability, `goto`. `PersonSearchSelect`
321, `AddRelationshipForm` 298. 53 `$effect` blocks across the UI.

Why it hurts: the pure modules are tested; the *transitions between them* are not, and those
are where regressions land (the churn numbers say so). `phone-map.ts` already shows the fix
works: a view machine as data, the component only renders it.

Proposal: for each of the four, extract an `explorer-state.ts` / `composer-state.ts`
(`$state`-free, a reducer or a class with methods, tested like `phone-map.ts`), and let the
component hold one `$state` of it. Start with `GraphExplorer` (highest churn) and
`MomentComposer` (the offline path, highest risk).

### AR-12 · Design system and feature components share one folder
**Severity: low · Effort: S**

Evidence: 47 `.svelte` files flat in `src/lib/components/` mix primitives (`Button`, `Icon`,
`Section`, `Avatar`, `Toast`, `InlineEdit`) with feature components (`MomentComposer`,
`KinSuggestions`, `MentionTextarea`, `KnowThemBy`, `WhichNamesake`). The sub-folders
(`person/`, `circle/`, `graph/`, `immich/`, `surnames/`) show the intended split.

Proposal: `components/ui/` (primitives, documented in docs/05) vs `components/<feature>/`;
move the rest. Pure mechanical PR.

### AR-13 · Adding an offline command touches six files
**Severity: low · Effort: S (document) / M (reduce)**

Evidence: a new command needs `lib/commands/commands.ts` (payload interface + `KINDS` entry),
`server/commands/parse.ts` (schema), `services.ts#getCommandDeps` (handler wiring), the
use-case itself, the form action that builds the command, and `pwa/outbox.ts` if it is
queueable with a photo. The dispatcher's exhaustive map is the only thing that catches a
missed step.

Proposal: after AR-04 the schema and the payload become one; after AR-01 the handler table is
its own module. Then write the remaining three-step checklist into docs/04 §4.11.2. Also a
test that `COMMAND_TYPES` equals the keys of the parse schema map.

---

## 5. Findings — tests, tooling, docs

### AR-14 · Forty-five hand-rolled fakes, no shared test support
**Severity: low-medium · Effort: M**

Evidence: 14 `function fakeRepo`, 10 `function fakes`, 5 `function fakeClock`, … (45 in all),
each re-implementing an in-memory port; `fakeClock` and the id generator are redefined per
file. Fixtures exist ad hoc (`graph/model/fixtures.ts`, `image/fixtures/`,
`import/monica/wording.fixture.ts`).

Proposal: one `src/lib/server/domain/testing/` (excluded from the build by name) with
`fixedClock(now)`, `sequentialIds()`, and an in-memory implementation per *read model* port
(after AR-08). Keep per-test fakes where they assert *recorded calls* — that is behaviour, not
boilerplate.

### AR-15 · No formatter or linter is wired
**Severity: medium · Effort: S**

Evidence: no `.prettierrc`, `eslint.config.*` or `biome.json` at the root; CI runs
`bun run check` and `bun run test` only (`.github/workflows/ci.yml:31-32`). docs/08 §8.2
item 18 still reads "(Prettier/ESLint to be wired in M0)". Five `eslint-disable-next-line`
comments exist for a linter that does not run (`src/lib/undo/held-answer.test.ts:58-156`).

Why it hurts: formatting *is* a review topic today (the import blocks in `services.ts` and
`load.ts` are in no order), and the architecture rules in this review (no `$app` in domain,
no `services` import below the edge, no wall clock in routes) have no mechanical guard.

Proposal: Prettier (with `prettier-plugin-svelte`, `prettier-plugin-tailwindcss`) and ESLint
flat config with `eslint-plugin-svelte` and **import boundary rules** (`no-restricted-imports`
patterns per folder). Format once in a `chore:` PR with `.git-blame-ignore-revs`. Then update
§8.2 item 18.

### AR-16 · Route edges are tested only by Playwright
**Severity: low · Effort: follows AR-01**

Evidence: 3 route-level unit tests; 90 e2e specs carry the rest. The `+page.server.ts` and
`actions/*.ts` files hold real branching (`(app)/+page.server.ts` 219 lines with a photo/
moment two-step; `settings/immich/+page.server.ts` 269; `contacts/[id]/actions/relationships.ts`
294 with a six-way outcome switch).

Proposal: once routes receive `locals.services` (AR-01) a form action becomes a function of
`(event with fakes)` and can be covered in `bun test`. Until then, keep moving branching into
colocated plain modules as `person-view.ts` does — they are testable now.

### AR-17 · Migrations carry generated names
**Severity: low · Effort: S**

Evidence: `drizzle/0000_conscious_scream.sql` … `0019_volatile_wild_pack.sql`; from `0020` on
they are named (`0020_nickname_in_shown_name.sql`). `schema.ts` is a single 737-line file for
28 tables.

Proposal: keep the history as is (renaming breaks the journal), make the naming rule explicit
in docs/08 §8.8 or a new §8.11 (`drizzle-kit generate --name`), and split `schema.ts` by
bounded context (`schema/people.ts`, `schema/circles.ts`, …) re-exported from one barrel — a
pure move Drizzle supports.

### AR-18 · docs/04 §4.3 has drifted from the tree
**Severity: low · Effort: S**

Evidence (documented but absent): `lib/stores/`, `lib/server/search/` (it is
`domain/search` + `db/search-*`), `routes/(app)/feed`, `routes/(app)/reminders`, "invite accept"
under `(auth)/`, `lib/graph` described as "cytoscape setup" (it is model + layout + adapter).
Undocumented but present: `lib/server/{api,http,i18n,immich,import,media,relationships,
release}`, `services.ts` itself (the composition root is not named anywhere in docs/04; docs/08
§8.3 still points at `src/routes/…`), and the 33 client folders (AR-10). The CLAUDE.md map and
§4.3 overlap and disagree.

Proposal: regenerate §4.3's tree from `find`, annotate, and make CLAUDE.md's map a pointer to
it (CLAUDE.md says "keep free of duplication" — this is one).

### AR-19 · Two statements of the visibility rules
**Severity: low · Effort: S**

Evidence: `access/visibility.ts` (`canViewContact`, `canViewChildRecord`, `canViewCircle`,
`canViewCirclePhoto`, …) and `access/query-scoping.ts` (`contactVisibleTo`,
`childRecordVisibleTo`, `circlePhotoVisibleTo`, …) state the same rules twice, once as TS and
once as SQL. Three repositories add inline `visibility` conditions besides
(`journal-repository.ts:52`, `stream-repository.ts:166`, `contact-merge.ts:85`).

Proposal: a parity test — for a fixed set of rows and viewers, filter in memory with
`visibility.ts` and in SQLite with `query-scoping.ts`, assert equal id sets. Cheap, and it
makes the duplication safe rather than removing it (the SQL form is needed).

Done: `access/visibility-parity.test.ts`. Of the three inline conditions only
`stream-repository.ts`'s activity-log scope was an access rule; it became the pair
`canViewActivity` / `activityVisibleTo`. The `journal-repository.ts` and `contact-merge.ts`
lines match `visibility` as part of a journal day's unique key, not as an access check.

---

## 6. Suggested sequence

Ordered so each step makes the next cheaper, and sized to the "at most two open feature PRs"
rule. Each is one Conventional-Commit `refactor:`/`chore:`/`docs:` PR unless marked as a series.

| # | Finding | Effort | Status | Why now |
|---|---|---|---|---|
| 1 | AR-15 formatter + linter + import-boundary rules | S | ☑ #259 | Makes every later move mechanically checked; one `chore:` PR, then a format-only commit |
| 2 | AR-05 stop swallowing dispatch errors; add `handleError` | S | ☑ #261 | Pure risk reduction; independent of everything |
| 3 | AR-03 `requireViewer`, `todayFor(clock)`, `messageKey` | S | ☑ #266 | Removes 150 edit sites before AR-01 moves them again |
| 4 | AR-07 glossary (docs/03 §3.0) + AR-18 regenerate §4.3 | S | ☑ #294 | Vocabulary before renames; cheapest high-leverage doc change |
| 5 | AR-04 one schema per command, `fromFormData` | M | ☑ #295 | Shrinks every form action; prerequisite for AR-13 |
| 6 | AR-01 `createServices()` + `locals.services` — **series**, one bounded context per PR, `auth` first | L | ☑ auth #296, people #298, relationships #299, circles #300, media #301, story #302, notes #304, records #305, household #306, archive #308, immich #311, release #312, offline #314 | The central change; do after 3 and 5 so routes shrink while being touched |
| 7 | AR-02 move shared actions under `routes/` taking deps | S | ☑ #315 | Falls out of 6 |
| 8 | AR-08 split read models off the three widest ports + AR-14 shared fakes — **series** | M | ☑ contacts #317, circles + tags #318, photo + media #319, relationships #320 | Do together: the fakes are what makes the split pay |
| 9 | AR-06 activity as a port; break `contacts ↔ relationships`; merge plan as data — **series** | M | ☑ activity #321, cycles #322, merge plan #323 | Needs 8's narrower ports |
| 10 | AR-11 `GraphExplorer` state → pure module; then `MomentComposer` | M ×2 | ☑ explorer #327, composer #328 | Independent of the server work; can run as the "second open PR" alongside 6–9 |
| 11 | AR-10 lib taxonomy + AR-12 components split | M | ☑ #330 | Last of the moves: after the renames the final layout is known |
| 12 | AR-09 `PartialDate`, `RelationshipPair`; AR-17 schema split; AR-19 parity test; AR-16 route tests | S–M | ☐ AR-19 ☑ #331, AR-17 ☑ #333 | Opportunistic, when the area is touched anyway |

**Guardrails to add as you go** (each a `bun test` case over the source tree, so they run in
CI without new tooling until AR-15 lands):
- no `services` import outside `src/routes/` and `src/hooks.server.ts`;
- no `$app`/`$env`/`@sveltejs/kit` import under `src/lib/server/domain`, `access`, or any
  folder the docs call *pure*;
- no `new Date(` outside `clock.ts`, tests and the two browser adapters;
- `COMMAND_TYPES` ≡ keys of the parse-schema map ≡ keys of the handler table.

---

## 7. Out of scope here, noted for later

- The e2e suite's shape (90 specs, five shards) was not reviewed; it is the project's
  regression net and should be read with a performance lens once the server work above lands.
- Security beyond authorisation structure (CSP, upload limits, token handling) deserves its
  own pass; nothing alarming was seen in the files read.
- Performance: family scale makes the N+1 patterns in some `load` functions (`allOf` over
  eighteen reads in `contacts/[id]/load.ts`) acceptable today; revisit with a read-model per
  page (AR-08) rather than caching.
