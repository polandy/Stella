## 5.5.16 On this day

### Intent

A member with time to linger comes to see what the household wrote on a date in earlier years —
today's, from Home's band, or any other day they want to look back on.

### Rules

- **`/on-this-day`** heads with the history icon and *On this day* (*An diesem Tag*), and one
  line: *What the household wrote on 1 November in earlier years.* Mockup:
  https://claude.ai/artifact/DH3TemNZHmgoy6iBVfR17p
- Under it the **day picker**: a back chevron (*Day before*), a date input (`max` today), a
  forward chevron (*Day after*) and *Today* — the last two only while the day is not today. It is
  a plain GET form (`?day=`); picking a date submits it.
- One card per **year** (`bg-card`, `shadow-card`), newest first, headed *2 years ago · 2024*:
  that year's photos (`MemoryPhotos`, without the year on each) above its entries
  (`MemoryRow`, as in Home's band). A year with only photos, or only entries, is a card too.
- With nothing that day: `EmptyState` with the history icon and *Nothing written on 1 November in
  earlier years.*
- Nothing in the navigation leads here: Home's *More from …* under the band and the palette's
  *On this day* do.

### Why

By year, because the question is *what were we doing then*; a year heading carries only its
year, since on 28 February a card may hold 29 February of a leap year. The picker steps by day
because a family looks back around a date (*the week of the wedding*) more than at one.
