# 05 — UI & Design System

Stella should feel **calm, warm, and effortless** — closer to a well-made notebook than a
CRM. This document defines the visual language, theming, layout, and interaction
patterns.

## 5.1 Design principles

1. **Content first, chrome last.** Generous whitespace, few borders, soft elevation.
2. **One primary action per screen.** Obvious, reachable (thumb-friendly on mobile).
3. **Recognizable people.** Avatars everywhere; faces are the fastest index.
4. **Progressive disclosure.** Quick-add is tiny; depth is available but never in the way.
5. **Motion with meaning.** Subtle transitions; always honor `prefers-reduced-motion`.
6. **Accessible by default.** WCAG **AA** contrast in both themes; full keyboard support.

## 5.2 Theming: Catppuccin

Two shipped themes, mapped to Catppuccin flavors:

- **Light → Latte**
- **Dark → Mocha**

Theme selection: `system` (default, follows `prefers-color-scheme`), `light`, or `dark`,
stored per user (`user.theme_pref`) and applied via a `data-theme` attribute on `<html>`
to avoid flash. An inline head script sets the attribute before paint.

Frappé and Macchiato are **not** shipped in v1 but the token structure below makes
adding them trivial.

**The one place a hex literal is allowed outside `app.css`** is
`src/lib/design/app-colors.ts`, for the two things that live outside the document and cannot
read a CSS variable: the `theme-color` meta the browser paints its own chrome with, and the
web app manifest, which is JSON (§2.18). It is a narrow exception like the explorer's in
§5.8, and it is held to `app.css` by a test that reads the stylesheet, so a flavour swap
cannot leave the install splash in last season's colour. The `theme-color` meta ships once
per theme — a single value leaves half the household with a status bar that fights the page.

### 5.2.1 Palette (hex reference)

**Latte (light)**

| Token | Hex | | Token | Hex |
|---|---|---|---|---|
| base | `#eff1f5` | | text | `#4c4f69` |
| mantle | `#e6e9ef` | | subtext1 | `#5c5f77` |
| crust | `#dce0e8` | | subtext0 | `#6c6f85` |
| surface0 | `#ccd0da` | | overlay2 | `#7c7f93` |
| surface1 | `#bcc0cc` | | overlay1 | `#8c8fa1` |
| surface2 | `#acb0be` | | overlay0 | `#9ca0b0` |

Accents (Latte): rosewater `#dc8a78`, flamingo `#dd7878`, pink `#ea76cb`,
mauve `#8839ef`, red `#d20f39`, maroon `#e64553`, peach `#fe640b`, yellow `#df8e1d`,
green `#40a02b`, teal `#179299`, sky `#04a5e5`, sapphire `#209fb5`, blue `#1e66f5`,
lavender `#7287fd`.

**Mocha (dark)**

| Token | Hex | | Token | Hex |
|---|---|---|---|---|
| base | `#1e1e2e` | | text | `#cdd6f4` |
| mantle | `#181825` | | subtext1 | `#bac2de` |
| crust | `#11111b` | | subtext0 | `#a6adc8` |
| surface0 | `#313244` | | overlay2 | `#9399b2` |
| surface1 | `#45475a` | | overlay1 | `#7f849c` |
| surface2 | `#585b70` | | overlay0 | `#6c7086` |

Accents (Mocha): rosewater `#f5e0dc`, flamingo `#f2cdcd`, pink `#f5c2e7`,
mauve `#cba6f7`, red `#f38ba8`, maroon `#eba0ac`, peach `#fab387`, yellow `#f9e2af`,
green `#a6e3a1`, teal `#94e2d5`, sky `#89dceb`, sapphire `#74c7ec`, blue `#89b4fa`,
lavender `#b4befe`.

### 5.2.2 Semantic tokens

Colour lives in three layers, and **components may only touch the third**:

| Layer | Where | Example |
|---|---|---|
| flavour | `app.css`, once per theme | `--ctp-mauve` |
| surfaces | `app.css`, once per theme — the values the palette doesn't carry | `--card`, `--shadow-card` |
| semantic | `app.css` `:root`, theme-independent | `--bg`, `--fg`, `--primary`, `--accent-teal`, `--cat-family`, `--kind-call` |

The table is mirrored in TypeScript by `src/lib/design/tokens.ts`, so a component that needs a
colour in an inline style asks for it by meaning (`accentChipStyle(tag.color)`) instead of
interpolating a variable name. That module is the only place allowed to build a token string.

**Surfaces.** The elevation order is page → sunken → card:

| Token | Latte | Mocha | Used for |
|---|---|---|---|
| `--bg` | `mantle` | `mantle` | the page itself |
| `--bg-sunken` | `crust` | `crust` | sidebar, inputs, wells |
| `--card` | `#ffffff` | `#232334` | anything that sits above the page |
| `--card-hover` | `#f7f8fb` | `#2a2a3d` | that surface, hovered |
| `--border` | `surface0` | `surface0` | inputs and dividers |
| `--border-subtle` | `#e7e9f0` | `#292939` | hairlines inside a card |

The card colour is the one **deliberate departure from the palette**. Latte's lightest step
(`base`, `#eff1f5`) sits too close to its neighbours to read as raised, and Mocha's `base`
gives only a six-value step over `mantle`; both leave every card looking sunken. So cards get
their own value and the page drops beneath them. Cards are separated by `--shadow-card` — a
shadow tinted with the text colour, never black — rather than by a border.

**Text.** `--fg` (`text`) → `--fg-muted` (`subtext1`) → `--fg-subtle` (`subtext0`), the same
three steps in both flavours. All three clear AA on `--card`. On the page ground `--fg-subtle`
reaches 3.9:1, so there it carries only meta that repeats what is already on screen — a day
divider, a relative timestamp.

**Brand and state.** `--primary` (mauve) marks the one primary action, the current navigation
item and focus; `--primary-soft` is its 14 % tint for active chips and hovers. `--success`,
`--warning`, `--danger`, `--link` are unchanged.

**Accents.** All fourteen Catppuccin accents are published as `--accent-<name>`. Tags, circles
and generated avatars store one of those names, so the name a household picks survives a
flavour swap. Avatars draw from the accents **except red**, which stays the danger signal.

**Colour identifies, the foreground reads.** A tag chip and an initials avatar tint their
surface with the accent and write on it in `--fg`, never in the accent itself. Catppuccin's
accents are picked to sing against the page: in Latte most of them measure between 2.6:1 and
3.7:1 against a tint of themselves, below AA at any size, and no mix that fixes that leaves
enough hue to be worth having. Tinting the surface keeps the colour identity where it is
legible and puts the text at 6:1 or better. `src/lib/design/color.test.ts` holds that pairing
to the AA floor for all fourteen accents in all three theme states.

**Categories, kinds and edges.** `--cat-family|romantic|social|professional|other`,
`--kind-met|call|video|message|letter|gift|other` and `--edge-membership|kinship` fix the
pairings of §5.6 in one place. The graph adapter resolves these same tokens into hex for the
canvas (`src/lib/graph/cytoscape/theme.ts`), so a chip and the edge it toggles cannot drift.

**Shape.** `--radius` (12px) for cards and panels, `--radius-control` (8px) for buttons,
inputs and chips, full round for avatars and pills.

**Three theme states.** An explicit choice stamps `data-theme` on `<html>`; the default follows
`prefers-color-scheme`. The dark palette is therefore written twice — once for
`[data-theme='dark']` and once inside the media query guarded by `:not([data-theme='light'])`.
They must be edited together; `app.css` says so at both blocks.

### 5.2.3 Accent color choice

- **Primary accent defaults to `mauve`** (Catppuccin's signature).
- Users may pick a different accent (`user.accent_pref`) from the accent set; it only
  remaps `--primary`/`--focus-ring`, so contrast stays managed.
- Relationship categories, tags, and interaction kinds each map to a **fixed accent**
  for consistency across list, profile, and graph (see 5.6).

## 5.3 Typography, spacing, radius, elevation

- **Two typefaces, two jobs.**
  - **Instrument Sans** (`--font-sans`) carries the interface: navigation, labels, buttons,
    lists, forms.
  - **Newsreader** (`--font-serif`) carries what a person wrote: moments, journal entries,
    notes, and the composer's own field. A written line should never read like a data field —
    that difference is what separates a moment from a system event in the stream.
  - Both are **self-hosted**: the `@fontsource-variable/*` packages ship the woff2 files and
    Vite rewrites the `@font-face` URLs to our own origin (no CDN, per §4.7). They are imported
    once in the root layout. The system stack stays as the fallback.
- **Scale (rem):** 0.75 / 0.8125 / 0.875 / 1 / 1.125 / 1.375 / 1.75 / 2.25. Headings tighten to
  −0.02em; serif body copy sits at 17px/1.5. Comfortable line length (~65ch) for note bodies.
- **Spacing:** 4px base grid (Tailwind default). Sections 32px, card padding 16–18px,
  list rows 8–10px.
- **Radius:** `--radius` 12px for cards, `--radius-control` 8px for buttons and inputs, full
  round for avatars and pills.
- **Elevation:** cards sit on `--card` above `--bg` and are lifted by `--shadow-card`, a
  text-tinted shadow; `--shadow-pop` is for menus and popovers. Borders are for inputs and
  dividers, not for separating cards.

## 5.4 Layout & navigation

- **App shell:**
  - **Desktop:** left sidebar (Home, People, Circles, Graph, Settings), a top bar with the
    search button that opens the ⌘K palette and the *Add person* button, content area.
  - **Mobile:** bottom tab bar (Home, People, *pencil*, Circles, Graph). The centre action is
    the **pencil** — writing a moment is the verb the app is built around, adding a record
    is not — and it opens the composer as a sheet over Home (§2.22.1). Settings, rarely
    opened, sits in the top bar there rather than taking a sixth place.
  - **Breadcrumb trail** in the top bar, derived from the route + loaded data
    (`Home / People / {name} / Journal`). Every segment links, so Home is always one
    click away; the active destination is marked with `aria-current="page"` in the
    sidebar and tab bar. The desktop shell's account menu (theme + sign out) lives in the
    shell, not per page; sign out is repeated as a plain button on **Settings** so it is
    reachable on mobile, where that menu is not rendered.
  - The shell is a single `(app)/+layout.svelte`; pages render content only — no per-page
    headers or back links.
- **Responsive, mobile-first.** Capture flows are optimized for one-handed phone use.
- **Command palette** (⌘K / Ctrl+K, or the search button): a native `<dialog>` listing
  actions (*Write a moment*, *Add person*) and the people the viewer may see, narrowed as
  you type with arrow keys and Enter; a typed query always ends in *Search everything*, which
  is the full-text search over notes the palette itself does not read. The rows come from a
  pure `paletteRows`; the people arrive with the app shell's `load`, so the first keystroke
  answers without a round trip. It is the one control here that cannot work without
  JavaScript, so its trigger stays **disabled until the shell has mounted** rather than
  swallowing a click in the first moments after a load — which is also what lets a test know
  the page is ready instead of waiting and hoping (`docs/08` §8.4).

## 5.5 Key screens

- **Home** — the capture field over the household stream (§2.22), which carries two rows of
  filter chips (*What*, *Who*) in the Circles chip style — links with `aria-current`, wrapping
  onto a second line on a phone rather than scrolling sideways — with a **rail** on the
  right from `lg` up: **Coming up** (§2.13.3) and **Quiet lately** (§2.12.1), each row an
  avatar, the person, one line of context and the one action — *Write a moment*. Below `lg`
  it is the **same vertical list**, full width — nothing scrolls sideways, because what lies
  off the right edge of a phone is not read. Two things keep it from pushing the stream away:
  each band stops after **three rows** with *Show all N* beneath it, and the rail only sits
  **above** the stream while a date is due **within 14 days** (`IMMINENT_HORIZON_DAYS`);
  otherwise it follows the stream, where it is still one scroll away. Both bands are
  **absent entirely when empty**; there is no empty state for them, because a permanently
  empty panel teaches people to stop looking. On a phone the composer is a **sheet** opened from the *What happened?*
  bar or the tab-bar pencil.
- **Settings → Check relationships** — the household-wide suggestion review (docs/02 §2.4.1).
  Closed it is an `EmptyState` with one primary action, because no rule runs until it is asked
  for; asked, it is a count, *Check again*, and one card per person — avatar, name linking to
  the profile, and that person's claims as the **same rows the person page uses**
  (`KinSuggestions`), so an answer means one thing wherever it is given.
  - **Nothing is dropped, everything is folded** (concept:
    `docs/concepts/relationship-review-at-scale.html`). The engine computes the whole household
    (docs/04 §4.9), so the screen folds at three levels: **ten people to a page** with a pager,
    **five claims per person** with the remainder named — *1 more for Selina Gerber*, never a
    bare *more* — and a link to that person's own review panel for the rest, and the declined
    log moving from a `<details>` drawer to **its own address** once it passes ten.
  - **The header counts the household, the range counts the page.** *6 open across 1 person*
    beside *People 1–10 of 96*: how much work is left, and where in it the reader is. A search
    narrows the range and never the header.
  - Every control is a form or a link — pager, search and log included — so the screen works
    with JavaScript off, and an answer returns to the page and search it was given on.
  - **A row says what its claim follows from**, in one sentence under the claim, and every name
    in both is underlined and leads to that person. The underline is drawn in `fg-subtle`, not
    `border`: measured on the dark theme, a border-coloured rule vanished against the row and
    the names read as plain text in one theme and as links in the other. Names are *not* set in
    the link colour — the two buttons beside them are the call to action, and a row carries up
    to six names. Measured: the full sentence costs the row nothing at the review's own width
    (66px, unchanged) and one line on a phone. Concept: `docs/concepts/relationship-reasoning.html`.
  - **An answered row goes at once.** It fades as it closes, over 200ms, and while it closes the
    list gives the height it loses back to its own scroll offset — so whatever stood below the
    row stands in the same place when it is gone, and the next row is never pulled up under a
    finger. Measured: 0px of movement, where a plain collapse moves everything below by a full
    row (74px). At the top of a list there is nothing to give back and the rows below do move;
    that is the honest limit. *Undo* lives in the toast for eight seconds, and under
    `prefers-reduced-motion` the row simply goes. Concept:
    `docs/concepts/relationship-answer-vanish.html`.
- **People** — a find-as-you-type field, tag chips, then **letter groups** by surname with a
  sticky letter heading; each row is avatar, name (lock for private), description, and
  **last written about** on the right (`—` when nothing has been). The heading counts people;
  *Add person* lives in the shell, not on the page.
- **Contact profile** — **what they are to the household in one column, who they are beside it.**
  - **Hero:** avatar, name and description (both editable in place), then the facts you came
    for on one line — when you
    were last in touch, how you met, whether the person is private. Two actions: *Write* (a
    journal entry) and *Log contact* (a touchpoint), the second opening the story card's own form.
  - **Main column** — one stack of cards, no tabs, in a fixed order: **People · Story · Notes ·
    Photos · Mentioned in**. Tabs hid the two things a page is most often opened for behind a
    click and, once People and Story led the column, the three that were left were a navigation
    layer the rest of the page no longer had. Each card carries its own count where the count is
    exact, its own `+ Add` disclosure (§5.7), and an **anchor** (`#section-relationships` and
    friends) so a link can point at one; the passive references of §2.20.1 do, and a form action
    redirects back to the card it acted on. Bookmarks holding the old `?tab=` are answered with
    the card they meant.
  - **People** opens with the **map** — the same explorer the graph route runs, with this
    person locked in the middle and a reach of two hops (§5.8) — because who someone is
    connected to is a shape before it is a dozen rows; *Open in the graph*, a button in the
    card's header rather than a small text link, reaches the whole household, and the explorer
    carries a *Back to <person>* link home (§2.7). Beside it, **How are we connected?** opens a
    person picker — the same one every other "which person?" question on this page uses — and
    hands both ends to the explorer, which traces the chain on arrival. The card asks the
    question and does not answer it: it holds two hops, and the answer usually runs further. The list
    follows, each row *label · name · how they connect · since <day>* with *former* as a quiet
    chip, carrying **Edit** (revealing the same three fields in place, the type not among them)
    and the standard remove-with-undo. Below it, **Also related · worked out, not entered**
    (§2.4.1) carries the derived relatives — a divider, a quieter heading and a *via* clause
    keep an inference visually distinct from something the household typed. The rows are
    read-only with one exception: a *step* relative is only as much as Stella can see, so
    those rows carry a ghost **Actually the child / the parent / a sibling** at the end of the
    line, which stores the direct link and so takes the row out of the block. After a link is
    added, an **Also true?** panel sits above them with what it implies, one *Add this too* per
    line: a suggestion is a sentence with a button, never a checkbox list that could be swept in
    with one click. **Story**, titled *Activity*, is the merged timeline of §2.23 — journal
    entries and touchpoints in one order, a rail with a dot per item coloured by kind, the
    author's name beside the kind (*you* on your own items), *Show earlier* paging back through
    both sources; it is paged, so it carries no count. **Notes** are pinned-first. **Photos**
    (§2.14) is a square grid at three columns, four from `sm`, with a lock badge on a private
    one; a photo opens into a **lightbox** — a solid card over a blurred, dimmed backdrop that
    closes on click, with the caption above the picture and the actions in one row beneath it.
    The destructive action sits last in that row and carries the danger style, so it is never
    the button next to the one you meant. **Mentioned in**
    (§2.20.1) is the passive side: one flat list of the notes and journal entries *elsewhere*
    that name this person, newest first, each row a single link — the source icon, *in <person>’s
    journal · by <author>*, the day on the right, and a one-line preview underneath. The whole
    row is the link, because the only thing to do with a passive item is go to where it is
    written; nothing here is editable, so there is no button to mistake for one.
  - **Profile column** (`17rem`, sticky from `lg`, second everywhere): **one** card named
    *Profile*, holding Contact fields, Dates (§2.13.1), Circles, Tags and How we met as folded
    **rows** (§5.7) — each shows its count, and a value or two of what is in it, so a folded row
    is still worth reading; opening one reveals its content and its own `+ Add`. Four shadowed
    cards used to shout over the story for details that are looked up rather than read. The
    record-keeping actions — *This is me*, *Archive*, *Merge*, *Delete* — sit in one quiet stack
    at the card's foot, behind a divider.
  - Below `lg` the columns stack **main column first**, profile underneath; the order inside
    each is the same as it is wide, so there is nothing that behaves differently on a phone.
- **Add a person** — one card: first and last name, description, how and where you met,
  visibility. Nickname and birthday sit behind a *More* disclosure; everything else waits
  for the person's page. The heading says so: *a name is enough*. Once a surname is typed,
  an **Already in Stella?** box (§2.2.1) slides in under the name fields: a sunken panel,
  one line per person — name as a link, the reason in muted text, a *Link as relative*
  radio on the right. It is absent until there is something to say and never steals focus;
  the form submits exactly as before.
- **Graph** — full-screen canvas under one slim toolbar row: search-to-focus, a **Filter**
  menu, an **Arrange** menu and the connection path (§5.8), plus a **peek panel** that shows
  the person's avatar, name and two actions. The Filter menu **is the legend**: each line
  kind is an item drawn in its own line style (solid per category, dashed for circles,
  dotted for kinship) in its token, so an item and the line it toggles can never disagree,
  and there is no second box to keep in sync. The **"Labels" switch** that names every line
  at once sits at the foot of the same menu.
- **Circles** — a find-as-you-type field and kind chips over a grid of **cards** (§2.4.2):
  colour dot, name, kind and member count, the description, and a stack of the first four faces
  with "+n" for the rest. A query that matches nothing gets the empty state, not a blank page. A circle's page
  puts the members in a **grid** of avatar cards with roles; *Add member* is the card's one
  disclosure, like every other card in the app. Its header carries *Open in the graph* — the
  same button a person's People card has, because a circle is a node like any other — and the
  explorer offers *Back to the <name> circle* in return (§2.7).
- **Empty states** are one component (`EmptyState`): a large icon in the subtle colour, a
  line naming what belongs here, and the one action that starts it — never a bare "nothing
  here". Bands that are absent when empty (Coming up, Quiet lately) do not use it.
- **Between screens** the app cross-fades (`document.startViewTransition`, 160 ms) so a list
  and the person it opens read as one place; the shell skips it under
  `prefers-reduced-motion` and in browsers without the API. No skeleton loaders: pages are
  server-rendered from a local SQLite file and there is no in-between state to draw.
- **Archiving** (docs/02 §2.2) sits at the foot of the person's profile column, a ghost
  button with one line saying what it does — never beside *Write*, which is the thing people
  came for. An archived person carries a quiet *Archived* chip in their header beside
  *Private*, and the directory grows an **Archived (N)** chip at the end of the tag row,
  leading to the same list with the "last written about" column dropped.
- **Which of these people you are** (docs/02 §2.1.3) is set in two places and looks the same
  in both: Settings carries a **You** section with a labelled person search select, and the
  foot of a person's profile column carries a ghost *This is me* — the same button reading
  *This is not me* once it is set, beside *Archive*, because both are quiet, rare and about the
  record rather than the person. The person you are wears a **You** chip in `--primary-soft`
  on `--primary`: in their header beside *Private* and *Archived*, and next to their name in
  the People directory. Exactly one row in the household can ever wear it, which is what makes
  it readable at a glance rather than a second lock icon.
- **Merging a duplicate** sits with the delete control at the foot of the profile, admin-only,
  as a disclosure holding a person search select and one button (docs/02 §2.2). The survivor is always the
  page you are on, so the form asks a single question — *who is the same person?* — instead of
  making the household choose which of two records wins.
- **Deleting a person** sits under the archive control on the profile and only for an admin
  (docs/02 §2.2). It is a two-step disclosure, not a `RemoveButton`: the deferred-removal
  pattern promises Undo, and there is nothing to put back. The second step spells out what
  goes with them and carries the only `variant="danger"` button on the page. In Home's stream
  a removal renders without an avatar or a link — a neutral icon, who did it, and what it
  says — because the person it names no longer has a page.
- *(No reminders screen.)* Upcoming dates live in the **Coming up** band on Home, and the
  dates themselves are edited in the **Dates** section of a person's page — kind, day,
  "year unknown", whether it repeats, and whether it shows on Home. A birthday derived from
  the profile is listed there too, marked *from the profile* and not deletable; an explicit
  birthday row replaces it (docs/02 §2.13.2).
- **Settings** — account (incl. sign out), appearance (theme + accent + reduced motion),
  household (members, invitations, relationship types, tags), data (export/import/backup), auth.
  *Today:* a landing page with the **Data** section, a **You** section (docs/02 §2.1.3) and an
  **Account** section (sign out only so far), and the **Import people** wizard
  (§2.16) as a three-step page — numbered step strip, a count-tile preview with a
  "left out, and why" card, then the import result and the photos, under one progress bar but
  two ways in, because the accepted formats differ: a folder picker for a Monica dump, whose
  pictures are still on the Monica server, and a single *Store photos* button for a JSON export
  or a vCard, which carry them inside the file, plus **Relationship types** (docs/02 §2.4): the household's own types as rows
  with a category dot, an *Edit* disclosure and — only where nothing uses the type — a
  `RemoveButton` with the usual Undo window; a type in use shows `used N×` in its place. The
  built-in twelve follow as a plain, actionless list under *Built in*, so their absence from
  the editable set reads as deliberate. Admin only; members see why. The page ends with an **About**
  card: the running version as the card's own line, and under it — when the release check is
  on — one line about the newest published release. That line is a notice, not a banner: a
  small `New` pill in soft primary, the version, and *Release notes* as an ordinary link,
  laid out to wrap on a narrow screen. Nothing to dismiss, nothing to act on in the app
  (docs/02 §2.17.1).
- **Auth** — one split shell for sign-in and first-run setup: the brand and one line of
  promise on a sunken panel, the form beside it; on a phone the panel shrinks to a header so
  the form comes first. Sign-in offers **"Sign in with SSO"** (Authelia) and, if enabled, a
  local email/password form; the demo login sits under them while `SEED_DEMO` is on.

- **Settings → API tokens** (docs/02 §2.16.1) — every member's own page, linked from Settings
  under *API*. A form (name, lifetime as a `select`) above the list of the member's tokens:
  name, *valid until* / *expired on*, *last used*, and a ghost *Revoke* whose accessible name
  carries the token's name. A new token appears **once**, in a `--primary`-bordered panel on
  `--primary-soft` above the form, with *Copy* and a ready-to-paste `curl` line against this
  very instance; nothing on the page can show it again. Revoke has **no undo toast**, unlike
  every other removal (§5.7): a token is withdrawn because it may be in the wrong hands, and a
  grace period would be a window for exactly those hands. Icon: `apiToken` (a key) — not
  `private`, which is about who sees a record.

## 5.6 Color semantics (categories → accents)

Consistent everywhere (chips, edges, timeline dots):

| Meaning | Accent |
|---|---|
| Primary / brand | mauve |
| Family (relationships) | green |
| Romantic | pink |
| Social / friends | blue |
| Professional | peach |
| Other | overlay/subtext (neutral) |
| Interaction kinds | met green · call blue · video sapphire · message teal · letter peach · gift pink · other neutral — one table (`src/lib/interactions/kinds.ts`) carrying the label, the icon name and the token, used by the profile timeline and the stream |
| Success | green · **Warning** yellow · **Danger** red · **Link** blue |

Tags choose from the full accent set, minus red for generated avatars. Every pairing is
declared once as a `--cat-*`, `--kind-*` or `--edge-*` token (§5.2.2). Where an accent tints a
surface that carries text — a tag chip, an initials avatar — the text is written in `--fg`, not
in the accent: colour identifies, the foreground reads (§5.2.2).

## 5.7 Components (design-system inventory)

Buttons (primary/secondary/ghost/danger), inputs & selects, person search select, tag/chip,
avatar (+ stack), card, section header, modal/sheet, toast, dropdown menu, command
palette, empty states, timeline item, note card, relationship row, photo grid + lightbox.
All themeable via semantic tokens, all keyboard-accessible.

**Section** (`src/lib/components/Section.svelte`) is that card: a title, an optional count, at
most one disclosure, and the thing itself. `as="row"` is the same component without the card
around it — a folded disclosure line inside somebody else's card, showing its count and a
summary of what it holds while closed. The person page's profile column is five of them in one
card (§5.5); one component rather than two, so a card and a row cannot come to disagree about
how a form behaves. The form it reveals opens **directly beneath the
card's header** — above the content, never at the foot of the card. A person with twelve
relationships pressing *Add* would otherwise watch nothing happen, because the form appeared a
screen below the button that asked for it. On opening, the card scrolls itself just into view
and the cursor lands in the form's first control that can hold it — the hidden inputs several
forms carry their ids in are skipped, since focusing one fails silently
(`src/lib/components/first-field.ts`). `Escape` closes the form and hands focus back to the
button that opened it. A form held open by a failed validation is the exception to both: the
reader has just arrived on the page, so nothing steals the cursor from the error message and
`Escape` cannot dismiss the form the message lives in.

**Person search select** (`src/lib/components/PersonSearchSelect.svelte`) replaces a plain
`<select>` everywhere a form asks for a person from a list too long to scan: relationship
target, interaction participants, circle member, merge duplicate. It filters by name as you
type (same match/rank rules as the People directory and command palette — case- and
diacritic-insensitive, prefix matches first), and posts the same hidden field(s) a `<select>`
would, so it drops into an existing form action unchanged. Single mode replaces the pick on
choosing someone; multiple mode (interaction participants) keeps chosen people as removable
chips and lets you keep adding.

With `allowCreate`, the picker also ends a fruitless search: from two typed characters on, a
row under the list offers *Add "<what you typed>" as a new person*, with a `+` mark and the
accent colour. It sits **outside** the listbox on purpose — it is an action, not a person, and
keeping it out means "the options" stays a list of people for a screen reader and for anything
locating someone by name. *No one found.* stays above it. Choosing it swaps the dropdown for a
compact create panel in the same position (first/last name pre-filled from the query, nickname
and birthday collapsed, visibility pills), which posts to `/contacts/quick-add` and selects the
new person on success (§2.2.2). The panel is plain inputs and `type="button"` buttons, never a
nested `<form>` — the picker sits inside the caller's form, and Enter inside the panel saves
the person rather than submitting that form. Its birthday is a `DateField` bound by value, not
a form field, since the panel sends JSON.

**Callers give it an `id` and point their label at it with `for`** — never a label that merely
wraps it. A `<label>` names its first labelable descendant, and in multiple mode that is a
chip's remove button, not the search input: the field loses its accessible name the moment
anybody is picked, and a screen reader reaches an unnamed combobox (§5.9).

**Date field** (`src/lib/components/DateField.svelte`) replaces `<input type="date">`
everywhere a day is entered: birthday, important date, the day an interaction happened, a
relationship's *Since*, a journal or moment day. A native date input takes its segment order,
its separators and its month names from the **browser's** locale, not the app's — so a German
household reading Stella in German on an English browser is asked for `mm/dd/yyyy` and handed
an English calendar, and no attribute on the page can change that. This field is assembled
from the app's own locale instead: the order comes from `Intl.DateTimeFormat` (day first in
German, month first in American English), and the month is a **named choice** rather than a
number, which also ends the day/month ambiguity.

Two consequences worth knowing. The year is a segment like any other, so a birthday whose year
nobody remembers is simply one left blank — that is what produces `--MM-DD` (§2.13.1), and it
is why there is no "year unknown" checkbox any more. And because the three segments are
separate controls, the browser cannot see that together they name 30 February; the verdict
from `src/lib/dates/calendar.ts` — the same predicate the server applies — is hung on the day
segment with `setCustomValidity`, so the form refuses to submit exactly as it would for any
other invalid field. It posts one hidden field holding the ISO value, so it drops into an
existing form action unchanged.

**Buttons** are one component (`src/lib/components/Button.svelte`) with four variants, and the
variant states the intent:

| Variant | Means | Looks like |
|---|---|---|
| `primary` | the one action the screen is for | filled in `--primary` |
| `secondary` | a real action beside it | card surface, bordered, lifted |
| `ghost` | a quiet action inside a row or card header | no chrome until hover |
| `danger` | removes something | neutral until hover, then `--danger` |

It renders an `<a>` when given `href`, so a link that looks like a button still behaves like a
link, and leaves native submit behaviour alone inside a form. Sizes are `sm` (rows, card
headers) and `md` (a screen's own actions); an icon with no label becomes a square icon button
and requires a `label`.

**Inline edit** (`src/lib/components/InlineEdit.svelte`) turns a read value into its own
editor: the value is a button, clicking it swaps in a focused field with *Save* and *Cancel*,
Enter saves and Escape reverts. It posts to a real form action, so without JavaScript the
field is simply always there. A save that failed keeps the editor open with the error under
it, and one that worked says *Saved* like every other form. Used for the person's name and
description (docs/02 §2.2).

**Settings → Data** lists the household's data tools as full-width cards: an icon in a soft
primary disc, a name, one line of explanation, and a chevron. *Download the archive* is the one
card that is a form rather than a link — it posts, because taking the archive writes a line into
the household's activity log, and a link a browser may prefetch is the wrong shape for that. The
cards show for the admin only; everyone else reads one sentence saying so (docs/02 §2.15).

**Restore from an archive** (`/settings/import/archive`) is one card and one screen: a file
field, a *Restore* button, and — afterwards — the report. The report is a list of kinds with
*n added* and, where it applies, *n already here*, then a line about the photos and one panel
per warning. No preview step: a restore only ever adds, so what would be previewed is the
household's own data (docs/04 §4.9).

**Mention field** (`src/lib/components/MentionTextarea.svelte`) is a textarea that offers
people while you type `@` (docs/02 §2.20.1): a listbox under the caret, arrows to move, Enter
or Tab to take the highlighted person, Escape to dismiss. The picker is an enhancement — the
field posts its text either way and the server resolves whatever handles it finds — and it
narrows to the audience of what is being written, so a shared note never offers a private
person. Used by the note form and the journal composer. The moment composer keeps its own
richer picker because only a moment may create a person on the fly (§2.22.1).

**Toasts** (`src/lib/components/Toast.svelte`) sit bottom-left of the content column, one
card per message, announced as a polite live region. A removal's toast names what went —
*Entry removed*, *Tag removed*, *Left the circle*, *Added Otto Meier as a parent of Lisa
Meier* — and carries an **Undo** button for the whole window (eight seconds); a plain notice
— *Saved*, or why a removal failed — has no button and goes on its own. Removing needs no confirmation dialog because every removal can
be taken back from here (docs/02 §2.23), and every one of them is the same component
(`RemoveButton`), so no list can quietly opt out. Saving says *Saved* and closes the form it
was typed in — a section's editor and an inline edit alike. On a phone the region sits above the tab bar.

**Activity indicator** (`src/lib/components/ActivityIndicator.svelte`) is how the app says it
is still working, once for the whole app: a small pill — a spinner and a word on `--card` —
centred just under the top edge of the window, over everything. It is **fixed to the viewport
and takes no space in the layout**; an indicator that appears in the flow pushes the page down
as it arrives, and moving the line somebody is reading is worse than showing nothing at all.
That rules out a banner in the column and a badge in a section header alike, and it is why
there is one indicator rather than one per card. A two-pixel line along the top edge was tried
first and passed unnoticed: at the size an indicator may take without being in the way, a
shape with a word in it is read and a line is not.

It arrives on a short fly-and-fade and leaves on a fade (260 ms / 180 ms, both nothing under
`prefers-reduced-motion`): the pill is quiet enough that appearing outright reads as a flash,
and a wait that announces itself abruptly feels longer than it is.

It shows for a page that is still loading and for any change a page reports — saving a
relationship reloads the person's graph, and on a household with many links that takes long
enough to read as nothing having happened. Nothing is dimmed, covered or disabled while it
runs: what is on screen is still true until the answer arrives. The live region is always
mounted, so a screen reader hears the work start rather than the region appear — polite and
without the `status` role, for the same reason the toast region omits it: the role would make
this the page's second status region and take `getByRole('status')` away from the inline hint
that is actually about what the reader is doing.

It does not appear for every wait. Work that is over within **250 ms** is never shown at all —
below that a save is finished about as soon as the pill could be read, and announcing it only
makes the app look busier than it is — and once it is up it stays for at least **400 ms**, so
it can never register as a blink. Both windows are the store's, not the indicator's, so a page
that starts two quick loads in a row (the app does, on a cold start) shows nothing rather than
flickering twice.

What counts as work in flight is decided away from the screen, by
`src/lib/sync/pending-work.ts`: one store per tab, provided by the shell through context
(`src/lib/sync/context.svelte.ts`) the way the removals store is, and a **count** rather than a
flag — two changes that overlap must not let the first one's answer clear the second one's
indicator, and an unbalanced `end()` throws rather than counting below idle. Its timer is
injected, so both windows are unit-tested against a clock the test moves by hand. A navigation
is reported to the same store, and so obeys the same windows. A page reports through
`src/lib/sync/pending.ts`: `trackPending` wraps an enhanced form's submit, `whilePending` wraps
a plain async job, and `reportNavigation` is what the shell's `$effect` on `navigating.to`
calls, so the rule can be driven — run, clean up, run again — without a browser.
`RemoveButton`'s optional `pending` counts the commit a removal makes once its undo window has
passed — never the window itself, during which nothing is on its way to the server yet. That
rule is `deferredRemoval` in `src/lib/undo/deferred-removal.ts`, which is what the button hands
to the removals store: key, toast wording and the work to do when the window closes. Both rules
sit outside their components so a unit test can reach them.

The indicator is hard to catch in a healthy local build — a save there is over in tens of
milliseconds, well under the delay — so `/settings/debug` is a workbench for it: jobs of a
chosen length, two that overlap, and one held open, with the windows and the current state
written out. It is served in development, and from a build only with `DEBUG_PAGES=true`
(docs/07); otherwise the route answers 404. Its copy is English in place rather than in the
message catalogues, because nobody in a household can reach it.

**Language picker** (`src/lib/components/LanguagePicker.svelte`) is a segmented control of
plain submit buttons, one per language, each naming itself in itself (*English*, *Deutsch*).
It posts to `/locale` and comes back on the page it was pressed on, now in that language, so
it works with JavaScript off. It appears twice: in **Settings → Language**, and small under
the sign-in form — the first screen has to be readable before there is a profile to remember
anything in (docs/02 §2.19).

**Offline banner** (`src/lib/components/OfflineBanner.svelte`) is a single quiet line on
`--bg-sunken` directly above the page content — above the content and not the shell, because
it is what you are reading that may be out of date, not the navigation around it. It carries
`role="status"`, so it is announced rather than read only by the sighted, and it appears and
clears on its own: the service worker reports whether Stella is reachable and the banner
follows (docs/02 §2.18, docs/04 §4.11.1). There is nothing to dismiss, because dismissing it
would not restore the connection.

**Install card** (`src/lib/components/InstallCard.svelte`) is an ordinary Settings card, one
of three sentences depending on what the device can do — installed, installable, or a browser
with no prompt to offer — with the button present only in the middle case. It is deliberately
*not* a banner over the app: an install prompt on a page somebody opened to read about their
aunt is an interruption, and there is no state in which it needs answering now.

**Offline screen** (`/offline`) is the one page with no shell: an `EmptyState` centred in the
viewport with the `offline` icon, what has happened, and a *Try again* that reloads. It is
fetched and cached while the connection still works, which is why it loads nothing of its own
— anything it read then would be stale by the time anybody saw it.

**A choice that cannot be made says why, once.** Where a picker's entries are refused by what
is already on record — the relationship type picker is the case (docs/02 §2.4) — the entries
are `disabled` and the reason is the heading of the `optgroup` they are gathered under (*"Not
possible — already Partner of Bert"*), never appended to the entry's own label. Two reasons
make two groups; the entries keep their own words and their order. The label of an entry and
the label of the link in the way are both of the form "X of Y", so side by side in one line
they read as a single sentence about the entry — which is how the first attempt was
misunderstood on a live instance. The control's own default follows: the primary button is
disabled only while *nothing* can be picked, because a select stands on the first entry that is
not disabled rather than on the first entry.

## 5.8 Relationship & context explorer styling

The explorer (§2.7, core feature) should feel alive and effortless. Interaction detail:

- **Nodes:** people as the **same disc as their avatar** — the photo when there is one,
  otherwise the accent tint over the card with the accent as the ring — so a face keeps its
  colour between the list and the map (`avatarAccent` is the one hash). A name label sits
  below in the interface font. **Circle nodes** are a distinct shape (rounded pill) so
  contexts read differently from people. Node size encodes degree; deceased contacts are
  subtly desaturated.
- **Edges:** styled by kind — relationship category (5.6), **circle membership** (dashed /
  circle-colored), and **derived kinship** (lighter, dotted, clearly "inferred"). On the
  canvas an edge is the only carrier of its category, so each line colour is the token
  **deepened toward `--fg` until it clears 3:1 on the page ground** (`ensureContrast`; the
  hue survives, only the depth changes), held there by `theme.test.ts` against the real
  tokens in both themes. Chips and dots keep the raw token, because they sit beside a label.
  A line carries its name — "Parent of", "Grandfather", the circle role — but only while it
  is highlighted or on a traced path: selecting a person names their connections, and the
  rest of the canvas stays quiet. A **"Labels" switch** in the Filter menu names every line
  at once, for reading the whole map at a glance; it is off by default, because on a dense graph
  hundreds of names are noise. Either way a name that would render below 7 px is dropped
  rather than drawn as a smudge. Asymmetric relationships show subtle direction.
- **Expand affordance:** an unexpanded node hints it can grow (e.g. a small "+" / count of
  hidden connections); clicking expands its neighborhood in place with a gentle animation.
  **The map holds still while it grows:** everyone already on the canvas stays exactly where
  they stood, and only the newcomers move — they travel out from the person they were opened
  from to a fan on that person's open side, one edge length away where there is room and
  further out where there is not, until every newcomer is at least an edge length clear of
  everyone (`placement.ts`). No layout runs, so a newcomer never lands in the middle of the
  map. The view is not re-framed; only when a newcomer lands off screen does it step back just
  far enough to take them in too (`viewport.ts`), so what the reader was looking at never
  leaves the screen. A removal moves nobody.
- **Toolbar:** one slim row, because every row it takes is a row of map lost — and on the
  card-sized map of a person's page, a large share of it. Only the search stays out in the
  open, since it is used all the time; what is set once and then looked at goes into two
  menus (`MenuButton`: arrow keys move between items, Escape closes and hands focus back, a
  click elsewhere closes). **Filter** counts what is shown (*Filter 5/6*) and stands out in
  the primary colour once the reader has narrowed the map — measured against what the map
  opened with, so the person page's circles-off start is not mistaken for a forgotten
  filter (`src/lib/menu/menu.ts`). Its items toggle and leave the menu open for the next.
  **Arrange** names the current arrangement (*Arrange: Tree*) and closes on a choice.
- **Arrange:** a toolbar menu (*Arrange* / *Anordnen*) with three one-off actions — the
  only things besides the first arrangement that move people already on the canvas. Each is
  worked out first and the map then glides into it in one slow movement (1.2 s), so the
  reader can follow each person to their new place; under reduced motion it simply takes its
  new shape, and the view is framed again either way.
  - *Free / Frei* runs the force layout over the whole map — for when a long session of
    expanding has left long lines.
  - *Tree / Stammbaum* (`layout/family-tree.ts`): one row per generation, the oldest at the
    top, worked out from the family links on the map (`model/generations.ts`) — entered
    links first, the worked-out kinship lines only for a relative nothing entered reaches.
    Partners stand side by side, each row is ordered so children sit under their parents,
    separate families stand side by side, and whoever has no family link (friends,
    colleagues, circles) is shelved in rows beneath rather than wedged into a generation.
    It reads what is shown, so a line filtered away cannot pull someone into a row.
  - *By circle / Nach Kreisen* (`layout/circle-clusters.ts`): each circle ringed by its
    members, the groups apart and largest first, everyone in no circle shelved beneath.
    Someone in several circles stands with the biggest; their other memberships still show
    as lines. It reads every membership, so the grouping holds while the Circles chip is off.

  Tree and By circle give every node the room it really takes — the canvas measures each
  node with its name — and bend any line that would run through somebody on its way (a
  grandparent line past the parent, a cousin past a sibling) around them, to the side that
  needs the smaller bend (`layout/geometry.ts`), so a line's name is never hidden under a node.
  *Free* draws every line straight again.

  Framing leaves the toolbar alone: the toolbar floats over the top of the canvas and wraps
  to more rows on a narrow window, so it is measured, and the map is framed in the part below
  it — the top row of a tree is never drawn under the toolbar. Stepping back to show newcomers
  after an expand keeps to the same strip. The very first arrangement is simply there, with no
  motion: the map has no earlier shape to glide from.

  None of the three is a mode: an expand afterwards still only adds people around the one
  expanded, and the choice is not remembered across a reload (saved graph settings are M3).
- **Search & focus:** an in-canvas search field; selecting a result smoothly pans/zooms to
  that node and pulses it. The suggested names are drawn above the rest of the toolbar: on a
  narrow window the chip row wraps underneath the field, and a name a chip covers cannot be
  read or clicked.
- **Connection path:** choosing a second person animates the connecting nodes/edges into
  view and de-emphasizes everything else, so the chain reads instantly.
- **Selection & peek:** selecting a node dims the rest, highlights its neighborhood, and
  opens a side peek panel (summary + the way to the node's own page: *Open profile* for a
  person, *Open the circle* for a circle).
- **Theme-aware:** all node/edge/label colors read from the semantic tokens so it matches
  Latte/Mocha; respects reduced motion (no continuous physics; expansion animations become
  instant when set). Keyboard-operable with a list-based fallback (§5.9).
- **Embedded on a person's page** (§5.5) the same component runs with a narrower brief
  (`compact`, `maxRings`): this person stays in the middle, the map reaches **two hops**
  (`PERSON_MAP_RINGS`) and a node on the last ring offers *Open in the graph* where it would
  otherwise offer *Expand* — a card-sized map is not a way to walk the household. The toolbar
  keeps the Filter menu (which is the legend, with the Labels switch) and the Arrange menu —
  a single small row — and drops what is about
  travelling elsewhere: the find-a-person field, because the page has its own search, and the
  two-ended connection path — a profile asks that question with a picker and hands it here
  (§5.5), rather than offering a trace that could only reach inside its own two hops. One label for one action — *Open in the graph* is the same words on the card
  header and in the peek panel, since it does the same thing in both. Nothing is selected on arrival, since the page's header already names the
  person and the peek panel would cover the map; circles start switched **off**, because they
  double the node count for something the profile lists anyway.
- **What the page is handed:** its own slice, not the household. `personMap` cuts two hops out
  of the same access-scoped snapshot the route reads (kinship is inferred over the whole
  visible graph, so a slice cut earlier could name the wrong relative), and the browser gets
  only that. Enough that expanding a neighbour needs no round-trip.
- **How it arrives:** the plain SVG ego graph is server-rendered and shown first; the engine is
  fetched afterwards and takes its place when ready (`RelationshipMap`). The map is never an
  empty box waiting on 400 KB, and a browser that never finishes the fetch keeps the SVG —
  which is the fallback rather than an error state.
- **It follows a save:** entering or retyping a relationship re-runs the page's load, and the
  map redraws from that fresh slice — the shape beside the list never disagrees with the list
  (`e2e/person-map.spec.ts`). What the reader had expanded stays expanded (`rebuildExplored`
  replays it against the new snapshot, skipping anything the new slice no longer reaches from
  the centre); a traced chain is dropped, because it described the links as they were. A
  removal is the one that waits: the row goes at once but the link is still recallable, so the
  map drops the node when the undo window commits it (§2.23), not while it is pending.

## 5.9 Accessibility checklist

- AA contrast for text in both themes, **enforced by test**: `src/lib/design/color.test.ts`
  parses `app.css`, resolves each token and holds the pairs the interface actually renders —
  the three text steps on each surface, and `--fg` on every accent tint — to 4.5:1.
- One measured gap, stated rather than papered over: `--fg-subtle` on the page ground is
  4.1:1. It cannot go darker without becoming `--fg-muted`, so there it is reserved for meta
  that repeats what is already on screen (day dividers, relative timestamps), held to the
  3:1 large-text floor by test.
- The explorer's lines clear 3:1 on the canvas in both themes (§5.8); the labels of
  interaction kinds are written in `--fg` with only the icon in the kind's colour, since
  peach and green text sat at 2.5–2.8:1 on the page ground (§5.6).
- Visible focus rings (`--focus-ring`), logical tab order, skip-to-content.
- All actions reachable without a pointer; graph has a list-based fallback view.
- Respect `prefers-reduced-motion`; no motion-only information.
- Form fields labeled; errors announced; adequate touch targets (≥44px).
- `<html lang>` carries the language the page was rendered in, so a screen reader speaks
  German with German phonemes rather than reading it as English (docs/02 §2.19).

## 5.10 Iconography & imagery

- **Lucide**, self-hosted via `@lucide/svelte`, is the only icon set — no emoji in the
  interface, where they never matched the stroke weight of anything around them.
- Icons are addressed **by meaning, not by glyph**: `src/lib/components/icons.ts` maps names
  like `journal`, `explore`, `private` to components, and everything renders through
  `Icon.svelte` so size and stroke weight stay consistent. Swapping in a better icon for the
  same job is a one-line change.
- Icons are decorative by default (`aria-hidden`), because they sit next to a visible label;
  an icon-only control passes a `label` and gets a real accessible name.
- **Logo:** the branching-graph mark in `Logo.svelte`, in the sidebar and on the auth screens.
- **Avatar fallback:** initials on a deterministic accent derived from the contact id, mixed
  over `--card` so an avatar stays opaque inside a stack, with the initials in `--fg` (§5.2.2).
- Empty states use friendly copy and a clear primary action, never a dead end.
