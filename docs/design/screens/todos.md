## 5.5.14 To-dos

### Intent

A member with a moment to spare comes to see everything the household still owes anybody, the
most pressing first, and to tick off what is done without opening each person.

### Rules

- **`/todos`** heads with *To-dos* (*Todos*), the count *5 open* beside it, and one line on what
  the page is. Mockup: https://claude.ai/artifact/5Lj9VzJEqR7My3sEL2vhjq
- One card per **day group** (`bg-card`, `shadow-card`): *Overdue*, *This week*, *Later*,
  *No day*, each heading with its count in `--fg-muted`; an empty group is left out
  (`todoListGroups`, docs/02 §2.26.6). The heading is `--fg`, *Overdue* too — no nudges.
- Each row (`HouseholdTodoRow`, `variant="list"`): the line as the checkbox's `<label>`, then a
  `text-xs` line with the day (`TodoDue`) · *noted by …* · *private*; the person with a 20 px
  avatar as a link to their To do card beside the line from `sm`, under it on a phone; the box
  at the right end (§5.1).
- Ticking is the card's: struck through at once, the toast with *Undo*, the struck row in its
  place while the toast stands; a tick kept on the device says *not sent yet* and offers
  *Undo* on the row. A refusal says why above the groups.
- No pencil and no remove: those stay on the person's card, where the name leads.
- With nothing open: `EmptyState` with the to-do icon, *Nothing open.*, and the hint that a
  to-do noted on a person's page shows up here.
- Nothing in the navigation leads here: Home's *Show all N* under the *To do* band and the
  palette's *All to-dos* do.

### Why

By day rather than by person, because the question here is *what is due*, while the person
page already answers *what do we owe Hilde*. Overdue and the week come first because that is
what the band on Home shows; the rest is one scroll further. The person stays on every row,
since a line like *send the recipe* means nothing without whom it is for.
