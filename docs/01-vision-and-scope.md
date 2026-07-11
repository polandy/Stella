# 01 — Vision & Scope

## 1.1 Vision

Stella is a **shared memory for a family's relationships**. It is the place where a
household collectively remembers the people in their lives: who they are, how they are
connected, what was said, when they were last seen, and what matters to them.

Where a traditional address book stores static facts, and Monica tries to be an
exhaustive personal-life database, Stella aims for a narrower, warmer target: a tool a
family actually enjoys opening, that makes it effortless to jot down "we met Julia at
the lake, she's Marco's sister, has two kids" — and to have that instantly available
and understandable to everyone else in the family.

## 1.2 Guiding principles

1. **Family over individual.** The default unit is the household. Sharing is the norm;
   privacy is a deliberate, per-record choice.
2. **Clarity over completeness.** We would rather ship five features that feel
   effortless than fifty that feel like a form. Every screen must justify its presence.
3. **The graph is the product.** People and their relationships are the core. The
   relationship visualization is a first-class feature, not a novelty.
4. **Calm software.** No notifications begging for attention, no engagement mechanics.
   The app is useful when you open it and invisible when you don't.
5. **Own your data.** Self-hosted, single file, trivially backed up and exported. No
   lock-in, no cloud dependency, no telemetry.
6. **Lean by construction.** Low server footprint is a design constraint, not an
   afterthought. One small container should comfortably serve a family.
7. **Beautiful and accessible.** A polished, Catppuccin-based aesthetic in both light
   and dark, meeting WCAG AA contrast.

## 1.3 Target users

- **Primary:** the author and their family — a household of roughly 2–10 members who
  want a shared record of contacts and acquaintances.
- **Secondary:** other privacy-conscious families and small close-knit groups who want
  to self-host a simple relationship tracker.

We explicitly do **not** target: sales teams, large organizations, or public
multi-tenant SaaS use.

### Personas

- **The Curator (admin).** Sets up the instance, invites family members, tends the data.
  Comfortable running a Docker container.
- **The Contributor (member).** Adds people they meet, writes notes, uploads photos from
  their phone. Wants it to be as fast as texting.
- **The Looker-upper.** Rarely writes; opens the app to answer "wait, who was that
  again, and how do we know them?"

## 1.4 Core use cases

1. **Capture a new acquaintance quickly**, ideally from a phone, in under a minute.
2. **Record how a person relates to others** already in the system (family trees,
   friend groups, colleagues).
3. **Keep a running log of notes and interactions** about a person over time.
4. **Attach and browse photos** of a person or of shared moments.
5. **Look someone up** and immediately understand who they are and how the family knows them.
6. **Explore the relationship graph** — pick a person and see their web of connections.
7. **Stay in the loop** — see what other family members have recently added or changed.
8. **Keep some things private** — a contact or note only I can see.

## 1.5 In scope (v1)

- Household accounts with multiple members and roles (admin / member).
- Contacts (people) with rich but optional detail.
- Contact fields (phones, emails, addresses, socials, custom).
- Relationships between contacts, with typed, directional, reciprocal links.
- Notes (Markdown) attached to contacts, with pinning.
- Interactions / activity log ("we met", "called", etc.) with dates.
- Important dates (birthdays, anniversaries) and simple reminders.
- Photos: per-contact avatar and a per-contact gallery.
- Tags for lightweight categorization.
- Relationship graph visualization with filtering and ego-network focus.
- Full-text search across contacts and notes.
- Per-record privacy (shared vs. private).
- Household activity feed ("what's new").
- Light / dark theme (Catppuccin), responsive layout, installable PWA.
- Data export (JSON + media) and import of the same format.
- Backups of the SQLite file + media volume.

## 1.6 Out of scope (v1) — deliberately

- **Multi-tenant SaaS** (many independent families on one shared public instance).
  The data model leaves the door open, but v1 assumes one household per deployment.
- **Two-way calendar / email / social-media sync.** No CardDAV/CalDAV, no Google
  Contacts sync in v1 (candidate for later).
- **Native mobile apps.** PWA covers mobile in v1; native is a later possibility.
- **AI features** (auto-summaries, enrichment). Not a v1 concern.
- **Financial tracking, gift management, task/journal modules** à la Monica. Kept out
  to preserve focus; may be reconsidered individually later.
- **Real-time collaborative editing.** Concurrent edits are handled with simple
  last-write-wins + an activity trail, not live cursors.
- **Public sharing / external links** to contacts.

## 1.7 Success criteria

Stella v1 is successful if:

- A non-technical family member can add a new person with a photo and a relationship
  from their phone in **under a minute**, without instruction.
- Any member can answer "how do we know this person?" in **one screen**.
- The relationship graph makes at least one connection **visible that wasn't obvious**
  from the list view.
- The whole thing runs comfortably in **under ~150 MB RAM** on a home server.
- A full **backup is a single file copy** (plus the media folder).

## 1.8 Non-goals as a feeling

If Stella ever feels like *filling out a CRM*, we've failed. It should feel like
*keeping a shared family notebook that happens to be smart about relationships.*
