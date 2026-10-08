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
- **PWA-ready** shell (installable manifest/icons; offline shell slipped to M2, §2.18).

**Exit:** a non-technical family member can add a person with a photo and a relationship
from their phone in under a minute, and anyone can look them up.

## M2 — Core: keep in the loop & richer relationships

Goal: the family "gets it" — shared awareness, history, and visualization.

- **Moments & household stream** (§2.22): one-sentence capture on Home with @-mentions,
  inline person creation and a post-save "link these two?" hint; Home becomes the
  visibility-scoped household stream (moments, new people, new relationships).
- **Activity feed** ("What's new") — shipped as the household stream (§2.11, §2.22.2);
  "notable edits" were dropped.
- **Personal dashboard (Home):** the stream plus a rail with "Coming up" (§2.12); further
  panels (gifts given) as their base features land.
- **Interactions timeline** + "last contacted", read as one **activity timeline** per person
  together with the journal (§2.23).
- **Name-based suggestions** on contact entry — shipped (§2.2.1).
- **Relationship intelligence:** derived kinship + propagation suggestions — shipped (§2.4.1).
- **Circles & shared contexts:** circles with time-bounded memberships, name autocomplete
  with create-on-the-fly, a circle overview page, and a member/circle visualization.
- **Important dates & reminders** (§2.13): dates on a person, birthdays derived from the
  birth date, and a "Coming up" band in Home's rail that offers to write a moment — no
  reminder objects and no separate reminders screen.
- **Photo gallery** with per-photo visibility — shipped (§2.14).
- **Personal journal:** per-person diary — dated Markdown entries with photos, per-entry
  visibility (shared/private), rendered as a timeline on the profile (§2.20).
- **Explorer (rich, core feature)** — shipped (§2.7, docs/05 §5.8, docs/04 §4.11).
- **Custom relationship types**; relationship note/since/status — shipped (§2.4).
- **Contact management:** merge, archive, delete — shipped (§2.2).
- **@mentions** in notes and the *"Mentioned in"* list — shipped (§2.5, §2.20.1).
- **Data portability:** backup archive and restore — shipped (§2.15).
- **Guided migration from Monica:** JSON export, SQL dump and vCard — shipped (§2.16).
- **PWA offline** app shell + read-through cache — shipped (§2.18); RP-initiated single
  logout — shipped (§2.1).

**Exit:** the household actively uses the feed and graph; data can be backed up and
moved with one action.

## M3 — Polish & extras

Goal: sand the edges and add the nice-to-haves.

- ~~**Localization:** German with a language switcher~~ — shipped (§2.19).
- ~~**Graph & UX polish**~~ — shipped (§2.7, §2.14, docs/05 §5.8): saved filters, group by
  role, density, keyboard walking, favourite photos first.
- ~~**Photos in every person picker**~~ — shipped (docs/05 §5.10).
- ~~**Context hints for people without a last name**~~ — shipped (§2.2.3).
- ~~**Tidy up people known by a first name only**~~ — shipped (§2.2.3).
- ~~**Last names for several people at once**~~ — shipped (§2.2, §2.2.4).
- ~~**Adding to Stella while it is out of reach**~~ — shipped (§2.18, docs/04 §4.9).
- ~~**Reading Stella while it is out of reach**~~ — shipped (§2.18).
- ~~**A simpler day in the *What happened?* composer**~~ — shipped (§2.22.1).
- ~~**Confirm a worked-out relationship to store it**~~ — shipped (§2.4.1).
- ~~**Fold imported custom family types into the built-ins**~~ — shipped (§2.4).
- ~~**Welcome animation**~~ — shipped (§2.18, docs/05 §5.11.4).
- **Stella's people in the phone's address book and calendar (CardDAV / CalDAV)** — a
  member adds Stella as a CardDAV account on their phone or mail client and sees the people
  they are allowed to see as contacts (name, photo, phone, email, address, birthday), plus a
  CalDAV calendar of their birthdays and anniversaries. **Two-way** for contacts: a person
  added, changed or removed in the address book arrives in Stella. As in the app, every
  member may change every person they can see; each write goes through the same domain
  use-cases and access layer (docs/03 §3.7) and is written to `activity_log` as that member,
  so the household sees who changed what and when. A private person stays in their owner's
  address book only. Concurrent edits are caught with ETags (`If-Match`): a stale
  write is refused and the client fetches the current card. This departs from the app's
  last-write-wins (docs/01 §1.6) on purpose: a phone's copy can be days old, and writing it
  back blindly would undo what others changed since.
  Deleting a contact on the phone archives the person rather than deleting them; a contact
  created there is shared, like one added in the app (§2.10). vCard
  properties Stella does not model are kept on the card and written back unchanged, so a
  round-trip loses nothing. The calendar stays derived: a birthday is changed on the contact, not the
  event. DAV clients cannot sign in through SSO, so each member creates a revocable **app
  password** for it in Settings. A per-person change stamp (shared with offline reading)
  keeps each sync to what changed.
  Open: which contact fields go out, whether a member picks circles to sync, and whether a
  plain subscribable `.ics` link suffices for the calendar instead of full CalDAV.
- ~~**A person's photos from Immich**~~ — shipped (§2.24).
- **Gift ideas and gifts given** — per person: ideas to give, what was given and when, so
  the same present is not given twice. Shared by default, private per record (docs/02 §2.10).
  A Monica import already lands gifts as notes (docs/monica-mapping.md); once this ships they
  move to real gift records. Ideas, gifts given and gifts received per person; the moment
  kind *Gift* folds into them. Decided in `docs/concepts/gifts.md` (mockup alongside).
- **Email and social sync** — bring in what already knows about people: Google Contacts as a
  first source, then mail and social. Read-only import first, matched against existing people
  through a review list rather than merged silently, every write through the domain
  use-cases and access layer. Sources, matching rules and credentials handling are open.
- **Native mobile apps** — beyond the PWA (§2.18), for what a PWA cannot do on a phone. Open:
  which platforms, and whether a wrapper around the PWA is enough before a true native app.
- ~~**Performance passes**~~ — shipped.
- ~~**Empty-state and onboarding refinements**~~ — shipped (§2.22).
- ~~**Accessibility audit**~~ — shipped (§2.19).
- **Who may remove what** — *concept pending.* A note can today be neither edited nor
  deleted, not even by its author (§2.5); a wrong or outdated note stays forever. Its
  **author or an admin** should be able to delete it. Other records follow a mixed rule
  today — journal entries, photos and touchpoints only by their author (§2.20, §2.14, §2.6),
  relationships by anyone who sees them — so the concept settles one rule across record
  kinds: which ones it covers (notes first; touchpoints, photos, journal entries,
  relationships, dates, circles?), whether an admin may remove another member's *shared*
  record (never a private one, §2.10), whether removal is undoable and leaves an audit entry,
  whether editing a note belongs in the same step, and how the author learns their record
  was removed.
- **Former relationships on the map** — *concept pending.* A link can be marked `former`
  (docs/03 §3.3, e.g. an ex-partner), which already stops kinship derivation through it
  (§2.4.1), but the relationship map (§2.7) still draws it like any current one. The concept
  settles how a former link reads on the map (muted or dashed line, a label, hidden behind a
  Filter switch?), whether layouts such as the family tree treat it differently, and
  whether the person page and the pickers set it apart the same way.

**Exit:** a release-quality 1.0 the family enjoys using daily.

## Cross-cutting (every milestone)

- Accessibility (AA contrast, keyboard, reduced motion) is not deferred; it's part of
  each component's definition of done.
- Backups/restore are documented and tested from M0.
- The central ACL layer is the only place authorizing access; every new feature routes
  through it.
- Keep the footprint lean: audit bundle size and idle memory each milestone.

## Explicitly later / maybe-never

Multi-tenant SaaS, AI enrichment, finance/task modules, real-time collaborative
editing. (Gifts, email/social sync and native apps moved up into M3.) Revisit only if the core
stays simple. (See [01-vision-and-scope.md §1.6](01-vision-and-scope.md).)

- **Local 2FA** (TOTP) for accounts without SSO, and opt-in email reminders — deprioritized:
  Stella runs behind Authelia, which already asks for the second factor. The `totp_secret`
  column stays reserved (docs/03).
- **Change digests** by email or signed webhook (docs/02 §2.11.1, docs/04 §4.12) — taken off
  the roadmap for now; the design stays written down in case it comes back.
