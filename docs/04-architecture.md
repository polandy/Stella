# 04 — Architecture

## 4.1 Goals & constraints

- **Lean server footprint** is a hard constraint (target < ~150 MB RAM idle for the whole
  app). Single process, single small container.
- **One codebase, one language** (TypeScript) for UI, SSR, and API.
- **Self-hosted**, offline-capable of running with no external services except an
  optional OIDC provider (Authelia).
- **Simple to operate**: one container, one SQLite file, one media directory.

## 4.2 Stack

| Concern | Choice | Why |
|---|---|---|
| Runtime | **Bun** | Low memory, fast startup, native `bun:sqlite`, built-in bundler/test. |
| Framework | **SvelteKit** (Svelte 5, runes) | Full-stack SSR + endpoints; small client bundles; great DX. |
| Adapter | `svelte-adapter-bun` | Serves the app directly on Bun. |
| DB | **SQLite** (WAL) | Zero extra process; a single file; ideal for a family's scale. |
| DB access | **Drizzle ORM** + Drizzle Kit | Tiny, typesafe, first-class SQLite + migrations. |
| SQLite driver | `bun:sqlite` | Native, synchronous, fast. |
| Validation | **Valibot** | Very small schema validation for forms and API input. |
| Styling | **Tailwind CSS** + CSS variables | Utility-first; Catppuccin tokens as CSS vars (see design doc). |
| Auth (local) | Custom sessions + **Argon2id** | No heavy dependency; full control. |
| Auth (SSO) | **OIDC** relying party (`oslo`/`arctic`-style OIDC + `jose` for JWT/JWKS) | Standard Authorization Code + PKCE against Authelia. |
| Images (avatars, M1) | **Browser canvas** | Crop/resize/thumbnail + EXIF strip client-side; server only validates & stores — no native image dep. A server-side pipeline (e.g. sharp) may return for the M2 gallery. |
| Graph | **Cytoscape.js** (lazy-loaded) | Purpose-built relationship graph; only loaded on the graph route. |
| Markdown | `markdown-it` + sanitizer | Notes rendering. |
| PWA | Vite PWA (Workbox) or hand-rolled SW | App shell + read-through cache. |

Rationale for the big decisions is recorded in §4.9 (Decision log).

## 4.3 Application structure

A conventional SvelteKit layout with a clear server/domain separation:

```
src/
  lib/
    server/
      db/            # drizzle schema, client, migrations
      auth/          # sessions, password (argon2), oidc (relying party)
      domain/        # use-cases: contacts, relationships, notes, media, feed…
      access/        # central visibility/ACL enforcement (see 3.7)
      media/         # sharp pipeline, storage paths
      search/        # FTS5 sync + query
      config.ts      # env parsing/validation (valibot)
    components/       # Svelte UI components (design system)
    stores/           # client state (theme, ui)
    graph/            # cytoscape setup, layouts, styling
  routes/
    (auth)/           # login, sso callback, invite accept, logout
    (app)/            # authenticated app shell
      contacts/…      # list, [id] profile, new
      graph/…
      feed/…
      reminders/…
      search/…
      settings/…
    api/              # +server.ts JSON endpoints (graph data, upload, search)
  hooks.server.ts     # session resolution, auth guard, security headers
  app.css             # tailwind + theme tokens
static/               # manifest, icons, offline shell
```

**Principles:**

- **Ports & Adapters.** The domain owns narrow interfaces (ports); `db/` and other
  infrastructure implement them (adapters); use-cases receive their collaborators
  (repository, `Clock`, `IdGenerator`) via an explicit `deps` argument; the SvelteKit
  edge is the only composition root that wires concretes. Pure logic takes no
  dependencies. Full convention: [`08-coding-guidelines.md` §8.3](08-coding-guidelines.md).
- All data access goes through `lib/server/domain/*`, which calls `lib/server/access`
  for every read/write. **No route or component queries the DB directly.** ACL rules
  (§3.7) live in exactly one place.
- SvelteKit **form actions** for mutations (progressive enhancement, works without JS);
  **`+server.ts`** endpoints for JSON needs (graph data, search-as-you-type, uploads).
- **Load functions** are server-side and already visibility-scoped.

## 4.4 Request & auth flow

1. `hooks.server.ts` reads the session cookie → resolves `session` + `user` (or none).
2. It attaches `locals.user` and enforces route guards (`(app)` requires a user).
3. Load functions / actions receive `locals.user` and pass it to the domain layer,
   which scopes every query by household + visibility.

### Local login
`POST` credentials → verify Argon2id → create `session` row → set cookie.

### SSO login (OIDC / Authelia)
1. `GET /login/sso` → generate `state`, `nonce`, PKCE `code_verifier`; store them in a
   short-lived signed httpOnly cookie; redirect to the provider `authorization_endpoint`
   with `scope=openid profile email groups`, `code_challenge`, `state`, `nonce`.
2. Provider authenticates the user (and enforces its own MFA) and redirects back to
   `GET /login/sso/callback?code&state`.
3. Callback verifies `state`, exchanges `code` + `code_verifier` at the `token_endpoint`,
   receives and **validates the ID token** (signature via cached JWKS, `iss`, `aud`,
   `exp`, `nonce`).
4. **Authorize:** check the `groups`/email allowlist policy. Reject unlisted users.
5. **Resolve user:** find `identity` by `(iss, sub)`; else optionally link by verified
   email; else JIT-provision a new `user`.
6. **Apply role mapping** from groups (unless `role_locked`), refresh profile if
   configured, update `identity.last_login_at`.
7. Create a Stella `session` and set the cookie. From here, requests are session-based.

Logout revokes the local session and clears its cookie first and unconditionally; only
then, if the session came from SSO, `OIDC_RP_LOGOUT` is on and the provider advertises an
`end_session_endpoint`, the browser is redirected there with the sign-in's `id_token_hint`.
Anything that goes wrong on that second half degrades to the local sign-out that already
happened — signing out never fails.

## 4.5 Configuration (environment)

Parsed and validated at startup via `config.ts`. Illustrative variables:

```
# Core
STELLA_URL=https://stella.example.home         # public base URL (for redirect URIs)
DATABASE_PATH=/data/stella.db
MEDIA_DIR=/data/media
SESSION_SECRET=…                            # signs/encrypts session + oidc temp cookies
BODY_SIZE_LIMIT=250M                        # adapter-node request cap; a restored archive must fit through it

# Auth toggles
AUTH_LOCAL_ENABLED=true                     # allow email+password
AUTH_OIDC_ENABLED=true                      # allow SSO

# OIDC / Authelia
OIDC_ISSUER=https://auth.example.home       # discovery via {issuer}/.well-known/openid-configuration
OIDC_CLIENT_ID=stella
OIDC_CLIENT_SECRET=…
OIDC_REDIRECT_URI=${STELLA_URL}/login/sso/callback
OIDC_SCOPES=openid profile email groups
OIDC_PROVIDER_NAME=authelia

# OIDC authorization & mapping
OIDC_ALLOWED_GROUPS=stella-users             # comma list; empty = allow any authenticated
OIDC_ADMIN_GROUPS=stella-admins              # groups mapped to the admin role
OIDC_ALLOWED_EMAILS=                        # optional explicit allowlist
OIDC_JIT_PROVISION=true                     # auto-create users on first login
OIDC_LINK_BY_EMAIL=true                     # link to existing local user by verified email (first login only)
OIDC_SYNC_ROLES=true                        # re-apply group→role mapping each login
OIDC_SYNC_PROFILE=true                      # refresh name/email each login
OIDC_RP_LOGOUT=true                         # also end the provider session on logout
```

Notes:
- If both auth methods are disabled, startup fails loudly.
- Uploaded Monica dumps wait in `<dirname DATABASE_PATH>/import/` between the wizard's
  preview and confirm steps (docs/02 §2.16); there is no separate variable for it.
- A documented **break-glass** path: create/keep one local admin with `role_locked=1`
  so IdP misconfiguration can't lock out the household.

### Authelia side (documented, not shipped)
The docs will include a ready-to-paste Authelia OIDC client snippet: a confidential
client with `authorization_code` grant, PKCE required, the redirect URI above, and the
`stella-users` / `stella-admins` groups. Kept in `docs/` deployment guide, not in code.

## 4.6 Data & media storage

- **DB:** single SQLite file at `DATABASE_PATH` on a persistent volume; WAL mode,
  `foreign_keys=ON`, busy_timeout set. Migrations run on startup (Drizzle Kit).
- **Media:** originals + generated thumbnails under `MEDIA_DIR`, addressed by id; served
  through an authenticated route that re-checks photo visibility (no direct static
  exposure of private media).
- **Backups:** `sqlite3 .backup` / WAL-checkpoint-safe copy of the DB plus an rsync of
  the media dir; an admin "Download backup" produces a single archive.

## 4.7 Security

- httpOnly, SameSite=Lax cookies. The Secure attribute is set only when `STELLA_URL` uses
  `https://` — over plain HTTP to a non-localhost host (e.g. a LAN IP) browsers silently drop
  Secure cookies, which would make login appear to fail. Deploy behind HTTPS for Secure cookies.
- CSRF protection on form actions (SvelteKit origin checks + token); strict security headers
  (CSP, HSTS, X-Content-Type-Options, Referrer-Policy) set in `hooks.server.ts`.
- Argon2id for local passwords; OIDC secrets and session secret from env only.
- Rate limiting on auth endpoints; login/SSO audit entries.
- Media EXIF (incl. GPS) stripped on ingest by default.
- Central ACL layer (§3.7) is the only place authorizing record access.
- No third-party analytics, no outbound calls except to the configured OIDC provider.

## 4.8 Performance & footprint

- One Bun process; SQLite in-process; sharp for image work.
- Cytoscape and Markdown libs are **route-lazy** to keep the base bundle small.
- SSR + minimal client JS (Svelte compiles away). Islands of interactivity only where
  needed (graph, search, forms).
- Expected idle memory dominated by the Bun runtime; target well under 150 MB.

## 4.9 Decision log (ADR-lite)

- **SQLite over Postgres** — family scale, WAL gives concurrent reads; single file
  backups; no second process. Drizzle keeps a Postgres migration path open if ever
  needed. (See vision §1.2.6.)
- **Bun over Node** — lower memory and faster startup for the same code; native SQLite.
  Node remains a fallback (SvelteKit is runtime-portable) if a dependency forces it.
- **SvelteKit over Next.js** — smaller client + server footprint, simpler mental model,
  SSR-first.
- **Custom sessions over an auth framework** — Lucia is sunsetting; our needs (sessions
  + one OIDC RP) are small and better owned directly with `jose`/`oslo` primitives.
- **OIDC-standard SSO, provider-agnostic** — targets Authelia but avoids provider lock-in.
- **A hand-rolled vCard reader over a package** — the subset a contacts export uses is small
  and frozen (RFC 6350 / RFC 2426): unfolding, escaping, structured values. Every published
  parser weighs far more than the two dozen lines that saves, against the minimal-deps rule
  (§8.8). Revisit if calendar or full-round-trip vCard support is ever wanted.
- **The ID token is kept on the session row, not in a cookie** — RP-initiated logout needs
  an `id_token_hint`, so the token has to survive from sign-in to sign-out. The alternative
  (a second httpOnly cookie) would put a JWT carrying the user's email and groups on every
  request to every route, and would go stale independently of the session it belongs to.
  On the session row it is deleted by the same statement that ends the session, and shares
  the database's blast radius rather than widening it.
- **Cytoscape.js for the graph** — mature, purpose-built; lazy-loaded to protect the
  bundle. D3-force considered as a lighter alt if bundle size demands it.
- **Explorer lines are deepened for the canvas, not re-picked** — in Latte only five of the
  fourteen accents clear 3:1 on the page ground, and none of the four category hues do. The
  alternative (swapping the categories to the five that pass) would have moved family to
  teal and romantic to maroon everywhere — chips, dots, the timeline — to fix a problem only
  the canvas has. Instead `resolvePalette` blends each line toward `--fg` until it clears
  3:1; the hue is kept, and a test holds every line to the floor in both themes.
- **"Quiet lately" measures recorded attention, not contact** — the band lists people with
  no journal entry or touchpoint in 90 days, counting an untouched person from the day they
  were added, and puts a story that went silent before one that never began. The
  alternative (a `last_contacted_at` column maintained on write) was rejected: it would be
  the second copy of a fact the story already holds, and would drift on every delete. The
  cost is three grouped reads per Home load, which at household scale is nothing.
- **The palette's people ride with the app shell** — `(app)/+layout.server.ts` loads every
  person the viewer may see on each navigation so ⌘K answers on the first keystroke. A
  fetch-on-open would spare that read on pages that never open the palette, at the price of
  a visible wait in the one place the shortcut has to feel instant; a household has a few
  hundred people at most, so the read is cheap and the wait is not.
- **Birthdays derived, not duplicated** — a birthday is read off `contact.birth_date` rather
  than written as an `important_date` row, so the two can never disagree. The cost is that
  "a person's dates" is assembled from two sources at read time; the alternative (a row per
  birthday, kept in sync on every profile edit) was rejected after the demo seed did exactly
  that and silently shadowed every birthday. An explicit `birthday` row **overrides** the
  derived one, which is the single mechanism behind correcting and muting a birthday.
  (docs/02 §2.13.2.)
- **No reminder objects and no reminders screen** — `important_date.remind` is a flag on the
  date itself, and what is due appears at the top of the Home stream. Rejected: a separate
  reminder entity with its own schedule (Monica's model), which doubles the things a user
  creates and maintains for no gain at family scale. Revisit if per-date lead times or email
  delivery (M3) turn the flag into something with real structure.
- **Monica import writes stable source ids, not ULIDs** — every imported row's id is
  `monica:<table>:<id>`, so the import is idempotent by construction (insert-or-ignore) and a
  re-run reports zero writes instead of duplicating; the cost is a second id shape in the
  tables, which nothing else depends on, and an assumption of one household per deployment
  that multi-tenancy would have to lift (docs/02 §2.16, docs/monica-mapping.md).
- **Imported photos travel through the browser, not a server path** — the wizard's folder
  picker reads Monica's photo directory on the admin's machine and downscales each file with
  the same canvas pipeline as avatars and journal photos. Rejected: a server-side
  `MONICA_STORAGE_DIR` (reads arbitrary paths from a web form; needs the volume mounted into
  Stella) and a server-side resizer (a native image dependency, which docs/04 §4.6 avoids).

- **The story is merged at read time, not stored** — a person's journal entries and touchpoints
  stay two tables and are merged into one timeline per request (docs/02 §2.23). Rejected: a
  third table holding a unified timeline, which would have to be kept in step on every write
  and would duplicate the visibility rules the two sources already enforce; and a SQL `UNION`
  view, which cannot be keyset-paginated across two different sort keys without materialising
  it. The cost is that each page reads a page from *both* sources even when one of them fills
  it alone, and that each carries its own resume point — a source can contribute nothing to a
  page and still have rows waiting, so "read me from the top" and "I am finished" have to be
  distinguishable. The merge is pure and owns those rules, which is what keeps them testable.
- **Undo is a removal held back in the browser, not a soft delete** — a removed story item
  is hidden and its form is posted only when the eight-second toast closes or the page is
  left (`src/lib/undo`, a pure store with the timer injected; the app shell flushes it on
  navigation and `pagehide`, with `keepalive`). Rejected: a `deleted_at` column on the two
  story tables, which would have put a filter into every read that touches them — story,
  stream, search, "quiet lately", photos — with a leak whenever one is forgotten, a purge to
  write, and the journal's one-entry-per-day slot blocked by a row that is invisible but
  still there; and re-creating the row from a snapshot on undo, which for a journal entry
  means its mentions and photo files too. The cost is that the removal is lost if the tab
  dies inside the window — the item is then simply still there, which is the safe failure.
  One removal button (`RemoveButton.svelte`) carries the rule to every list, and the saving
  forms beside it are enhanced (`savedEnhance`) rather than reloading the page — a reload
  would end the undo window of anything still on its way out. Enhancing them moves the
  "close the form after saving" that the reload used to do into the page, which is why each
  section binds its open state.

- **Authors are named from a per-request member lookup, not a join** — the story reads one
  list of the household's members (`domain/household`, `authorNames`) and turns each item's
  `created_by` into a name in the view layer. The alternative, joining `user` into both story
  queries, would put a presentation concern into the two keyset-paginated reads that the
  merge's cursor rules depend on, and repeat the name on every row. A household has a handful
  of members, so the lookup is one small query per page.

- **A connection path travels stored links only** — derived kinship reaches the explorer as
  its own edge kind, but the path finder searches the model with derived edges removed
  (`withoutDerivedLinks`). A derived edge is a *name for a chain that already exists*:
  letting BFS hop it would answer "how do we know each other?" with "Cousin" instead of the
  route through the shared grandparent, and the shorter the answer the less it explains. The
  cost is that a path can be longer than the drawn graph suggests; the drawn line is still
  there, and selecting it names the relationship.

- **A merge settles its collisions with `UPDATE OR IGNORE`, not with a plan** — every table
  pointing at `contact` is repointed at the survivor in one transaction, and where a key says
  the survivor already has that row, the colliding row is simply left behind and dies with the
  record being merged away. Computing the collisions up front would mean re-deriving four
  primary keys and two unique indexes in TypeScript and keeping that copy in step with the
  schema; the database already knows them. The cost is that the rule lives in SQL and is only
  legible through its integration test, which is why that spec names every constraint it
  settles. Three cases genuinely need more — the link between the two records, the journal
  day-slot and circle membership — and are written out.

- **Only deletions and merges are logged** — the stream is a query over the tables that still exist, so
  nothing is written twice and no event table has to be kept in step. A deletion — and a merge,
  which ends a record the same way — is the one thing that leaves nothing to query.
  So `activity_log` is written for exactly those two actions, in the same transaction as the
  change, with the summary precomputed because the record it names cannot be read back and
  the visibility copied from it so the log leaks nothing. Logging creates and updates too
  would duplicate what the tables already say and put the two out of step; that is the cost
  of the asymmetry, and it is the cheaper side.

- **Archiving hides from browsing, not from the graph** — `archived_at` could have been
  folded into `contactVisibleTo`, one line in the one place every read already goes through.
  It is a separate condition (`contactBrowsableBy`) applied at six listing surfaces instead,
  because the kinship engine infers *through* people: archive the grandmother and her two
  children no longer share a visible parent, so Stella would stop calling them siblings —
  not saying less, but saying something untrue. The cost is that a new listing read has to
  remember which of the two conditions it wants — resolving an @-mention wants visibility,
  listing people to pick from wants browsing — and the two are pinned against each other in
  `query-scoping.test.ts` so the distinction cannot quietly erode.

- **A custom relationship type's key is derived, and the kinship keys are reserved** — the
  household types a label; `relationshipTypeKey` slugs it. Letting a key be typed would let a
  household mint `parent_child`, `sibling`, `partner` or `spouse`, which `kinship-graph-read`
  switches on to feed the inference engine — a type named for convenience would then invent
  grandparents and in-laws nobody entered. Rejecting those four keys outright is cheaper than
  making the inference defend itself, and the built-in set stays read-only so the other end of
  the same coupling cannot be pulled either. The cost is that two types can never share a
  label; the message says so.

- **Kinship edges are derived per viewer at read time, not stored** — `loadVisibleGraph`
  infers them from the same visibility-scoped snapshot the person page uses
  (`kinship-graph-read.ts`, shared by both repositories so the two can never disagree).
  Storing them would mean invalidating on every relationship, birth and visibility change,
  and would let a stale row outlive the link it came from. Inference re-runs per subject,
  which is quadratic in principle but reads a household-sized graph in a single pass.
- **A note's search index is built by triggers, not by the repository** — storing mentions as
  ids means the indexed text has to be assembled from two tables, which the existing SQL
  triggers can do with a sub-select. Maintaining `note_fts` from the note repository instead
  would have allowed a proper regex strip of the token, but notes are also written by the
  Monica importer and the demo seed straight through Drizzle; those rows would have gone
  unindexed. The cost is that SQLite has no regex, so the strip is two `replace` calls and the
  opaque id survives in the index as a word nobody searches for.
- **The export archive is a tar of one YAML file plus the images** — the household's data has
  to leave in a shape another program can read and a person can still open in ten years, which
  rules out both a byte-for-byte SQLite copy and a per-table JSON dump. YAML because it reads as
  text; `Bun.YAML` because it is already in the runtime; a hand-written ustar writer
  (`src/lib/archive/tar.ts`, ~60 lines) because tar is one 512-byte header per file and a
  dependency for that is not worth it. The cost is a format we emit ourselves, paid for by a
  test that hands the bytes to the system's own `tar`.
- **The export reads outside the access layer, on purpose** — every other read in Stella is
  scoped by `contactVisibleTo` and friends. An export is not a viewer looking at records; it is
  the household taking its own data out, and an archive missing a member's private journal is
  not a backup. The authorisation moves instead of disappearing: the route requires an admin,
  the repository scopes by household, and the export writes itself into `activity_log` so the
  household can see it happened. Rejected: exporting only shared rows, which would have made
  the word "backup" untrue everywhere it appears.
- **People are identified in the archive by id, never by name** — two people can share a first
  and last name, and a document that joins on names silently fuses them. Every person carries
  their id and every relationship, mention, participant and membership refers to it.
- **An import adds and never overwrites** — the alternatives were replacing a record the archive
  also has, or asking the admin field by field. Replacing loses whatever was written since the
  export and makes an import unrepeatable; asking turns a restore into a merge tool nobody asked
  for. Adding only means the id is enough to recognise a record, importing twice is a no-op, and
  a failed import can simply be run again. The cost is that an archive cannot be used to *undo*
  edits: for that, restore the SQLite snapshot (`docs/07` §7.9).
- **The restore is one step, not a wizard** — the Monica import previews first because it maps a
  foreign model onto ours and the admin has to agree with the mapping. A restore writes records
  that are already the household's, in our own format, and cannot overwrite anything; a preview
  would ask them to approve their own data. The report afterwards carries the same information
  the preview would have, and it is a report of what actually happened.
- **Restored rows are written as columns and values, not through the ORM** — the plan comes out
  of the document as table-and-row, mirroring how the export reads it, so one mapping layer is
  gone rather than duplicated in reverse. Nothing in the SQL comes from the uploaded file: table
  names are held against the export's own list, column names against `PRAGMA table_info`, and
  every value is bound. An archive whose ids already belong to another household on this server
  is refused before anything is written, because those rows would otherwise hang off somebody
  else's records.
- **The passive list reads both sources and merges them, rather than one query over a union** —
  notes and journal entries are separate tables with separate visibility joins, and a `UNION`
  would put the ordering rule in SQL where no unit test reaches it. Two scoped reads plus a pure
  merge (the cut the story timeline already uses) keeps "newest first, an entry about you is not
  a reference to you" testable without a database. The cost is two round-trips instead of one,
  which at family scale is nothing, and no paging: the list is read whole, because a household
  that has been named in more entries than fit on a page does not exist yet.
- **Both Monica exports are read into one typed view, not two mappings** — the SQL dump and the
  JSON export carry the same household in different shapes, and the mapping (`plan.ts`) is the
  part with judgement in it: which relationship type is which, what becomes a note, what is left
  out. A second mapping would have to keep every one of those decisions in step. So each format
  gets only a reader, both producing `MonicaExport`, and the mapping never learns which file it
  came from. The cost is a lowest common denominator: a Monica id widens to `string | number`
  because one format counts and the other uuids, and the view carries a `source` so the mapping
  can report what a format could not give.

## 4.10 Deployment

- **Single Docker image** (multi-stage: build with Bun, run on a slim Bun base).
- **`docker-compose.yml`** mounts a `/data` volume (DB + media), sets env, exposes one
  HTTP port; intended to sit behind the user's existing reverse proxy (which also
  fronts Authelia).
- Health check endpoint; migrations auto-run on boot; readable structured logs.
- See the deployment guide (to be added under `docs/`) for the full compose file and the
  Authelia client configuration.

## 4.11 Relationship & context explorer (core feature) architecture

The explorer ([`02-features.md` §2.7](02-features.md)) is a signature feature and, by
explicit requirement, must be **maintainable, extensible, and readable**. We achieve that
by splitting it strictly along Ports & Adapters (§4.3, `docs/08` §8.3), so the graph
*logic* is pure and unit-tested while the *rendering* library stays replaceable.

Three layers, one direction of dependency (domain ← adapters ← UI):

1. **Graph domain (pure, framework- and library-agnostic)** — `lib/server/domain/graph`
   (or a shared `lib/graph/model` for isomorphic use):
   - A neutral **`GraphModel`** value type: `nodes` (people, circles) and typed `edges`
     (relationship / membership / derived-kinship), each with the minimal data the view
     needs — **no Cytoscape types leak in here**.
   - Pure builders/operations, each independently testable:
     `buildEgoNetwork(centerId, depth)`, `expandNode(model, contactId)`,
     `findConnectionPath(fromId, toId)` (BFS over relationships + circle co-membership),
     `applyFilters(model, filters)`.
   - Data arrives through a **port** — a `GraphDataSource` interface ("give me the visible
     neighbourhood of node X"). The builders never touch the DB or the network directly.
   - **The builders run in the browser.** The server does one bulk, access-scoped read
     (`GraphRepository.loadVisibleGraph`, §3.7) and ships a slim `GraphModel` snapshot of the
     whole *visible* graph to the client; the client wraps it in an **in-memory
     `GraphDataSource`** and runs `buildEgoNetwork` / `expandNode` / `findConnectionPath`
     locally — no per-interaction requests. The same pure code also runs server-side over
     any source; only the source implementation differs (in-memory in the browser). This
     deliberately pushes load to the client and fits family scale.
   - Derived kinship (§2.4.1) is computed by the same engine the person page uses and merged
     as its own edge kind: `deriveKinshipEdges` folds each person's inferred relatives into
     one edge per pair, which the bulk read appends to the snapshot. Nothing else in the
     node/edge handling changed. `withoutDerivedLinks` is the projection path finding
     searches (§4.9).

2. **Rendering adapter** — `lib/graph/cytoscape`:
   - Translates a `GraphModel` into Cytoscape elements, styles them from the **semantic
     theme tokens** (light/dark), and wires layouts. Cytoscape is confined to this module
     and **lazy-loaded** only on the explorer route.
   - Interaction handlers (expand, focus, hover) call back into the pure operations and
     re-render from the returned `GraphModel` — the adapter holds no domain rules.
   - Swapping Cytoscape for another renderer (or adding a layout) touches only this layer.

3. **UI** — the explorer Svelte component + the `/graph` route and the profile's "Explore"
   entry: layout, search box, filter chips, peek panel, path picker. Thin; delegates all
   logic to layers 1–2.

**Why this is extensible & readable:** new edge kinds (e.g. a future "met at event") or new
operations (e.g. "highlight all within 2 hops") are added as pure functions with their own
tests, without disturbing rendering; the renderer can change without risking the logic; and
each piece is small and named for intent. **Test-first targets:** `buildEgoNetwork`,
`expandNode`, `findConnectionPath`, `applyFilters` — pure, deterministic, no DB.

## 4.12 Background jobs & delivery (M3)

The change digests (`02-features.md` §2.11.1) need periodic work, kept as lean as the rest:

- **Scheduler:** a single in-process interval timer started at server boot (no external cron
  or job queue). On each tick it finds members whose `next_digest_at` is due and processes
  them. State (`last_digest_at` / `next_digest_at`) lives in `notification_preference`, so a
  restart resumes correctly and a crash/retry never double-sends a window (idempotent).
- **Digest assembly is pure & test-first:** given a member, a time window, and the visible
  activity, a pure function produces the digest payload — unit-tested without I/O. Delivery
  is the edge.
- **Delivery adapters (ports):** an `EmailSender` (SMTP via env config — the only new
  infra) and a `WebhookSender` (HTTP POST with an HMAC signature header, a few retries).
  Both behind ports so the assembly logic stays framework-agnostic and the channels are
  independently testable/fakeable.
- **Config:** SMTP host/credentials and a default from-address via environment; email and
  webhook are each opt-in per member. No delivery infrastructure runs unless a member has a
  non-`none` frequency and at least one channel enabled.
