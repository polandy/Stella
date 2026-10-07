## 5.5.2 Person page

### Intent

A reader opens a person's page to answer questions in a fixed order: who this is, who they
belong with, what was taken; then what happened and what was written down; last, where
somebody else named them. The one thing they most often came to *do* is write a moment about
the person, and that never leaves the page. Keeping the record tidy (archive, merge, delete,
"this is me") is rare and stays out of the way.

### Rules

#### Layout

- One column of full-width cards, at most `66.25rem` (about 1060 px), in a fixed order: the
  identity card, then **People · Photos · Activity and Notes · Mentioned in**. No tabs.
- Activity (about 1.4 parts) and Notes (1 part) stand side by side from `lg`, and stack below
  it with Activity first.
- Each card carries its own count where the count is exact, its own `+ Add` disclosure (§5.7),
  and an **anchor** (`#section-relationships` and friends). The passive references of docs/02
  §2.20.1 link to them, and a form action redirects back to the card it acted on.
- A bookmark holding the old `?tab=` is answered with the card it meant.

#### Identity card

- `IdentityCard` opens with the portrait: the avatar uploader as a square with rounded
  corners, 168 px in a column of its own from `md`, 88 px beside the name on a phone. It is
  the way to change the picture.
- Then the name and the description, both editable in place. The description wraps to two
  lines on a phone and shows in full from `md`; it is never cut off at one line.
- A former name and the last-name chips sit under the name; the **You**, **Private** and
  **Archived** markers beneath them.
- The **You** chip is `--primary-soft` on `--primary`; *Archived* is a quiet chip beside
  *Private*.
- Then a small labelled grid of **facts**: four across from `md`, two on a phone. It is the
  card's **only reading surface** and holds **only what the record has**:
  - the birthday with the age (from the dates, else the profile; *Born around …* for an
    estimated year);
  - **every other date** as a fact of its own with the years since (*Hochzeitstag · 13 June
    2009 · 17 years*);
  - the addresses among the contact details, one line each;
  - the job's short form;
  - the last contact, **only when there is one**; it follows the Activity card and is read
    only;
  - the circles as chips with their role, across the full width, ending in a dashed **+**
    chip (*Join a circle*).
- **Each fact is edited where it is read**: the fact is one button the size of its cell,
  ending in the faint pencil every in-place value carries (§5.7, *Where to edit*). Tapping it
  opens its editor in its place across the grid's width (§5.7, *Fact editors*): any date the
  one dates editor, the address its editor, the job its two fields, the **+** chip the circles
  editor under the chips.
- The dates editor holds each date's kind, day, *year unknown*, whether it repeats and whether
  it shows on Home. A birthday derived from the profile is listed there too, marked *from the
  profile* and not deletable; an explicit birthday row replaces it (docs/02 §2.13.2). There is
  no reminders screen: upcoming dates are Home's *Coming up* band (§5.5.1).
- Below the facts come the **rows** that have no fact (§5.7): Contact (without the addresses),
  Tags, How we met — two abreast from `md`. A row folds and unfolds in place with the app's
  one motion (§5.11).
- What the record does not hold yet collapses into **one quiet button that names it**: the
  first three missing of *address, birthday, job, phone, email, tags* (and *circles*), e.g.
  *Add address, phone, email …*.
- Pressed, that button brings the empty facts into the grid in their places as **dashed
  slots** (*Address · + Add*, each opening its editor) and the empty rows below, and hands the
  cursor to the first.
- A fact or row emptied during a visit stays where it was, as a slot.
- Gender is not on the card; it is set in the name editor.
- **One action**: *Write a moment* (primary). It does not leave the page: it opens the moment
  composer at the top of the Activity card and the page glides there.
- Beside it a framed **⋯** (`MenuButton` with `look="button"`) holds, in order: *Log contact*,
  a divider, *This is me* / *This is not me*, *How are we connected?* (opening the People
  card's picker), *Archive* / *Bring back into the lists*, and, for an admin only, *Merge
  someone into this person* and *Delete for good* (last, in the danger colour).
- Archiving, merging and deleting open a **confirm step** on the card, unfolding under the
  actions (§5.11): a sunken panel saying what it does, its button and *Cancel*. For a deletion
  *Cancel* reads *Keep them* and takes the cursor.
- The name and the job glide into their editors and back the same way.
- On a phone the actions span the card under the portrait and name.

#### Record keeping (the ⋯ menu)

- **Archive** (docs/02 §2.2) is only a ⋯ entry, its consequence said in its confirm step;
  never a button beside *Write a moment*.
- **This is me** (docs/02 §2.1.3) reads *This is not me* once set; it marks the same person
  as Settings' *You* section (§5.5.7). Exactly one person in the household can wear the
  **You** chip — here and beside their name in the People directory.
- **Merge** is admin only. Its confirm step holds a person search select and one button
  (docs/02 §2.2). A *same person?* link (`?merge=<id>#merge`) arrives with that step open. The
  survivor is always the page you are on; the form asks one question, *who is the same
  person?*
- **Delete for good** is admin only and two steps — the entry, then the confirm step — not a
  `RemoveButton`, and has no Undo. The confirm step spells out what goes with them and carries
  the only `variant="danger"` button on the page.

#### Jump bar

- `JumpBar` is a row of four links, *People · Photos · Activity · Notes*, each with its card's
  count where it has one (none for the paged Activity, none for a count of nothing).
  *Mentioned in* is not in it. The four it links stay at zero — as one line, at the least —
  since that is where their *+ Add* is; the bar's tests hold it to the empty-card rule.
- It shows **only once it sticks**: it hangs from a zero-height sticky slot that takes no room
  in the flow and sticks at the bar's own height, so it sticks — and fades in (§5.11's fade) —
  exactly when the identity card's bottom passes under its foot (`barVisible`).
- It sits at the top of the scroller on a translucent page-coloured band with a
  `--border-subtle` hairline below, full bleed across the page's padding.
- While hidden it is `inert` and lets taps through.
- The card being read wears the selected-pill look (`aria-current`): the last card whose top
  has passed under the bar; of two side by side, the first; at the foot of a page that cannot
  scroll further, the last card on screen (`src/lib/contacts/jump-bar.ts`).
- Four even columns on a phone, a left-aligned row from `sm`.
- It sticks to the shell's scroller, so the phone's sliding top bar (§5.4) takes it along. The
  scroller's `scroll-padding-top` is the bar's height, so a jump, a `#section-…` link and
  keyboard focus all stop below the bar.
- A tap glides to the card by the rule an opened form follows (§5.11), hands the card the
  cursor (`tabindex="-1"`; the card is named by its heading) and writes its `#section-…` into
  the address without a second scroll.
- The links stay plain anchors: without JavaScript, in a new tab or copied they jump as
  anchors do.
- The tapped card stays marked through the glide and after it — beside another card or at the
  foot of the page too — until the reader scrolls on their own (wheel, touch, a click, a
  scrolling key; `markedSection`, `scrollsThePage`).

#### People card

- A **compact list grouped by kind** — *Family* (partners included), *Friends*, *Work*,
  *Other* — each under a small uppercase heading with its count.
- Every person is a tile: a 36 px avatar, the name (two lines at most) and, under it in the
  subtle colour, **what they are to this person** (*Wife*, *Son*; docs/02 §2.4), then
  *former*, *how they connect* and *since <day>*, cut short on one line. The face and the name
  are one link.
- The list takes the card's whole width under the map: two columns on a phone, three and then
  four (from a 48 rem list) as its own width grows — container queries, not the viewport.
- **The fold**: past six entered people the card shows the first six in group order, behind
  one ghost **Show N more** / **Show fewer**.
- While the card folds, every worked-out relative waits behind *Show more*; none takes a
  folded place.
- *N* counts everybody hidden, entered and worked out; the wording stays *Show N more* when
  only worked-out people are left.
- A fold that would hide fewer than two people (entered and worked out together) does not
  happen; everything shows.
- Under the folded tiles a **collapsed line** names every group hidden whole with its count,
  the worked-out block last (*Friends · 3 · Work · 2 · Also related · 5*), in the groups'
  heading style, each a quiet dashed-outline pill, the worked-out one with its icon. A group
  partly shown is not repeated.
- Each pill is a button (*Show Friends · 3*) that unfolds the whole card — there is one *Show
  more* state, no fold per group. Once the glide has settled the page brings that group into
  view (only the shell scrolls, §5.11), tints it briefly (not under `prefers-reduced-motion`)
  and puts the cursor on its heading. The rules are `foldPeople` and `workedOutShown`
  (`src/lib/relationships/people-groups.ts`).
- Unfolding and folding glide (§5.11): the list's box grows over the rows that came, *Show
  more* rides on its lower edge, and after *Show fewer* the page follows the button if it
  went past the top. Edit mode unfolds everything and glides the same way.
- The header holds three quiet controls: **Edit** (pencil; *Done* with a check while on), an
  icon-only **+** for *Add relationship* (`Section`'s `iconAdd`; the form opens under the
  header), and a framed **⋯** (`MenuButton`, `look="button"`) with **How are we connected?**,
  **Check relationships** and **Open in the graph**.
- *How are we connected?* opens a person picker in the card — the same one every other "which
  person?" question on the page uses — with *Trace it* and *Cancel*, and hands both ends to
  the explorer, which traces the chain on arrival. The identity card's ⋯ opens the same picker.
- **Edit mode** is the card's, not a row's: it unfolds the list and gives each row more width
  (one column on a phone). Every entered row gets a pencil — revealing the type, *how they
  connect*, *since* and the status in place, across the grid under the tile, with *Save* and
  *Cancel* — and the standard remove-with-undo; every worked-out row gets its *Confirm* /
  *Actually the child …* action. Outside edit mode the rows are quiet.
- Below the list, **Also related · worked out, not entered** (docs/02 §2.4.1) carries the
  derived relatives as tiles of the same shape, quieter: a divider and its own heading, a
  dashed ring round a faded face, the name in the muted colour, the term and *via* beneath.
- Each worked-out action stores the row and so takes it out of the block in place, without a
  reload: **Confirm** for a term that says what it is; for a *step* relative **Actually the
  child / the parent / a sibling**, storing the direct link instead.
- After a link is added, an **Also true?** panel sits above them with what it implies, one
  *Add this too* per line — never a checkbox list. Its rows behave as on *Check
  relationships* (§5.5.8).
- While the person has no links, a `compact` `EmptyState` (§5.5.10) stands in place of the
  map.

#### The map

- The **map** is the same explorer the graph route runs, this person locked in the middle, a
  reach of two hops (§5.8). On every width it is a **preview** across the card's top, under
  the header; the live canvas waits until it is asked for.
- The preview is a picture the server draws (`EgoGraph`), with no links. On a **phone**
  (below `sm`) a 100 px strip, the people in a ring, no names. **Wider**, a 7.5 rem strip with
  the people in a wide fan, half to either side in two staggered rows, every face under or
  over its **first name** (`stripFan`, `src/lib/graph/layout/strip-fan.ts`).
- The strip is drawn at its own size and centred: a narrow card crops its ends rather than
  shrinking the names.
- In its bottom-right corner sit two icon-only controls, each a 44 px target around a 32 px
  card-coloured disc, named for a screen reader and with a tooltip.
- **Enlarge map** (expand icon; the whole strip is that button) grows the same explorer
  **inside the card**: full card width; on a phone `100dvh − 12.75rem` tall (at least 20 rem),
  wider up 24 rem; with its Filter and Arrange controls and an icon-only **Shrink map** in the
  map's own toolbar, just left of its full-screen icon and drawn like it.
- On a phone the enlarged height leaves the top bar, the jump bar, the tab bar and a strip of
  page in view.
- The way there and back is animated: one frame holds both, its height glides between the
  preview's and the enlarged height on `--motion-expand` / `--ease-standard` (§5.11), with
  `contain: layout` only while it moves.
- Growing, the drawing rides in the middle of the frame and the preview's icons fade out. The
  live map is mounted only once the height has arrived, at its final size, so the canvas is
  framed once and never resized. The drawing fades out (`--motion-fade`) only when the map has
  drawn itself; there is never a blank frame.
- Shrinking, the drawing and its icons fade back over the map while the height glides down;
  the map goes once the height is there.
- The card's top holds still while the frame changes under it. The page follows smoothly where
  it must: on a phone to the frame's top as it grows (wider up only as far as it takes to show
  it), and to the preview once it has shrunk.
- Under `prefers-reduced-motion` the switch is instant — height, fade and scroll.
- Which layer shows when is `mapLayers` / `phoneMapAfter`, driven by two signals: the height
  arrived (the frame's own `transitionend`) and the map drew (`GraphExplorer`'s `onReady`).
- Focus moves to *Shrink map* once the live map shows (it stays on *Enlarge map* until then)
  and back to *Enlarge map* on shrinking. The reader stays on the person's page.
- **Full screen** (the explorer's own icon, right of *Enlarge map*) is a link to the graph
  route. With script and full screen available it mounts the explorer and opens it full
  screen in the same tap (§5.8, §5.5.5); leaving full screen brings the preview back. Which
  view follows which tap is `mapViewAfter` (`src/lib/graph/phone-map.ts`; every width runs it).

#### Activity card

- **Activity** is the merged timeline of docs/02 §2.23: journal entries and touchpoints in one
  order, a rail with a dot per item coloured by kind (§5.6), the author's name beside the kind
  (*you* on your own items), and *Show earlier* paging back through both sources. It is paged,
  so it carries no count.
- Its header holds *Log contact* as a quiet ghost button, opening the card's own form, and
  beside it *Open journal* (book icon), leading to the journal page.
- The top of the card holds **one form at a time** (`StorySection`,
  `$lib/contacts/story-forms.ts`): the moment composer or the log form. Opening one folds the
  other away (§5.11) and keeps what was typed in it until it is saved or cancelled.
- The composer is Home's `MomentComposer` with an `anchor`: a non-removable chip with the
  person's avatar and name, *· goes to Markus's journal*, above the serif field; the sharing
  switch, the photo button, the day pill, *Cancel* and *Save* below.
- *Write a moment* unfolds the composer, brings the card into view the way every card form
  opens (§5.11: a card low in the view or off screen glides its top to just under the top
  bar) and puts the cursor in the field. Pressed while the composer is open, it only does the
  last two. *Log contact* opens the same way.
- *Save* folds the composer away and the moment heads the timeline, with the *Saved* toast.
  *Cancel* or Escape folds it away, and a draft with words in it is offered back by the
  toast's *Undo*.
- While the composer is open for somebody with no activity yet, the empty state steps aside.
- Moments kept on the device while Stella is out of reach stand above the timeline, beside
  the kept logs.

#### Notes, Photos, Mentioned in

- **Notes** are pinned-first.
- **Photos** (docs/02 §2.14) is a square grid at three columns, four from `sm`, with a lock
  badge on a private photo and a star badge, top left, on a favourite; favourites come first.
- A photo opens into a **lightbox**: a solid card over a blurred, dimmed backdrop that closes
  on click, the caption above the picture and the actions in one row beneath it. The
  destructive action sits last in that row, in the danger style.
- When the person's circles hold photos, tapping the portrait opens a chooser rather than the
  file picker: *Choose a picture…* and a grid of the group photos, each captioned with its
  circle.
- The Photos card then ends with an *On group photos* row: a horizontally scrolling strip of
  4:3 thumbnails with the circle's name and the date, each a link to the circle.
- A photo that was a cut says *From Class 1B* under the picture in its lightbox.
- **Mentioned in** (docs/02 §2.20.1) is one flat list of the notes and journal entries
  *elsewhere* that name this person, newest first. Each row is a single link: the source icon,
  *in <person>’s journal · by <author>*, the day on the right, and a one-line preview
  underneath. Nothing in it is editable.

#### Empty cards

- `cardShape` (`$lib/contacts/empty-cards.ts`) decides each card's shape at zero.
- An empty **Photos** or **Notes** is **one line** (`Section`'s `empty`): the title, one short
  sentence cut off rather than wrapped (*No photos yet.*, *Nothing noted yet.*), and the
  card's actions — *+ Add* and, on Photos, the Immich menu — with no count and no body.
- Pressing *+ Add* grows it into the card with its form open; *Cancel* shrinks it back, and
  the button pressed is the one that closes it.
- Photos counts as empty only with no photo, none kept on the device, no group photo and no
  Immich line.
- An empty **Activity** keeps its card and a dashed box with one sentence (*Nothing written
  down yet — calls, visits and moments land here.*): *Log contact* is in its header already.
- An empty **Mentioned in** is **not on the page**. People keeps its card, whose empty state
  is where linking starts.

### Why

The cards replaced tabs because tabs hid the two things a page is most often opened for behind
a click.

The facts are the only reading surface, and each fact edits where it is read — the way the job
always did. Empty facts wait behind one button that names them instead of standing as
blank labels; once asked for they come as slots in their real places. A slot emptied mid-visit
stays rather than vanishing under the tap.

*Write a moment* is the thing people came for, so it is the one visible action and it keeps the
reader on the page. *Log contact* is rare, so it is a ghost button on the card it belongs to and
an entry in the ⋯. Archiving, "this is me", merging and deleting are quiet, rare and about the
record rather than the person, so they live in the ⋯ and say their consequence in a confirm step
rather than as prose on the page. *Keep them* takes the cursor so a second Enter never deletes
anybody. Only one person can wear *You*, which is what makes it readable at a glance rather than
a second lock icon. Merging always keeps the page you are on, so the household answers one
question instead of choosing which of two records wins. Deleting is not a `RemoveButton`: that
pattern promises Undo, and after a deletion there is nothing to put back.

The jump bar shows only once it sticks because at rest nothing should stand between the identity
card and People. It appears exactly where a jump to People leaves the page, so a tapped bar never
vanishes. Hidden, it is `inert` because it is out of sight. *Mentioned in* is the page's quiet
foot, and a fifth link does not fit a phone; at zero it is not there at all.

In the folded People card worked-out relatives wait behind *Show more* so an inference never
pushes something the household typed below the fold, and worked-out tiles look quieter so an
inference never passes for something the household typed. A suggestion is a sentence with a
button, never a checkbox list that could be swept in with one click. The card asks *How are we connected?* but does not
answer it: it holds two hops, and the answer usually runs further.

The map is a preview because a card-sized canvas at rest was too small to read and panned by
accident while scrolling, and as a 20 rem column beside the list it told the reader *that*
somebody had ten links while squeezing the list that names them. Names show only where the width
makes them legible. On a phone the enlarged map leaves page in view because the canvas takes a
vertical swipe as a pan; the strip below is always there to scroll by. Enlarging is animated so
it reads as the preview growing rather than a jump; the live map waits for the height because
built mid-glide it costs a phone the glide's frames, and a canvas framed once never visibly
resizes. Enlarging is the reader's choice, so the canvas never pans by accident and never holds
the photos a screen away.

The photo lightbox puts the destructive action last so it is never the button next to the one
you meant. *Mentioned in* is a list of whole-row links because the only thing to do with a
passive item is go to where it is written; nothing there is editable, so there is no button to
mistake for one.

Most people in a household are reference records, and a page of boxes that each say "nothing"
teaches the reader to stop looking — the rule *Coming up* follows. So an empty card shrinks to
the line that still holds its *+ Add*. An empty *Mentioned in* goes entirely because it is
passive: there is nothing to add there.
