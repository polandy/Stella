## 5.5.18 Outings

### Intent

A member planning a free weekend comes to see everything the household wants to do with
someone, what is near first, and to tick off what they did without opening each person.

### Rules

- **`/plans`** heads with *Outings* (*Unternehmungen*), the count *4 open* beside it, and one line
  on what the page is. Concept: https://claude.ai/artifact/WDNvm8UqZPLnmTtUco39jg
- One card per **group** (`bg-card`, `shadow-card`): *This month*, *Later*, *Some time*, each
  heading with its count in `--fg-muted`; an empty group is left out (`planListGroups`,
  docs/dev/02 §2.27.9). A passed idea sits in *This month* with the card's passed chip — no nudge
  beyond it; Home asks.
- Each row (`PlanListRow`): the person's 28 px face, the title linking to their Outings card,
  *private* or the surprise icon before it, then a `text-xs` line *with Mia* (to the person) ·
  *booked* · *not sent yet*, and the when chip (`WhenChip`) under it; the done box at the right
  end (§5.1), the card's `PlanStep`.
- Ticking is the card's: the toast with *Undo*, the row gone while it stands; a tick kept on the
  device says *not sent yet* on the row. A refusal says why above the groups.
- **Show later ones too (n)** under the groups, with the chevron, while unbooked ideas wait more
  than 90 days ahead; *Hide the later ones* folds them again. With only such ideas, a line says
  every idea waits for later.
- No pencil, no booking and no remove: those stay on the person's card, where the name leads.
- With nothing open: `EmptyState` with the explore icon, *No open outing idea.*, and the hint that
  an idea noted on a person's Outings card shows up here.
- Reached from the Outings card's ⋯ menu (*All outings*) and the palette's *All outings*; the top
  bar's trail is *Home › Outings*.

### Why

By when rather than by person, because the question here is *what could we do soon*, while the
person page already answers *what do we want to do with Mia*. Far-off ideas fold away so the
page stays a short read, as `/gifts` does. The person stays on every row, since *the zoo* means
nothing without whom it is with.
