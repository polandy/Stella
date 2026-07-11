# 02 — Feature Specification

This document describes **what** each feature does and how it should behave. The
**how** (schema, endpoints) lives in [03-data-model.md](03-data-model.md) and
[04-architecture.md](04-architecture.md). UI/interaction detail lives in
[05-ui-design-system.md](05-ui-design-system.md).

Each feature is tagged with a milestone: **[M1]** MVP, **[M2]** core, **[M3]** polish.
See [06-roadmap.md](06-roadmap.md).

---

## 2.1 Accounts, household & authentication **[M1]**

- The deployment hosts **one household**. All members belong to it.
- **Roles:** `admin` and `member`.
  - `admin` can invite/remove members, change roles, edit household settings, and
    access every **shared** record. Admins **cannot** see other members' **private**
    records.
  - `member` can do everything with shared and their own records.
- **First-run setup:** the first account created becomes `admin` and creates the
  household. No public sign-up; there is no open registration page.
- **Invitations:** an admin generates an invite (single-use link/token with expiry).
  The invitee joins via local password **or** SSO (see 2.1.2).
- **Sessions:** regardless of login method, Stella issues its **own server-side session**,
  referenced by an httpOnly, SameSite=Lax, Secure cookie. The identity provider is used
  for authentication, not for every request.
- **Account settings:** display name, avatar, email, password change (local accounts),
  theme preference (system / light / dark), default visibility for new records
  (shared / private).
- **Security:** rate-limited login, session revocation ("sign out everywhere"),
  optional TOTP 2FA for local accounts **[M3]** (with SSO, 2FA is delegated to the IdP).

### 2.1.1 Authentication methods

Two methods, independently toggleable via configuration:

- **Local** — email + password, hashed with **Argon2id**.
- **SSO via OIDC** — Single Sign-On against an external OpenID Connect provider
  (see 2.1.2). Primary target: the author's self-hosted **Authelia**.

Deployment can run **local-only**, **SSO-only**, or **both** (local as break-glass
fallback while SSO is primary). This is set through environment configuration.

### 2.1.2 SSO via OIDC / Authelia **[M1]**

Stella acts as an OIDC **Relying Party** (confidential client) against a provider such as
**Authelia**. This is a priority feature so the family can use existing household
credentials and MFA.

- **Flow:** OpenID Connect **Authorization Code flow with PKCE**. Stella redirects to the
  provider's `/authorize`, validates the returned ID token (issuer, audience, `nonce`,
  expiry, signature via the provider's JWKS), then establishes its own Stella session.
- **Discovery:** provider configured via its **OIDC discovery document**
  (`.well-known/openid-configuration`) plus client id/secret and redirect URI.
- **Scopes/claims:** requests `openid profile email groups`. Consumes `sub` (stable
  identifier), `email`, `name`/`preferred_username`, and `groups`.
- **Identity linking:** an OIDC identity links to a Stella user by **`iss` + `sub`**
  (immutable). On first login it may match an existing local user by verified email
  (configurable) to link accounts, otherwise it provisions a new user.
- **Just-in-time provisioning:** on first successful SSO login, if provisioning is
  enabled and the user is authorized (see below), a Stella user is created from the
  claims. If disabled, the user must have been pre-invited.
- **Authorization to enter the household:** access is gated by an **allowed-groups**
  and/or **email allowlist** policy. Only members of a configured Authelia group (e.g.
  `stella-users`) may sign in. Unlisted users are rejected with a clear message.
- **Role mapping:** configurable mapping from IdP **groups → Stella roles** (e.g. group
  `stella-admins` → `admin`, otherwise `member`). Optionally, roles are **synced on every
  login** (IdP is source of truth) or set once at provisioning; this is configurable.
  There is always at least one local **break-glass admin** possible so an
  IdP misconfiguration can't lock everyone out.
- **Profile sync:** name/email/avatar may be refreshed from claims on each login
  (configurable), while Stella-specific settings (theme, default visibility) stay local.
- **Single Logout:** local logout always clears the Stella session; **RP-initiated
  logout** to the provider's `end_session_endpoint` is supported when advertised **[M2]**.
- **Security specifics:** `state` + `nonce` + PKCE verifier stored in a short-lived,
  httpOnly cookie; strict redirect-URI matching; clock-skew tolerance; ID-token
  signature verified against cached JWKS with rotation support.
- **Failure handling:** provider unreachable → clear error and, if enabled, fall back to
  the local login form; never a blank page.

> Although Authelia is the primary target, the implementation uses **standard OIDC**
> only, so any compliant provider (Keycloak, Authentik, Zitadel, Google, etc.) works.

## 2.2 Contacts (people) **[M1]**

The central entity. A contact is any person the family wants to remember — they need
not be an app user.

**Fields (all optional except a display name):**

- Names: first, last, nickname, name prefix/suffix, "goes by".
- Optionally a **maiden/former name**.
- Gender (free-form or preset), pronouns.
- Photo / avatar.
- Birthdate (with support for **unknown year** and **age-only** estimates).
- Deceased flag + date of death.
- One-line **description** ("Marco's sister, met at the lake").
- **How we met** — free text + optional **date** + optional **place** where you met the
  person (`met_place`). The place is free text (e.g. "at the lake", "Anna's wedding"); it
  may optionally render a **map link** when it looks like a real location. Surfaced on the
  profile header and usable as a filter/grouping ("people we met at …").
- Job title & company/organization.
- Tags (see 2.8).
- Contact fields: phones, emails, addresses, websites, social handles, custom
  (see 2.3).
- Visibility: shared (default) or private (see 2.10).

**Behaviors:**

- **Quick add:** a minimal, fast form — display name + optional photo + optional
  "how we met" — reachable in one tap, designed for mobile capture. Everything else can
  be filled later.
- **Contact profile page** aggregates: header (avatar, name, description, key dates,
  tags), relationships, notes, interactions timeline, photo gallery, contact fields.
- **Deceased contacts** are kept, visually marked, and excluded from active reminders.
- **Merge** two contacts that turn out to be the same person **[M2]** (combines fields,
  notes, photos, relationships; keeps an audit entry).
- **Archive** (soft-hide without deleting) and **delete** (with confirmation) **[M2]**.
- **Who added this** and **last edited by/when** are always visible.

### 2.2.1 Duplicate & relative suggestions (name-based) **[M2]**

As soon as a **last name** (or full name) is entered in quick-add / new contact, Stella
surfaces **existing contacts with the same or similar surname** as candidates. Two goals:

- **Avoid duplicates** — "did you mean this existing person?" before creating a
  near-identical contact.
- **Kick-start relationships** — offer to link the new person to a likely relative in one
  tap (e.g. "Add a relationship to Hans Müller?"), feeding directly into §2.4.1.

Matching is diacritic- and case-insensitive with light fuzzy tolerance (typos, former
names). It respects visibility (§2.10) — only candidates the user may see are proposed.
Powered by the indexed name data behind search (§2.9); a pure, test-first ranking function
orders candidates by surname match, then shared relationships/household proximity.

## 2.3 Contact fields **[M1]**

Flexible, repeatable contact methods on a contact:

- Types: `phone`, `email`, `address`, `url`, `social`, `date`, `custom`.
- Each has an optional **label** ("Home", "Work", "WhatsApp"), a value, and ordering.
- Addresses support structured parts (street, city, region, postal code, country) and
  render a map link.
- Phones/emails become tap-to-call / tap-to-mail on mobile.
- Social handles map to known networks (icon + link) or free-form.

## 2.4 Relationships **[M1]**

The defining feature. Relationships connect two contacts with a **typed, directional,
reciprocal** link.

- A **relationship type** has a forward label and a reverse label, e.g.
  `parent → child`, `partner ↔ partner`, `sibling ↔ sibling`, `friend ↔ friend`,
  `colleague ↔ colleague`, `grandparent → grandchild`.
- Creating "A is **parent of** B" automatically implies "B is **child of** A" — the
  reverse is shown on B without a second entry.
- **Symmetric** types (partner, sibling, friend) use the same label both ways.
- Types are grouped by **category**: family, romantic, social, professional, other.
- A **default set** of types ships built in; admins can **add custom types** **[M2]**.
  The set includes a **generic "knows / connected"** type (symmetric, social) for loose
  associations where no specific kinship applies.
- **Connecting a person to one, the other, or several people is just one relationship
  each.** Example: Lio is connected to Peter *and* to Lisa → two relationships (Lio↔Peter,
  Lio↔Lisa). "Both" is naturally two links; there is no separate concept to learn.
- **Each relationship can carry its own free-text description** so you can explain *how*
  Lio relates to Peter versus to Lisa (e.g. "met through Peter at the ski course",
  "Lisa's plus-one at the wedding"). Plus an optional **since** date and a **status**
  (e.g. current/former for partners) **[M2]**.
- Relationships are shown on each contact's profile, grouped by category (description
  inline), and drive the graph (2.7).
- **Guardrails:** prevent duplicate and self relationships; warn on contradictions
  (e.g. mutual "parent of").

### 2.4.1 Relationship intelligence — derived kinship & propagation **[M2]**

Stella reasons over the relationship graph so members enter as little as possible.

**Derived kinship (computed, not stored):** from a small set of **primary** relationships
(parent/child, partner/spouse, sibling), Stella derives extended kinship *for display*
without manual entry — **grandparent/grandchild, great-grandparent, aunt/uncle,
niece/nephew, cousin, sibling-in-law, parent-in-law**, plus half/step variants where
partner history allows. Example: Hans → parent Bettina, Bettina → parent Otto ⇒ *Otto is
Hans's grandfather* automatically. Derived labels are shown on the profile and graph,
clearly marked as derived, and never duplicate stored edges.

**Propagation suggestions:** when a primary relationship is added, Stella proposes the
logically implied ones for one-tap confirmation:

- Adding **Bettina as mother of Hans**, where **Hans and Lisa are siblings**, suggests
  *Bettina as mother of Lisa* (and of every other sibling).
- Adding a **sibling** suggests **sharing the known parents** on either side.
- Adding a **partner** suggests **step-relationships** to existing children (opt-in).
- Roles are distinguished — **father/mother/parent, sibling, grandparent** — using the
  relationship types and each contact's gender where known.

**Principles:** suggestions are always **opt-in** (never silently written); derivations are
**consistent** (guardrails prevent contradictory edges, §2.4); explicit entry stays
possible when the connecting person isn't in Stella yet (e.g. record a grandparent
directly). Implemented as a **pure kinship-inference engine** over the graph — no new
tables, fully unit-testable (test-first).

### 2.4.2 Circles & shared contexts **[M2]**

Beyond pairwise relationships, people are connected by **shared contexts** — the same
class, course, club, team, workplace, or friend group. Stella models these as **Circles**:
a named group contacts belong to, over a period of time. (A first-class entity, not a tag.)

- A **Circle** has a name, optional description, a **kind** (friends, family, school,
  class, course, club, team, work, neighborhood, other), a color, and an optional **period**
  (e.g. "Grade 1, 2023/24"). Circles may optionally **nest** (e.g. *School X* › *Class 1B*).
- A contact's **membership** carries an optional **role** (student, teacher, coach, member,
  captain…) and its own **start/end dates** — so the same person can be in the kindergarten
  group one year and the grade-1 class the next, and you can see *when*.
- **The same two people can share several Circles.** Concrete example: Hans and Peter are
  both in the *Ski Course* **and** in *Day School* — two separate Circles, and both surface
  as shared contexts between them.
- **Shared-context connections are derived, not hand-entered:** two contacts in the same
  Circle are shown as connected "via {Circle}". Surfaced on each profile ("Shared circles
  with Anna: Ski Course, Day School") and in the graph (cluster / context edges, filterable
  by Circle). This answers *"through what context do these people know each other?"* and
  stays distinct from typed pairwise relationships (§2.4).
- **Feeds suggestions (§2.4.1 / §2.2.1):** e.g. "Hans and Peter are both in Ski Course —
  add a friendship?" — always opt-in.
- Circles are shareable records under the standard visibility model (§2.10); a membership
  is visible when both its Circle and the contact are visible. Powered by a small,
  test-first domain module over the membership data — extends the graph without touching
  pairwise-relationship logic.

- **Adding a membership is one field with autocomplete:** as you type a circle name, the
  UI suggests **existing circles** (matched fuzzily, visibility-scoped). Pick one to join
  it; if you type a name that doesn't exist yet, **the circle is created on the fly** from
  that input (kind/period can be refined later). No separate "create circle first" step.
- **Circle overview page:** a dedicated screen listing all circles (filter by kind,
  active/past, search), each showing member count and period. Opening a circle shows its
  **members** (with roles and dates) and lets you add/remove members.
- **Circle visualization:** the overview and each circle are **visualized** — members as
  nodes clustered by circle, with people who belong to multiple circles bridging them.
  Reuses the graph engine (§2.7), theme-aware, filterable by circle/kind. Makes overlaps
  like "Hans & Peter share Ski Course *and* Day School" visible at a glance.

Distinct from **Tags** (§2.8): tags are lightweight labels on a *single* contact; Circles
are shared memberships with roles and time that *connect* people.

## 2.5 Notes **[M1]**

- A note belongs to **one contact**, has an optional **title** and a **Markdown body**.
- Notes show author and timestamp; they can be **pinned** to the top of a profile.
- Markdown supports basic formatting, lists, links, and **@mentions** of other
  contacts **[M2]** (a mention creates a soft link, surfaced on the mentioned contact).
- Notes are individually **shared or private** (see 2.10).
- Full-text searchable (2.9).

## 2.6 Interactions / activity log **[M2]**

A lightweight journal of contact touchpoints, distinct from notes.

- An interaction has: a **type** (met in person, call, video, message, letter, gift,
  other), a **date**, an optional **title/summary**, an optional **description**, and
  optional **participants** (other contacts present).
- Rendered as a reverse-chronological **timeline** on the profile.
- Powers "**last contacted**" on the profile and "haven't seen in a while" hints **[M3]**.

## 2.7 Relationship & context explorer **[M1 basic / M2 rich]** — core feature

An interactive, explorable graph of people and how they are connected — through
**relationships, circles/shared contexts, and derived kinship**. This is a **signature
feature** of Stella: it must be especially **polished and intuitive**, and (per
`docs/08`) built for **maintainability, extensibility, and readability** — see the
architecture in [`docs/04-architecture.md` §4.11](04-architecture.md).

**Entry points**

- From **a person's profile**: "Explore connections" opens the explorer centered on that
  contact, showing all of their relationships and circles at once.
- As a **standalone screen** (nav → Graph) starting from search or the household overview.

**What is shown**

- **Nodes** are contacts (avatar + name). **Circles** appear as their own node type
  (grouping members), so both person↔person and person↔context links are visible.
- **Edges** are typed and styled by kind: relationship category (family/romantic/social/
  professional), **circle membership**, and (toggle) **derived kinship** (§2.4.1) shown as
  distinct, clearly-labeled edges.

**Interactive navigation (the heart of it)**

- **Expand any node in place:** click a person to expand *their* relationships and circles
  into the graph, then continue outward from there — exploring the web hop by hop without
  leaving the view. Collapse to declutter.
- **In-graph search:** a search box finds a person and brings them into the view; if they
  are already reachable, the graph **animates to focus** them.
- **Connection path ("how do we know each other?"):** pick a second person and Stella
  finds the **shortest path** between the two through relationships/circles and builds up
  exactly those nodes and edges — so you see the chain that links them (e.g. *You → Peter
  → Ski Course → Hans*).
- **Peek & jump:** hovering highlights a node's immediate neighborhood; a side peek panel
  summarizes the selected person with a link to their full profile.

**Controls & presentation**

- **Filters:** by edge kind (relationships / circles / kinship), relationship category,
  circle, tag, or "living only".
- **Layouts:** force-directed by default; tidy **tree** layout for family hierarchies and
  **clustered** layout grouping circle members **[M2]**.
- **Performance:** the server sends the whole *visible* graph once as a slim, access-scoped
  snapshot (ids/labels + typed edges — not full records); the browser then builds the ego view
  and does every expand/focus/path **client-side with no further requests**. This pushes the
  work to the client and suits family scale (hundreds of nodes); per-neighborhood server
  streaming can return later for very large households (§4.11).
- **Access-scoped:** only nodes/edges the viewer may see appear (§2.10 / §3.7).
- **Beautiful & accessible:** Catppuccin-themed in light/dark, smooth but
  `prefers-reduced-motion`-aware, keyboard-operable, with a list-based fallback view.

## 2.8 Tags **[M1]**

- Freely created labels with a name and a color (from the Catppuccin accent set).
- Applied to contacts; used for filtering (lists and graph) and grouping.
- Managed in settings (rename, recolor, merge, delete).

## 2.9 Search **[M1]**

- **Global search** (keyboard-accessible, `/` or ⌘K) across contact names, descriptions,
  contact-field values, tags, and note bodies.
- Backed by SQLite **FTS5**; results grouped by type (contacts, notes) with snippets.
- Respects visibility — private records only appear for their owner.

## 2.10 Privacy model (shared vs. private) **[M1]**

- Every shareable record (**contact, note, photo, interaction**) has a **visibility**:
  `shared` (whole household) or `private` (only the creator).
- **Default** visibility for new records follows the creator's account preference.
- **Inheritance & rules:**
  - A **private contact** and everything under it are visible only to its creator,
    regardless of child visibility.
  - A **shared contact** may still have **private notes/photos/interactions** —
    visible only to their author.
  - **Relationships** are visible if the viewer can see **both** endpoints; a
    relationship touching a private contact they don't own is hidden from them.
- Changing a contact from shared → private warns about the effect on shared children.
- Admins do **not** gain access to others' private records (see 2.1).

## 2.11 Household activity feed ("What's new") **[M2]**

Keeps the family in the loop — directly serving the core goal.

- A reverse-chronological feed of **shared** changes: new contacts, new relationships,
  new notes/photos/interactions, and notable edits.
- Each item shows **who**, **what**, **which contact**, and **when**, and links to it.
- Private records **never** appear in another member's feed.
- Feed is filterable by member and by type.

### 2.11.1 Change digests & delivery **[M3]**

Each member can choose to be notified about recent household changes on a schedule, so you
don't have to open the app to stay in the loop.

- **Per-member frequency:** `none` (default), `daily`, `weekly`, or `monthly`. Purely a
  personal preference — it does not affect what others receive.
- **What's in a digest:** a summary of the **shared** activity since that member's last
  digest (new people, relationships, notes, photos, interactions, gifts), plus upcoming
  important dates. It is assembled per-member and **respects visibility** (§2.10) — another
  member's private records never appear. If nothing changed, no digest is sent.
- **Delivery channels** (independently toggleable per member):
  - **Email** — a formatted summary to the member's address (requires SMTP configured for
    the deployment).
  - **Webhook (HTTP POST)** — a JSON payload of the digest POSTed to a member-configured
    URL, for wiring into other systems (a home dashboard, Ntfy/Gotify, a chat bridge,
    an automation). Signed with a per-webhook secret (HMAC header) so the receiver can
    verify authenticity; delivery is retried a few times on failure.
- **How it runs:** a scheduled job (see docs/04) wakes on an interval, finds members whose
  next digest is due, computes each digest, delivers it over the enabled channels, and
  records the send time. Idempotent — a crash/retry never double-sends the same window.
- **Calm by design:** digests are opt-in, batched (never per-change spam), and a member can
  change frequency or turn everything off at any time in settings.

> Real-time, per-change notifications are intentionally out of scope — the digest is the
> notification surface. The webhook channel lets power users build their own real-time
> flows if they want.

## 2.12 Personal dashboard (Home) **[M2]**

The personal landing view — the first thing a member sees after signing in — giving an
at-a-glance overview of recent household life and acting as a launchpad into the details.

- Composed of **panels**, each summarizing one dimension and linking deeper:
  - **Recent activity** — who added or changed what lately (drawn from the activity feed,
    §2.11), attributed to each member.
  - **New people** — contacts recently added to the household.
  - **Recent notes** — the latest notes across visible contacts.
  - **Gifts given** — recent interactions of kind *gift* (who gave what to whom).
  - **Upcoming dates** — birthdays/anniversaries coming up (from §2.13).
  - **Your contributions** — quick return to what *this* member recently added or touched.
- **Personal, yet household-aware:** it is *this user's* dashboard (their upcoming dates,
  their contributions highlighted) while still surfacing shared household activity. It
  strictly respects visibility (§2.10) — other members' private records never appear.
- **Drill-down everywhere:** every item links to the relevant contact profile or panel
  (a note → that note on the contact; a gift → the interaction; a person → their profile),
  so the dashboard is a jumping-off point, not a dead end.
- **Powered by existing data** — activity log, contacts, notes, interactions (incl.
  `kind='gift'`), important dates. **No new tables:** it is a read/aggregation view
  assembled in the domain layer (test-first), reusing the access-control scoping.
- **Configurable later [M3]:** which panels appear and their order; compact vs. comfortable
  density.

> Relationship to §2.11: the activity feed is the household-wide change stream; the
> dashboard is the personal home that *composes* that feed with other summaries (new
> people, gifts, notes, dates) into one overview.

## 2.13 Important dates & reminders **[M2]**

- Contacts can have **important dates** (birthday, anniversary, custom), with optional
  yearly recurrence.
- A **reminders** view surfaces upcoming dates (e.g. next 30 days) across the household.
- Optional **email reminders** to members who opt in **[M3]**. No push spam.
- Birthdays derive automatically from a contact's birthdate.

## 2.14 Photos & media **[M1 avatar / M2 gallery]**

- Each contact has an **avatar** and a **photo gallery**.
- Upload from desktop or mobile camera/roll; images are stored on a media volume, with
  generated **thumbnails**; metadata (caption, taken-at, dimensions) in the DB.
- EXIF orientation respected; EXIF GPS/personal metadata **stripped** on ingest by
  default (privacy).
- Photos have their own visibility (2.10) and can be captioned.
- Basic gallery: grid, lightbox, set-as-avatar, delete. Reordering **[M3]**.

## 2.15 Data portability **[M2]**

- **Export:** a single archive (JSON manifest + media files) of the household's data.
- **Import:** the same format, for restore/migration.
- **Backups:** documented procedure to snapshot the SQLite file (WAL-safe) + media dir;
  optional built-in "download backup" button for admins.

## 2.16 Migration from Monica **[M2]**

A **first-class, guided migration** so a user coming from Monica can bring their data over
with the least possible friction. This is a priority feature — for many users (the author
included) it is the very first thing they will do.

- **Guided wizard**, not a raw import: Settings → Data → *Import from Monica*. The user
  uploads a Monica export; Stella parses it, shows a **preview & mapping summary** (e.g.
  "312 contacts, 540 relationships, 1 208 notes, 87 activities, 96 photos"), lets them
  confirm, then imports inside a single transaction with a progress indicator.
- **Accepted inputs** (support the formats Monica actually offers, in priority order):
  1. **Monica JSON export** (account settings → *Export → JSON*), the richest source.
  2. **Monica SQL dump** (self-hosters’ full export) — parsed read-only into the mapping.
  3. **vCard** (contacts only) as a fallback for partial data.
  The wizard auto-detects the format from the uploaded file.
- **Entity mapping** (Monica → Stella), documented and versioned:
  - Contacts → `contact` (names, nickname, gender, birthdate incl. Monica’s
    unknown-year/age precision → our `birth_date_precision`; deceased flag/date;
    job/company; "how you met" → `how_we_met`/`met_date`).
  - Contact fields (emails, phones, addresses, websites, social) → `contact_field`.
  - Relationships → `relationship`, mapping Monica relationship types to our built-in
    `relationship_type` set, **creating custom types** for anything unmatched.
  - Notes → `note`; Journal/other free text → notes with a source tag.
  - Activities → `interaction` (kind/date/participants).
  - Important dates / reminders → `important_date`.
  - Tags → `tag`; photos/avatars → `photo` (downloaded/copied into the media volume).
  - Gifts/tasks/debts and other out-of-scope Monica modules → **not lost**: imported as
    structured notes on the contact (clearly labeled), so nothing silently disappears.
- **Idempotent & safe:** dry-run preview first; import is atomic (all-or-nothing) and can
  be run into an empty household; a stable **source id** per record prevents duplicates if
  re-run. Everything imported is attributed to the importing user and set to the household
  **default visibility** (configurable in the wizard).
- **Report:** after import, a summary of what was imported, skipped, or approximated, with
  any warnings — no silent data loss.
- **Documented mapping table** ships in `docs/` so the transformation is transparent and
  reviewable.

> Implemented as a standalone, well-tested **domain module** (`domain/import/monica`) that
> takes a parsed export and emits Stella entities — pure and unit-testable (test-first),
> with the file upload/UI as a thin edge. See `docs/08-coding-guidelines.md`.

## 2.17 Settings **[M1/M2]**

- **Account:** profile, password, theme, default visibility, sessions/2FA.
- **Household** (admin): name, members & roles, invitations, relationship types, tags.
- **Data** (admin): export, import, backup.
- **Appearance:** theme (system/light/dark), accent color choice from Catppuccin set,
  reduced motion.

## 2.18 Progressive Web App **[M2]**

- Installable (manifest + icons), responsive, mobile-first capture flows.
- Offline: read-through cache of recently viewed contacts and the app shell; graceful
  offline messaging. Full offline write/sync is **out of scope** for v1.
- "Add to Home Screen" prompts handled tastefully.

## 2.19 Accessibility & i18n **[M1 baseline]**

- Keyboard navigable, focus-visible, ARIA where needed, WCAG **AA** contrast in both
  themes, `prefers-reduced-motion` respected.
- Copy is externalized to enable localization later; **English** ships first, with the
  structure ready for **German** **[M3]**.

## 2.20 Feature ↔ milestone summary

| Feature | Milestone |
|---|---|
| Auth (local), household, roles, invites | M1 |
| SSO via OIDC / Authelia (auth-code + PKCE, JIT, group→role) | M1 |
| Contacts + quick add + profile | M1 |
| Contact fields | M1 |
| Relationships (built-in types, incl. generic "knows") | M1 |
| Per-relationship description ("how they connect") | M1 |
| Notes (Markdown, pin) | M1 |
| Explorer: ego network from a profile (core feature, basic) | M1 |
| Tags | M1 |
| Search (FTS5) | M1 |
| Privacy (shared/private) | M1 |
| Avatars | M1 |
| Custom relationship types, merge/archive/delete | M2 |
| Interactions timeline | M2 |
| Explorer rich: in-place expand, in-graph search, connection path, circles + kinship edges, filters, layouts | M2 |
| Activity feed | M2 |
| Personal dashboard (Home, panels, drill-down) | M2 |
| Name-based duplicate & relative suggestions | M2 |
| Relationship intelligence (derived kinship, propagation) | M2 |
| Circles & shared contexts (groups, memberships, derived context links) | M2 |
| Important dates & reminders | M2 |
| Photo gallery | M2 |
| Export / import / backup | M2 |
| **Guided migration from Monica** (JSON/SQL/vCard, mapping, preview) | M2 |
| PWA install + offline shell | M2 |
| RP-initiated single logout | M2 |
| 2FA (local), email reminders | M3 |
| Change digests (daily/weekly/monthly) via email + webhook | M3 |
| @mentions, photo reordering, "haven't seen" hints | M3 |
| German localization | M3 |
