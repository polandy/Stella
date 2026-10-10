# Concept — Who may remove what

Status: **concept, slices 1–3 built** — decided with the maintainer on 2026-10-10 (§3, §5).
Slices 1 (the rule, and removing a note), 2 (editing a note) and 3 (removing the other authored
kinds) are built: their rules now live in docs/02 §2.5, §2.6, §2.10, §2.11, §2.14, §2.20, §2.23
and docs/03 §3.7 and `activity_log`, and are not repeated here. Slice 4 is still to build.
Roadmap: docs/06 M3, *Who may remove what*. When a slice is built, its rule moves into the
feature docs (docs/02, docs/03 §3.7) and this file shrinks; once all slices are built it is
folded in and deleted.

---

## 1. Why

A note could be neither edited nor deleted — not even by whoever wrote it (docs/02 §2.5).
A wrong or outdated note stayed on a person's page forever. Its **author or an admin** should
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
| **Note** | author (title and body) — **built, slice 2** | author; admin when shared — **built, slice 1** | `domain/notes/remove-note.ts` → `db/note-repository.ts` (`deleteRemovableBy`) |
| **Moment / journal entry** | author (title and body) | author; admin when shared — **built, slice 3** | `domain/journal/journal.ts` → `db/journal-repository.ts` (`updateOwn`, `deleteRemovableBy`) |
| **Touchpoint** (interaction) | nobody | author; admin when shared — **built, slice 3** | `domain/interactions/interactions.ts` → `db/interaction-repository.ts` (`deleteRemovableBy`) |
| **Person photo** (gallery) | caption, visibility: author | author; admin when shared — **built, slice 3** | `domain/media/gallery.ts` → `db/photo-repository.ts` (`removableBy`) |
| **Circle photo** | caption, role, pin: anyone who sees it; visibility: author | author; admin when shared — **built, slice 3** | `domain/circles/circle-photos.ts` (`deleteRemovable`) |
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

- **Note:** no way out and no correction, not even for its author — fixed by slices 1 and 2.
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
  memberships and relationships go through the held 8-second window (`lib/undo/keys.ts:8`);
  notes since slice 1 and photos since slice 3 (they went at once before).
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

Built in slice 1 as `canRemoveAuthored` / `authoredRemovableBy`, described in docs/03 §3.7.
Its parity test already covers journal entries, touchpoints and person photos, so slice 3
only changes their repositories from `deleteOwn` to the shared rule; circle photos need a
twin over the circle (`CirclePhotoAccess`).

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

**Built, slice 2** — docs/02 §2.5, *Editing*. The author alone, title and body in place; an
admin gets *Remove* on another member's shared note, never *Edit*.

### 3.6 Circle photos keep their shared curation

A circle photo's caption, role and pin stay open to anyone who sees it. They are the
circle's curation: the class photo's caption is the class's. Visibility stays with whoever
added the photo, and removal moves to §3.2. A person photo's caption stays author-only,
because a person's gallery is closer to a journal than to a shared album. The difference is
on purpose, and docs/02 §2.14 says so once slice 3 lands.

### 3.7 Removing waits for a connection

Removing an authored record is **not** a command in the offline outbox (docs/02 §2.18), though
adding a note is one. It goes out when the undo window closes, as removing a journal entry
does today. Without a connection the send fails, the record comes back and the toast says
so. The server checks the right to remove at the moment of removal. An admin's removal of
someone else's work never sits for hours in a phone's queue, past a change of role or
visibility.

### 3.8 A photo someone wears

The author's rule today stays for everyone who may now remove (docs/02 §2.14):

- **A person photo:** removing it takes its framing with it. If the person wore it, they
  fall back to their initials.
- **A circle photo:** every profile picture cut from it becomes that person's own photo and
  stays worn.

What is new is that removing a person photo the person wears **says so in the undo toast**,
e.g. *"Photo removed — also Kurt's picture"*, while *Undo* is still on offer. No one should
take a profile picture away without noticing.

---

## 4. Slices

Each slice is one PR. It is test-first in `access/` and `domain/`, carries its UI, both
languages (`en` and `de`) and its docs, and goes through the delivery loop (owner hand-test,
then e2e on the branch).

1. **The rule, and removing a note.** — *built.* `record.removed` is an `ActivityEvent` with
   `recordKind` (`REMOVED_RECORD_KINDS` in `lib/stream/notices.ts`).
2. **Editing a note.** — *built;* see docs/02 §2.5, *Editing*.
3. **The other authored kinds.** — *built.* `REMOVED_RECORD_KINDS` holds all five kinds;
   journal entries, touchpoints, person and circle photos remove by the shared rule
   (circle photos through `canRemoveCirclePhoto`), photos through the held window.
4. **Editing a touchpoint.**
   - `editInteraction(deps, author, input)`: author only, for day, kind, text and the
     people who took part. Visibility stays out of the editor, as with a journal entry
     (§3.5).
   - *Edit* beside *Remove* on the author's touchpoints in Activity, reusing the editing
     pattern of slice 2.
   - Docs: docs/02 §2.6, §2.23; `using-stella.md`.

The finding in §6 is not a slice here. It is a separate refactor PR.

---

## 5. Settled on 2026-10-10, and what moved out

The open questions of the first draft were decided with the maintainer:

- **Offline:** removing waits for a connection (§3.7).
- **A photo someone wears:** the author's rule stays, and the toast names the picture (§3.8).
- **Touchpoint editing:** becomes slice 4, author only.
- **Circles:** nobody can delete or rename a circle today. This moved to its own roadmap
  item, *Deleting and renaming circles* (docs/06 M3).
- **Departed members:** removing a member from the household is promised in docs/02 §2.1
  but not built. It moved to its own roadmap item, *Removing a member* (docs/06 M3). That
  item settles what happens to the member's private records. Their shared ones are covered
  here, since an admin may remove them (§3.2).

No open questions are left for this concept.

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
