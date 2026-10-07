## 5.5.10 Empty states and moving between screens

### Intent

Two things every screen shares: what a reader sees where there is nothing yet, and what they
see when they go from one screen to the next. An empty place should say what belongs there and
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

#### Between screens

- The app cross-fades between screens (`document.startViewTransition`, 160 ms).
- The shell skips the cross-fade under `prefers-reduced-motion` and in browsers without the API.
- No skeleton loaders.

### Why

`compact` exists so the invitation does not push the rest of a card away. The `role="status"`
wrapper lets a screen reader hear the list go empty while the reader types.

The cross-fade makes a list and the person it opens read as one place. There are no skeleton
loaders because pages are server-rendered from a local SQLite file, so there is no in-between
state to draw.
