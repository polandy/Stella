# Concept — Gift ideas and gifts given

Status: **decided, not built.** Written and decided with the maintainer on 2026-10-06 (§8);
checked against `main` on 2026-10-08 (§9). Mockup:
`docs/concepts/gifts.html`. Roadmap: docs/06 M3, *Gift ideas and gifts given*.

---

## 1. Why

Two things are hard to remember and annoying to get wrong:

- **What did we give whom, and when?** So the same book does not arrive twice, and so next
  year's present can build on last year's.
- **A good idea, the moment it comes.** Grandma mentions she would love a new teapot in
  March; by her birthday in October nobody remembers. The idea has to be written down on her
  page in a few seconds, from the phone, and be there when it is needed.

Monica had this as *Gifts*. Stella's import keeps them, but only as notes (§6).

---

## 2. What a gift is

A gift belongs to **one person**, the one it is for. It has:

| Field | |
|---|---|
| **What** | short title, required: *Teapot, cast iron* |
| **Note** | optional free text: size, colour, where she saw it |
| **Link** | optional URL: the shop page |
| **State** | **idea** → **given**, or **received** (a present from them to us) |
| **On** | the day it was given or received; today by default |
| **Occasion** | optional: *Birthday*, *Christmas*, *Anniversary* or free text |
| **Visibility** | shared by default, private per record (docs/02 §2.10) |

An idea and the gift it became are **the same record**. *Mark as given* moves it from the
ideas to the given list and asks only for the day and the occasion. The title, note and link
stay, so a given gift still says where it came from. A **received** gift is noted directly,
never from an idea: *what Hilde gave us*, so a thank-you and a fitting present back are easy.

Who wrote it down and when is kept, as on every record. *Who gave it* is not a field: in a
household a present is usually from several people, and naming them would be a chore no one
keeps up. The creator is shown as *noted by*.

---

## 3. Where it shows

### 3.1 The person page

A new card **Gifts** (*Geschenke*), a new entry `'gifts'` in `CONTACT_SECTIONS`
(`src/lib/contacts/sections.ts`) between *Notes* and *Mentioned in*, so it gets its anchor and
its jump-bar link the way the other cards do. Three tabs:

- **Ideas** — open ideas, newest first. Each row: title, note preview, link icon, *Mark as
  given*. Empty state: *Got an idea for Hilde? Note it here so it is there on her birthday.*
- **Given** — given gifts, newest first, grouped by year: *2025 · Birthday · Teapot*.
- **Received** — what they gave us, the same way. The tab only shows once there is one.

The tab count shows how many ideas are open: *Ideas · 3*. With no gift at all the card follows
the empty-card rule (`src/lib/contacts/empty-cards.ts`, #293): one line — title, one sentence,
*+ Idea* — and the jump bar links to it like to the other one-line cards.

### 3.2 The story (*Activity*)

A given or received gift appears in the person's story — the card headed *Activity* — on its
day, next to the journal entries and touchpoints, with the gift icon and
accent the story already uses (`--kind-gift`). It is **read from the gift record**, not a
copy, so editing or deleting the gift changes the story too. Ideas never appear in the story.

The story already has a **touchpoint** kind *gift* (`interaction.kind = 'gift'`, offered by
*Log contact* / *Kontakt festhalten*). It goes away (§8 Q2): each existing gift touchpoint
becomes a **given** gift on its person, its title or description as the gift's title, its day
as the gift's day, its visibility and author kept. A gift touchpoint with participants becomes
one gift per participant (§8 Q3). *Log contact* no longer offers
*Gift*; *+ Given* on the Gifts card takes its place.

### 3.3 Before an occasion

In the **Coming up** band of Home's rail (docs/02 §2.13.3), a person with open ideas shows a small hint: *🎁 2 ideas* (with the gift icon, not an emoji),
linking to their Gifts card. Nothing new is sent or scheduled; it only shows where the
occasion is already shown.

### 3.4 Not given twice

When a title is typed that matches a gift already **given** to the same person (case and
accents folded, as the name matcher does), the form says so under the field: *Already given
on 12 Oct 2023 (Birthday).* It is a hint, not a block — the second tin of her favourite tea
can be on purpose.

---

## 4. Capture

- *+ Idea* on the card opens a small form: title, then note and link folded away. Saving
  needs only the title.
- *+ Given* records a past gift directly, with day and occasion, for catching up.
- *+ Received* (in the card's menu) records a present from them.
- The command palette gets *Gift idea for …* next to *Write a moment*, so an idea can be noted
  from anywhere.
- Every addition goes through the offline outbox like any other (docs/04 §4.11.2), so an idea
  typed on the train is kept.

---

## 5. Data model (sketch for docs/03)

```
gift
  id            text pk
  contact_id    text → contact.id, cascade      -- who it is for
  created_by    text → user.id
  visibility    'shared' | 'private'            -- default 'shared'
  state         'idea' | 'given' | 'received'
  title         text not null
  note          text
  url           text
  given_on      text (YYYY-MM-DD)               -- null while an idea; the day for given/received
  occasion      text                            -- free text; the form offers presets
  created_at, updated_at
index (contact_id, state, given_on)
```

Domain use-cases in `src/lib/server/domain/gifts/` (add, edit, mark given, delete, list for a
person), all reads through `src/lib/server/access/`. The duplicate hint (§3.4) is a pure
function. Export/restore and the activity log cover the new table like every other one.

---

## 6. The Monica gifts already imported

The import wrote each Monica gift as a **note** on the person, titled *Gift* / *Geschenk*:

```
🎁 **Teapot** — idea, 12 Oct 2023
<comment>
<url>
```

The note's id is `<source>:gift:<monica id>`, so these notes can be found exactly. Monica's
own status (`idea`, `offered`, `received`) is in the first line as Monica wrote it. Monica's
gift *value* and *recipient relative* were not carried over.

**Proposal:** a one-time migration turns each such note into a gift record — `idea` → idea,
`offered` → given, `received` → received — and removes the note.
A note that was edited since the import, or whose first line no longer parses, is left alone
and named in the migration's log, so nothing written by hand is lost. The importer itself then
writes gift records instead of notes. The same migration turns the gift touchpoints into gifts
(§3.2) and drops `'gift'` from `interaction.kind`.

---

## 7. Not in this change

- A household-wide list of all open ideas (*Christmas shopping list*) — later (§8 Q4).
- Prices and budgets, wish lists the person shares themselves, reminders by email.

---

## 8. Decided with the maintainer on 2026-10-06

1. **Gifts received** are kept as a third state with their own tab; Monica's `received` gifts
   move there.
2. **The touchpoint kind *gift*** is converted into gift records and dropped — one place for gifts.
3. **One gift belongs to one person.** A couple's present is noted on each; a converted gift
   touchpoint with participants becomes one gift per person.
4. **The household idea list** waits; the person page comes first.

---

## 9. Checked against `main` on 2026-10-08

About 60 commits landed after the concept. What they change for it, already folded in above:

- **Vocabulary** (#260, glossary docs/03 §3.0): *moment* now means a journal entry; the gift kind
  is a **touchpoint** kind; the person's story is headed *Activity*; *activity* alone is the
  household log. The build adds **gift** to the glossary: *a present for one person — an idea,
  given or received* (`gift`, `domain/gifts/`, `lib/gifts/`), *not used:* present, wish.
- **Person page** (#263, #290, #293): the card order is now People, Photos, Activity, Notes,
  Mentioned in; Gifts goes after Notes. An empty Gifts card is one line, like Photos and Notes.
- **Services** (AR-01, #296–#305): routes reach use-cases through `locals.services.<context>`;
  gifts become their own group, `locals.services.gifts`, wired in
  `src/lib/server/services/`.
- **Commands** (AR-04, #295): every addition is a command with one payload schema in
  `src/lib/commands/payloads.ts`, read by form actions through `fromFormData`, so the outbox
  and the form share it — *addGift*, *editGift*, *markGiftGiven*, *removeGift*.
- **Home** (#255, docs/02 §2.22.2): the quieter Home keeps the *Coming up* band in its rail;
  docs/02 §2.22 already says the gifts panel returns with the gifts feature. The hint of §3.3
  is that return, inside the band rather than a panel of its own.
- **List dividers** are uppercase labels now (#292); the Given tab's year dividers use them.

Nothing in the decisions of §8 changes.

