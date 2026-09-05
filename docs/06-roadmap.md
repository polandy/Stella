# 06 — Roadmap

Milestones are outcome-based, not date-based. Each ships something usable. Feature tags
(**[M1]/[M2]/[M3]**) in [02-features.md](02-features.md) map to these phases.

## M0 — Foundations (walking skeleton)

Goal: an empty but real app you can log into and deploy.

- Repo scaffolding: SvelteKit + Bun + TypeScript, Tailwind with Catppuccin tokens,
  light/dark theming end-to-end.
- Drizzle + SQLite wired up; migration workflow; seed of built-in relationship types.
- App shell (sidebar/tab bar), design-system primitives (buttons, inputs, card, avatar).
- **Auth foundations:** local email/password (Argon2id) **and** OIDC/Authelia SSO
  (auth-code + PKCE, JWKS validation, JIT provisioning, group→role, allowlist).
  First-run admin setup; sessions; route guards; central ACL layer skeleton.
- Dockerfile + docker-compose + `/data` volume; health check; docs stub for Authelia
  client config.

**Exit:** deployable container; a family member can sign in via Authelia and see an
empty home.

## M1 — MVP: capture & look up people

Goal: the core loop — add people, relate them, find them — works and feels good.

- **Contacts:** quick-add, full profile, edit, avatar upload (sharp pipeline, EXIF
  strip). Contact fields (phone/email/address/url/social/custom).
- **Relationships:** create with built-in types, directional/reciprocal display,
  guardrails; relationships section on profile.
- **Notes:** Markdown, pin, per-note visibility.
- **Privacy:** shared/private on contacts and notes enforced centrally (§3.7).
- **Search:** FTS5 across contacts + notes with the ⌘K palette.
- **Tags:** create, apply, filter.
- **Explorer (basic):** ego-network from a profile — a person with their relationships,
  theme-aware, built on the pure graph-model + Cytoscape-adapter split (docs/04 §4.11).
- **PWA-ready** shell (installable manifest/icons; offline shell can slip to M2).

**Exit:** a non-technical family member can add a person with a photo and a relationship
from their phone in under a minute, and anyone can look them up.

## M2 — Core: keep in the loop & richer relationships

Goal: the family "gets it" — shared awareness, history, and visualization.

- **Moments & household stream** (§2.22): one-sentence capture on Home with @-mentions,
  inline person creation and a post-save "link these two?" hint; Home becomes the
  visibility-scoped household stream (moments, new people, new relationships).
- **Activity feed** ("What's new") with visibility filtering — filters and notable edits on
  top of the stream.
- **Personal dashboard (Home):** the stream plus a rail with "Coming up" and "Quiet lately"
  (§2.12); further panels (gifts given) as their base features land.
- **Interactions timeline** + "last contacted", read as one **story timeline** per person
  together with the journal (§2.23).
- **Name-based suggestions:** duplicate/relative candidates on contact entry (pure ranker)
  — shipped in *Add a person* (§2.2.1).
- **Relationship intelligence:** derived kinship (grandparent, cousin, …) + propagation
  suggestions (e.g. mother of a sibling) — a pure, test-first kinship-inference engine
  — shipped on the person page (§2.4.1); kinship edges in the graph explorer still open.
- **Circles & shared contexts:** circles with time-bounded memberships, name autocomplete
  with create-on-the-fly, a circle overview page, and a member/circle visualization.
- **Important dates & reminders** (§2.13): dates on a person, birthdays derived from the
  birth date, and a "Coming up" band in Home's rail that offers to write a moment — no
  reminder objects and no separate reminders screen.
- **Photo gallery** (grid, lightbox, captions, set-as-avatar) with per-photo visibility
  — shipped on the person page (§2.14); reordering stays M3.
- **Personal journal:** per-person diary — dated Markdown entries with photos, per-entry
  visibility (shared/private), rendered as a timeline on the profile (§2.20).
- **Explorer (rich, core feature):** in-place node expansion, in-graph search-to-focus,
  connection-path finding between two people, circle + derived-kinship edges, filters and
  tree/clustered layouts. Built as a pure graph-model domain + a confined Cytoscape
  rendering adapter (docs/04 §4.11) — the pure operations are test-first.
- **Custom relationship types**; relationship note/since/status.
- **Contact management:** merge, archive, delete with audit entries.
- **@mentions** in notes → soft links.
- **Data portability:** export/import archive; admin "Download backup".
- **Guided migration from Monica:** upload a Monica export (JSON/SQL/vCard), preview the
  mapping, import atomically. First-class onboarding path (`domain/import/monica`, test-first).
- **PWA offline** app shell + read-through cache; RP-initiated single logout.

**Exit:** the household actively uses the feed and graph; data can be backed up and
moved with one action.

## M3 — Polish & extras

Goal: sand the edges and add the nice-to-haves.

- **Localization:** German (structure already externalized); language switcher.
- **Local 2FA** (TOTP) for non-SSO accounts; opt-in email reminders.
- **Change digests:** per-member frequency (daily/weekly/monthly), delivered by email
  and/or signed webhook (HTTP POST). Needs a background scheduler + SMTP config (docs/04).
- **Graph & UX polish:** "haven't seen in a while" hints, photo reordering, saved graph
  filters, density/appearance refinements.
- Performance passes, empty-state and onboarding refinements, accessibility audit.

**Exit:** a release-quality 1.0 the family enjoys using daily.

## Cross-cutting (every milestone)

- Accessibility (AA contrast, keyboard, reduced motion) is not deferred; it's part of
  each component's definition of done.
- Backups/restore are documented and tested from M0.
- The central ACL layer is the only place authorizing access; every new feature routes
  through it.
- Keep the footprint lean: audit bundle size and idle memory each milestone.

## Explicitly later / maybe-never

CardDAV/CalDAV & contact sync, native mobile apps, multi-tenant SaaS, AI enrichment,
finance/gift/task modules, real-time collaborative editing. Revisit only if the core
stays simple. (See [01-vision-and-scope.md §1.6](01-vision-and-scope.md).)
