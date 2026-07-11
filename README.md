# Stella

> A calm, self-hosted personal CRM for families.
> Working product title: **Stella** — *stella*, Latin for "star": every person is a star,
> and their relationships form constellations. Repository codename: `ross`.

Stella helps a family keep track of the people in their lives — existing contacts and
new acquaintances alike — in one shared, private place. Add people, describe how they
relate to each other, write notes, attach photos, and see the whole web of
relationships at a glance. Everything a family member adds is visible to the rest of
the household (unless explicitly marked private), so everyone stays in the loop.

It is a lighter, more focused, and more intuitive alternative to
[Monica](https://github.com/monicahq/monica).

## Why another personal CRM?

Monica is powerful but, in our experience, cluttered and not especially pleasant to
use day to day. Stella optimizes for a different set of goals:

- **Family-first, not individual-first** — a shared household pool is the default,
  with per-record privacy when you want it.
- **Intuitive & uncluttered UI** — a small number of well-designed screens instead of
  many sparsely-used features.
- **Relationship visualization** — see people and how they connect as an interactive graph.
- **Lean to self-host** — a single small container, an SQLite file, minimal RAM.
- **Beautiful in light and dark** — a Catppuccin-inspired design system.

## Tech stack (at a glance)

| Layer | Choice |
|---|---|
| Runtime | **Bun** |
| Framework | **SvelteKit** (Svelte 5), SSR + form actions + JSON endpoints |
| Database | **SQLite** (WAL mode) via **Drizzle ORM** (`bun:sqlite`) |
| Styling | **Tailwind CSS** with Catppuccin design tokens (Latte / Mocha) |
| Auth | Custom session-based auth (httpOnly cookies, Argon2id hashing) + OIDC/Authelia SSO |
| Graph | Cytoscape.js (relationship visualization) |
| Delivery | Responsive web + installable **PWA** |
| Hosting | **Self-hosted**, single **Docker** image + volume |

See [`docs/04-architecture.md`](docs/04-architecture.md) for the full rationale.

## Specification suite

The project is fully specified before implementation. Read in order:

1. [Vision & Scope](docs/01-vision-and-scope.md) — what we are building and, importantly, what we are not.
2. [Feature Specification](docs/02-features.md) — every feature, described in behavioral detail.
3. [Data Model](docs/03-data-model.md) — entities, fields, relationships, and the privacy model.
4. [Architecture](docs/04-architecture.md) — stack, structure, deployment, and key decisions.
5. [UI & Design System](docs/05-ui-design-system.md) — Catppuccin theming, layout, and interaction patterns.
6. [Roadmap](docs/06-roadmap.md) — milestones from MVP to full release.
7. [Deployment Guide](docs/07-deployment.md) — Docker, reverse proxy, and Authelia SSO setup.

## Development

Requires **Bun** (≥ 1.3). On NixOS: `nix profile add nixpkgs#bun`.

```sh
bun install          # install dependencies
bun run dev          # start the dev server (http://localhost:5173)
bun run build        # production build
bun run preview      # preview the production build
bun run db:push      # apply the Drizzle schema to the local SQLite db
bun run db:studio    # open Drizzle Studio
```

Environment: copy `.env.example` to `.env` and adjust. See the
[Deployment Guide](docs/07-deployment.md) for the full list and Authelia SSO setup.

## Status

🚧 **Milestone M0 — Foundations** (walking skeleton). The specification suite above is
the source of truth; the application is being scaffolded.
