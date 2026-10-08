# Stella (repo: ross)

Self-hosted, family **personal CRM** — a lean, intuitive alternative to Monica. The `docs/`
suite is the **source of truth**; this file only routes, and every coding agent shares it
(`GEMINI.md` imports it — don't fork the rules per tool).

> Open **only** the doc/source file your task touches. `02`, `04` and `05` are split one file
> per section: open the index (e.g. `docs/02-features.md`), find the `§`, open that file.
> A concept under `docs/concepts/` whose status says *built* is history — read the feature
> doc instead. Keep this file and the docs free of duplication.

## Golden rules — full text `docs/08-coding-guidelines.md`, read once

- **Test-first**, `bun run test`; no test may race — no sleeps, no wall clock (§8.4, §8.4.2).
- **Delivery loop**: implement + tests → owner verifies → **on their OK** the e2e (§8.4.1).
- **Framework-agnostic domain**: `src/lib/server/{domain,access}` is plain TS, no `$env`/`$app` (§8.1).
- **Ports & Adapters + DI**: use-cases take `deps`, never a singleton; pure logic takes none (§8.3).
- **Working agreement**: worktree beside the checkout → PR with UI + docs → `/pr-review` → wait
  for the go-ahead; at most two feature PRs open; English throughout (§8.10).
- **Minimal exposure and deps, strict TS (no `any`), fail loud, names say what, comments say why** (§8.1–8.2).

## Commands

`bun run test` (unit: `bun test src`) · `bun run test:e2e` (Playwright — CI runs it, agents
don't) · `scripts/ci-failures.sh <PR>` (only the failures of a red run). The rest is in `package.json`.

## Stack — `docs/04-architecture.md`

Bun · SvelteKit (Svelte 5, runes) · SQLite WAL + Drizzle · Tailwind v4 + Catppuccin tokens ·
`adapter-node` under Bun · Argon2id passwords · OIDC/Authelia SSO.

## Code map — one clause per folder group; the full tree is `docs/04` §4.3, the words `docs/03` §3.0

| Path | Responsibility |
|---|---|
| `src/lib/server/services/` | the composition root — the only module wiring adapters into `deps`; builds `AppServices` once per process, handed to routes as `locals.services`; only routes and hooks import it by value |
| `src/lib/server/config.ts` | env parsing (Valibot) — the only `$env` reader |
| `src/lib/server/db/` | Drizzle schema in `schema/`, one file per context (`docs/03`), `bun:sqlite` client, one adapter per port |
| `src/lib/server/access/` | **central** ACL / visibility (`docs/03` §3.7) — the *only* authz path |
| `src/lib/server/domain/` | use-cases, test-first; `commands/` applies a command once |
| `src/lib/server/{auth,immich,commands,…}/` | infrastructure and edge helpers: sessions + OIDC, the Immich gateway, the command wire edge, media store, HTTP helpers |
| `src/lib/{commands,people,gifts,immich,kinship,motion,pwa,stream,suggestions,surnames,sync,ui}/` | **pure** decisions, test-first; a `*.svelte.ts` beside one is its browser adapter |
| `src/lib/graph/` | pure `model/`, `layout/`, `keyboard.ts`, `phone-map.ts`; `cytoscape/` renders, no logic |
| `src/routes/` | thin edges: `load` / form actions / `+server.ts`; big pages colocate `load.ts` + `actions/` |
| `src/lib/{relationships,circles,story,mentions,dates,media,undo,archive}/` | client-safe helpers per concept, not lint-guarded as pure |
| `src/lib/components/` | `ui/` the design system, `<feature>/` the rest (`docs/05` §5.7) |
| `src/lib/i18n/` | languages, catalogues `en` + `de`, translator — **all UI copy** (`docs/02` §2.19) |
| `src/lib/design/tokens.ts`, `src/app.css` | the token table and its three layers — the only places that build a colour token |

## Docs index — open the single relevant one

`01` vision · `02` features · `03` data-model · `04` architecture · `05` ui-design-system ·
`06` roadmap · `07` deployment · `08` coding-guidelines. A screen's rules (`05` §5.5) live one
file per screen in `docs/design/screens/` — *Intent*, *Rules*, *Why*. User docs `install.md` and
`using-stella.md` stay in sync with behaviour.

## Non-negotiables

- **English and German both complete.** No user-visible string in a component or route:
  `t()` from `useI18n()`, `say(locals, …)`, domain errors carry a `Phrase` (`docs/08` §8.7).
- **Semantic tokens** (`--fg`, `--primary`, `--accent-*`, …), never `--ctp-*` or hex; icons
  from `Icon.svelte`, no emoji (`docs/05` §5.2.2, §5.9).
- All data access flows through `src/lib/server/access/`; never query the DB from routes or components.
- A model or behaviour change updates the matching `docs/` file in the same change.
- **Exact-pinned dependencies**, `bun.lock` committed, installs `--frozen-lockfile` (§8.8);
  **Conventional Commits**, releases by release-please (§8.9).
