# Concept: a shared home address

**Status:** proposal, waiting for the owner's choices. Mockup: [`shared-home.html`](shared-home.html).

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
home_member  home_id → home (cascade) · contact_id → contact (cascade) · since? · until?
             · created_by · created_at        unique (home_id, contact_id) while until is null
```

- **No visibility column on `home`.** A home is only ever reached through a member the viewer
  may see (§3.7), so it inherits that person's visibility; it has no surface of its own.
- A person's addresses are *own address fields* + *every home they currently belong to*. The
  resolution is one access-layer read, used by the profile, search and export.
- A home with no members left is deleted with the last one (variant A) or kept as the former
  address of everyone who lived there (variant B, see §6 Q1).

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
4. **Moving out.** *Moved out …* in the editor: an optional month and an optional new address.
   The membership ends (`until`); the rest of the home is untouched.
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

## 6. Open questions — the mockup shows each choice

- **Q1 — history.** A: moving out simply removes the person from the home (undo for a while),
  no former addresses. B: the membership keeps `until`, and the address editor lists
  *Before: Lindenweg 4 · until Aug 2026*. *Recommendation: A* — Stella has no address history
  today and nobody asked for one; B can follow without a migration since `until` exists.
- **Q2 — the default on a changed line.** *For everyone* (recommended — the common case is a typo
  or the family moved) or no default, forcing a choice each time.
- **Q3 — the data-quality check.** Exact match after folding only (recommended), or also
  near-matches (*Lindenweg 4* vs *Lindenweg 4a*), shown as *maybe*.
