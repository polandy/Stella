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
- **Activity feed** ("What's new") with visibility filtering — **shipped** as the household
  stream (§2.11, §2.22.2), filterable by kind and by member. "Notable edits" were dropped: the
  stream records what happened in the family, not every edit to the database.
- **Personal dashboard (Home):** the stream plus a rail with "Coming up" and "Quiet lately"
  (§2.12); further panels (gifts given) as their base features land.
- **Interactions timeline** + "last contacted", read as one **story timeline** per person
  together with the journal (§2.23).
- **Name-based suggestions:** duplicate/relative candidates on contact entry (pure ranker)
  — shipped in *Add a person* (§2.2.1).
- **Relationship intelligence:** derived kinship (grandparent, cousin, …) + propagation
  suggestions (e.g. mother of a sibling) — a pure, test-first kinship-inference engine
  — shipped on the person page and as dotted edges in the explorer (§2.4.1).
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
  tree/clustered layouts — **shipped**: *Arrange* offers free, family tree and by circle, and
  an expand places newcomers without moving anyone (§2.7, docs/05 §5.8). Built as a pure
  graph-model domain + a confined Cytoscape rendering adapter (docs/04 §4.11) — the pure
  operations are test-first.
- **Custom relationship types**; relationship note/since/status — the specifics (how they
  connect, since, current/former), editing and removal shipped, and a household names its own
  types under *Settings → Relationship types* (§2.4).
- **Contact management:** merge, archive, delete with audit entries — **archive and delete
  shipped** (§2.2): archiving takes someone out of the browsing surfaces and keeps them in the
  graph; deleting is admin-only, takes everything including the image files, and is the one
  action written to `activity_log` so the household sees it in the stream; merging folds one
  record into another, settling every collision without losing what anyone wrote.
- **@mentions** in notes → soft links — **shipped** (§2.5): notes go through the same picker,
  parser and chip as the journal, `note_mention` records who was named, and the search index
  follows the name rather than the stored id. The passive *"Mentioned in"* list on the
  referenced person is shipped too (§2.20.1): a tab on their page listing every note and journal
  entry elsewhere that names them, newest first, scoped so a reference never shows an entry the
  viewer could not have read anyway.
- **Data portability:** export/import archive; admin "Download backup" — **shipped** (§2.15):
  one `.tar` of `household.yaml` plus the images, arranged around people, everything referring
  to them by id, private records included and marked. *Restore from an archive* reads one back
  in — it adds what is missing and never overwrites what is there, so importing the same archive
  twice is a no-op.
- **Guided migration from Monica:** upload a Monica export, preview the mapping, import
  atomically. First-class onboarding path (`domain/import/monica`, test-first). **Both of
  Monica's own exports are shipped**, **and vCard with them** (§2.16) — the JSON file, the SQL
  dump and a `.vcf`, told apart from the file itself and read into one typed view so the
  mapping exists once. A vCard fills that view sparsely: people, but not how they connect.
- **PWA offline** app shell + read-through cache — **shipped** (§2.18): a manifest and icons
  make Stella installable, a service worker keeps the shell and the pages already read, and a
  line above the page says when what is showing came off the device rather than from Stella.
  Signing out throws the cached pages away. **RP-initiated single logout is
  shipped** (§2.1): signing out revokes the Stella session first, then ends the provider's
  session too when it advertises an `end_session_endpoint` — and never fails when it does not.

**Exit:** the household actively uses the feed and graph; data can be backed up and
moved with one action.

## M3 — Polish & extras

Goal: sand the edges and add the nice-to-haves.

- ~~**Localization:** German with a language switcher~~ — shipped: English and German are
  both fully supported, chosen per member and kept with the profile (§2.19).
- **Graph & UX polish:** "haven't seen in a while" hints, photo reordering, saved graph
  filters, density/appearance refinements. ~~Group a circle's members by role~~ — shipped:
  a *Group by role* switch in the explorer's Filter menu (§2.7).
- ~~**Photos in every person picker**~~ — shipped (docs/05 §5.10): search results, the person
  pickers (Circles' *Add member*, the relationship form, …) and the @-lists show a person's
  photo instead of their initials whenever they have one.
- ~~**Context hints for people without a last name**~~ — shipped (§2.2.3): someone known
  only by a first name is told apart by a second line in ⌘K, the person pickers and the
  @-picker — their description, where/when met, then a relationship or circle read per viewer
  through the access layer (*Sister of Hans Meyer*, *in the circle Class 9a*). Adding someone
  without a last name nudges for a description, the relationship form fills one in from the
  link, and a typed `@Thomas` that is two people is refused with their names
  (`docs/concepts/namesake-context.html`, `docs/concepts/mention-namesakes.html`).
- ~~**Tidy up people known by a first name only**~~ — shipped (§2.2.3): *Settings → Data
  quality* lists everyone with a first name and nothing else to tell them
  apart, each with a description field; merge and archive stay on their page.
- ~~**Adding to Stella while it is out of reach**~~ — shipped (§2.18): every adding form
  saves as a named command, idempotent by its id, through an outbox on the phone. Away from
  home it keeps what is added, photos included, editable or discardable until sent, and
  sends it once Stella answers again; the server re-checks everything on arrival. Nothing
  others have seen is changed offline, so there is nothing to merge. Event sourcing and full
  offline sync were weighed and rejected (docs/04 §4.9); the decisions taken along the way
  are in `docs/concepts/offline-capture.md` §8.
- ~~**Reading Stella while it is out of reach**~~ — shipped (§2.18): every person the member can see readable
  offline, their journal too, not only the pages read since the last update; the offline line
  says how old the copy is, and a person no longer visible leaves the device on the next
  refresh. Pages are kept ahead as the server renders them (no second renderer, no local
  database); a tag of each page's content keeps the refresh to what changed.
  Plan and decisions: `docs/concepts/offline-reading.md`.
- ~~**A simpler day in the *What happened?* composer**~~ — shipped (§2.22.1): a *Today* pill
  beside *Shared* and *Photo* offers the last week in one tap and a month calendar for
  anything older. Chosen from four mockups over always-visible chips, a day stepper and a
  week strip, because it takes no room while today is meant (docs/05 §5.7).
- ~~**Confirm a worked-out relationship to store it**~~ — shipped (§2.4.1): every non-step
  row in *Also related · worked out, not entered* carries *Confirm*, which stores it as one of
  the new built-in family types (great-grandparent, half-sibling, aunt/uncle, cousin,
  parent-in-law, sibling-in-law; grandparent and sibling already existed). The refusal of a
  hand-entered sibling Stella already works out is gone with it. A confirmed link reads like
  any entered one and no longer says *via* whom it was worked out. Both *Check relationships*
  lists offer the same claims (rule K1), after what follows from an entry.
- ~~**Fold imported custom family types into the built-ins**~~ — shipped (§2.4): a Monica
  import lands cousins, aunts/uncles and nieces/nephews on the built-in `cousin` and
  `aunt_uncle_niece_nephew` (docs/monica-mapping.md). A household that imported earlier gets a
  one-click *Merge into …* on its own *Cousin of* and *Uncle/aunt of*, and any custom type can
  be merged into another of the same shape under *Settings → Relationship types*.
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
  created there follows the member's default visibility, like one added in the app. vCard
  properties Stella does not model are kept on the card and written back unchanged, so a
  round-trip loses nothing. The calendar stays derived: a birthday is changed on the contact, not the
  event. DAV clients cannot sign in through SSO, so each member creates a revocable **app
  password** for it in Settings. A per-person change stamp (shared with offline reading)
  keeps each sync to what changed.
  Open: which contact fields go out, whether a member picks circles to sync, and whether a
  plain subscribable `.ics` link suffices for the calendar instead of full CalDAV.
- **A person's photos from Immich** — a contact is linked to the person Immich's face
  recognition knows, by a name-matching review list or a face picker. Their page then shows
  how many photos there are, a strip of the latest, a small viewer, the photos of *you and
  them* together, and *Use as photo*. One read-only household key set by the admin; images
  go through a signed proxy and follow the contact's visibility. Built in five slices; the
  decisions are in `docs/concepts/immich.md` §9.
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

Google Contacts sync, native mobile apps, multi-tenant SaaS, AI enrichment,
finance/gift/task modules, real-time collaborative editing. Revisit only if the core
stays simple. (See [01-vision-and-scope.md §1.6](01-vision-and-scope.md).)

- **Local 2FA** (TOTP) for accounts without SSO, and opt-in email reminders — deprioritized:
  Stella runs behind Authelia, which already asks for the second factor. The `totp_secret`
  column stays reserved (docs/03).
- **Change digests** by email or signed webhook (docs/02 §2.11.1, docs/04 §4.12) — taken off
  the roadmap for now; the design stays written down in case it comes back.
