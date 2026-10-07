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
  **Labels** (names every line at once), **All kinship lines** (while the Kinship kind is on)
  and the grouping by role.
- On a phone (below `sm`, tuned for a Pixel 9 Pro at 412 px) search, Filter and Arrange keep
  one row: the search field takes whatever the two menus leave, and the Arrange pill shows only
  the arrangement's name (its accessible name still reads *Arrange: …*). Full screen and the
  connection path start a second row.
- On a phone the peek panel is a strip along the bottom: avatar and name side by side, its
  buttons in one row, the general tip left out. The toolbar stays within reach while somebody
  is selected.
- An open Filter or Arrange menu moves sideways as far as it must to stay on the map, 12 px
  clear of its edge.
- A **Full screen** button at the end of the toolbar row hands the whole frame — canvas,
  toolbar and peek panel — to full screen, on the graph route and on a person's map alike.
- On a person's page the phone map preview opens straight into full screen
  (`startFullscreen`), and leaving it hands the place back to the preview (`onFullscreenExit`).
  The map enlarged inside the card keeps the button, with *Shrink map* (`onShrink`) just left
  of it; leaving full screen from there returns to the enlarged map.
- Both icon buttons carry their name as a tooltip.
- With a mouse, and on every touch device except iPadOS/iOS Safari (Android, a touch laptop),
  full screen is the browser's own Fullscreen API; Esc leaves it too.
- On iPadOS/iOS Safari full screen is an app-level overlay; only the button leaves it.
- Where neither is available the button is absent.

### Why

A legend that *is* the filter can never disagree with the lines it toggles, and there is no
second box to keep in sync. On a phone both menu pills stand at the right, so a menu opening
from there would run off the screen unless it moves. The peek panel has no room beside the map
on a phone, hence the bottom strip.

Esc leaving the native full screen is fine: nobody presses Esc mid-drag. iPadOS/iOS Safari reads
a downward drag on a Fullscreen-API element as "swipe to dismiss" — the gesture that closes a
full-screen video — and panning the canvas is exactly that drag, so those devices never hand the
frame to the browser.
