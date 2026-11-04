## 5.5.10 Empty states and moving between screens

### Intent

Three things every screen shares: what a reader sees where there is nothing yet, where an
address that leads nowhere lands, and what they see when they go from one screen to the next. An empty place should say what belongs there and
offer the step that fills it; moving between screens should feel like staying in one place.

### Rules

#### Empty states

- Empty states are one component, `EmptyState`: a large icon in the subtle colour, a line
  naming what belongs here, and the one action that starts it — never a bare "nothing here".
- A band that is absent when empty (*Coming up*, §5.5.1) does not use it.
- **The action is the next step, made specific**: a search that found nobody offers *Add
  "Lukas"* with the name carried over (global search, the People filter); a circle search
  offers *Create "…"*; an empty circle *Add people*; an empty journal *Write the first moment*;
  a graph centred on somebody with no links *Add a relationship*.
- Where the action needs something that is not there yet, it offers that instead — an empty
  circle in a household with nobody to add offers *Add person*.
- An action that would duplicate a form already open is left out.
- **`compact`** is the same invitation inside a card that holds other things: a small icon
  beside the words and the action after them. A person's People card uses it in place of the
  map while they have no links.
- **The copy names the person** where there is one: *Lena is not linked to anyone yet*, not a
  bare *Not linked yet.* Photos and Notes are the one-line exception (`docs/05` §5.5, *Empty
  cards*): their sentence stays generic so it fits beside the title on a phone.
- A no-match state that replaces a filtered list sits in a `role="status"` wrapper.

#### An address that leads nowhere

- A missing person, circle or setting, or any address no route answers, lands on Stella's own
  screen (`StrandedScreen`, `src/lib/ui/stranded.ts`), never the bare status: an `EmptyState`
  whose title is the page's `<h1>` and whose action is the way to the list it belonged to —
  *This person is no longer here* + *All people*, *This circle is no longer here* + *All
  circles*, *This setting does not exist* + *Settings*, else *This page does not exist* +
  *Home*.
- `/settings/immich` on a Stella without Immich says *Immich is not connected*, that whoever
  runs Stella connects it on the server, and offers *Settings*.
- Inside the app it renders in the shell (`(app)/+error.svelte`), so the tab bar and the parent
  crumb stay; an address outside every route gets the same screen without the shell.
- Any other failure says *Something went wrong* with the server's own message (in the reader's
  language, with its reference) and offers *Home*.

#### Between screens

- The app cross-fades between screens (`document.startViewTransition`, 160 ms).
- The shell skips the cross-fade under `prefers-reduced-motion` and in browsers without the API.
- No skeleton loaders.

### Why

A stale link — from the calendar feed, a share, a person merged away — is the commonest way
to reach a page that is gone; without the shell the reader had no way back but the browser's.

`compact` exists so the invitation does not push the rest of a card away. The `role="status"`
wrapper lets a screen reader hear the list go empty while the reader types.

The cross-fade makes a list and the person it opens read as one place. There are no skeleton
loaders because pages are server-rendered from a local SQLite file, so there is no in-between
state to draw.
