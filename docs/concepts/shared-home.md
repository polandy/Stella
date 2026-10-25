# Concept: a shared home address

**Status:** agreed 2026-10-25 (§6); slice 1 built (§8), slice 2 open. Mockup: [`shared-home.html`](shared-home.html).

## 1. The problem

A family lives at one address, and today every person carries their own copy of it: four
people, four `contact_field` rows of kind `address`, typed four times and wrong three times
after the move. The household wants to enter an address once for everyone who lives there.

## 2. What it is — and what it is not

- A **home** is one address plus the people who live there. It has no page, no list and no
  place in the navigation: it exists only *in the address fact* of its members (docs/02 §2.2,
  *The profile page*). A circle would have worked in the schema but would flood the circles
  list with one "Brunner home" per family — rejected by the owner.
- `household` already names the whole deployment (the tenant, docs/03 §3.1), so the code says
  **`home`**; the UI says *Home* / *Haushalt* only where it must, and mostly just *lives with*.
- A person's **own** addresses (work, a student flat, a holiday house) stay ordinary
  `contact_field` rows beside it. A person can live in **more than one** home at a time
  (a child of separated parents).

## 3. Data model (docs/03 §3.3)

```
home         id · household_id · label (default *Home*) · value (formatted line) · meta (JSON parts)
             · created_by · created_at · updated_at
home_member  home_id → home (cascade) · contact_id → contact (cascade)
             · created_by · created_at        primary key (home_id, contact_id)
```

- **No visibility column on `home`.** A home is only ever reached through a member the viewer
  may see (§3.7), so it inherits that person's visibility; it has no surface of its own.
- A person's addresses are *own address fields* + *every home they currently belong to*. The
  resolution is one access-layer read, used by the profile, search and export.
- No history (§6 Q1): moving out deletes the membership, and a home is deleted with its last
  member.

## 4. Behaviour

1. **Reading.** The *Address* fact shows the home's line and below it *lives with Anna and
   Peter Brunner*, each name a link. Only people the viewer may see are named.
2. **Sharing.** The address editor gains *Share with …*: the multi-picker circles already use,
   with the person's family (parents, children, partner, siblings — §2.4) offered first. Picking
   someone who has an own address that is the same after folding (case, spaces, punctuation)
   replaces it silently; a *different* own address is named on the chip (*has Dorfstrasse 12*)
   and kept as their own address unless *replace* is ticked. One transaction, one undo.
3. **Changing the line.** Saving a changed address of a home asks once, in the sunken confirm
   box: *For everyone here — Anna, Peter and Tim* (default) or *Only for Tim* — which moves Tim
   out of the home and gives him the new line as his own address. Toast: *Address changed for
   3 people · Undo*.
4. **Moving out.** *Moved out …* in the editor, with an optional new address that becomes the
   person's own. The membership is deleted (with undo); the rest of the home is untouched. The
   × on another member's chip does the same for them.
5. **New people.** Adding a child or partner of someone with a home (relationship quick-add,
   §2.4) offers *Lives at Lindenweg 4 with Anna and Peter* as a ticked box. This replaces the
   copying prefill F4 in docs/02 §2.4.1 (*the value copied, the rows never linked*), which is
   rewritten in the same change.
6. **Existing duplicates — *Settings → Data quality → Same address*.** A check, run on demand,
   groups people whose own address lines are equal after folding; each finding offers
   *Make one home* or *Not the same* (remembered, like the relationship checks). Nothing is ever
   merged without the tap. Joining an existing home is offered the same way.
7. **Private people.** A private person's record changes only by their owner (§3.7). A save by
   anyone else on a home with members they cannot see therefore leaves those members on the old
   line — they are split off as their own address — and the confirm box never names or counts
   them.
8. **Edges.** Export and backup (§2.15) carry `home` + `home_member`; search (§2.9) finds every
   member by the home's line. The import API accepts `home: { with: <personId> }` on a person in
   place of an address. The household stream records nothing (an address is not news).

## 5. Out of scope

A map of homes, a "same household" relationship suggestion (L7 stays not built), postal
validation, and any home without a person in it.

## 6. Decisions (owner, 2026-10-25)

- **Q1 — no history.** Moving out removes the person from the home, undo for a while; no former
  addresses (the mockup's variant B is not built).
- **Q2 — *For everyone here*** is preselected when a home's line changes.
- **Q3 — exact only.** The duplicate check matches lines equal after folding case, spaces and
  punctuation; no near-matches.

## 7. Slices

1. **The home itself** — schema + migration, the access-layer resolution, the *Address* fact
   (*lives with*), the editor (share, change line with the confirm, moved out, remove a member),
   search and export/backup.
2. **Getting homes in** — the new-child/partner offer (F4 rewritten), *Data quality → Same
   address*, and `home` in the import API. This concept then folds into docs/02, 03 and 05 and is
   deleted.

## 8. Slice 1 as built — where it differs

- **Named *Also lives here …*** (*Wohnt auch hier …*), not *Share with …* — the owner's
  choice after the hand test; its button says *Add*.

- **Search left out.** Contact fields are not in the search index at all (§2.9), so a home's
  line is not either; searching by address is its own change, for every address at once.
- **No undo on *Add* or a changed line.** Both wait for a connection like editing a field;
  a share is taken back with *Moved out*, a line by saving it again. *Moved out* and the × on a
  chip have undo (§2.23).
- **The different address is asked about after *Add*,** in the sunken box, rather than named
  on each chip while picking — the picker stays the one every page uses.
- ***Moved out* takes no new address;** *Add another address* gives them one.

