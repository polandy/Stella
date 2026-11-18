## 5.5.19 A gift idea for several

### Intent

A member with one present in mind for several children — the same puzzle for each one's fifth
birthday — notes it once and sees, before saving, what it comes to for each of them
(docs/dev/02 §2.25.11). Mockup: https://claude.ai/artifact/B4yqCiMfPD7nwQKS3iSa7m

### Rules

- **`/gifts/several?for=<id>`**, a page rather than a sheet: the back arrow and *Cancel* return
  to the person's Gifts card (`/gifts` without one). Heading *Gift idea for several*.
- One card holds *What?* (with *More…* for the note and the link as on the Gifts card), *For
  whom?* and the `WhenPicker` with `several`. Under *For whom?* the shortcuts are chips with
  their icon, `aria-pressed` while every person of the set is ticked; a press ticks the set, a
  second unticks it. The name search below adds one person and empties again; it goes once 50
  people are on the form.
- **The preview** is a second card, one `GroupPreviewRow` per person: `Avatar`, the name, the
  line from `whenPreview`, and the tick at the right end (`tap-target`). The order is the
  soonest first, *now* before a day, *later* after, the grey rows last; grey rows are
  `text-fg-muted` with the avatar at `opacity-60` and a disabled tick. What helps sits under
  the line: an age field with *or Enter birthday*, a link alone for a birthday with no year, or
  the *instead:* chips. A chosen time of their own shows *own time* with *reset*; an age typed
  shows *estimated: about 2022 — noted on Noah when saved*.
- **The footer card**: *For 3 of 4* in `text-fg`, the reasons after a dash in `text-fg-muted`,
  then the visibility radios (*Surprise for …* only when a chosen person is a member's own) and
  *Cancel* / *Save* at the end; *Save* stays disabled without a title or anyone chosen.

### Why

- **A page, not a sheet in the card**: the preview list needs the height, and the palette can
  open it for anyone.
- **The preview before the save**: an age rule meets several birthdays at once; seeing each
  day, and who it misses, is the point of noting it once (owner, Variante C).
- **Grey rows stay on the form** with the way to help them, rather than vanishing: the member
  learns who is left out and can fix it in place (F11, D1, D5).
