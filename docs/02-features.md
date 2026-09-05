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
- **Name and description are edited where they are read**: click either on the profile, a
  field takes its place, Enter saves and Escape puts it back. A name may never be emptied —
  a person with no name is unfindable in every list that sorts by one — so an empty name is
  refused and the field stays open with the reason. Everything else still lives in its own
  section's form.
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
- **The People directory** lists everyone the viewer may see under **letter groups** by
  surname (display name when there is none; digits and symbols under `#`), with a
  **find-as-you-type** field that matches any name they go by, their nickname or their
  description — accent- and case-insensitive, with no round trip — and a **last written
  about** column fed by the same read as *Quiet lately* (§2.12.1). Tag chips filter the
  list as before.

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

- **Shipped:** under the name fields of *Add a person*, an **Already in Stella?** box lists
  up to five people once a surname is typed: an exact full-name match first (*Same name — is
  this them?*), then the same surname, then a surname one typo away (*Similar surname*).
  Matching ignores case and diacritics and looks at each part of a compound surname
  (*Brunner* finds *Brunner-Keller*); ties go to the better-connected person. Each row links
  to the existing page (the duplicate check) and offers **Link as relative**: the new person
  is created and lands on their own page with the relationship editor open and that relative
  preselected (`?relate=`, the same hand-off a moment's "link these two?" uses). Only people
  the member may see are proposed, and only their visible relationships count.

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
- Adding a **partner** suggests nothing: a tie to their existing children is a *step*
  relationship, which has no stored type and needs none, because the derived block already
  names it. (Decided when this shipped; see the two **Shipped** notes below.)
- Roles are distinguished — **father/mother/parent, sibling, grandparent** — using the
  relationship types and each contact's gender where known.

**Principles:** suggestions are always **opt-in** (never silently written); derivations are
**consistent** (guardrails prevent contradictory edges, §2.4); explicit entry stays
possible when the connecting person isn't in Stella yet (e.g. record a grandparent
directly). Implemented as a **pure kinship-inference engine** over the graph — no new
tables, fully unit-testable (test-first).

- **Shipped:** the person page's **People** tab lists the entered relationships first, then
  an **Also related · worked out, not entered** block naming what follows from them —
  grandparents and great-grandparents, aunts and uncles, nieces and nephews, cousins,
  siblings and half-siblings, in-laws and step-family — each with *via* the person it comes
  through, gendered where the gender is on record and neutral where it is not. A pair that
  already carries any stored relationship keeps the name the household gave it and is never
  re-derived. Half-sibling is claimed only where both people have two parents recorded, so
  it is never a guess. Inference reads only the people and links the viewer may see, so a
  derived label cannot reveal a private person.
- **Shipped:** storing a parent or sibling link brings back an **Also true?** block with the
  links it implies — a parent added to one child is offered to that child's siblings, a new
  sibling link offers the parents each side already has — each with the sentence explaining
  it and its own *Add this too*. Nothing is written without that click, and the remaining
  suggestions stay while they are worked through. A partner's tie to existing children is
  deliberately not offered: it is a step relationship, which the profile already names
  without storing anything.

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
- **Finding one among many.** The Circles page filters as you type over name and description,
  with one chip per kind that is actually there, each carrying its count. The counts follow the
  query, so no chip ever leads to an empty page, and a kind the query has filtered away falls
  back to *All*. Both run in the browser over the circles already loaded — a household has few
  enough of them that a round trip per keystroke would only add latency. The chips appear only
  when there is more than one kind to choose between.
- Circles are shareable records under the standard visibility model (§2.10); a membership
  is visible when both its Circle and the contact are visible. Powered by a small,
  test-first domain module over the membership data — extends the graph without touching
  pairwise-relationship logic.

- **Adding a membership is one field with autocomplete:** as you type a circle name, the
  UI suggests **existing circles** (matched fuzzily, visibility-scoped). Pick one to join
  it; if you type a name that doesn't exist yet, **the circle is created on the fly** from
  that input (kind/period can be refined later). No separate "create circle first" step.
- **Circle overview page:** a dedicated screen of circle **cards**, each with kind, member
  count, description and the first few faces (docs/05 §5.5). Opening a circle shows its
  **members** as a grid with roles and lets you add/remove members. Filters by kind and
  period, and search, are still to come.
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
  contacts **[M2]** (a mention creates a soft link, surfaced on the mentioned contact —
  same id-based, visibility-safe mechanism specified for the journal in §2.20.1).
- Notes are individually **shared or private** (see 2.10).
- Full-text searchable (2.9).

## 2.6 Interactions / activity log **[M2]**

A lightweight journal of contact touchpoints, distinct from notes.

- An interaction has: a **type** (met in person, call, video, message, letter, gift,
  other), a **date**, an optional **title/summary**, an optional **description**, and
  optional **participants** (other contacts present).
- Rendered on the profile as part of the person's **story** (§2.23), interleaved with journal
  entries in one chronological read.
- Powers "**last contacted**" on the profile and "haven't seen in a while" hints **[M3]**.
- **Shipped:** the timeline and the *Log interaction* form live in the **Interactions**
  section of the person page. An interaction is about one **subject** and records a **day**
  (not a time); participants are chosen from the people the member can see, and the subject
  cannot be their own participant. Visibility follows the child-record rule (§2.10): a
  private interaction is only ever listed to its author, and a participant the viewer may
  not see is left out rather than named. Only the member who logged it can remove it.
  **"Last contacted"** in the profile header is derived from the timeline *as the viewer
  sees it*, so it never betrays a private touchpoint. Logging one also posts to the
  household stream (§2.22.2). The "haven't seen in a while" hint is still M3.

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
- Feed is filterable by member and by type **[later]**.
- **Shipped as the household stream on Home (§2.22.2):** a scoped query over existing tables,
  no event table; the feed's filters and "notable edits" come later.

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

> **Current state:** Home is the capture field + household stream of §2.22, with a **rail**
> beside it holding two bands: **Coming up** (§2.13.3) and **Quiet lately** (below). The
> panel layout underneath is where further summaries (gifts) slot in once those exist; "new
> people", "recent notes" and "your contributions" are covered by the stream.

### 2.12.1 Quiet lately

- The rail names the people **nothing has been written about for 90 days** — no journal
  entry and no touchpoint the viewer may see — capped at five, each with one action:
  *Write a moment*. Like *Coming up*, the band is **absent entirely when nobody is quiet**.
- It measures **recorded attention, not contact**: Stella cannot know about the call nobody
  logged. The band is a prompt to write something down, which is the same act either way.
- **Order:** people whose recorded story went silent come first, longest silence first; only
  then the people nobody has written about at all. A household that has just imported its
  address book would otherwise see the same five empty records for months.
- A person never written about counts from **the day they were added**, so someone added
  yesterday is new, not neglected. **Deceased people are excluded** (§2.2).
- Visibility is the filter: a private entry counts only for its author, so from another
  member's chair that person really is quiet.
- Pure and test-first (`domain/attention`: `quietContacts` over an `AttentionRepository`
  port whose one scoped read also gives People its *last written about* column).

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

A date is either on the household's radar or it is not — there is no separate reminder
object to create, schedule and maintain. And there is no reminders *screen*: what is coming
up appears where the household already looks, at the top of the Home stream (§2.22.2), so
the stream reads as one timeline with the future above the past.

### 2.13.1 The dates themselves

- A contact can have **important dates**: `birthday`, `anniversary` or `custom` (a custom
  one must be named, or it means nothing three months later). Each carries whether it
  **recurs yearly** and whether it should **remind** — the "show it on Home" switch.
- A date may be a full ISO day or a year-less `--MM-DD` when the year is unknown; the age
  or count is then simply omitted rather than guessed.
- Dates are **child records of a contact** with no visibility of their own: they inherit
  the contact's, enforced by the adapter's scoped reads (§2.10).
- Dates are listed, added and removed in a **Dates** section on the person page.

### 2.13.2 Birthdays are derived, never duplicated

A birthday comes from `contact.birth_date`, captured on the contact form. No
`important_date` row is written for it, so the two can never disagree.

An **explicit `birthday` row overrides the derived one** for that contact. That is the one
mechanism behind two features: correcting a birthday without touching the profile, and
**muting** one — an explicit birthday row with `remind` off silences it.

### 2.13.3 What Home shows

- The **Coming up** band in Home's rail (§2.12) lists the next occurrences inside a 30-day
  horizon, soonest first, capped at five. It is **absent entirely when nothing is due** — a permanently
  empty panel teaches people to stop looking.
- Each entry reads as a countdown ("today", "tomorrow", "in 4 days") rather than a
  calendar entry, and says what the occasion is ("turns 11", "12 years together").
- Each entry offers exactly **one action: write a moment about it** — `/?about=<contactId>`
  opens the capture field with that person's handle already in it (§2.22.1). This is the
  point of a reminder: it closes back into the app's core verb instead of just informing.
- **Deceased contacts are excluded** (§2.2), and a one-off date disappears once it passes.
- 29 February falls on **1 March** in a common year, so an anniversary is never skipped.

### 2.13.4 Later

- Optional **email reminders** to members who opt in **[M3]**. No push spam.
- Custom lead times ("two weeks before"), snoozing, and an ICS feed are deliberately out
  of scope until the simple version has been lived with.

## 2.14 Photos & media **[M1 avatar / M2 gallery]**

- Each contact has an **avatar** and a **photo gallery**.
- Upload from desktop or mobile camera/roll. **Avatars are processed in the browser** (M1):
  the client applies EXIF orientation, centre-crops to a square, and produces a full + a
  thumbnail JPEG; re-encoding via canvas **drops all EXIF/GPS metadata** (privacy) and keeps
  uploads small, so the server needs no native image library. The server validates (magic
  bytes, size) and stores both variants on the media volume; dimensions/size in the DB.
- EXIF orientation respected; EXIF GPS/personal metadata **stripped** (by the client re-encode
  for avatars; on ingest for gallery photos). Server-side processing for the M2 gallery
  (thumbnails, captions, taken-at) is a later choice — see `docs/04` §4.6.
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

- **Shipped (SQL dump):** *Settings → Data → Import from Monica* takes a `mariadb-dump` of
  the Monica database, plain or gzipped, and walks three steps: **preview** (counts per
  entity, the custom relationship types it will create, and a "left out, and why" list),
  **import** (one transaction), then **photos** — the admin points the browser's folder
  picker at Monica's `storage/app/public/photos`; each file is matched by name, downscaled
  in the browser like every other upload, and stored, with Monica's avatar choice carried
  over. Everything gets a **stable source id** (`monica:contact:12`), so importing the same
  dump twice writes nothing new and the report says so. The mapping table is
  [monica-mapping.md](monica-mapping.md). Monica's JSON export and vCard are not read yet;
  the wizard is the same for them once they are.

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

## 2.20 Personal journal (per-person diary) **[M2]**

A **journal** is a per-person diary: household members chronicle a contact's life day by day —
a child's milestones, a friend's big moments — in a warm, readable timeline. It is distinct
from **notes** (§2.5): notes are reference facts about a person ("allergic to peanuts",
"met at Anna's wedding"); journal entries are dated diary moments ("today she took her first
steps in the garden").

- **Per day.** Each entry is *about* a specific day (`entry_date`, an ISO date), separate from
  when it was written. The profile shows entries as a timeline, newest day first, grouped by
  date and rendered from Markdown (safe render, same pipeline as notes — raw HTML escaped,
  unsafe links dropped).
- **Markdown, rendered beautifully.** Authors write in Markdown; it is server-rendered to safe
  HTML for a nice reading view.
- **Photos.** An entry can carry photos (§2.14 media pipeline: browser-side downscale + EXIF/GPS
  strip on upload, stored on the media volume, served through the authenticated `/media` route).
  Images render inline in the entry.
- **Visibility (§2.10).** Each entry is **shared** (the whole household sees this person's
  journal) or **private** (only the author). Default is the author's household default. A
  private entry is a genuine diary — no one else, admin included, can read it.
- **One entry per slot.** Uniqueness is per **(contact, author, day, visibility)**: saving the
  same day again *edits* that entry rather than duplicating, so "one entry per day" holds while
  still letting a member keep both a shared and a separate private entry for the same day.
- **Ownership.** Entries are attributed to their author; you may edit and delete **your own**.
- Implemented as a pure, test-first domain module (`domain/journal`) over a `JournalRepository`
  port; visibility-scoped reads live in the Drizzle adapter; the route is a thin edge.
- Monica's **journal** entries map here on import (§2.16); other Monica free-text falls back to
  notes.

### 2.20.1 @-mentions of people (passive references) **[M2]**

Inside a journal entry you can reference another person already in Stella. The reference is
**clickable** when rendered, and it surfaces on the referenced person as a **passive entry** —
they didn't get an entry of their own, they were *mentioned* in someone else's — showing which
person's journal it came from. Example: in *Beat*'s journal you write "hiked with `@SandraBrunner`";
on *Sandra*'s profile a passive item appears: "mentioned in *Beat Steiner*'s journal, 12 Jul".

- **Authoring.** Typing `@` opens an autocomplete over the contacts you may see (§2.10),
  filtered by name as you type; picking one inserts the mention. The on-screen form is
  `@FirstnameLastname` with no space, e.g. `@AnnaWeber`. Write `\@` for a literal "@".
- **Stored form is id-based, not name-based.** A confirmed mention is saved as a stable token
  that embeds the contact **id** — so it survives a later rename and never resolves to the wrong
  person when two people share a name. The typed `@AnnaWeber` is only the lookup key. A raw,
  unconfirmed `@FirstnameLastname` (e.g. pasted text) is resolved best-effort when the entry is
  saved: a single exact first+last match becomes a mention; anything ambiguous or unmatched is
  left as literal text.
- **Rendering.** A mention renders as a chip/link to `/contacts/{id}`, labelled with the
  person's **current** display name (looked up at render time). It goes through the same
  safe-render pipeline as the rest of the body (raw HTML escaped, unsafe links dropped); the
  mention chip is the only non-Markdown token the renderer injects.
- **Passive appearance on the referenced person.** On the mentioned contact's profile a
  **"Mentioned in"** list shows every entry that references them, newest first. Each item names
  the **source person** (whose journal — "in *Beat Steiner*'s journal"), the **author**, the
  **entry date**, and a title/snippet, and links to that entry. It is **read-only** here: the
  entry is owned and edited on the source person's journal. A self-mention (an entry in a
  person's own journal that references that same person) creates no passive item.
- **Visibility (§2.10) — a mention never widens access.** A passive item is shown only to
  viewers who may already see the **source entry** (a private entry ⇒ only its author), the
  **source contact**, and the **referenced contact**. To stop a mention leaking a private
  person's existence, a **shared** entry may reference only contacts the whole household can
  see; a **private** entry may reference anyone its author can see. The autocomplete only offers
  contacts allowed for the entry's current audience.
- **Lifecycle.** Saving or editing an entry re-parses its body and rebuilds that entry's mention
  links to match (`journal_mention`, §3.3); deleting the entry removes them (cascade). Because
  only the id is stored, renaming the referenced person updates every chip automatically.
- **One shared pipeline.** Notes carry the same soft-link idea (§2.5, `note_mention`); the
  parser, id-resolver, and chip renderer are shared between notes and journal rather than
  duplicated. Framework-agnostic domain module, test-first (`docs/08` §8.3).

## 2.22 Moments & the household stream **[M2]**

The fastest way to record a memory, and the way the family stays in the loop. Where Monica
asks you to fill in modules, Stella asks **"what happened?"** — one field on Home turns a
sentence like *"met @Julia at the lake, she's @Marco's sister"* into a person, a journal
entry and a household update, without leaving the page. Concept + clickable prototype:
`docs/concepts/moments-capture-concept.html`.

### 2.22.1 Capture ("What happened?")

- **One field, on Home.** A plain text field (Markdown allowed) with the same `@`-mention
  autocomplete as the journal (§2.20.1). On desktop it sits at the top of Home; on a phone the
  stream shows a one-line *What happened?* bar and the composer opens as a **sheet** over it,
  from that bar or from the **pencil in the middle of the tab bar** (`/?compose`, so the open
  state lives in the URL and survives a reload). `⌘K` / `Ctrl+K` from anywhere opens the
  **command palette** (docs/05 §5.4), whose first row is *Write a moment* — so `⌘K`, `Enter`
  still lands here.
- **A moment *is* a journal entry.** Nothing new is stored: the first person mentioned becomes
  the entry's contact (the *anchor*, whose journal it lands in); every other mention is stored
  as a `journal_mention` exactly as today. The composer shows the anchor while typing
  ("Goes to *Julia*'s journal, mentions 1"). A moment therefore needs **at least one mention**.
  Day, visibility and photos behave as in §2.20 (default: today, shared; photos processed in
  the browser).
- **Create people inline.** When the typed `@name` matches nobody, the picker offers
  *"Create “Name”"*. Picking it inserts the handle and queues the name; on save the server
  creates that contact first (quick-add with just a display name, taking the **moment's
  visibility**) and then resolves the handle to it. Everything else about the person is filled
  in later on their profile.
- **Relationships are offered, not parsed.** Free text is never interpreted. After saving a
  moment that mentions two or more people, Home shows a quiet, dismissible hint —
  *"Link Julia and Marco?"* — whose one action opens Julia's profile with the relationship form
  pre-filled with Marco (`/contacts/{a}?relate={b}`). A wrong guess costs nothing.
- **Visibility (§2.10).** A shared moment may mention only household-visible people; a private
  moment anyone the author can see — the journal rule. A person created inline takes the
  moment's visibility, so a private moment never introduces a shared person.
- **Progressive.** The form posts natively; the picker, the inline-create queue and the photo
  processing are enhancements.

### 2.22.2 Household stream (Home)

- Home is a single **reverse-chronological stream**, grouped by day, of what the household
  did: **moments** (journal entries, with author, anchor, mentioned people as chips, photos),
  **new people** ("Lena added *Thomas Lang*"), **new relationships** ("Leo linked *Marie*
  → colleague of *Andy*") and **logged interactions** ("Lena logged a call with *Oma*",
  §2.6). Every item links to the person it is about.
- **Visibility is the filter.** The stream is a *query* over the existing tables, scoped by the
  central rules (§3.7): a private moment or interaction appears only in its author's stream,
  marked with a lock; a private person only in their creator's; a relationship only when both
  ends are visible. There is no event/log table and nothing is written twice.
- **Deliberately not in the MVP:** filters by member or type, moments without any person
  ("family trip"), parsing relationships out of text,
  reactions or comments. The previous dashboard panels (new people, recent notes, your
  contributions) are folded into the stream; dedicated panels (upcoming dates, gifts) return
  with their base features (§2.12).
- Implemented as a pure, test-first domain (`domain/moments`: capture orchestration over the
  contact + journal ports; `domain/stream`: merge/limit of scoped reads over a
  `StreamRepository` port); the Drizzle adapter owns the scoped queries; Home is a thin edge.

## 2.23 The story timeline **[M2]**

Two things are recorded against a person and both are chronological: the **journal** someone
wrote about them (§2.20) and the **touchpoints** someone had with them (§2.6). They used to be
two lists, one under the other, each with its own dates — leaving the reader to merge them by
eye to answer the only question the page is really asked: *what has been going on with this
person?*

The **story** is that merge, done once, server-side.

- **One order.** Newest day first; within a day, the later recording first. A dead heat orders
  by kind, so a page boundary always falls in the same place and paging can neither repeat nor
  swallow an item.
- **One page at a time.** Both sources are keyset-paginated on `(day, recorded_at)` and merged
  into pages of twelve. Each source carries its own resume point, because a page can be filled
  entirely by one of them while the other still has rows waiting. *Show earlier* fetches the
  next page from `POST /contacts/:id/story`, which takes the previous cursor back verbatim.
- **Visibility is unchanged (§2.10).** Each source is read through its own scoped query before
  the merge, so a private entry or touchpoint reaches its author and nobody else. The merge
  never sees a row the viewer may not.
- **Who wrote it.** Every item names its author: *you* on your own, otherwise the member's
  first name — which is what makes a shared household legible ("Nina logged that call, not
  me"). An item whose author has left the household names nobody rather than guessing. The
  journal page names the author the same way.
- **Removing.** An item can be removed from the story by whoever wrote it — previously a
  journal entry could only be removed from the full journal page. There is no confirmation
  dialog: the item leaves the story at once and a toast offers *Undo* for eight seconds. The
  removal reaches the server only when that window closes or the page is left, so *Undo*
  simply never sends it (docs/04 §4.9). The same holds for an entry removed on the journal
  page. If the removal fails once it is sent, the item comes back and the toast says so.
- **Everything removable works this way.** Contact details (§2.3), dates (§2.13.1), tags
  (§2.9), a circle left on the person page and a member removed on the circle's own page
  (§2.4) all remove through the same button and the same window; the section's count follows
  the row, so it never counts something the screen no longer shows. Saving anything says
  *Saved* in the same place and closes the form it was typed in.
- **Writing** still happens where it did: the journal page for an entry with photos, the
  *Log contact* form on the person page for a touchpoint.
- Implemented as a pure merge (`domain/story`: `mergeStory`, unit-tested for every ordering
  and cursor rule) plus a thin read that fetches one page of each source; both Drizzle
  adapters own their scoped keyset queries.

## 2.21 Feature ↔ milestone summary

| Feature | Milestone |
|---|---|
| Auth (local), household, roles, invites | M1 |
| SSO via OIDC / Authelia (auth-code + PKCE, JIT, group→role) | M1 |
| Contacts + quick add + profile | M1 |
| Contact fields | M1 |
| Relationships (built-in types, incl. generic "knows") | M1 |
| Per-relationship description ("how they connect") | M1 |
| Notes (Markdown, pin) | M1 |
| Personal journal (per-person diary, Markdown, photos, per-day) | M2 |
| Explorer: ego network from a profile (core feature, basic) | M1 |
| Tags | M1 |
| Search (FTS5) | M1 |
| Privacy (shared/private) | M1 |
| Avatars | M1 |
| Custom relationship types, merge/archive/delete | M2 |
| Interactions timeline | M2 |
| Explorer rich: in-place expand, in-graph search, connection path, circles + kinship edges, filters, layouts | M2 |
| Activity feed → household stream on Home | M2 |
| Story timeline (journal + touchpoints merged, per person) | M2 |
| **Moments**: one-sentence capture with inline person creation + link hint | M2 |
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
