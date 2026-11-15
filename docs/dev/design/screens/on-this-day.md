## 5.5.16 On this day

### Intent

A member with time to linger comes to see what the household wrote on a date in earlier years —
today's, from Home's band, or any other day they want to look back on.

### Rules

- **`/on-this-day`** heads with the history icon and *On this day* (*An diesem Tag*), and one
  line: *What the household wrote and photographed on 1 November in earlier years.* Mockups:
  https://claude.ai/artifact/DH3TemNZHmgoy6iBVfR17p, Immich: https://claude.ai/artifact/8VokZyK43zm7RYLXJHYrHU
- Under it the **day picker**: a back chevron (*Day before*), the app's `DateField` (day,
  month, year in the language's order, `max` today; §5.7), a forward chevron (*Day after*) and
  *Today* — the last two only while the day is not today. The day sits in the address
  (`?day=`); a segment committed — a month chosen, the day or year left or entered — opens that
  day, never each key, so typing *12* does not open the 1st on the way.
- One card per **year** (`bg-card`, `shadow-card`), newest first, headed *2 years ago · 2024*:
  that year's photos (`MemoryPhotos`, without the year on each) above its entries
  (`MemoryRow`, as in Home's band). A year with only photos, or only entries, is a card too.
- The photo grid is 4 columns, 6 from `sm`: the gallery's photos, then up to 12 of Immich's with
  the *Immich* pill, opening the Immich lightbox as on Home. A centred secondary *Show more*
  under them adds the next 12 while the year holds more. A year only Immich has is a card of its
  own, in its place by year.
- While Immich answers, a last card *Photos from Immich…* holds four grey tiles; it stands in
  for the empty state when nothing else is there.
- With nothing that day, Immich's answer included: `EmptyState` with the history icon and
  *Nothing written or photographed on 1 November in earlier years.*
- Nothing in the navigation leads here: Home's *More from …* under the band and the palette's
  *On this day* do.

### Why

By year, because the question is *what were we doing then*; a year heading carries only its
year, since on 28 February a card may hold 29 February of a leap year. The picker steps by day
because a family looks back around a date (*the week of the wedding*) more than at one.
Immich's photos come after the gallery's because the gallery is what the household chose to
keep; any photo of the day counts, not only linked people's, because the beach in 2019 is a
memory even with nobody linked in it. Twelve a year with *Show more*, because a holiday day can
hold hundreds.
