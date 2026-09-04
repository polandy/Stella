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

Logout clears the local session; if the provider advertises `end_session_endpoint` and
RP-logout is enabled, redirect there too **[M2]**.

## 4.5 Configuration (environment)

Parsed and validated at startup via `config.ts`. Illustrative variables:

```
# Core
STELLA_URL=https://stella.example.home         # public base URL (for redirect URIs)
DATABASE_PATH=/data/stella.db
MEDIA_DIR=/data/media
SESSION_SECRET=…                            # signs/encrypts session + oidc temp cookies

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
OIDC_RP_LOGOUT=true                         # use end_session_endpoint on logout [M2]
```

Notes:
- If both auth methods are disabled, startup fails loudly.
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
- **Cytoscape.js for the graph** — mature, purpose-built; lazy-loaded to protect the
  bundle. D3-force considered as a lighter alt if bundle size demands it.
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

- **The story is merged at read time, not stored** — a person's journal entries and touchpoints
  stay two tables and are merged into one timeline per request (docs/02 §2.23). Rejected: a
  third table holding a unified timeline, which would have to be kept in step on every write
  and would duplicate the visibility rules the two sources already enforce; and a SQL `UNION`
  view, which cannot be keyset-paginated across two different sort keys without materialising
  it. The cost is that each page reads a page from *both* sources even when one of them fills
  it alone, and that each carries its own resume point — a source can contribute nothing to a
  page and still have rows waiting, so "read me from the top" and "I am finished" have to be
  distinguishable. The merge is pure and owns those rules, which is what keeps them testable.

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
   - Derived kinship (§2.4.1) is computed by the same engine and merged as its own edge
     kind — added without changing existing node/edge handling.

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
