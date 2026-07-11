# Stella (repo: ross)

Self-hosted, family **personal CRM** — a lean, intuitive alternative to Monica.
The `docs/` suite is the **source of truth**; this file is only a router — keep it short.

> Efficiency contract: open **only** the doc/source file your task touches (map below).
> Don't re-read the whole tree. Keep CLAUDE.md and docs free of duplication.

## Golden rules — full text: `docs/08-coding-guidelines.md` (read once, then follow)

- **Test-first**: failing test → minimal impl → refactor. Run `bun test`.
- **Framework-agnostic domain**: business logic in `src/lib/server/{domain,access}`,
  plain TS, no SvelteKit/`$env`/`$app` imports. SvelteKit only at the edges (routes/hooks).
- **Ports & Adapters + DI**: domain owns narrow interfaces (ports); use-cases take a
  `deps` arg (repository / `clock` / `idGenerator`) — never a singleton or concrete DB.
  Pure logic takes no deps. Only the SvelteKit edge wires concretes. (`docs/08` §8.3)
- **Minimal exposure & minimal deps**: export as little as possible; prefer Bun/Web APIs.
- **Strict TS (no `any`), fail loud, descriptive names, comments explain _why_.**

## Commands

```
bun run dev        # dev server (http://localhost:5173)
bun test           # unit tests (Bun's built-in runner)
bun run check      # svelte-check + types
bun run build      # production build   |  bun run start  → bun ./build/index.js
bun run db:generate | db:migrate | db:push | db:studio
```

## Stack — full: `docs/04-architecture.md`

Bun · SvelteKit (Svelte 5, runes) · SQLite WAL + Drizzle (`bun:sqlite`) · Tailwind v4 +
Catppuccin tokens · `adapter-node` run under Bun · `Bun.password` (Argon2id) · OIDC/Authelia SSO.

## Code map — touch only what you need

| Path | Responsibility |
|---|---|
| `src/lib/server/config.ts` | env parsing/validation (Valibot) — the only `$env` reader |
| `src/lib/server/db/schema.ts` | Drizzle schema (impl of `docs/03`) |
| `src/lib/server/db/index.ts` | `bun:sqlite` client + pragmas |
| `src/lib/server/access/` | **central** ACL / visibility (`docs/03` §3.7) — the *only* authz path |
| `src/lib/server/domain/` | use-cases (contacts, relationships, notes, feed…) — test-first |
| `src/lib/server/auth/` | sessions, password, OIDC relying-party |
| `src/lib/graph/model/` | **pure** graph domain: `GraphModel`, `buildEgoNetwork`, `expandNode`, `findConnectionPath`, `applyFilters` (test-first) |
| `src/lib/graph/cytoscape/` | rendering adapter (Cytoscape confined here, lazy-loaded); no domain logic |
| `src/routes/` | thin edges: `load` / form actions / `+server.ts` |
| `src/lib/components/` | UI components (design system) |
| `src/app.css` | Catppuccin semantic tokens (Latte/Mocha) |

## Docs index — open the single relevant one

`01` vision · `02` features · `03` data-model · `04` architecture ·
`05` ui-design-system · `06` roadmap · `07` deployment · `08` coding-guidelines

## Non-negotiables

- UI uses **semantic tokens** (`--fg`, `--bg`, `--primary`, …), never raw `--ctp-*` or hex.
- All data access flows through `src/lib/server/access/`; never query the DB from routes/components.
- When you change the model or a behavior, update the matching `docs/` file in the same change.
- **Dependencies are exact-pinned** (no `^`/`~`); `bun add` saves exact; commit `bun.lock`;
  CI/Docker install `--frozen-lockfile`. (`docs/08` §8.8)
- **Conventional Commits** (`feat`/`fix`/`docs`/…); releases are automated by release-please
  from the commit history — pick the type by user-facing impact. (`docs/08` §8.9)
