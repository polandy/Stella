## 5.5.12 Photos from the Immich library

### Intent

A member writing about a day — a moment, a journal entry — or filling a gallery wants the photos
they already took, which live in Immich, without leaving Stella or downloading them first
(docs/02 §2.24.9).

### Rules

- **Where it opens.** A moment's and a journal entry's photo button is a menu (`PhotoSourceMenu`):
  *From this device*, *From Immich*. A gallery's editor keeps its file field and adds *or From
  Immich* (`FromImmich`) beside it, with *N photos from Immich* once some are picked. Without
  Immich on the instance, the button stays the plain file picker and nothing else shows.
- **Offline**, *From Immich* stays where it is, greyed out, with *Needs a connection* under it.
- **The sheet** (`ImmichLibraryPicker`) slides up from the bottom like the circle picker: a title,
  the search field, the day bar, the grid, and a footer that stays put.
- **The day bar** heads with the day, *N photos* under it, ‹ and › on either side named *An
  earlier day with photos* and *A later day with photos*. It opens on the entry's day (a gallery: today).
- **The grid** is three square columns on a phone, four on wider screens; each tile carries its
  time (a day) or its date (a search) in the corner, on a dark scrim. A tap ticks it: a primary
  ring and a round badge with its number in the order of the taps; the tile is a toggle button
  (`aria-pressed`) named *Photo, 14:32*.
- **A search** replaces the day bar with *Best matches for "…"* and a clear button; clearing
  goes back to the day. Smart search off is a quiet note above the days, not an error.
- **The footer** says *Tap photos to tick them*, then *N ticked* with *Clear*, and *Add N
  photos* as the primary button, disabled at none. At 20 it says *At most 20 at a time*, and a further tap does nothing.
  *Add* shows *Copying 3 of 5 photos from Immich…*, then closes the sheet and a toast says
  *5 photos from Immich added*; a failed copy says so and keeps the ticks.
- **States:** skeleton tiles while loading; *No photos from 12 June in Immich.* with the arrows
  still there and a line that they skip to a day with some; *Immich didn’t answer.* with *Try
  again*.

### Why

A day is how a member remembers a moment, so the picker starts on the entry's day rather than a
gallery of everything; the arrows skip empty days because a family's library has many. Numbers
on the ticks show the order the photos will appear in. The sheet is the circle picker's shape so
it reads as part of the composer, not a trip to another app. The overlay on the photo is the one
place black and white are used, as in the lightbox: it sits on a picture, not on a theme.
