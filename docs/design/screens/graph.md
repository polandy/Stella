## 5.5.5 Graph

### Intent

The household as a map: find a person, see who they are connected to and how, and trace the
chain between two people. The same explorer runs full screen here and inside a person's People
card (§5.5.2); its styling is §5.8.

### Rules

- A full-screen canvas under one slim toolbar row: search-to-focus, a **Filter** menu, an
  **Arrange** menu and the connection path (§5.8), plus a **peek panel** with the selected
  person's avatar, name and two actions.
- The Filter menu **is the legend**: each line kind is an item drawn in its own line style
  (solid per category, dashed for circles, dotted for kinship) in its token. There is no
  second legend box.
- Below the kinds sit the switches that change how the map is read rather than what it holds:
  **Labels** (names every line at once), **All kinship lines** (while the Kinship kind is on),
  **Former links** (on by default; its row starts with the former line's dashed stroke) and
  the grouping by role.
- A link marked former is a thinner, longer-dashed line in a muted shade of its category, and
  its name ends in *· former*; selected or hovered it stays thinner than a current line. With
  *Former links* off it leaves the map and the Filter pill stands out as narrowed, its name
  ending in *former links hidden*.
- **Tree** draws the family as a paper family tree (§5.8): partner bars, one drop per couple to
  a bar over their children — a former couple stays side by side on a dashed bar, but each
  parent drops on their own, and the role under the name says *Wife · former* — right angles throughout, each person's role towards the centre
  under their name instead of names on the lines — Labels starts off in the tree and its switch
  turns the names on there as anywhere, each on its child's own drop — the centre softly
  lit, and everyone outside the family on a shelf beneath under a quiet *Outside the family*,
  each with a caption: a friend of the centre's their role, anybody else whom on the map they
  hang off (*Friend of Sandra +1*), a circle its people on the map (*Lena, Noah +2*).
  Each family stands as one block — siblings together, a person's father's family left, their
  mother's right — so no couple's bar crosses another's. Only the tree's own lines are drawn:
  a grandparent, cousin or sibling line the bars already draw is left off, and friends,
  colleagues and circles show their lines only around a person the reader taps or finds — not
  around the opening centre, nor the person just expanded once the tree is laid out again. An
  only child hangs straight under their parents. The map is never framed so far out that the
  names vanish: a large tree is shown from its top at the smallest zoom that still draws them,
  the shelf below reached by panning. An expand
  in the tree lays the whole tree out again; everybody glides to their new place.
- In the tree around a person, a reader who may add a relationship sees a dashed **plus slot**
  where a parent is missing up the centre's own line (centre, parents, grandparents): over a
  child with no parent on record, or beside the one parent there on a dashed bar. It is no
  person — no filter, badge or path counts it — but the keyboard walk steps onto it and reads it
  as a button (*Add a parent of Lena*, *Add Lena's other parent*); tapping it or Enter opens the
  child's page with *Add relationship* open on *Child of*, leaving full screen first.
- In the tree, **Export** (before Full screen in the toolbar) opens a dialog: on the left a
  preview of the sheet as it comes out — the page with its margins for a print, the picture
  alone for a PNG, white whatever the theme — and on the right the title, *Picture (PNG)* or
  *PDF / Print*, the paper (*A4* or *A3*, landscape) with a hint at the printed name size, the
  *Years of birth and death* switch and, only when someone on the map is private, the private
  switch; Cancel and *Download PNG* / *Print…* at the foot. On a phone the dialog is a bottom
  sheet, the preview capped at 40% of the screen's height so the choices stay in sight.
- On a phone (below `sm`, tuned for a Pixel 9 Pro at 412 px) the toolbar is one row: the
  search field takes whatever the rest leave, and Filter, Arrange and the connection path are
  round icon buttons (their accessible names still read *Filter: …*, *Arrange: …*,
  *Connection path*); a narrowed filter shows a dot. Export (in the tree) and Full screen keep
  their icons. The page's hint bar above the map is left out unless it carries the way back.
- On a phone the peek panel is a one-row strip along the bottom: avatar and name side by side,
  then Expand and Profile (a word each, the full words their accessible names) and close. A
  circle's roles and *the map ends here* go under the row; the general tip and *everything is
  already shown* are left out. Tapping a selected person again still expands them. The toolbar
  stays within reach while somebody is selected.
- An open Filter or Arrange menu moves sideways as far as it must to stay on the map, 12 px
  clear of its edge.
- A **Full screen** button at the end of the toolbar row hands the whole frame — canvas,
  toolbar and peek panel — to full screen, on the graph route and on a person's map alike.
- On a person's page the phone map preview opens straight into full screen
  (`startFullscreen`), and leaving it hands the place back to the preview (`onFullscreenExit`).
  The map enlarged inside the card keeps the button, with *Shrink map* (`onShrink`) just left
  of it; leaving full screen from there returns to the enlarged map.
- Entering or leaving full screen frames the map afresh for its new size, unless the reader
  has panned or zoomed since the map last framed itself — then their view stays (§5.8).
- Both icon buttons carry their name as a tooltip.
- With a mouse, and on every touch device except iPadOS/iOS Safari (Android, a touch laptop),
  full screen is the browser's own Fullscreen API; Esc leaves it too.
- On iPadOS/iOS Safari full screen is an app-level overlay; only the button leaves it.
- Where neither is available the button is absent.

### Why

A legend that *is* the filter can never disagree with the lines it toggles, and there is no
second box to keep in sync. Former links are a switch rather than a seventh chip because a
former link already has a kind and a category; the switch cuts across them. They are shown by
default because an ex-partner is still part of how a family hangs together, and a bar the
children hang from would say the two are still a couple. On a phone both menu pills stand at the right, so a menu opening
from there would run off the screen unless it moves. The peek panel has no room beside the map
on a phone, hence the bottom strip — kept to one row, because a second toolbar row, an empty
hint bar and a tall card together left a 412 px phone a map the size of a stamp. A phone frames
a whole family far below full zoom, so the names around the selected person grow with it; the
faded rest stays small, or the grown names would cover the people.

The slots for missing parents keep to the centre's own line because that is the question a tree
around one person asks, and three generations cap a large family at seven plus signs. They are
left out of the model so nothing that counts people — filters, "+N", the path — has to learn to
skip them; and a slot a reader may not use would be a button that only refuses.

The export draws the tree again on a core of its own rather than photographing the screen, so
the reader's map neither moves nor turns light, and a private person left out leaves no gap. A
print is one page because a tree split across pages has to be taped back together; A3 is the
answer when A4 makes the names too small. The preview's title is typed over a blank header at
the picture's own measures, so a keystroke never draws the tree again.

Esc leaving the native full screen is fine: nobody presses Esc mid-drag. iPadOS/iOS Safari reads
a downward drag on a Fullscreen-API element as "swipe to dismiss" — the gesture that closes a
full-screen video — and panning the canvas is exactly that drag, so those devices never hand the
frame to the browser.

A map framed for a 24 rem card is framed far too small for a whole screen, and the other way
round it spills out of the card; reframing fixes that. A reader who has already moved the view
was looking at something, and taking it away from under them is worse than a map off centre.
