# Concept: deleting and renaming circles

Status: **decided with the maintainer on 2026-10-10, not built.** Source: docs/06 *Deleting and
renaming circles*. Mockup: [circle-delete-rename.html](circle-delete-rename.html). Once all
slices are built, the rules move into docs/02 §2.4.2, docs/03 and docs/05, and this file is
deleted.

---

## 1. What exists today

- **A circle can't be changed after it is created.** `createCircle`
  (`domain/circles/circles.ts`) sets the name, kind, colour, description, period and
  visibility once. The only edit is **renaming a role** (`rename-role.ts`): anyone who sees
  the circle may do it, it touches only the members and photos they see, and the stream
  records nothing.
- **Nothing deletes a circle.** The data model already says what a deletion must do with the
  photos (docs/03 `photo`): the repository removes the circle's photos and their files with the
  circle (`circle_id` has no fk), and first turns the **cuts** of all those photos, as
  removing one photo does (`cutsToTurn` takes any number of photos). docs/02 §2.4.2 asks for
  *one combined question for all its photos*.
- **Memberships** cascade with the circle (`circle_membership.circle_id … on delete
  cascade`). The derived shared-context links ("via Ski Course"), the circle's graph node and
  the circle-based suggestions (§2.4.1) are all read from memberships, so they go with them.
- **Nesting** is `circle.parent_circle_id` with `ON DELETE SET NULL`
  (`schema/circles.ts`). Only the API import and the demo seed write it. No screen shows or
  sets it, and the person page's context line reads it (`lib/people/context.ts`: *Class 9a*
  says more than *School Muri*).
- **Archiving** a circle (`archived_at`) has a column but no use-case and no screen yet.
- **The circle-photo upload stream items** are read from the `photo` table, not from
  `activity_log`, so they go away with the photos.
- **Precedents.** Deleting a person (docs/02 §2.2): admins only, from the ⋯ menu, a confirm
  step that focuses *Keep them*, no Undo, and an `activity_log` row, *"Andy removed Kurt"*.
  Removing an authored record (docs/03 §3.7): the author always, an admin when it is shared,
  checked by the SQL condition itself.

## 2. Decisions

Asked and answered on 2026-10-10:

1. **Deleting**: the circle's **creator** always, and an **admin** when the circle is
   **shared**. Both must see it first, so an admin gains nothing on a private one, and a
   private circle is its creator's alone. This is the authored-record rule (docs/03 §3.7)
   with the circle as the record: `canDeleteCircle` / `circleDeletableBy`, held to the same
   rows by the parity test. The remover is the viewer plus `isAdmin`, read by
   `requireRemover`.
2. **Renaming** means **editing the circle's details**: name, description, kind, colour and
   period. **Anyone who sees the circle** may do it, because a circle is a household fact like
   its roles and memberships. Visibility is not in this form (§5).
3. **A deletion is confirmed, logged and can't be undone.** The ⋯ menu opens an inline
   confirm step that says what goes. Its focus starts on *Keep it*, as the person page's starts
   on *Keep them*. There is no Undo window: files are deleted, and the page the member is on
   is gone. The household is told: one `activity_log` row, *"Andy removed the circle Class
   1B"*, with nothing to link to.
4. **Nested circles move up a level.** A child keeps its members, photos and everything else,
   and only loses its parent (the existing `SET NULL`). The confirm step names them.

Decided without asking. Each is open to a change in the PR:

5. **Editing a circle records nothing in the stream.** Renaming a role doesn't either, and the
   new name shows wherever the circle appears. (Editing a *person's* name writes
   `contact_name`, because people are looked up by name in the stream. A circle is opened from
   its list.)
6. **The deletion takes everything in the circle, including what the deleter can't see**:
   other members' private photos and the memberships of contacts that are private to someone
   else. This matches deleting a person, which also takes others' private notes. The confirm
   step **counts** photos and wearers it doesn't name, as the cut warning already does
   (*"the profile picture of 4 people"*), and counts only the members the deleter sees.
7. **Cuts become their wearer's own photos**, as docs/03 already decides: still worn,
   `cut_from` cleared, and moved into the wearer's gallery. The deletion asks one question for
   all photos, which is the confirm step itself, not a second dialog.
8. **The same name twice is allowed.** Creating a circle doesn't refuse a name that is already
   used, so editing doesn't either.

## 3. The behaviour

### Editing

- The circle page's header gets a **⋯ menu** (*More actions*) beside *Open in the graph*,
  like the person page's. It holds *Edit circle* and, for whoever may, *Delete circle…*.
  Anyone who sees the circle sees the menu, because everyone who sees it may edit it.
- *Edit circle* turns the header into a form in place with the create form's fields: **name**
  (required, trimmed), **kind** (its select), **description** and **colour** (its swatches).
  It also has the **period**, start and end day, which the create form doesn't offer, so
  editing is the first place to set it. *Save* says *Saved* and closes the form, the same
  as every other save (§2.23). *Cancel* and Escape close it unchanged.
- The header line shows the period when it is set: *Class · Aug 2025 – Jul 2026 · Primarschule
  Längenfeld*, months in the reader's language.
- The validation is `createCircle`'s, through one shared function: a blank name is refused
  with a `Phrase`, and an unknown kind or colour fails loud (`resolveCircleKind` /
  `resolveCircleColor`). New for both forms: a period that ends before it starts is refused.
- `updateCircle(deps, viewer, circleId, input)` reads the circle through `getVisibleTo`, so a
  circle the viewer can't see, or one already deleted, answers `CircleGoneError` (404). The
  write sets `updated_at`, which the people stamps already read, so every person page showing
  the circle refreshes its context line.

### Deleting

- *Delete circle…* opens an inline confirm step under the header (the person page's sunken
  box, not a modal). The step says what goes and what stays:
  - *This deletes **Class 1B**: 24 members leave it and its 7 photos are deleted. It cannot be
    undone.*
  - when photos are worn: *2 of its photos are the profile picture of 5 people. They keep it
    as a photo of their own.*
  - when it has children: *Class 1B Reading group and Class 1B Choir stay, without a parent
    circle.* (only children the deleter sees are named; the rest are counted.)
  - the buttons: **Delete Class 1B** (danger) and **Keep it** (ghost, focused).
- The counts come from `circleDeletionPreview(deps, remover, circleId)`. It is a read that the
  page loads only when the step opens, so the circle page's `load` doesn't count photos for
  a step most visits never open.
- **The deletion runs in one transaction** (`deleteCircle(deps, remover, circleId)`):
  1. the circle is checked by `circleDeletableBy` in the `DELETE`'s own condition; no row
     deleted → `CircleGoneError`, which the action answers with 404, read as done (§2.23: a
     gone item is never a failure);
  2. the cuts of all the circle's photos are turned (`cutsToTurn` →
     `db/cut-turning.ts`);
  3. the circle's photo rows, framings included, are deleted and their file paths collected;
  4. the circle row is deleted: memberships cascade, children's `parent_circle_id` is set to
     null;
  5. the use-case reports `{ kind: 'circle.deleted', … }`, written in the same
     transaction.

  The files are unlinked after the commit, as for a person.
- Afterwards the member lands on **/circles**, with a toast *Class 1B deleted*.
- **The activity row**: `action = 'delete'`, `entity_type = 'circle'`, `entity_id` the circle,
  `contact_id` null, `visibility` the circle's (so a private circle's deletion is seen only by
  its creator, who is the only one who could delete it), and `summary` the facts
  `{"name":"Class 1B"}`. Home says the line in each reader's language: *Andy removed the
  circle Class 1B* (`noticeContentOf`). It is the only stream item about a circle that is
  not a photo upload, and like a person's deletion it links nowhere.
- **Elsewhere**:
  - a queued offline upload to a deleted circle arrives as *Could not send* with
    `CircleGoneError`'s reason (§2.18, *someone it names was deleted*);
  - an open graph centred on the circle loses it on its next read;
  - an archive taken before the deletion still restores the circle (§2.15).

## 4. Slices

Each slice is test-first and carries its UI, both catalogues (`en`, `de`) and its docs. UI
slices follow the delivery loop: hand test, then the e2e on the same branch.

1. **Editing a circle.**
   - Domain: `updateCircle` and the shared validation pulled out of `createCircle`
     (`circles.test.ts`: changes every field, refuses a blank name and a period that ends
     before it starts, answers `CircleGoneError` for an invisible or gone circle).
   - Repository: `update`.
   - UI: the ⋯ menu and the form in the circle header, as the action `updateCircle`.
   - Docs: docs/02 §2.4.2 (*Filling and managing a circle*), docs/05
     `screens/circles.md`, `using-stella.md`.
   - E2e: `circles.spec.ts`, edit name and kind, then see both on the list.
2. **Deleting: access and domain.** No UI.
   - Access: `canDeleteCircle` / `circleDeletableBy` and their parity rows (creator, admin on
     shared, admin on private, member on shared, invisible circle).
   - Domain: `circleDeletionPreview` and `deleteCircle`, with tests for the order (cuts turned
     before the photos go), the counts including what the remover can't see, children kept
     without a parent, and a gone circle answering `CircleGoneError`.
   - Activity: the `circle.deleted` event, the row and `noticeContentOf`'s line in both
     languages.
   - Repository: the transaction, tested against SQLite (memberships gone, children's parent
     null, photo files returned, a worn cut now a gallery photo of its wearer).
   - Docs: docs/03 `circle`, `photo` (the *Nothing deletes a circle yet* sentences become the
     rule), `activity_log`, §3.7.
3. **Deleting: the screen.**
   - UI: *Delete circle…* in the ⋯ menu for whoever may, the confirm step with the preview, and
     the redirect and toast.
   - Docs: docs/02 §2.4.2 and §2.11/§2.22 (the new stream line), `screens/circles.md`,
     `using-stella.md`, and the docs/06 entry removed.
   - E2e: the creator deletes a circle with a worn photo and a child, the wearer keeps the
     picture, the child stays, Home shows the line; a member who isn't the creator or an
     admin gets no *Delete* item.

## 5. Out of scope

- **Changing a circle's visibility** (shared ↔ private). Making a shared circle private hides
  every membership and photo from the household, a question of its own.
- **Archiving a circle**: the column waits for a use-case and a screen. It would be the
  reversible step everyone has, as for a person.
- **Setting a parent** from a screen: nesting stays import-only.
