# Concept — Last names review: *Not this name* and *no last name*

Status: **draft, open questions in §5**. Written 2026-10-09 from the owner's hand test of #298
(2026-10-07). Mockup: `docs/concepts/last-names-review.html`. Folds into docs/02 §2.2.4.2,
docs/design/screens/data-quality.md, docs/03 §contact and `using-stella.md` once built; then
this file goes.

---

## 1. Intent

*Settings → Data quality → Last names* is a list to work down. Two things stop it emptying:

- **Not this name** seems to take the whole person off the list instead of only that proposal.
- **Nobody can say "no last name, and that's fine"**: a person met once at a mountain hut, a
  grandmother known only as *Oma Rösli*. They stay on the list forever.

The review should drop **only the answered proposal** and let the household **settle a person**
as having no last name. Settled people leave the list but can still be found and taken back.

---

## 2. What happens today (read and reproduced on `main` 5f3295bb)

**How a proposal is made.** `reviewLastNames` (`src/lib/server/domain/contacts/last-names.ts`)
reads everyone the viewer may see without a last name (archived people aside). The pure rules
(`src/lib/suggestions/rules/surnames.ts`, F1–F11) propose a name per person, and
`groupBySurname` sorts each person into a name group, *Choose one*, or *No suggestion*.

**How a proposal is dismissed.** The row menu's *Not Brunner* posts `?/dismissLastName`.
`dismissLastName` writes one row to `suggestion_dismissal` (`relation = 'last_name'`,
`pair_key = '<contact id> <folded surname>'`). So the dismissal is stored **per person and
per name**, for the **household**, not the member. `proposeSurname` skips a dismissed name,
and *Names you said no to → Offer again* deletes the row. It survives a reload. The backup
snapshot carries it. The archive document (`household.yaml`) does **not** carry it (docs/03
already says so), so a restore proposes the name again. A merge leaves it behind
(`MERGE_LEAVES_BEHIND`), so the survivor is asked again.

**Who sees the list.** Every member, each seeing only the people they may see (a member's
private person is on their list only). Answers are the household's.

**Why a dismissal "hides the person": it is a client crash, not the data.**
`LastNameFields.svelte` binds `drafts[person.id]` (undefined at first) to `Combobox`'s
`value = $bindable('')`. Svelte refuses to bind `undefined` to a prop that has a fallback
(`props_invalid_value`). So **whenever the *No suggestion* section holds anyone, the page throws
on hydration.** This has been the case since #224 (2026-10-02). In the browser (preview, demo
household plus three nameless test people):

| Case | Server answer | What the reader sees |
|---|---|---|
| **One proposal dismissed out of several** (Sara: *Brunner* from her father, *Widmer* from her partner) | Sara moves to a *Widmer · 1* group | correct: she stays, under Widmer |
| **The only proposal dismissed** (Ben: *Brunner* only) | Ben moves to *No suggestion* | the render throws; Ben **vanishes**, the count still says *2 people*; a reload shows a **blank page** |
| **A person with no proposal at all** (Jonas) | listed under *No suggestion* | **blank page** on every visit |
| **Marked done, then a relative with a surname appears** | — | no "done" exists; the person is proposed the new name |
| **Merge or archive restore of someone marked done** | — | no "done" exists. A merge drops the merged person's dismissals; a restore from the document drops all of them |

So *Not this name* is already per proposal. The person "vanishes" only when that was their
**last** proposal, because they then move into the one section that crashes the page.

---

## 3. Rules (proposed; the choices in §5 are marked with the recommendation)

### 3.1 *Not this name* keeps the person

- *Not Brunner* drops that name for that person, as today (`suggestion_dismissal`, per person
  and folded name, household-wide). The person **stays on the list**: under their next name,
  in *Choose one*, or under *No suggestion* with a field.
- The answer gets the usual **toast with Undo** (eight seconds): *Brunner won't be proposed for
  Ben again.* — *Undo*. *Names you said no to → Offer again* stays as the later way back.
- Fix the *No suggestion* crash: each field starts from an empty draft, so the section renders
  with people in it.

### 3.2 *No last name* settles a person

- Every row, in every section, gets **No last name** in its menu (a row in *No suggestion* gets
  it beside *Save*). One tap settles the person: they **leave the list and the counts**, with
  the undo toast: *Ben is fine without a last name.* — *Undo*.
- **Stored on the person**: a new nullable column `contact.without_last_name_at` (when it was
  settled). It is the household's answer, like a dismissal.
- **Settled people are listed in a drawer** at the foot of the page, next to *Names you said no
  to*: *Without a last name (3)*. Each row shows the name (a link to the profile) and
  **Ask again**, which clears the mark and puts them back on the list.
- A settled person is offered nothing anywhere: no chip on the profile (§2.2.4.6) and no
  pass-on offer (§2.2.4.5). An explicit name still works: *Select → Set last name*, the
  profile's name editor, or a later import.
- **A last name clears the mark.** Whenever a person is given a last name by any path, the
  column is set to null in the same write. A person whose last name is later deleted comes back
  to the list.
- The *Data quality* card says *14 people have no last name · 9 with a suggestion*. Settled
  people are not counted there.
- *People known by a first name only* (§2.2.3) is a separate check. Settling the last name does
  not take anyone off it, since a description is what tells them apart.

### 3.3 Merge and restore

- **Merge**: the column joins `FILL_IF_EMPTY` in `merge-profile.ts`. If the survivor has no
  last name and either record was settled, the survivor stays settled. If either brings a last
  name, the name wins and the mark is cleared.
- **Archive**: the column travels with the person (`people[].without_last_name_at`), like every
  other profile column, so export → restore keeps it (round-trip test). Restore adds and never
  overwrites, as for every column.

---

## 4. What does not change

How names are entered on the profile; the quick-add/bulk surname polish (its own TODO);
kinship; the proposal rules F1–F11.

---

## 5. Open questions (for the owner)

1. **What *Not this name* stores, and how it is undone.** *Recommended:* as today, per person
   and name, household-wide, with an Undo toast added and *Offer again* kept.
   Alternative: no toast, only *Offer again*.
2. **What "done" is called, and where settled people are listed.** *Recommended:* the action
   is **No last name**, and settled people sit in a **drawer at the foot of the Last names
   page** (*Without a last name (3)* → *Ask again*). Alternatives: a filter on the People
   directory; a separate Data quality card.
3. **Per household or per member.** *Recommended:* per household, like the dismissals and
   shared-by-default. Alternative: per member (each member works their own list).
4. **Does it travel in the archive.** *Recommended:* yes, as a column on the person.
   Alternative: no, like the dismissals today.
5. **A settled person gets a relative with a surname later.** *Recommended:* they stay settled
   and quiet; the household answered *no last name*. Alternative: a new proposal brings them
   back to the list.

---

## 6. Found on the way

- **The *No suggestion* crash** (§2) is the cause of the reported bug, so it is fixed here.
- *Not yet carried by the archive document*: declined last names (and declined relationships),
  already noted in docs/03. Not changed here.
