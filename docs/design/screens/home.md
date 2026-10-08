## 5.5.1 Home

### Intent

Where a member lands. They come to write down what just happened, to read what the
household has written lately, and to see whose date comes up next. On a phone they come
first to find somebody, so there the page opens on the person search.

### Rules

- The capture field sits over the household stream (docs/02 §2.22). On a phone the top is the
  person search instead: the *What happened?* heading is left to screen readers, and the
  composer is a **sheet** opened from the tab-bar pencil.
- From `md` the stream carries two rows of filter chips, *What* and *Who*, in the Circles chip
  style: links with `aria-current`, wrapping onto a second line, never scrolling sideways.
- Below `md` the rows fold into one **Filter pill**: the filter icon, *Filter*, the number of
  narrowed groups in a `--primary` badge, the pill tinted `--primary-soft` while narrowed, and
  the narrowed-to names beside it. What the pill says is the pure `filterPill`
  (`src/lib/stream/filter-pill.ts`).
- The pill opens a **bottom sheet** holding the same chip links, *Show everything* while
  narrowed, and *Done*. The sheet is a native `popover`: it closes on a tap outside or Escape,
  its chips work with JavaScript off, and a chip keeps it open over the narrowed stream.
- **Coming up** (docs/02 §2.13.3) is one band; each row is an avatar, the person, one line of
  context and one action, *Write a moment*.
- From `lg` the band stands in a **rail** on the right, a 17 rem column. Below `lg` it is the
  same vertical list at full width; nothing on the page scrolls sideways.
- The band stops after **three rows**, with *Show all N* beneath it.
- Below `lg` the band stands **above** the stream only while a date is due **within 14 days**
  (`IMMINENT_HORIZON_DAYS`); otherwise it follows the stream.
- The band is **absent when empty**, and the rail with it; it has no empty state. From `lg`
  its column goes too and the stream takes the page's width.
- A moment's body keeps a 72ch measure (§5.3).
- Each stream row ends with the **time of day** it was written, in the viewer's locale
  (*08:41*), under *Today* and *Yesterday*; under an older day it ends with nothing. The full
  date and time are the time's tooltip. The grouping and that choice are the pure
  `streamDays` / `streamTime` (`src/lib/stream/days.ts`), handed the clock.
- A moment's people are the mention chips in its body and nothing more. An interaction keeps
  its row of participant avatar chips beneath it.
- **A row's avatar is its subject, not its author**: the anchor of a moment, the person added,
  the one an interaction was with, the *from* side of a link. Who wrote it is the sentence's
  first word.
- On a row **another member** wrote, that member's own avatar (16px) overlaps the subject's
  bottom-right, ringed in the row's ground — `--bg`, and `--card` while the row is hovered.
  The reader's own rows carry no badge, and a household of one member shows none
  (`offersMemberChoice`, the test that shows the *Who* row). The decision is the pure
  `showsActorBadge` (`src/lib/stream/actor-badge.ts`). The badge is `aria-hidden`.
- A person's removal renders in the stream without an avatar or a link: a neutral icon, who
  did it, and what it says.
- **First-run card** (docs/02 §2.22.3): one card above the stream while the household holds
  nobody but the member — a heading, one line on what Stella is for, and up to three steps as
  full-width link rows (icon in `--primary-soft`, title, one-line hint, chevron).
- A done step keeps its place, muted, with a tick in `--success`.
- When the first-run card shows and which steps are done come from `$lib/stream/welcome`;
  `WelcomeCard` only draws it. It replaces the stream's own empty state rather than stacking
  on top of it.

### Why

On a phone the two chip rows would take four lines and push the stream past the fold, so they
fold into the pill; the sheet holds the same links so the filter is one thing in two shapes.
Nothing scrolls sideways because what lies off the right edge of a phone is not read.

*Coming up* must not push the stream away, hence the three-row cap and the 14-day rule: when
nothing is imminent it follows the stream, still one scroll away. It is absent rather than
empty because a permanently empty panel teaches people to stop looking, and its rail column
goes with it because a stable stream width was not worth a quarter of the screen standing
blank most weeks.

Older days need no time: their heading already says when. A moment names its people in its
text, so an avatar row would say them twice; an interaction's participants are not in its
text, so their chips stay.

Faces are what a reader scans for (§5.1), so a row leads with whom it is about. Read by faces
alone, though, a row could pass for being *by* the person pictured — hence the actor badge on
another member's rows. *You* is what a reader assumes, so their own rows stay plain, and in a
one-member household there is nobody else to tell apart. The sentence already names the actor,
so the badge is hidden from screen readers. A removed person has no page left to link to.

A done first-run step keeps its place so the list never shifts under the reader.
