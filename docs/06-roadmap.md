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
- **Personal dashboard (Home):** the stream plus a rail with "Coming up" (§2.12), which also
  says who has open gift ideas (§2.25.5).
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
- ~~**A person's photos from Immich**~~ — shipped (§2.24).
- ~~**Photos from Immich wherever a photo can be added**~~ — shipped (§2.24, #407).
- ~~**Tags on journal entries**~~ — shipped (§2.20.2): a household set of their own, written
  as `#word` with a `#` list, chips that filter a person's journal, the full search by word and
  by `#tag`, a page per tag (`/tags/{key}`), the list of all tags and a *Tags* filter on Home's
  stream.
- ~~**Gift ideas and gifts given**~~ — shipped (§2.25): ideas, gifts given and gifts received
  per person on the Gifts card and in the story, the Monica gifts converted, the *already
  given* hint, the *Coming up* hint and *Gift idea for …* in the palette, and the household's list of every open idea, by whose
  occasion comes next (`/gifts`, §2.25.6).
- ~~**Email and social sync**~~ — *address books shipped; mail and social moved to After 1.0.*
  Bring in what already knows about people, matched against the
  people already in Stella through a review list rather than merged silently, every write
  through the domain use-cases and access layer:
  - ~~**Google Contacts via its export**~~ — shipped (§2.16.2): any `.vcf`, Google's and
    Nextcloud's included, goes through the import wizard's matching review, and the answers are
    remembered.
  - ~~**Nextcloud via a two-way link**~~ — shipped (§2.16.3): one household book set in the
    environment, synced by `sync-collection` on *Sync now* and on opening Stella; name, phones,
    emails, addresses, birthday and photo both ways; new cards through the review, conflicts
    under *Data quality* with Stella's side kept until answered; private people never go out;
    the *Nextcloud* actor in the activity log.
- ~~**Performance passes**~~ — shipped.
- ~~**Empty-state and onboarding refinements**~~ — shipped (§2.22).
- ~~**Accessibility audit**~~ — shipped (§2.19).
- ~~**Who may remove what**~~ — *shipped, all four slices (removing and editing a note, §2.5;
  removing every other authored kind, §2.6, §2.14, §2.20; editing a touchpoint, §2.6; the rule is docs/03 §3.7).* Decided: authored records (notes,
  moments, touchpoints, person and circle photos) may be removed by their author, or by an
  admin when shared (never a private one, §2.10). Removal is a delete with the 8-second
  undo, and a removal by someone other than the author leaves a shared activity entry
  without the text, online only. The author may edit their note and their touchpoint.
  Household facts (dates, fields, relationships, memberships, gifts) keep "anyone who sees
  it".
- ~~**Removing a member**~~ — *shipped, both slices (§2.1).* An admin removes any other member
  from the *Members* page in Settings, and restores a former one there. Left out on purpose,
  each its own entry if ever asked for: changing a member's role (with SSO role sync it has its
  own questions), leaving a household on one's own, purging a former member's private records,
  and deleting an account row for good (every authored record would need a new author first).
- ~~**Former relationships on the map**~~ — *shipped (§2.7).* A link marked `former` is a
  dashed, muted line named *· former*, shown by default and hidden by the Filter menu's
  *Former links* switch; the family tree keeps a former partnership as a link but never as
  the couple the children hang from. The person page and the pickers already set it apart.
- ~~**Missing parents in the family tree**~~ — *shipped (§2.7, docs/05 §5.8).* Around a
  person the tree offers a dashed "+" slot where a parent is missing up the centre's own line
  (centre, parents, grandparents); tapping it, or Enter in the keyboard walk, opens *Add
  relationship* on that person preset to *Child of*. No node for filters or the "+N", and only
  for a reader who may add a relationship.
- ~~**Nested circles on the circle page**~~ — *shipped (§2.4.2, ADR-126).* *Belongs to* in the
  edit form and the list's *New circle*, the always-there Sub-circles card with *New
  sub-circle*, *Add existing* and *Detach*, each move undoable from its toast and checked for
  loops as the import API is.
- ~~**Arranging people between a circle and its sub-circles**~~ — *shipped (§2.4.2, ADR-127).*
  *Arrange people* on a circle with sub-circles: a card per circle, move or copy by dragging or
  by tapping, one batch in one transaction, *Undo* restores the deleted memberships exactly.

**Exit:** a release-quality 1.0 the family enjoys using daily. *Feature-complete 2026-10-30;
1.0.0 is cut once the owner's outstanding hand tests are through.*

## After 1.0

Written down, not scheduled: each needs the owner's decisions (or a change in how the family
works) before it is specified in docs/02. Nothing here is a candidate for the next task by
itself, except what is marked *in progress* or *queued*.

**Queued** (owner, 2026-11-01) means: wanted, written in enough detail to build, taken in the
listed order unless the owner says otherwise. Each starts by settling its *Open* points with
the owner (mockup as an Artifact for anything with UI), then moves its rules into docs/02 and
the screen file in the same PR that builds it, and leaves a one-line *built* note here.

- **To-dos per person** — *built (§2.26), decided 2026-10-31.* The person page's *To do* card,
  *To-do for …* in the palette, adding and ticking offline; *Done: …* in the Activity; Home's
  *To do* band, `/todos` and to-dos in search; Monica's tasks in the import.

- **Stella's people in the phone's address book and calendar (CardDAV / CalDAV)** — *the
  family's phones already sync their contacts with Nextcloud, and the two-way Nextcloud link
  (§2.16.3, shipped in M3) brings those into Stella without a second server for phones to
  talk to. Kept as written in case that changes.* A
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
  plain subscribable `.ics` link suffices for the calendar instead of full CalDAV — the
  `.ics` link is queued below (item 1).
- **Mail and social sync** — people from mail and social accounts, matched in the same review
  as the address books (§2.16.2). Open: which sources, and what is read from each.
- **Native mobile apps** — beyond the PWA (§2.18), for what a PWA cannot do on a phone. Open:
  which platforms, and whether a wrapper around the PWA is enough before a true native app.

### Queued, in order

1. **Dates in the phone's calendar — a subscribable `.ics` link** — *built*; see docs/02
   §2.13.4. To-dos in the feed stay open.

2. **Sharing into Stella from other apps (Web Share Target)** — *built*; see docs/02
   §2.18.3. A shared link as a *note* was declined: moment, gift idea and to-do cover it.

3. **On this day — memories on Home** — *queued.* A quiet band in Home's rail, below *Coming
   up* and *To do*: what the household wrote on today's date in earlier years. Not a nudge and
   not about "seeing people more" (declined by the owner: most people are reference) — a reason to
   enjoy the notebook.
   - **What shows.** Moments, journal entries (§2.20) and touchpoints (§2.6) the reader may see
     whose date is today's day and month in an earlier year, newest year first, grouped as
     *1 year ago*, *5 years ago*; at most three, *More* opens the full list on a
     `/on-this-day` page (any date, with a day picker). Each item: the people's avatars, the
     first line, the year; tapping opens it in the person's Activity. With Immich linked
     (§2.24), one photo strip of the household's linked people taken on this day, through the
     gateway's date search, only when the Immich key is set. Gallery photos (§2.14) by capture
     date likewise.
   - **Absent when empty**, like *Coming up* (§2.13.3). Private entries follow the veil
     (§2.10.1). Deceased people's entries stay — remembering them is the point.
   - **How.** A use-case `memoriesOn(day, deps)` with the reader's scope, one indexed query
     per kind on the day-and-month of the stored date (a generated `MM-DD` column or an index
     expression, docs/03), the clock injected. Pure grouping and ranking in
     `src/lib/memories/`. Feb 29 shows on 28 Feb in a common year.
   - **Tests.** Unit: grouping, the 29 Feb rule, visibility, the cap. E2e: a seeded moment two
     years back on the fixed test day shows on Home and opens.
   - **Docs.** docs/02 §2.12, `home.md`, `using-stella.md`.
   - **Open.** Whether to count only whole years (recommended) or also *a month ago*; whether
     the band can be switched off per member (recommended: no setting until someone asks).

4. **Before a visit — a person's brief** — *queued.* One compact view of a person for "we're
   going over in ten minutes": everything worth knowing at a glance, nothing to fill in. Pure
   aggregation of what is already stored.
   - **What is on it.** Name, photo, age; their partner and children with ages (derived
     kinship, §2.4.1), and the household they live in; the next date (§2.13); open to-dos
     (§2.26) and open gift ideas (§2.25); the last three moments or touchpoints with dates; the
     pinned notes (§2.5); *How we met*. Each block absent when empty. Read-only, every row
     links to where it is edited.
   - **Where.** A *Brief* action in the person page's header menu and a palette command
     *Brief: …*; a route `/people/<id>/brief`, phone-first, printable on one page (print
     stylesheet). Offline from the read-through cache like the person page (§2.18).
   - **How.** One `load` composing existing use-cases through the access layer — no new tables.
     The choice and order of blocks is a pure function (`src/lib/people/brief.ts`) tested
     first.
   - **Tests.** Unit: block selection, ages, empty blocks dropped. E2e: open the brief of a
     seeded family, see the children and an open gift idea.
   - **Docs.** docs/02 §2.2, a `person-brief.md` screen file, `using-stella.md`.
   - **Open.** Whether the brief replaces the top of the person page on a phone instead of
     being its own page (recommended: own page first, live with it, then decide).

5. **The family tree as a picture or PDF** — *queued.* A printable tree for the grandparents or
   a family gathering.
   - **What.** In the explorer's family-tree view (§2.7) an *Export* menu: *PNG* (for sharing)
     and *PDF / Print* (A4 or A3, landscape). It exports what is on screen: the centre, the
     current filters and depth, names under the nodes, photos when shown, the light theme
     always (print), dates of birth and death optional by a switch. A title line (*Family of
     Anna Example*, editable before export) and the date it was made.
   - **How.** PNG from Cytoscape's own `cy.png({ full: true, scale })` in the adapter layer;
     PDF through the browser's print with a print stylesheet that lays the PNG out on the
     page — no PDF library, no new dependency. Private people the reader may see are
     included only when a switch says so, off by default, since a print leaves the household.
   - **Tests.** Unit: the export options → render parameters mapping (pure). E2e: export a PNG
     and check the download's type and size bounds; print layout stays an owner hand check.
   - **Docs.** docs/02 §2.7, `graph.md`, `using-stella.md`.
   - **Open.** Whether a very wide tree should split across pages (recommended: no — scale to
     one page, offer A3); whether the ego network (not only the tree) exports too.

## Cross-cutting (every milestone)

- Accessibility (AA contrast, keyboard, reduced motion) is not deferred; it's part of
  each component's definition of done.
- Backups/restore are documented and tested from M0.
- The central ACL layer is the only place authorizing access; every new feature routes
  through it.
- Keep the footprint lean: audit bundle size and idle memory each milestone.

## Explicitly later / maybe-never

Multi-tenant SaaS, AI enrichment, finance/task modules, real-time collaborative
editing. (Gifts and address-book sync moved up into M3 and shipped; the rest waits in *After 1.0*.) Revisit only if the core
stays simple. (See [01-vision-and-scope.md §1.6](01-vision-and-scope.md).)

- **Local 2FA** (TOTP) for accounts without SSO, and opt-in email reminders — deprioritized:
  Stella runs behind Authelia, which already asks for the second factor. The `totp_secret`
  column stays reserved (docs/03).
- **Change digests** by email or signed webhook (docs/02 §2.11.1, docs/04 §4.12) — taken off
  the roadmap for now; the design stays written down in case it comes back.
