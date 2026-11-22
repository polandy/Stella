## 5.5.13 Gift ideas

### Intent

A member about to shop — before a birthday, or in December — comes to see every open idea of
the household at once, and to tick off what they bought without opening each person.

### Rules

- **`/gifts`** heads with *Gift ideas*, the count *6 open* beside it, and one line on what the
  page is. At the heading's right, the secondary button *Record given…* opens the Gifts card's
  sheet for everyone (docs/dev/02 §2.25.14). There, each row's *For* is a person search or the
  *Us (household)* chip. *From* offers *Us* and the search only. A row for us that has no person
  under *From* shows a `bg-warning-soft` line until it gets one. Mockup: https://claude.ai/artifact/4rJm5QVbU85KWvC17mVybU
- Under the intro the pill `Tabs` *By person* · *By occasion* (docs/dev/02 §2.25.6), the choice
  kept per member in this browser (`listViewPreference`). The waiting toggle belongs to *By
  person* only. *By occasion* is one `bg-card` per day, soonest first: the heading with its
  nearness (`occasionHeading`) and the tally *1 done · 2 assigned · 1 free* at the right, then a
  block per recipient (`Avatar`, the name as a link to their Gifts card, their tally) over rows
  of `GiftStateMark`, title and the giver's phrase or *still free*; bought rows at `opacity-70`.
  A passed day carries *… is over. Record what was given…*. The rows have no buttons: the card
  is where a gift changes. With nothing planned: `EmptyState`, *Nothing planned for an occasion
  yet.*
- One card per person (`bg-card`, `shadow-card`): `Avatar`, the name as a link to their Gifts
  card, *2 ideas* to the right, and under the name a chip with the next occasion, *Birthday in
  3 days · 2 Nov* (*today* and *tomorrow* in words), behind the calendar icon for a birthday and
  the gift for Christmas. Within 30 days the chip is `bg-warning-soft`, otherwise neutral.
- Cards in the order of their occasion (docs/dev/02 §2.25.6); the rows inside as on the Gifts card,
  each naming its giver (*Sandra is giving it*) and with *Bought* and *Mark as given…* (`IdeaListRow`) — a bought idea leaves the list as a
  given one does, with the same *Undo* — and *hidden from Hilde* on a surprise, and an idea's time as its `WhenChip` — *· in 34
  days* while it comes near, `bg-warning-soft` and *· passed* once its occasion went by. An idea
  still waiting for its time is folded away (docs/dev/02 §2.25.8): under the intro a small
  uppercase toggle, the card's *Later* style, says *3 ideas for later* (`aria-pressed`, the label never changes);
  pressed, the waiting rows join their person's card after the others, soonest first, at
  `opacity-80`, and the chevron turns. The choice is kept per member in this
  browser (`waitingPreference`). The count beside the heading stays the open ideas only; with
  only waiting ideas left, one muted line says so instead of the empty state. *Still current?*
  is asked on the person's card only. An idea several people get (docs/dev/02 §2.25.11) carries
  the card's *also for Ben and Lea ›* under its chip, a link to the person's Gifts card that
  opens *Who has it?* (`giftGroupPanelPath`). The form opens in place, its occasion preset to
  the card's; *Cancel* closes it.
- A given idea disappears at once and comes back on *Undo* in the toast, as a removed row does
  (`heldAnswer`); a card whose last idea went disappears with it.
- With nothing open: `EmptyState` with the idea icon, *No open gift ideas.*, and the hint that an
  idea noted on a person's Gifts card shows up here.
- Nothing in the navigation leads here: the palette's *All gift ideas*, a phone's empty Home field
  (docs/dev/02 §2.22.1) and the Gifts card's ⋯
  menu do.

### Why

The list is for one job a few times a year, so it stays out of the phone's bar and is reached
where a member already thinks about gifts. By person rather than by date, because a shopping
trip is planned per person; the next occasion orders them, since that is what decides what to
buy first. Giving an idea here must be as quick as on the card, and undoable, because ticking
off the wrong row in a long list is easy.
