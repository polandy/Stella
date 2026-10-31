# Concept: to-dos per person

Status: **decided 2026-10-31 (§7), ready to build in slices (§6).** Mockup: the claude.ai canvas
*Stella · Todos* (https://claude.ai/artifact/Ko3TazkhgPMvQswMHuZ2Bn; person page and Home, phone, Latte). Once built, the rules move into
a new docs/02 §2.26, docs/03, docs/05 and the screen files `person.md` and `home.md`, and this
file is deleted.

---

## 1. Why

Stella remembers what *happened* (moments, touchpoints, notes) and what *comes* (dates, gift
ideas), but not what *we still owe someone*: *give the book back*, *ask how the surgery went*,
*send Hilde the recipe*. Today such a thing lands in a note and is forgotten there, because a
note has no "done" and nothing brings it back. Monica had tasks; Stella has nothing in their
place.

## 2. The goal, and what it is not

- **Goal:** a small, tickable line on a person, optionally with a day, that shows where the
  household already looks and goes away once done.
- **Not a task manager.** No projects, no priorities, no sub-tasks, no recurrence, no
  assignee, no push or email. Stella stays a book about people.
- **No nudges.** Nothing is invented: only what a member wrote down comes back, and only on
  the day they gave it (the declined "haven't seen lately" nudges stay declined).

## 3. What a to-do is

A to-do belongs to **one person**, the one it is about (as a gift does, §2.25.1).

| | |
|---|---|
| **What** | a short line, required: *Buch zurückgeben* |
| **By** | optional day: *by 8 November*. Without one it is open with no day |
| **State** | **open** or **done**; done keeps the day and the member who ticked it |
| **Visibility** | shared by default, private per record (§2.10); only its author switches it |

Who noted it is kept and shown as *noted by …* on another member's to-do. Who should *do* it is
not a field: in a family that is settled at the table, not in the app (§7, question 4).

**Who may change what** (recommended, as for gifts): whoever may see a to-do may tick it,
rewrite it and remove it — *I gave the book back* is often said by whoever did. Only its author
makes it private or shared again. A private to-do is its author's alone, admins included.

## 4. Where it shows

1. **Person page — the *To do* card** (`'todos'` in `CONTACT_SECTIONS`). Open to-dos, those
   with a day first (soonest first), then those without (newest first). Each row: a checkbox,
   the line, the day (*by Fri, 8 Nov*; past it, plainly *was due Mon, 2 Nov*),
   *noted by …*, *private*. A pencil rewrites line, day and visibility in place.
   - **Placement (recommended):** right under the identity card **while something is open**;
     with nothing open the card is the one-line empty shape at the end of the page
     (`cardShape`, docs/05 §5.5): *To do · Nothing open.* and *+ Add*.
   - **Adding:** *+ Add* opens one field and an optional day; Enter saves.
2. **Home — a *To do* band** in the rail, above *Coming up*: open to-dos the reader may see that
   are **overdue or due within 7 days**, soonest first, at most three, *Show all N* beneath.
   Each row: avatar, the line, the person and day, a checkbox. Absent when empty, like
   *Coming up*; below `lg` it stands above the stream while it holds something overdue or due
   today, below it otherwise (the 14-day rule's cousin).
3. **`/todos` — every open to-do** the reader may see, grouped *Overdue*, *This week*, *Later*,
   *No day*. Reached from the band's *Show all* and the palette. No place in the navigation
   (as `/gifts`, docs/05 §5.5.13).
4. **Command palette:** *To do for …* beside *Gift idea for …*, the same two-step pick, landing
   on the person's card with the field open (`?todo=new`).

## 5. Ticking off

- A tick strikes the line through and the toast offers *Undo* for the removal window (§2.23);
  then it leaves the list.
- **Done goes into the story (recommended):** the person's *Activity* (§2.23) shows *Done:
  Buch zurückgegeben* on the day it was ticked, with the check icon, read from the to-do (a
  fourth source of the merge, as gifts are the third). So *when did we give it back?* has an
  answer, and the card stays short. Unticking from the story's row reopens it.
- Not in the household stream: a tick is too small to be news.

## 6. Shape of the build

- **Data:** one table `todo` (docs/03): `id`, `household_id`, `contact_id`, `title`,
  `due_on` (ISO day, nullable), `done_at`, `done_by`, `visibility`, `created_by`, timestamps.
  Child of a contact: it inherits the contact's visibility and its own (docs/03 §3.7).
- **Pure:** `src/lib/todos/` — the order of the card, the band's selection (overdue, ≤ 7 days,
  cap 3) and the due label, handed *today*; test-first.
- **Domain:** `src/lib/server/domain/todos/` — add, edit, tick, untick, remove, list for a
  person, list for the reader; every read through the access layer.
- **Offline:** adding and ticking are commands (`todo.add`, `todo.tick`) through the outbox
  (§2.18): a tick only ever moves towards done, so replaying it is harmless. Rewriting,
  unticking and removing wait for Stella, as for gifts.
- **Search:** to-dos are found on the full search page in a group of their own (§2.9), done
  ones included and marked *done* — the one place to look one up across people.
- **Export / restore** carry the table (§2.15); the Monica import brings Monica's tasks,
  completed ones as done on their completion day, so they land in Activity (§7, item 6).
  Removing a done to-do erases it from the story too: removal is a hard delete.
- **Slices:** (1) record, card, palette, offline add and tick; (2) the story entry, so a
  ticked to-do is never shown nowhere for long; (3) Home band, `/todos` and search; (4) Monica
  tasks. Reordered 2026-10-31 after the UX review.

## 7. Decided with the maintainer (2026-10-31)

1. **Who may tick, rewrite and remove:** whoever sees it, as for gifts; only the author
   switches shared ↔ private.
2. **Home band:** overdue and due within 7 days, at most three, absent when empty.
3. **Done:** into the person's story (*Activity*) on the day it was ticked.
4. **Assignee:** none.
5. **Placement:** under the identity card while something is open, otherwise the one-line
   empty card at the end.
6. **Monica's tasks:** imported as to-dos (slice 4).
7. **After the UX review (2026-10-31):** *Done* in Activity moves up to slice 2; the whole
   line ticks; *+ Add*, *By when?*, *was due …* without `--danger`; placement stays (top while
   anything is open), to be looked at again once the Home band exists.
