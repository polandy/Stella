## 5.5.11 Tags

### Intent

A member comes to read one topic across the whole household — every *#crafts* moment, whoever
it is about — or to see which topics the household writes about at all.

### Rules

- **A tag's page** (`/tags/{key}`) heads with the tag as a large `TagChip`, *5 moments about 3
  people* under it, and *All tags* to the right. The page's `h1` is the tag's name, left to
  screen readers: the chip already says it.
- Its moments are rows like Home's stream (`StreamMoment`), grouped under the same day
  headings; the person's name opens their journal **filtered by the tag**. A private moment is
  veiled (`journal:{entryId}`) and carries the lock, as on Home.
- A tag the viewer has no moment for shows the empty state *No moments with #x* with *All
  tags*; it does not tell a tag nobody uses from one only on another member's private moments.
- **All tags** (`/tags`): a title, one line on what the page is, the tags as large chips with
  their counts, most used first, a lock on those only on the viewer's private moments, and one
  hint on how a tag is made. Nothing in the navigation leads here; *All tags* on a tag's page
  and on Home's Tags row do. The breadcrumbs read *Home / Tags / #crafts*.

### Why

The page is the household's view of a topic, so it reads like Home's stream rather than like a
journal: who wrote what in whose journal. The person's name keeps the tag because whoever
follows it is still reading that topic. *All tags* stays out of the navigation because tags are
reached from a moment, from Home or from search; one more tab for a list visited now and then
would crowd the phone's bar.
