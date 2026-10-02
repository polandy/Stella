# Concept — Last names for several people at once, worked out where Stella can

Status: **built** (docs/02 §2.2, §2.2.4). Decided with the maintainer on 2026-10-02; the
decisions are listed in §10. It builds on the field-suggestion catalogue of
`docs/concepts/relationship-suggestions.md` §4 (F1, F1b, F2, F3) and settles its open question
on suggestions while *editing* (§9 there) for the last name only.

---

## 1. Why

Many people come into Stella with a first name only: typed quickly into a moment, carried in
from Monica, or added as *Thomas* because the surname was not known that evening. Later the
household often does know it, and Stella often knows it too. Lea is Peter Brunner's child, Max
is her brother, and the *Family Brunner* circle holds all four of them.

Today none of that helps. A last name can only be given when a person is **created**: the
profile's inline name edit changes the name they are shown by (`editProfile` writes only
`display_name`), and no form edits `first_name` or `last_name` afterwards. So a family of five
that came in as first names stays five first names, or each one gets the surname typed into
the shown name, where the directory, the namesake check and the surname match on *Add a
person* (§2.2.1) cannot see it.

The goal: **give one last name to several people in one step, and let Stella propose it
wherever a link, a circle or the person's own record already says what it is.** Nothing is
ever written without a tap.

---

## 2. What is there to build on

| Exists | Where | Used here for |
|---|---|---|
| `first_name`, `last_name`, `former_name`, `display_name` (required) | docs/03 §contact | the field written; the shown name follows it (§6) |
| `deriveDisplayName` | `domain/contacts/display-name.ts` | deciding whether the shown name follows the parts |
| Field rules F1/F1b/F2/F3 (concept only) | `relationship-suggestions.md` §4 | the core of the proposal catalogue (§4) |
| Dismissal log `suggestion_dismissal` | docs/03 §3.3 | remembering *"not Brunner"* (§5) |
| *Settings → Data quality*, *People known by a first name only* | docs/02 §2.2.3 | the home of the bulk list (§3.1) |
| *Select* + bottom bar on a circle's members | docs/02 §2.4.2 | the same pattern on the People directory (§3.2) |
| Undo window of eight seconds | docs/02 §2.23 | taking a bulk change back (§7) |
| Surname match ignoring case, diacritics and compound parts | §2.2.1 | grouping and the *already in Stella?* check (§5) |

---

## 3. Where it happens

Four entry points. One and two are the bulk paths the request is about; three and four make
the single case cheap, so the bulk list does not keep growing.

### 3.1 *Data quality → Last names* (the main path)

A card next to *Check relationships* and *People known by a first name only*, open to every
member: *14 people have no last name · 9 with a suggestion.* It lists everyone the viewer may
see who has no last name (archived people aside; the deceased are included, since a
grandmother's surname matters to the tree).

The list is **grouped by proposal**, the largest group first:

```
Brunner · 4                                         [ Apply to 3 ]
  [x] Lea         Child of Peter Brunner
  [x] Max         Child of Peter Brunner · sibling of Lea
  [x] Sophie      In the circle Family Brunner
  [ ] Maria       Partner of Peter Brunner      (possible, not ticked)

Choose one · 1
  Jonas           [ Keller ]  [ Weber ]          Parents Anna Keller, Tom Weber

No suggestion · 5
  Thomas          [ last name…        ]  [Save]
  …                                              [ Select… ]
```

- **A group** is everyone with the same proposed surname (folded by the §2.2.1 rule, shown in
  the household's most common spelling). Each row says *why*, in the reason `Phrase` the
  suggestion engine already produces (*Child of Peter Brunner*). Rows from a `likely` or
  `certain` rule start ticked; `possible` rows start unticked (§4). **Apply** writes the
  ticked rows in one transaction.
- **Choose one** holds people whose sources disagree at the same confidence (two parents with
  different surnames, F1b). Each choice is a chip; a tap saves that one. No winner is ever
  picked for them.
- **No suggestion** gives each person a field, with autocomplete from the surnames the viewer
  can see in the household. **Select…** ticks several of them and opens the same bar as §3.2,
  so five cousins without any link still get one name in one step.
- A row's **Not this name** (in its overflow menu) writes a dismissal (§5) and moves the person
  to *No suggestion*.

### 3.2 *Select* on the People directory

The directory gets the *Select* mode a circle's members list already has. The bottom bar gains
**Set last name**: one field (with the same autocomplete), then a short confirmation:

> Set **Brunner** for 5 people.
> Anna already has the last name **Meier** — [ ] replace it

People who already have a **different** last name are named and **unticked** by default, so a
bulk action never overwrites silently. People who already carry this name are left alone and
not counted. The same action is offered in a circle's member *Select* bar, where *Family
Brunner* is the natural place to do it.

### 3.3 Passing it on after one change

When a person gets a last name by any path, and their **children or siblings** that the viewer
can see have none, the toast that confirms the save offers it to them:

> Last name saved. **Lea and Max** have none yet — Brunner too? [Yes] [Undo]

It goes **one generation at a time**: never grandchildren in the same offer. Saying *Yes* for
Lea and Max is itself a save, so its toast offers the name to *their* children in turn. A
family name comes down the tree step by step, each step confirmed, and a daughter who carries
another name by marriage simply ends the chain on her branch.

It only ever **fills a blank**. Changing a surname that is already there (Peter becomes
Peter Meier after a marriage) offers nothing to anyone: that is the dangerous half of the open
question in `relationship-suggestions.md` §9, and the answer here is *never automatically*.

### 3.4 One person, on their profile: the name parts

Under the name in the hero, a person without a last name shows a quiet **Add last name**, with
the best proposal as a chip when there is one (*Brunner?*). A tap on the chip saves it.

Beyond that, the profile makes **all name parts** editable: **first name, last name and
nickname**, which today can only be given when a person is created. The inline edit of the
shown name stays as it is (a tap on the name); a small **Name parts** link beside it opens
the three fields in place, Enter saves, Escape puts them back. *Add last name* opens the same
fields with the last name focused. Changing an existing last name offers *keep the old one as
former name* (§6). A person may not end up with no name at all: the shown name is never
empty, so emptying every part is allowed and the shown name simply stays as it is.

---

## 4. Where a proposal comes from

Rules are pure, read only what the viewer may see, and each yields a surname, a confidence and
a reason. The ids continue the F series of `relationship-suggestions.md` §4.

| id | Source | Proposal | Confidence |
|---|---|---|---|
| **F1** | a **parent** with a last name | that name | likely |
| **F1b** | two parents with **different** last names | both, as *Choose one* | likely, no winner |
| **F2** | a **sibling** with a last name (all named siblings agree) | that name | likely |
| **F3** | a **partner or spouse** with a last name | that name, never pre-ticked; when the partner has a former name, the row says so (*Maria Brunner, born Keller*) | possible |
| **F9** | the person's **own shown name** has words after the first name (*Thomas Brunner*, last name empty, typical of imports) | those words, with the first word as first name if that is empty too | certain |
| **F10** | their **children** share one last name | that name | possible (a parent may have kept their own) |
| **F11** | a **family-kind circle** whose members with a last name all share one | that name | likely |

F11 reads the circle's **kind**, never its name: *Familie Brunner* is covered because its
members are Brunners, without parsing words that depend on the language.

How they combine for one person:

1. Proposals for the same name (after folding) **merge**: the highest confidence wins and all
   reasons are kept, so Max reads *Child of Peter Brunner · sibling of Lea*.
2. Different names at **different** confidence: the higher one is the proposal; the lower is
   shown in the row's menu as *or: Weber*.
3. Different names at the **same** top confidence: *Choose one* (§3.1).
4. A name dismissed for this person (§5) is dropped before any of this.

Never used as a source: anything private the viewer cannot see, a description's free text (it
was often *written from* a link, so it would only echo F1–F2), the `former_name` of anyone, a
`former` partnership, a circle's name, and email addresses (rare in a family address book and
easily wrong: *thomas.b@*, a work address; the import case is F9).

---

## 5. Rules that keep it trustworthy

- **Nothing is written without a tap.** A pre-ticked row is still applied only by *Apply*.
- **No silent overwrite.** A bulk path never changes an existing last name unless that person
  is ticked by hand in the confirmation (§3.2). Passing it on (§3.3) only fills blanks.
- **A *no* is remembered.** *Not this name* writes `suggestion_dismissal` with
  `relation = 'last_name'` and a key of contact id plus the folded surname, so the household's
  answer holds for everyone and a different proposal can still come later. Dismissals stay
  deletable like the relationship ones.
- **The household might already have them.** After a save, if a person now has the same first
  and last name as someone else the viewer can see, the confirmation says so and links to the
  merge on their page (*There is already a Lea Brunner — the same person?*). Nothing merges on
  its own.
- **Only visible people are touched.** The write takes ids; an id the viewer may not see fails
  the whole batch, the same rule as filling a circle (§2.4.2).
- **Spelling is kept as typed** (*van der Berg*, *Müller-Weber*, *Nováková*). Stella does not
  derive gendered surname forms; the proposal is editable before it is saved.

---

## 6. The shown name

`display_name` is stored and required. A changed name part must reach it, or the directory
still shows *Thomas*. The rule, the same for every path that changes a part (bulk or profile):

- If the shown name is **what the parts made** — it equals `deriveDisplayName` of the old
  first name, last name and nickname without an explicit name (*Thomas*) — it is **made
  again** from the new parts (*Thomas Brunner*).
- If the member **chose** a different shown name (*Opa Hans*, *Tante Gabi*), it is **kept**.
  The row says so (*shown as "Opa Hans"*) so nobody wonders why the directory did not change.
- If a person has a shown name but **no first name** and that shown name is a **single word**
  (imports, F9: *Thomas*), it becomes the first name in the same write, so the rule above has
  parts to work from. A shown name of several words with no parts at all is ambiguous — it may
  be an untouched import or a chosen name like *Opa Hans* — so nothing is guessed there; the
  first name stays empty until typed.
- Changing an existing last name on the profile (§3.4) offers **Keep "Meier" as former name**,
  ticked when `former_name` is empty. Bulk paths never touch `former_name`.

The directory's letter groups, the search index and the namesake line all read the new name
at once, since they already read `last_name` and `display_name`.

---

## 7. Writing it

- **One use-case**, `setLastNames(deps, viewer, changes)`, where `changes` is a list of
  `{ contactId, lastName, replace: boolean }`. It checks every id against the access layer,
  refuses an empty name, refuses a `replace: false` change on someone who already has a
  different name (so a stale screen cannot overwrite), applies §6 per person, and writes
  everything in **one transaction**: all or nothing.
- **The profile** uses a second use-case, `editNameParts(deps, viewer, id, parts)`, for the
  three fields of §3.4 and the former-name choice. Both use-cases apply §6 through the same
  pure function, so a shown name follows its parts the same way wherever they change.
- **Undo**: the toast offers *Undo* for eight seconds, and the batch is sent only when the
  window closes or the page is left, the same deferred send as answering suggestions (§2.23).
- **The household is told**: one activity entry per batch, *Andy set the last name Brunner on 4
  people*, linking to the people the reader may see.
- **Not offline.** The outbox is for adding, not editing (docs/02 §2.18); the actions are
  disabled with the usual offline line while Stella is out of reach.

---

## 8. Where the code lives

| Part | Place | Kind |
|---|---|---|
| Rules F1–F3, F9–F11, combination, folding | `src/lib/suggestions/rules/surnames.ts` (+ test) | pure, test-first |
| Grouping into *groups / choose one / none* | `src/lib/suggestions/surname-groups.ts` (+ test) | pure, test-first |
| Shown-name rule of §6 | `domain/contacts/display-name.ts` (`withNameParts`) | pure, test-first |
| `setLastNames`, `editNameParts` | `domain/contacts/` | use-cases with `deps` (contacts repo, dismissals, activity, clock) |
| What a viewer may see for the rules | `SuggestionView`, already built per viewer through `access/` | read model, extended by circle kinds and former names |
| Name parts on the profile | `components/person/` (the hero) | component |
| Data-quality page | `routes/(app)/settings/last-names/` | edge |
| *Select* + bar on People, *Set last name* on circle members | `routes/(app)/contacts`, the circle page | edge + components |
| Copy | `i18n/messages/en`, `de` | both languages |

---

## 9. Slicing

1. **Name parts on the profile** — §3.4 without the chip, `editNameParts`, §6. Fills the gap
   that today makes a first name, last name or nickname impossible to change later.
2. **The rules and the Data-quality list** — §4, §3.1, dismissals. The bulk path that does most
   of the work.
3. **Select on People and circles** — §3.2.
4. **Passing it on** — §3.3, and the proposal chip on the profile (§3.4).

Each is a PR with its unit tests, UI and docs; the e2e follows the maintainer's sign-off
(docs/08 §8.4.1).

---

## 10. Decisions (with the maintainer, 2026-10-02)

1. **Partner (F3)** is offered, never pre-ticked, with the partner's former name shown when
   there is one.
2. **Children (F10)** stay as a source, unticked. **Email addresses** are not a source.
3. **Circles (F11)** count by their *family* kind only; a circle's name is never read.
4. **Deceased people** are in the list, marked as everywhere else, with no filter of their own.
5. **The profile** makes all name parts editable — first name, last name, nickname — not the
   last name alone (§3.4).
6. **Passing it on (§3.3)** goes one generation at a time: children and siblings, and each
   accepted step offers the next.
