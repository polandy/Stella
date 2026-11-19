## 5.5.12 Photos from the Immich library

### Intent

A member writing about a day — a moment, a journal entry — or filling a gallery wants the photos
they already took, which live in Immich, without leaving Stella or downloading them first
(docs/dev/02 §2.24.9).

### Rules

- **Where it opens.** A moment's and a journal entry's photo button is a menu (`PhotoSourceMenu`):
  *From this device*, *From Immich*. A gallery's editor keeps its file field and adds *or From
  Immich* (`FromImmich`) beside it, with *N photos from Immich* once some are picked. Without
  Immich on the instance, the button stays the plain file picker and nothing else shows.
- **Offline**, *From Immich* stays where it is, greyed out, with *Needs a connection* under it.
- **The sheet** (`ImmichLibraryPicker`) slides up from the bottom like the circle picker: a title,
  the search field, the tabs, the trail, the body of the level, and a footer that stays put.
- **The tabs** (`LibraryTabs`) sit under the search: *Time* (calendar icon) and *Albums* (photo
  icon), the body below their tab panel. Each tab returns to the level it was left on. Without
  the key's `album.read` they are not there and the picker is the timeline alone.
- **The trail** (`LibraryCrumbs`) names where the picker is: *All years › 2026 › October › Wed
  21*. Every step but the last is a button back up; the last is plain text (`aria-current`).
  Without the key's `timeline.read` it starts at the month. In *Albums* it reads *All albums ›
  Sommerferien Engadin*.
- **All albums** (`LibraryAlbums`) is covers in two columns, three wider: a square cover, the
  name in bold, *about 24 · Jul 2026* under it; a cover Immich would not show is a sunken
  square with the photo icon. From 12 albums a filter field with the filter icon heads the list,
  kept while the sheet is open;
  *No album is called "…"* when nothing matches. The approximate-counts line sits under it.
- **An album** (`LibraryPaged`, as a month) is its photos oldest first under sticking day
  headings that name the year (*Thursday, 30 July 2026*), the next 100 loading near the end; *This album holds no photos Stella can show.*
  when Immich has none of them on the timeline.
- **All years** (`LibraryYears`) is tiles in two columns, newest year first: the year, *about 812*,
  and a thin bar against the busiest year. One quiet line under them says the counts include
  videos, so they are approximate.
- **A year** (`LibraryMonths`) is twelve month tiles in a grid, three on a phone, four wider, each
  with its count; an empty month is greyed out and cannot be tapped.
- **A month** (`LibraryMonthGrid`) is the grid grouped by day: each day's heading (*Wed 21*, a
  › at its end) sticks to the top while its photos scroll, and a tap opens the day. Near the end
  the next page loads by itself; *Show more photos* stays as the button for it.
- **The week chips** (`LibraryWeeks`) sit between the trail and the grid of a month: a row of
  pills, *Week 40 … Week 44* (*KW* in German), scrolling sideways. A tap jumps the grid to that
  week's first day with photos, reading further pages first when it is not there yet; the last
  tapped chip is filled and `aria-current`. They are a jump within the month, not a level.
- **The day bar** heads with the day, *N photos* under it, ‹ and › on either side named *An
  earlier day with photos* and *A later day with photos*. It opens on the entry's day (a gallery: today).
- **The grid** is three square columns on a phone, four on wider screens; each tile carries its
  time (a day) or its date (a search) in the corner, on a dark scrim. A tap ticks it: a primary
  ring and a round badge with its number in the order of the taps; the tile is a toggle button
  (`aria-pressed`) named *Photo, 14:32*.
- **A search** replaces the day bar with *Best matches for "…"* and a clear button; clearing
  goes back to the day. Smart search off is a quiet note above the days, not an error.
- **The tray** sits above the footer's line once something is ticked: small square thumbnails
  (44 px) in the order of the taps, each with its number in a round badge at the corner, scrolling
  sideways. It holds every tick, whichever level or search it came from; a tap on a thumbnail
  unticks it (*Untick photo 2*). It is hidden at none.
- **The footer** says *Tap photos to tick them*, then *N ticked* with *Clear*, and *Add N
  photos* as the primary button, disabled at none. At 20 it says *At most 20 at a time*, and a further tap does nothing.
  *Add* shows *Copying 3 of 5 photos from Immich…*, then closes the sheet and a toast says
  *5 photos from Immich added*; a failed copy says so and keeps the ticks.
- **In a journal entry's editor** nothing is copied (docs/dev/04 ADR-132): *Add N photos* closes
  the sheet at once and the picks wait beside the entry's photos with a dashed frame until
  *Save*. A referred photo Immich no longer serves is a dashed tile with the offline icon, named
  *Photo not available from Immich* — never a broken image.
- **States:** skeleton tiles while loading; *Immich has no photos yet.* for an empty overview;
*No photos from October 2026 in Immich.* for an empty month; *Immich has no albums with photos yet.*
for an empty album list; *No photos from 12 June in Immich.* with the arrows
  still there and a line that they skip to a day with some; *Immich didn’t answer.* with *Try
  again*.

### Why

A day is how a member remembers a moment, so the picker starts on the entry's day rather than a
gallery of everything; the arrows skip empty days because a family's library has many. The trail
up to months and years is for the photo whose day nobody remembers — the summer, not the date —
and is the way Immich's own timeline reads, so it needs no learning. Counts say *about* because
Immich counts videos the picker leaves out; a promise of 812 that shows 790 would read as a bug. Numbers
on the ticks show the order the photos will appear in, and the tray shows them all, because a tick
made in another month would otherwise be invisible. Weeks are chips and not a level because a week
is a place to jump to in a month, not somewhere to stand; one more step would cost a tap each time.
Albums are a second way in, not a level under the years, because a family names its trips and
birthdays in Immich and remembers them by that name; tabs keep the two ways apart and each keeps
its place, so a look at an album costs nothing in the timeline. Oldest first inside an album
tells the trip in the order it happened. The filter waits for 12 albums because a short list is
faster to scan than to type into. The sheet is the circle picker's shape so
it reads as part of the composer, not a trip to another app. The overlay on the photo is the one
place black and white are used, as in the lightbox: it sits on a picture, not on a theme.
