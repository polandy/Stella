## 5.5.6 Circles

### Intent

A circle is a group of people the household knows together (docs/02 §2.4.2). The list is where a reader finds one; a circle's page shows who is in it by role, and
its photos, and lets the household manage members in bulk.

### Rules

#### The list

- A find-as-you-type field and kind chips over a grid of **cards**.
- Each card: the circle's cover photo as a flat strip across the top when it has one (80 px,
  filled from the centre, decorative), then the colour dot, name, kind and member count, the
  description, and a stack of the first four faces with *+n* for the rest.
- A query that matches nothing gets the empty state (§5.5.10), not a blank page.
- **Families, not levels.** Only a top-level circle gets a card — one without a parent, or whose
  parent the reader cannot see. A sub-circle never has a card of its own: it is a compact
  **row** inside its parent's card, below the meta line — a corner arrow, the colour dot, the
  name, a short period (*23/24*, or *from Aug 2025* when it has no end) and its direct member
  count. A row whose circle has circles of its own adds *+2 inside*; deeper levels are only
  counted, never listed. On a narrow card (a phone, or two cards side by side) that meta drops
  to a small second line under the name, so the name gets the row's full width; a card of at
  least 24 rem keeps it beside the name.
- Rows run **newest first** everywhere — the card's rows, its past ones once unfolded, and the
  timeline's rows on a circle's page: by period start descending, on the same start the later
  end first (an open end counting as the latest), then by name; undated rows come last, by name.
  Current and future rows stand open; **past** ones (ended before today) wait behind *Show 2
  past*, a button inside the card that does not open it. Private sub-circles the reader cannot
  see are a closing *+1 more*, without a name or a link.
- The card's meta line adds *4 sub-circles*; a circle with sub-circles but no direct members
  drops *0 members* and the *Nobody in it yet* line.
- The search reaches into the families: a sub-circle at any depth that matches brings its
  top-level card, showing only the matching rows when the top-level circle does not match
  itself. A matching past row is shown without the toggle. A kind chip keeps a card whose own
  kind or any descendant's matches; the chips still count every circle of their kind.

#### A circle's page

- A sub-circle's path is the **top bar's trail** (§5.4), not a second one on the page: *Home /
  Circles / School / Class 5*, each visible ancestor a link. On a phone the back link is the
  direct parent (*‹ School*); a top-level circle keeps *‹ Circles*.
- Below the header a sub-circle with siblings offers *‹ previous* and *next ›* in
  **chronological** order — previous is the earlier circle, next the later one, as on the time
  axis (by period start, undated last, then by name).
- Every circle shows a **Sub-circles · N** card between the header and the members — empty too,
  as one line, *No sub-circles yet.*, because it is where sub-circles are made. Its header holds
  *New sub-circle* (the card's disclosure, opening the create form in the card) and *Add
  existing* (secondary, opening the circle picker). With children it is a **timeline** with one row per direct child — the dot and the name, *period · N
  members* as text, and a track (`--border`, which holds on Mocha's card where `--bg-sunken`
  fades) with a bar over the period. An open-ended bar has a square
  right edge and runs to the axis's end; a line marks today and the years stand below the
  tracks. On a wide screen the label sits left of the track, on a phone above it. An undated
  child gets no bar; without any dated child the card is a plain list. Each row is a link; the
  bars are decoration (`aria-hidden`), the period is always in the text. Hidden private ones
  close it as *+1 more*. Each row ends in a ⋯ icon button (*Actions for Class 5*,
  `aria-expanded`) that unfolds a strip under the row: *Detach from School* (secondary, at once)
  and *Open*. One strip is open at a time.
- The create form in the card: *Name* with a placeholder fitting the suggested kind (*e.g.
  Class 3a* under a school), *Kind* suggested from the parent's, *Belongs to* already on this
  circle, the colour swatches; *Create circle* opens the new circle.
- **Belongs to** in the header's edit form (and, optional, in the list's *New circle*): a
  button as wide as the inputs with the parent's dot, its name and below it the path (*in
  School › Class 5*), or *None* · *stands on its own* with an empty ring; a small *Detach* link
  beside the label while a parent is set; a help line under it. A refusal stands under the
  field as the form's error; a private parent of a shared circle adds a quiet line saying what
  the others see.
- The **circle picker** is a `<dialog>` sheet from the bottom on a phone and centred on a wide
  screen: title, subtitle, *Close*, a search field focused on open, then the circles indented
  1.25 rem a level. While searching it is a flat list, each row with its path. *None – stands on
  its own* leads when choosing a parent. Rows that cannot be chosen stay, disabled, in
  `--fg-subtle` with their reason; the current choice (or a sub-circle already there) carries a
  check. Its foot says the one rule: a circle cannot sit inside itself or one of its
  sub-circles.
- Moves answer in a toast with *Undo* (§5.7, *Toasts*), never a confirm step: *Saved · now in School*,
  *Class 5 now stands on its own*.
- A circle with sub-circles but no direct members says so where the members would be:
  *Directly, nobody belongs to School — the people are in its sub-circles.*
- The members stand in **grids** of avatar cards, one per role under a small uppercase heading
  with its count; no headings when nobody has a role.
- *Add member* is the card's one disclosure.
- *Select* in the card header turns each card into a checkbox target, with an *all* box beside
  every role heading, and raises a **selection bar** fixed to the bottom of the screen: the
  count, *Everyone / No one*, a role field with the circle's roles as suggestions and *Apply*,
  and *Remove*.
- Leaving select mode drops the bar and the selection.
- On a phone the bar sits above the bottom tab bar (§5.4) and a step below a toast (§5.7).
- The role field is a **Combobox** (§5.7), not a plain input.
- The header carries *Open in the graph*; the explorer offers *Back to the <name> circle* in
  return (docs/02 §2.7).
- Beside it a **⋯ menu** (*More actions*), the person page's `MenuButton` with the `button`
  look, holds *Edit circle* for everyone who sees the circle, and *Delete circle…* in the danger
  colour below it for whoever may delete (its creator, an admin on a shared one) — nobody else
  sees the item.
- *Edit circle* swaps the header for a card-coloured **form in place** with the cursor in the
  name: name, kind and description, the colour swatches the create form uses
  (`ColourSwatches`), and the period as two `DateField`s side by side (stacked on a phone),
  then *Save* (primary) and *Cancel* (ghost). Escape is *Cancel*; either hands the cursor back
  to the ⋯. A refused save keeps the form open with the error above the name.
- *Delete circle…* opens the person page's **sunken confirm box** under the header, not a
  modal: one to three short sentences — what goes (*This deletes Class 1B: 24 members leave it
  and its 7 photos are deleted. It cannot be undone.*), whose profile picture stays theirs, which
  nested circles stay without a parent — then *Delete Class 1B* (danger) and *Keep it* (ghost),
  with the cursor on *Keep it*. Until the counts arrive the box says *Counting what goes…*;
  if they cannot be read, a sentence without numbers stands in, and the button still works.
  Escape and *Keep it* close it and hand the cursor back to the ⋯. After the deletion the reader
  lands on the list with a toast, *Class 1B deleted*.
- The header's line under the name reads kind · period · description · *private*; the period
  in short months (*Aug 2025 – Jul 2026*).

#### Photos

- A circle with a cover opens with it as a wide **strip** above the header; a role with a lead
  photo gets the same strip as a **banner** between its heading and its people.
- Strips are about 3:1 on a phone and a fixed height on a wide screen (192 px cover, 144 px
  banner), filled from the centre, with a count badge when the lightbox has more than one photo
  to walk. Each strip is one button.
- Below the members a *Photos* card holds the role chips (the Circles chip style, only with more
  than one group) and a square grid (three columns, five from `sm`) whose tiles carry the role
  and the date on the gradient, a star when pinned and a lock when private.
- *Add photos* is the Photos card's disclosure: the files, *Who is in them?* and *Who can see
  them?* as pill radios, and the submit naming how many photos it adds.
- The lightbox is the person gallery's dialog (§5.9), with a step back and forward for touch,
  the role as a select, *Use as profile picture for …*, and the uploader's actions below a
  dashed rule. *Remove* is a `RemoveButton` (kind `circle-photo`): the uploader has it, and an
  admin on a shared photo — who then sees only *Remove* in that area. The photo leaves the grid
  and the lightbox closes while *Undo* is on offer.
- On a photo people wear, *Make private* and *Remove* first turn that area into a short warning
  — how many people wear it, and that they keep it — with the confirming button and *Cancel*.
- *Use as profile picture for …* opens a dialog: a search field; the members of the photo's
  role under the role's name; the other members under *Others in this circle*; anyone else
  under *Everyone else* once something is typed. Each is a row with the avatar and a check mark
  when they already wear a cut.
- After a cut the dialog says who now wears the photo, with *Next person* (primary) and *Done*.

### Why

The cover strip on a card is decorative because the name already says what the circle is. The
selection bar is fixed rather than in the card so it stays in reach in a long circle, and its
place on a phone means neither it nor a toast ever hides the other. The role field is a Combobox
because a plain input's suggestions do not show on Mobile Safari. *Open in the graph* is the same
way out a person's People card offers (there in its ⋯), because a circle is a node like any
other. Editing sits in a ⋯ rather than behind a pencil on the name because the circle's later
actions (deleting) join it there, as on the person page; it turns the header itself into the
form so the reader edits what they were just reading. Deleting has no Undo — the files go and
so does the page — so its step says what it takes before anything happens and starts on *Keep
it*, so a second Enter never deletes; the counts are read only when the step opens, so the
page's load does not count photos for a step most visits never open. Strips have a fixed height on a wide screen so the members stay in view.

The list shows families rather than levels because a school with eight classes would otherwise
bury everything else under nine equal cards; a row is enough to find a class, and its page has
the rest. Past rows fold away because a family grows a year at a time and the current year is
what a reader looks for, while the search still finds the old ones. One level down is the limit
on every screen: nesting has no depth limit, and a page that unfolded all of it would stop being
readable. Sub-circles are a timeline on their parent's page because a school's or a club's
children are mostly years and seasons, and their order in time is the point; the period stays
in the text, so the bars carry nothing a screen reader misses.

The parent is set in one field, the edit form's *Belongs to*, because a circle's place is one of
its details like its kind; the card's *New sub-circle* and *Add existing* are shortcuts for the
direction a reader thinks in on the parent's page, and *Detach* is the one thing a row needs
most. The card stays when it is empty because otherwise a circle without children would have no
way to get one but the edit form of each future child. Moves have *Undo* rather than a
confirmation because nothing is lost by one — members, photos and the moved circle's own
sub-circles go along — and a question before every move would be asked of the common case to
guard the rare one (ADR-126). Blocked rows stay in the picker, saying why, so a circle that is
missing never looks like a bug.
