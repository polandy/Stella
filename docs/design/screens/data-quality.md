## 5.5.8 Data quality

### Intent

The household-wide checks, gathered under Settings → *Data quality*: relationships Stella can
work out but nobody entered, people without a last name, people known by a first name only. A
reader comes here to work a list down, a few answers at a time, without losing their place.

### Rules

#### The Data quality page

- Each check is a card like the rest of Settings: *Check relationships* (docs/02 §2.4.1),
  *Last names* (§2.2.4; the `rename` icon, its line saying how many have none and how many have
  a suggestion) and *People known by a first name only* (§2.2.3; the `tidy` icon, with a count
  pill while anyone is left).
- The checks live here, not in the People directory (§5.5.3).
- The first-name list gives each row a one-line description field and a small *Save* under the
  name; a saved row leaves the list.
- Its names link to the profile; the list offers neither merging nor archiving itself.

#### Check relationships

- Closed, the screen is an `EmptyState` with one primary action; no rule runs until it is asked
  for.
- Asked, it is a count, *Check again*, and one card per person: the avatar, the name linking to
  the profile, and that person's claims as the **same rows the person page uses**
  (`KinSuggestions`).
- **Nothing is dropped, everything is folded**, at three levels: **ten people to a page** with
  a pager; **five claims per person**, the remainder named (*1 more for Selina Gerber*, never a
  bare *more*) with a link to that person's own review panel; and the declined log moving from a
  `<details>` drawer to **its own address** once it passes ten.
- **The header counts the household, the range counts the page**: *6 open across 1 person*
  beside *People 1–10 of 96*. A search narrows the range and never the header.
- Every control — pager, search and log included — is a form or a link, so the screen works
  with JavaScript off; an answer returns to the page and search it was given on.
- **A row says what its claim follows from**, in one sentence under the claim. Every name in
  both is underlined, in `fg-subtle` (not `border`), and leads to that person. Names are not in
  the link colour.

#### Answering a row (here and on a person's page)

- **An answered row goes at once**: it fades as it closes, over 200ms, and while it closes the
  list gives the height it loses back to its own scroll offset, so whatever stood below the row
  stands in the same place when it is gone (0px of movement). At the top of a list there is
  nothing to give back, and the rows below do move.
- *Undo* lives in the toast for eight seconds.
- Under `prefers-reduced-motion` the row simply goes (docs/04 ADR-012).
- **A keyboard answer keeps its place**: once the row has gone, focus moves to the **same
  button of the row that took its place**, so a run of *Decline, Enter* goes on down the list.
- Rows are read in page order across the whole screen: a person's last answer carries on into
  the next person's first row; with nothing left below, the nearest row above; with no row left
  at all, the screen's heading (*Check relationships*, or *Suggestions* / *Also true?* on a
  profile), which is focusable for exactly this. Never the person's own name.
- Only a keyboard answer (`:focus-visible`) moves focus — a click never does — and never when
  the reader has already put focus somewhere else or the row left for another reason (an undo,
  a refresh).
- Focus moves the same under `prefers-reduced-motion`. The decision is
  `src/lib/relationships/answer-focus.ts`.

### Why

Checks live in Settings so the People directory stays a place to find people rather than a
to-do list. Merging and archiving stay on the profile, where they live in the ⋯ menu.

The rule engine runs only when asked because it computes the whole household (docs/04 §4.9),
and nothing it finds is dropped (docs/04 ADR-010) — so the screen folds instead. The header and
the range answer two different questions: how much work is left, and where in it the reader is.
Using the person page's rows means an answer means one thing wherever it is given.

The *follows from* sentence was measured: it costs the row nothing at the review's own width
(66px, unchanged) and one line on a phone. The underline is `fg-subtle` because, measured on the
dark theme, a border-coloured rule vanished against the row and the names read as plain text in
one theme and as links in the other. Names stay out of the link colour because the two buttons
beside them are the call to action, and a row carries up to six names.

An answered row hands its height back so the next row is never pulled up under a finger; a plain
collapse moved everything below by a full row (74px). That it fails at the top of a list is the
honest limit. Focus skips the person's own name because their card leaves the page once its
answers are sent and would drop focus a second time. A click never moves focus so the pointer's
0px hold is untouched, and focusing a button says nothing new, so the toast's announcement is not
talked over.
