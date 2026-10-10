# Concept — Who may remove what

Status: **concept** — decided with the maintainer on 2026-10-10 (§3), nothing built yet.
Roadmap: docs/06 M3, *Who may remove what*. When a slice is built, its rule moves into the
feature docs (docs/02, docs/03 §3.7) and this file shrinks; once all slices are built it is
folded in and deleted.

---

## 1. Why

A note can be neither edited nor deleted today — not even by whoever wrote it (docs/02 §2.5).
A wrong or outdated note stays on a person's page forever. Its **author or an admin** should
be able to remove it. Looking at every kind of record turned up a mixed set of rules (§2).
The concept settles one rule for the records that have an author and writes down on purpose
where the household-wide rule stays.

---

## 2. Today, per record kind

Checked against `main` at `3271403` (#358). "Sees it" means the visibility rules of
docs/03 §3.7. No kind looks at the admin role: `Viewer` (`access/visibility.ts:15`) carries
no role, so `access/` cannot express it. Only routes know about admins
(`auth/guards.ts:28`, used for relationship types and household settings).

| Kind | Edit | Remove | Evidence |
|---|---|---|---|
| **Note** | nobody | nobody | `domain/notes/notes.ts:31` — the port has insert, list and mentions only |
| **Moment / journal entry** | author (title and body) | author | `domain/journal/journal.ts:203,271` → `db/journal-repository.ts:82,152` (`updateOwn`, `deleteOwn`) |
| **Touchpoint** (interaction) | nobody | author | `domain/interactions/interactions.ts:170` → `db/interaction-repository.ts:166` (`deleteOwn`) |
| **Person photo** (gallery) | caption, visibility: author | author | `domain/media/gallery.ts:79,95,108` → `db/photo-repository.ts:59,89` |
| **Circle photo** | caption, role, pin: anyone who sees it; visibility: author | author | `domain/circles/circle-photos.ts:258,306,318` |
| **Gift** | anyone who sees it; visibility: author | anyone who sees it | `domain/gifts/gifts.ts:227,261` |
| **Important date** (and its reminder) | — | anyone who sees the person | `routes/(app)/contacts/[id]/actions/dates.ts:63` |
| **Contact field** | anyone who sees the person | anyone who sees the person | `routes/(app)/contacts/[id]/actions/fields.ts:78,96` |
| **Relationship** | anyone who sees both ends | anyone who sees both ends | `domain/relationships/relationships.ts:666,703` → `db/relationship-repository.ts:106,133` |
| **Circle membership** | role: anyone who sees it | anyone who sees it | `domain/circles/circles.ts:394,414` |
| **Circle** | nobody (role names only) | nobody | `routes/(app)/circles/[id]/+page.server.ts` — no delete or rename action |
| **Person** | anyone who sees them | delete, archive: anyone who sees them | `domain/contacts/remove-contact.ts:47`, `domain/contacts/contacts.ts:441` |

There is no *comment* record; *comment* is a word the glossary rules out for a note
(docs/03 §3.0). There is no *reminder* record either: a reminder is the `remind` flag on an
important date (docs/02 §2.13).

**Where the rule is missing or inconsistent:**

- **Note:** the only authored kind with no way out at all, not even for its author.
- **Moment / journal entry:** author-only, consistent. An admin cannot clear a shared entry
  left by a member who has gone.
- **Touchpoint:** can be removed but never corrected, so a typo means delete and log again.
  Same admin gap as the journal.
- **Person photo:** author-only, consistent. Same admin gap.
- **Circle photo:** caption, role and pin are open to anyone who sees the photo, while a
  person photo's caption is author-only. Kept on purpose (§3.6).
- **Gift:** anyone may rewrite or remove it, but only its author may re-scope it. This is
  coherent: a gift is a household fact with an author attached.
- **Important date, contact field:** "household fact" rule, consistent. But the remove
  actions go from the route straight to the repository (§6), and the domain's
  `removeImportantDate` is never called.
- **Relationship, circle membership:** "household fact" rule, consistent.
- **Circle:** nobody can delete or rename one. Out of scope here (§5).
- **Person:** anyone who sees them may delete them. This is the one removal that writes an
  activity entry (`contact.deleted`).
- **Undo** (docs/02 §2.23): journal entries, touchpoints, dates, fields, gifts, tags,
  memberships and relationships go through the held 8-second window (`lib/undo/keys.ts:8`).
  Notes are not on that list.
- **Activity log** (docs/03 §activity_log): only deletions of a person, merges, renames,
  last-name batches, Immich links and exports write a row. Removing a child record leaves no
  trace.

---

## 3. Decisions

Decided with the maintainer on 2026-10-10.

### 3.1 Which kinds: authored records

The rule covers the records that have an **author** whose words or picture they are:
**note, moment / journal entry, touchpoint, person photo, circle photo.**

**Household facts** are dates, contact fields, relationships, circle memberships, gifts and
tags. They keep today's rule: anyone who sees them may change or remove them. They describe
the person, not what a member said, and dates, fields and relationships carry no author to
check against. Persons are unchanged too.

### 3.2 Who: the author, and an admin on a shared record

An authored record may be removed by:

- its **author**, always; or
- an **admin** of the household, when the record is **shared**.

An admin gains nothing on a **private** record (docs/02 §2.10). An admin cannot see one, so
there is nothing to offer. Every other member sees no *Remove* on someone else's record.
Removing is the only thing an admin may do to another member's record. **Editing stays with
the author** (§3.5): an admin may take someone's words away but never rewrite them.

The rule lives in `access/`, in the same two forms as every visibility rule:

- a predicate, e.g. `canRemoveAuthored(remover, record)`;
- its SQL twin, e.g. `authoredRemovableBy(remover)`.

`visibility-parity.test.ts` holds the pair to the same rows. `remover` is a `Viewer` plus
whether they are an admin, filled by the route from `locals.user.role`.

### 3.3 How: delete, with the 8-second undo

Removing is a **real delete**, the same way journal entries and touchpoints go today:

1. The row leaves the screen at once.
2. A toast offers *Undo* for eight seconds.
3. The delete is sent only when that window closes or the page is left (docs/02 §2.23).

After that the record is gone. Its mentions cascade, its photo bytes are unlinked and the
search index drops it. Getting it back takes a backup or an archive export. There is no trash
and no soft delete: either would need a `removed_at` column on every kind and a filter in
every read.

The authorization is checked when the delete reaches the server, not when the button is
pressed. A record whose author made it private during the window is refused like any other
record the remover may not touch.

### 3.4 Undo and the activity log

- The remover gets the same undo, whether they are the author or an admin.
- **A removal by someone other than the author** writes one activity entry, in the delete's
  transaction (docs/04 ADR-120). It is a new `ActivityEvent`, e.g.
  `{ kind: 'record.removed', recordKind, contactId, authorId }`. It is `shared`, because only
  a shared record can be removed by someone else, so the household — the author included —
  reads it in *What's new*: *"Andy removed your note on Kurt."* (*"… Nina's note …"* for
  everyone else). It names the kind, the person and both members, **never the text**. The
  log outlives the record and must not keep what was removed.
- **An author removing their own record writes nothing**, as today. The undo window is their
  safety net, and the household is not told about a member tidying up.

### 3.5 Note editing comes with it, author only

The author may edit a note's title and body in place, as the journal's *Edit* does
(docs/02 §2.20). The rules that follow from that:

- Mentions are rebuilt and the search index is refreshed.
- Visibility is part of the record, not the text. Changing it stays out of the editor here,
  as with a journal entry.
- An admin gets *Remove* on another member's shared note, never *Edit*.

### 3.6 Circle photos keep their shared curation

A circle photo's caption, role and pin stay open to anyone who sees it. They are the
circle's curation: the class photo's caption is the class's. Visibility stays with whoever
added the photo, and removal moves to §3.2. A person photo's caption stays author-only,
because a person's gallery is closer to a journal than to a shared album. The difference is
on purpose, and docs/02 §2.14 says so once slice 3 lands.

---

## 4. Slices

Each slice is one PR. It is test-first in `access/` and `domain/`, carries its UI, both
languages (`en` and `de`) and its docs, and goes through the delivery loop (owner hand-test,
then e2e on the branch).

1. **The rule, and removing a note.**
   - `canRemoveAuthored` and its SQL twin in `access/`, with parity tests.
   - The remover descriptor (a `Viewer` plus admin) built in the route.
   - `removeNote(deps, remover, id)` in `domain/notes/`, and `deleteRemovableBy` on the note
     repository.
   - The `record.removed` activity event and its line in both languages.
   - A `note` removal kind for the undo window, and *Remove* on a note: the author's own,
     plus an admin's on shared ones.
   - Docs: docs/02 §2.5, §2.11, §2.23; docs/03 §3.7 and `activity_log`; `using-stella.md`.
2. **Editing a note.**
   - `editNote(deps, author, input)`: author only, title and body, mentions rebuilt, search
     reindexed.
   - The note's *Edit* on the person page.
   - Docs: docs/02 §2.5, `using-stella.md`.
3. **The other authored kinds.**
   - Journal entries and moments, touchpoints, person photos and circle photos move from
     `deleteOwn` to the shared rule.
   - Admins see *Remove* on other members' shared items: in Activity, on the journal page, in
     both galleries — wherever the author's *Remove* already shows.
   - Each such removal writes `record.removed`.
   - Docs: docs/02 §2.6, §2.14, §2.20, §2.22, §2.23; docs/03 §3.7.

The finding in §6 is not a slice here. It is a separate refactor PR.

---

## 5. Open questions

- **Offline.** Notes are written through the command outbox (docs/02 §2.18). Is removing a
  note a queued command, or does it wait for a connection like removing a journal entry?
  The lean is to wait: an admin's removal of someone else's work should not sit in a phone's
  queue.
- **A photo that is someone's picture.** A circle photo or person photo can be the source of
  a profile picture cut (`cutProfilePicture`, docs/02 §2.14). When an admin removes it, does
  the cut stay? Today's author delete decides that already. Slice 3 checks that path and
  writes it down.
- **Touchpoint editing.** A touchpoint still cannot be corrected (§2). Is that a roadmap item
  of its own?
- **Circles.** Nobody can delete or rename a circle. Is that a separate roadmap item?
- **Departed members.** A member who leaves keeps their `created_by`. Admin removal (§3.2)
  covers their shared records. Should their private records be purged when the member is
  removed? That belongs with account removal (docs/02 §2.1), not here.

---

## 6. Finding outside the scope

Removing an **important date** or a **contact field** goes from the route straight to the
repository: `actions/dates.ts:63` and `actions/fields.ts:96` call
`locals.services.records.{importantDates,contactFields}.remove`. That skips the domain layer.
`removeImportantDate` (`domain/dates/important-dates.ts:126`) is never called.

It is **not an access bypass**. Both actions check that the viewer sees the person first, and
the delete pins `contact_id`, so a foreign id touches nothing. Decided 2026-10-10: kept as a
TODO for a small separate refactor PR. That PR routes both removals through domain use-cases
that take the viewer and check visibility themselves.
