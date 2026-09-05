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
    sidebar and tab bar. The account menu (theme + sign out) lives in the shell, not per page.
  - The shell is a single `(app)/+layout.svelte`; pages render content only — no per-page
    headers or back links.
- **Responsive, mobile-first.** Capture flows are optimized for one-handed phone use.
- **Command palette** (⌘K / Ctrl+K, or the search button): a native `<dialog>` listing
  actions (*Write a moment*, *Add person*) and the people the viewer may see, narrowed as
  you type with arrow keys and Enter; a typed query always ends in *Search everything*, which
  is the full-text search over notes the palette itself does not read. The rows come from a
  pure `paletteRows`; the people arrive with the app shell's `load`, so the first keystroke
  answers without a round trip.

## 5.5 Key screens

- **Home** — the capture field over the household stream (§2.22), with a **rail** on the
  right from `lg` up: **Coming up** (§2.13.3) and **Quiet lately** (§2.12.1), each row an
  avatar, the person, one line of context and the one action — *Write a moment*. Below `lg`
  the rail sits between the heading and the stream as a horizontal strip of cards, so two
  bands never push the stream off a phone screen. Both bands are **absent entirely when
  empty**; there is no empty state for them, because a permanently empty panel teaches people
  to stop looking. On a phone the composer is a **sheet** opened from the *What happened?*
  bar or the tab-bar pencil.
- **People** — a find-as-you-type field, tag chips, then **letter groups** by surname with a
  sticky letter heading; each row is avatar, name (lock for private), description, and
  **last written about** on the right (`—` when nothing has been). The heading counts people;
  *Add person* lives in the shell, not on the page.
- **Contact profile** — **who on the left, what happened on the right.**
  - **Hero:** avatar, name, description, then the facts you came for on one line — when you
    were last in touch, how you met, whether the person is private. Two actions: *Write* (a
    journal entry) and *Log contact* (a touchpoint), the second opening the story's own form.
  - **Profile column** (`19rem`, sticky from `lg`): Contact fields, Dates (§2.13.1), Circles,
    Tags, How we met. Each is a card with **one** disclosure — `+ Add` reveals its form and
    nothing else is open. A form that failed validation opens itself, so the error has a home.
  - **Right column:** tabs *Story · People · Notes*. **Story** is the merged timeline of
    §2.23 — journal entries and touchpoints in one order, a rail with a dot per item coloured
    by kind, *Show earlier* paging back through both sources. **People** lists the
    relationships and hides the ego-graph behind *Show map*, so a person with no interest in
    it does not pay for it on every visit. Below them, **Also related · worked out, not
    entered** (§2.4.1) carries the derived relatives — a divider, a quieter heading and a
    *via* clause keep an inference visually distinct from something the household typed.
    After a link is added, an **Also true?** panel sits above them with what it implies, one
    *Add this too* per line: a suggestion is a sentence with a button, never a checkbox list
    that could be swept in with one click. **Notes** are pinned-first.
  - Below `lg` the two columns stack **story first**: the story is what the page is opened for,
    and the profile follows underneath.
  - Counts sit on a tab only where they are exact; the story is paged, so it carries none.
- **Add a person** — one card: first and last name, description, how and where you met,
  visibility. Nickname and birthday sit behind a *More* disclosure; everything else waits
  for the person's page. The heading says so: *a name is enough*. Once a surname is typed,
  an **Already in Stella?** box (§2.2.1) slides in under the name fields: a sunken panel,
  one line per person — name as a link, the reason in muted text, a *Link as relative*
  radio on the right. It is absent until there is something to say and never steals focus;
  the form submits exactly as before.
- **Graph** — full-screen canvas. The toolbar's filter chips **are the legend**: each draws
  its own line style (solid per category, dashed for circles, dotted for kinship) in its
  token, so a chip and the line it toggles can never disagree, and there is no second box
  to keep in sync. Search-to-focus, connection path, and a **peek panel** that shows the
  person's avatar, name and two actions.
- **Circles** — a grid of **cards** (§2.4.2): colour dot, name, kind and member count, the
  description, and a stack of the first four faces with "+n" for the rest. A circle's page
  puts the members in a **grid** of avatar cards with roles; *Add member* is the card's one
  disclosure, like every other card in the app.
- **Empty states** are one component (`EmptyState`): a large icon in the subtle colour, a
  line naming what belongs here, and the one action that starts it — never a bare "nothing
  here". Bands that are absent when empty (Coming up, Quiet lately) do not use it.
- **Between screens** the app cross-fades (`document.startViewTransition`, 160 ms) so a list
  and the person it opens read as one place; the shell skips it under
  `prefers-reduced-motion` and in browsers without the API. No skeleton loaders: pages are
  server-rendered from a local SQLite file and there is no in-between state to draw.
- *(No reminders screen.)* Upcoming dates live in the **Coming up** band on Home, and the
  dates themselves are edited in the **Dates** section of a person's page — kind, day,
  "year unknown", whether it repeats, and whether it shows on Home. A birthday derived from
  the profile is listed there too, marked *from the profile* and not deletable; an explicit
  birthday row replaces it (docs/02 §2.13.2).
- **Settings** — account, appearance (theme + accent + reduced motion), household
  (members, invitations, relationship types, tags), data (export/import/backup), auth.
  *Today:* a landing page with the **Data** section, and the **Import from Monica** wizard
  (§2.16) as a three-step page — numbered step strip, a count-tile preview with a
  "left out, and why" card, then the import result and a folder picker with a progress bar
  for photos. Admin only; members see why.
- **Auth** — one split shell for sign-in and first-run setup: the brand and one line of
  promise on a sunken panel, the form beside it; on a phone the panel shrinks to a header so
  the form comes first. Sign-in offers **"Sign in with SSO"** (Authelia) and, if enabled, a
  local email/password form; the demo login sits under them while `SEED_DEMO` is on.

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

Buttons (primary/secondary/ghost/danger), inputs & selects, tag/chip, avatar (+ stack),
card, section header, tabs, modal/sheet, toast, dropdown menu, command palette, empty
states, timeline item, note card, relationship row, photo grid + lightbox. All themeable
via semantic tokens, all keyboard-accessible.

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

**Toasts** (`src/lib/components/Toast.svelte`) sit bottom-left of the content column, one
card per message, announced as a polite live region. A removal's toast reads *Entry removed*
or *Interaction removed* with an **Undo** button and stays for the whole undo window (eight
seconds); a plain notice — *Saved*, or why a removal failed — has no button and goes on its
own. Removing needs no confirmation dialog because every removal can be taken back from here
(docs/02 §2.23). On a phone the region sits above the tab bar.

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
  Labels on hover/zoom; asymmetric relationship types show subtle direction.
- **Expand affordance:** an unexpanded node hints it can grow (e.g. a small "+" / count of
  hidden connections); clicking expands its neighborhood in place with a gentle animation.
- **Search & focus:** an in-canvas search field; selecting a result smoothly pans/zooms to
  that node and pulses it.
- **Connection path:** choosing a second person animates the connecting nodes/edges into
  view and de-emphasizes everything else, so the chain reads instantly.
- **Selection & peek:** selecting a node dims the rest, highlights its neighborhood, and
  opens a side peek panel (summary + link to profile).
- **Layouts:** force-directed default; tidy tree for family hierarchies and clustered for
  circles (M2).
- **Theme-aware:** all node/edge/label colors read from the semantic tokens so it matches
  Latte/Mocha; respects reduced motion (no continuous physics; expansion animations become
  instant when set). Keyboard-operable with a list-based fallback (§5.9).

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
