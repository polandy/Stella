# UX review — design concept, Home, person page (October 2026)

Reviewed on 2026-10-06 against `main` at `dfaef79`, read as a UX reviewer: the design docs
(`docs/01`, `docs/05` §5.1–5.6) and a demo-seeded production build, screenshotted at 1440 px
(Latte and Mocha) and on a Pixel-sized phone (412 × 915, both themes) — Home, the people list
and the person pages of Markus Brunner (rich), Sandra Brunner-Keller (many circles) and Kurt
Lehmann (a sparse "reference" person).

Each numbered item below is written to be picked up **on its own in one agent session**: the
problem with its evidence, the proposal, the files it touches, the doc it must keep in sync, and
a size. Items are grouped by surface and ordered by impact within the group. Decisions that are
the owner's are marked **Decide:**; everything else is a recommendation an implementer can act
on. Nothing here is implemented.

## Progress

Tracked here while the review is worked off (started 2026-10-06). One row per item; the
status moves *open → decided → mockup → building → PR → merged → e2e → done* (or *declined*).
Decisions the owner made are written into the *Decision* column, so the item text above stays
the original finding. The review file travels with the first implementation PR; every later
PR updates its own row.

| Item | Status | Decision | PR |
|---|---|---|---|
| A1 one primary per screen | done | batch 1 mockup approved 2026-10-06 — `ux-review-batch-1.html` | merged #255, e2e #257 |
| A2 §5.5 split per screen | open | | |
| A3 one vocabulary | decided | *moment* for the written thing (*Write a moment* everywhere), *Activity* for the per-person timeline; docs' *Story* → *Activity*; `/journal` stays the reading page | |
| A4 uppercase label roles | open | | |
| A5 Mocha accent tints | open | | |
| B1 filter pill on a phone | done | batch 1 mockup approved 2026-10-06 — `ux-review-batch-1.html` | merged #255, e2e #257 |
| B2 two search entries | done | batch 1 mockup approved 2026-10-06 — `ux-review-batch-1.html` | merged #255, e2e #257 |
| B3 mentions twice | decided | drop the avatar row for moments (inline chips keep their links); keep it for interactions | |
| B4 age vs. day heading | open | | |
| B5 composer pills | open | | |
| B6 empty desktop rail | decided | the stream takes the width when *Coming up* is empty; no *Recently opened* band | |
| B7 actor vs. subject avatar | open | | |
| C1 identity card facts | decided | facts are the only reading surface and edit in place (like the job); rows keep only Contact (no address), Tags, How we met | |
| C2 empty cards | building | batch 1 mockup approved 2026-10-06 — `ux-review-batch-1.html` | PR 2 (person page) |
| C3 gender into name editor | open | | |
| C4 description clamp | building | batch 1 mockup approved 2026-10-06 — `ux-review-batch-1.html` | PR 2 (person page) |
| C5 last contact only when set | building | batch 1 mockup approved 2026-10-06 — `ux-review-batch-1.html` | PR 2 (person page) |
| C6 inline composer | open | | |
| C7 jump bar at rest | decided | (b): render only once sticky — fades in when the identity card's bottom passes the top | |
| C8 desktop map preview | open | | |
| C9 fold order | open | | |
| C10 phone breadcrumb | building | batch 1 mockup approved 2026-10-06 — `ux-review-batch-1.html` | PR 2 (person page) |
| C11 Immich label | open | | |
| C12 edit affordance on touch | open | | |

What is *not* proposed, because it was decided before: "haven't seen" nudges or a "see more
often" mark (most people are reference records), a default-visibility setting (shared by
default, private per record), free reordering of photos.

---

## A. Design concept (`docs/05`)

The concept is unusually coherent: content first, one primary action, progressive disclosure,
serif for what a person wrote, three colour layers, one motion vocabulary, AA held by tests.
The findings below are where the built screens have drifted from the concept's own rules, and
two places where the concept itself is silent.

### A1. Two primary-coloured actions on every screen

**Problem.** §5.1 says *one primary action per screen*, and §5.4 says the pencil is "the verb the
app is built around, adding a record is not". Yet *Add person* is a filled `--primary` button in
the top bar of every page. On a phone's Home that gives the purple **+** at the top *and* the
purple pencil in the tab bar; on a person's page the purple **+** sits above the purple *Write in
journal*. Two filled primaries compete, and the one the concept calls secondary wins the eye
because it is always in the corner.

**Proposal.** Demote *Add person* to the secondary look (ghost/outlined, icon + label on desktop,
icon alone on a phone), or move it into the sidebar as a quiet row under *People*. The top bar
then holds search and a quiet add; the one primary per screen is the page's own.

**Touches.** `src/routes/(app)/+layout.svelte` (top bar), `Button` variants; docs/05 §5.4.
**Size.** S.

### A2. §5.5 is a changelog, not a spec

**Problem.** The key-screens section is ~390 lines, and the person page alone is one paragraph of
~150 lines mixing intent ("one column in the order a reader asks"), rules ("four even columns on a
phone") and implementation history ("built mid-glide it costs a phone the glide's frames"). An
implementer cannot find the rule for one card without reading all of it, and a reviewer cannot
tell intent from accident.

**Proposal.** Split `5.5` one file per screen (`docs/design/screens/home.md`, `person.md`, …),
each with three fixed headings: *Intent* (what the reader comes for), *Rules* (what must hold,
bullet per rule), *Why* (the rationale and history, free prose). Keep the section numbering
(§5.5.1 Home, §5.5.2 Person page, …) so existing `docs/05 §5.5` references still resolve.
No behaviour change.

**Touches.** `docs/design/5.5-5.6-*.md`, `docs/05-ui-design-system.md` index, CLAUDE.md router.
**Size.** M (docs only).

### A3. One vocabulary for "what happened"

**Problem.** The same act has four names across the UI: Home asks *What happened?* and the tab
bar says *Write a moment*; the person page's primary button says *Write in journal*; the card
below it is titled *Activity*; the docs call it *Story*. A moment *is* a journal entry (§2.22.1),
but a Looker-upper cannot know that, and the pencil, the button and the card look like three
different features.

**Proposal.** **Decide:** one noun for the written thing (*moment* is the concept's own word; the
German *Moment festhalten* already exists) and one noun for the per-person timeline
(*Activity*, since the card and jump bar already say so). Then: the person page's primary
button becomes *Write a moment* (`contact.write`), the docs rename *Story* → *Activity* in
user-facing prose, and `/journal` stays the reading page (*Journal* as the place is fine; the
verb is what should match).

**Touches.** `src/lib/i18n/messages/{en,de}/contact.ts`, `nav.ts`; docs/02 §2.20, §2.22, §2.23,
docs/05 §5.5; `using-stella.md`. **Size.** S.

### A4. Uppercase tracked labels carry three roles

**Problem.** The same style — 12 px, uppercase, letter-spaced, `--fg-subtle` — is used for a
section heading (*Coming up*), a filter-row label (*What*, *Who*), a day divider (*Yesterday*),
and a group heading inside a card (*Family · 7*, *Also related*). Four roles, one style, so the
hierarchy between "a band" and "a divider inside a band" is carried by position alone.

**Proposal.** Write the rule into §5.3: the uppercase label is for *dividers inside a list* (day
dividers, kind groups). Section headings in rails and cards use the sentence-case
`text-sm font-semibold` the cards already use. Filter-row labels become part of the control
(see B1) and lose the label style.

**Touches.** docs/05 §5.3; `(app)/+page.svelte` (*Coming up* heading). **Size.** S.

### A5. Accent tints lose identity in Mocha

**Problem.** In Latte an initials avatar is clearly tinted (MB rosewater, KL teal). In Mocha the
same avatars read as grey-brown squares; the chip tint behind a circle name is barely there. The
concept says *colour identifies, the foreground reads* — in the dark theme the identifying half
is nearly gone.

**Proposal.** Give the dark theme its own tint strength for `accentChipStyle` / the avatar
background (e.g. 28 % instead of 14 %) and re-run `src/lib/design/color.test.ts` so AA holds for
all fourteen accents. One number in `tokens.ts` per theme, not per component.

**Touches.** `src/lib/design/tokens.ts`, `src/app.css`, `color.test.ts`; docs/05 §5.2.2.
**Size.** S.

---

## B. Home

### B1. Filter chips cost a phone a whole screen

**Problem.** On a phone the two chip rows (*What*: 7 chips, *Who*: 3+) wrap to **four lines**
and sit between *Coming up* and the stream. The first stream item starts at the fold (≈ 900 px
on a 915 px viewport): a phone's Home shows the search field, two birthdays, four lines of
filters, and no household life. The filter is used rarely; the stream is what the page is for.

**Proposal.** On a phone, replace the rows with **one *Filter* pill** carrying the active count
and highlight — the pattern the graph toolbar already has (`GraphFilterMenu`, `src/lib/menu/`) —
opening a sheet or menu with the *What* and *Who* groups as the same links. From `md` keep the
rows as they are (desktop has the width). The chips stay links, so the URL contract
(`?kind=`, `?by=`) and the no-JS path are unchanged; the pill is only how they are reached.

**Touches.** `(app)/+page.svelte`, `src/lib/stream/filter.ts` (what the pill says — pure,
test-first), `MenuButton`; docs/02 §2.22.2, docs/05 §5.5. **Size.** M.

### B2. Two search entries on the phone's Home

**Problem.** The phone's top bar has the search icon (opens the ⌘K palette) and, directly under
it, the *Find a person…* field. Both list the same people from the same `personSearchRows`. Two
identical doors a thumb's width apart; the user has to learn that they are the same.

**Proposal.** On Home below `md`, hide the top-bar search button (the field is the search), or
make the field itself open the palette. On every other phone page keep the icon.

**Touches.** `(app)/+layout.svelte`. **Size.** XS.

### B3. Mentioned people appear twice in a stream item

**Problem.** A moment shows `@Noah Brunner` as an inline mention chip in the serif body *and*
again as a *Noah Brunner* avatar chip in the row beneath. For a short moment the duplicate row is
as tall as the moment itself.

**Proposal.** Show the mention row only for mentions **not** already in the rendered body
(there are none today, since every mention is inline), i.e. drop the row for moments; keep it
for interactions, whose participants are not in the text. Alternatively keep the row and strip
the inline chip styling in the stream, so the body reads as prose. **Decide** which; the first is
less work and keeps the body's links.

**Touches.** `(app)/+page.svelte` moment branch; docs/02 §2.22.2. **Size.** XS.

### B4. "1d ago" under a "Yesterday" heading

**Problem.** The stream is grouped by day *and* every item carries a relative age (*1d ago*,
*2w ago*). Under *Yesterday* the age repeats the heading; under *Monday 28 September* the
*1w ago* is less precise than the heading. The right column pays for information already
given.

**Proposal.** Replace the age with the **time of day** for today's and yesterday's items (the
only groups where it adds something), and show nothing for older days. The day header stays.

**Touches.** `(app)/+page.svelte` (`ago`), `src/lib/dates/labels.ts` (pure, test-first);
docs/02 §2.22.2. **Size.** S.

### B5. The composer's three pills behave three ways but look alike

**Problem.** *Shared*, *Photo* and *Today* are drawn as the same chip. *Shared* is a toggle
(tap → *Private*), *Photo* opens the file picker, *Today* opens a menu (it alone has a
chevron). On the phone sheet the *Save* button also shows a `⌘↵` keyboard hint, which means
nothing on a touch screen.

**Proposal.** Give the toggle a toggle's affordance (a switch-like pill with the lock/people icon
swapping, `aria-pressed`), keep the chevron for the menu, and make *Photo* a plain icon button.
Hide the `<kbd>` hint below `md` / on coarse pointers (`@media (pointer: coarse)`).

**Touches.** `MomentComposer.svelte`; docs/02 §2.22.1, docs/05 §5.7. **Size.** S.

### B6. The desktop rail is reserved and usually empty

**Problem.** From `lg` the 17 rem right column is always reserved so the stream's width is
stable, but *Coming up* is absent unless a date is within 14 days. On a 1440 px screen that
leaves a permanent empty column beside a stream capped at ~800 px.

**Proposal.** **Decide:** either let the stream take the width when the rail is empty (the docs'
reason — a stable stream width — is weaker than a quarter of the screen staying blank), or give
the rail a second band that is almost always non-empty and is *navigation, not a nudge*:
**Recently opened** — the last five people this member opened, from the browser (localStorage,
pure `src/lib/recent/` module). It serves the Looker-upper persona directly and never asks for
anything. Not a "quiet lately" list.

**Touches.** `(app)/+page.svelte`, new `src/lib/recent/` (pure, test-first) + a `.svelte.ts`
adapter; docs/02 §2.12, docs/05 §5.5. **Size.** M.

### B7. The avatar in a stream row is the subject, the sentence starts with the actor

**Problem.** *You logged Call with Markus Brunner* is shown beside Markus's avatar; *Lena added
Thomas Lang* beside Thomas's. Faces are "the fastest index" (§5.1), so a reader scanning faces
reads the row as being *by* the person pictured. This is a deliberate choice (the row is about
the subject) but it is undocumented and easy to misread with several members.

**Proposal.** Keep the subject's avatar (it is what one scans for) but write the rule into
§5.5 and consider a small actor avatar overlapping the subject's bottom-right once the
household has more than one writing member (`offersMemberChoice`). Low priority.

**Touches.** `(app)/+page.svelte`; docs/05 §5.5. **Size.** S.

---

## C. Person page

The new one-column layout and the identity card are a clear improvement over tabs: who the
person is, who they belong with, then what happened, all without a click. The findings are
mostly about *repetition* inside the identity card and about how the page reads for the
sparse majority of people.

### C1. The identity card says the same thing twice

**Problem.** The card has a **facts grid** (birthday, address, job, last contact, circles) and
below it **editable rows** (Contact, Tags, Dates, Circles, Gender, How we met). On Markus's
page the address appears as a fact and 150 px lower as *Zuhause Spitalackerstrasse 22, 3013
Bern* inside Contact; the circles appear as three chips and as a folded *Circles 3 · Join*
row; the birthday as a fact and as a folded *Dates 2 · Add*. The docs explain the rows exist
to add and remove; a reader sees a card that repeats itself.

**Proposal.** Make the facts the only reading surface and let them be edited where they are
read, as the job already is: tap *Address* to edit it, tap *Birthday* to open the dates, tap
the circles row's **+** to join. The rows then hold only what has no fact: *Contact* without
the address line, *Tags*, *How we met*. Gender moves out (C3). The quiet *Add phone, email,
tags …* stays for the empty rows.

**Decide:** facts editable in place (recommended; the job proves the pattern) vs. keeping the
rows and merely hiding the address line in *Contact* when it is shown as a fact (XS, a stopgap).

**Touches.** `IdentityCard.svelte`, `src/lib/people/identity-card.ts` (pure rules,
test-first), `ContactFieldsRow`, `ImportantDatesRow`, `CirclesRow`; docs/05 §5.5, docs/02 §2.2.
**Size.** L.

### C2. Empty cards fill the page of a sparse person

**Problem.** Most people in a household are reference records. On Kurt Lehmann's page the
identity card is followed by *Photos 0* (a card with one sentence), a dashed empty state in
*Activity*, *Notes 0* (a card with two sentences) and *Mentioned in 0* (a card with one
sentence) — four boxes saying "nothing". On a phone that is a full screen of empty cards below
the fold. The concept's own rule for *Coming up* applies: a permanently empty box teaches
people to stop looking.

**Proposal.**
- *Mentioned in* with a count of zero is **not rendered** (it is passive; there is nothing to
  add there).
- *Photos* and *Notes* at zero collapse to a **single compact line** each (`EmptyState compact`
  or a one-line row: title, the sentence, the add button), not a full card with header + body.
- *Activity* keeps its dashed empty state but loses one of the two sentences; the button *Log
  contact* is already in its header.
- The jump bar's entries for cards at zero stay (they are where the add buttons are).

**Touches.** `PhotosSection`, `NotesSection`, `MentionsSection`, `StorySection`,
`src/lib/contacts/jump-bar.ts`; docs/05 §5.5. **Size.** M.

### C3. Gender is a row that is neither a fact nor a disclosure

**Problem.** *Gender · Male* stands among the editable rows with no chevron and no add button;
it reads as a fact that strayed. Gender is rarely looked up — it exists so kinship terms say
*Wife* and *Son* — and takes a full row on every page.

**Proposal.** Move gender into the **name editor** (the pencil beside the name), where first
name, last name, nickname and the shown name already are. The row disappears; the empty-row
button no longer offers *gender*.

**Touches.** `NameEditor.svelte`, `GenderRow.svelte`, `identity-card.ts` (`ROW_ORDER`);
docs/02 §2.2, docs/05 §5.5. **Size.** S.

### C4. The description is cut off on a phone

**Problem.** Beside the 88 px portrait the description — the line that answers "how do we know
this person" — is truncated with an ellipsis: *Familienvater, Vorstand im FC Läng…*.
`InlineEdit` renders its value with `truncate`. The name wraps; the description, which matters
more to a Looker-upper, does not.

**Proposal.** Let the description wrap to **two lines** (`line-clamp-2`) on a phone and fully
from `md`; `InlineEdit` takes a `clamp` prop rather than always truncating. Check the former
name and the last-name chips under it do not collide.

**Touches.** `InlineEdit.svelte`, `IdentityCard.svelte`. **Size.** XS.

### C5. "Last contact · No contact logged yet" breaks the card's own rule

**Problem.** The facts grid "holds only what the record has", yet *Last contact* is always
shown, and for the many people nobody logs calls with it says *No contact logged yet* — a quiet
reproach on every reference person's page, which the household decided it does not want.

**Proposal.** Show *Last contact* only when there is one. The *Activity* card already offers
*Log contact*. If a positive signal is wanted for the gap, it belongs in the Activity empty
state, not in the facts.

**Touches.** `IdentityCard.svelte`; docs/05 §5.5. **Size.** XS.

### C6. The primary action leaves the page it is on

**Problem.** *Write in journal* navigates to `/contacts/{id}/journal`, while the *Activity*
card that will show the entry is on this very page, and Home proves the composer can live
inline. A member who wants to jot one line about Markus leaves his page, writes, and comes
back.

**Proposal.** The primary button opens the **moment composer inline** at the top of the
Activity card (the same `MomentComposer`, anchored to this person, no `@` needed for the
anchor), scrolls there and focuses the field, and the entry appears in the timeline on save.
The journal page stays as the long-form reading and editing surface, linked from the card's
header (*Open journal*). Pairs with A3 (the button then says *Write a moment*).

**Touches.** `IdentityCard.svelte`, `StorySection.svelte`, `MomentComposer` (an `anchor` prop),
`contacts/[id]/actions/*`; docs/02 §2.20, §2.22, docs/05 §5.5. **Size.** L.

### C7. The jump bar reads as stray text on desktop

**Problem.** From `sm` the bar is four unstyled text links left-aligned on the page ground,
between two cards, with nothing selected until a card has passed under it. At first sight it
looks like a caption that lost its card. On a phone (four even columns) it reads as a control.

**Proposal.** **Decide:** (a) give the bar a resting look on every width — a hairline below, or
the pill row inside a quiet `--bg-sunken` track like the phone's — or (b) render it only once it
is sticky (fade in when the identity card's bottom passes the top), so it never stands between
two cards at rest. (b) is truer to "chrome last".

**Touches.** `JumpBar.svelte`, `src/lib/contacts/jump-bar.ts` (a pure `barVisible` rule if (b));
docs/05 §5.5. **Size.** S.

### C8. The desktop map is a third of the People card and shows unlabelled dots

**Problem.** From 48 rem the ego map takes a 20 rem column of the People card. At that size the
nodes are coloured circles without legible names: it tells the reader *that* Markus has ten
links, which the list beside it already says, while the list is squeezed to three columns and
*Sandra Brunner-Keller* wraps to two lines. On a phone the same map is a 100 px **preview** that
enlarges on demand — a better pattern.

**Proposal.** Use the phone's preview-and-enlarge pattern on every width: a short preview strip
across the card's top (or beside the header) that enlarges in place; the list gets the full card
width (four columns from `md`). Alternatively keep the column but draw labels at that size
(`stylesheet.ts`); the first is the consistent one.

**Touches.** `RelationshipsSection.svelte`, `PeopleMap.svelte`, `src/lib/graph/phone-map.ts`
(the view machine is already pure); docs/05 §5.5, §5.8. **Size.** M.

### C9. The fold hides entered links and shows inferred ones

**Problem.** Markus has 10 entered relationships; folded, the card shows *Family · 7* (six
tiles) and two *Also related · worked out, not entered* tiles, then *Show 7 more*. The *Friends*
and *Work* groups — things the household typed — are behind the fold, while two inferences
are above it. The reader does not know what *7 more* holds.

**Proposal.** Fold the inferred block first: the derived relatives sit entirely behind *Show
more* until the entered groups are all shown. And when a group is hidden by the fold, show its
heading with the count as a collapsed line (*Friends · 2 · Work · 1*), so the fold says what it
hides. Rules live in `src/lib/relationships/people-groups.ts` (pure, test-first).

**Touches.** `people-groups.ts`, `RelationshipList.svelte`, `RelationshipsSection.svelte`;
docs/05 §5.5. **Size.** S.

### C10. The breadcrumb wraps on a phone for long names

**Problem.** *Home / People / Sandra Brunner-Keller* wraps to two lines on a phone, making the
top bar taller than on other pages; the name is repeated 60 px lower in the card.

**Proposal.** Below `md`, show only the **parent** crumb as a back link (*‹ People*), since the
current page's name is the card's headline. From `md` keep the full trail.

**Touches.** `(app)/+layout.svelte`; docs/05 §5.4. **Size.** XS.

### C11. "Immich" as a control label

**Problem.** The Photos header carries a pill labelled with the product name *Immich ▾*. The
household knows "the photo library", not necessarily the server's name; a product name as a
button also stands out as foreign among *Edit*, *Add photos*.

**Proposal.** Label it by what it does: *From photo library ▾* (or an icon with that tooltip),
with *Immich* named inside the menu items where it matters. Keep the key `immich.menu.trigger`.

**Touches.** `src/lib/i18n/messages/{en,de}/immich.ts`; docs/02 §2.24. **Size.** XS.

### C12. Where to edit is invisible on touch

**Problem.** The name shows a pencil, but the description, the job fact and the gender row edit
on tap with no affordance at rest; on desktop a hover tint reveals it, on a phone nothing does.

**Proposal.** One rule in §5.7 for in-place editing: an editable value shows a faint pencil on
coarse pointers (`@media (pointer: coarse)`) and on hover elsewhere. Apply it in `InlineEdit`
and `JobEdit`.

**Touches.** `InlineEdit.svelte`, `JobEdit.svelte`, `app.css`; docs/05 §5.7. **Size.** S.

---

## Suggested order

| Order | Item | Why first | Size |
|---|---|---|---|
| 1 | C2 empty cards | changes how the page reads for most people | M |
| 2 | B1 filter pill on a phone | the phone's Home shows no stream above the fold | M |
| 3 | A1 one primary per screen | cheap, every screen | S |
| 4 | C4, C5, C10, B2 | four XS fixes, one session | XS×4 |
| 5 | A3 vocabulary (+ decide) | unblocks C6 | S |
| 6 | C1 identity card facts | the biggest structural change; after A3 | L |
| 7 | C6 inline composer | after A3 and C1 | L |
| 8 | C8, C9 People card | independent of the above | M + S |
| 9 | C3, C7, C12, B3, B4, B5 | polish | S each |
| 10 | A2 docs split, A4, A5, B6, B7, C11 | docs and low-impact | — |

## Reproducing the screenshots

```
bun run build
mkdir -p /tmp/stella-ux/data/media
PORT=4199 HOST=127.0.0.1 ORIGIN=http://127.0.0.1:4199 STELLA_URL=http://127.0.0.1:4199 \
DATABASE_PATH=/tmp/stella-ux/data/stella.db MEDIA_DIR=/tmp/stella-ux/data/media \
SESSION_SECRET=insecure SEED_DEMO=true IMMICH_DEMO=true bun ./build/index.js
```

Then sign in with *Sign in as demo user* and open `/`, `/contacts/demo-c-markus`,
`/contacts/demo-c-sandra`, `/contacts/demo-c-kurt`, `/?compose` (phone). For a full-page
capture grow the viewport to `#content`'s `scrollHeight` — the shell scrolls inside that
element, so Playwright's `fullPage` sees only one screen. Playwright's `devices['Pixel 7']`
with a 412 × 915 viewport stands in for the Pixel 9 Pro; `colorScheme: 'dark'` gives Mocha.
