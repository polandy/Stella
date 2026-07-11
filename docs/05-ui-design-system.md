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

Components consume **semantic** CSS variables, never raw flavor colors. Each theme maps
Catppuccin → semantics. Defined in `app.css`:

```css
:root, :root[data-theme="light"] {           /* Latte */
  --ctp-base: #eff1f5;  --ctp-mantle: #e6e9ef; --ctp-crust: #dce0e8;
  --ctp-surface0:#ccd0da; --ctp-surface1:#bcc0cc; --ctp-surface2:#acb0be;
  --ctp-overlay0:#9ca0b0; --ctp-overlay1:#8c8fa1; --ctp-overlay2:#7c7f93;
  --ctp-text:#4c4f69; --ctp-subtext1:#5c5f77; --ctp-subtext0:#6c6f85;
  --ctp-mauve:#8839ef; --ctp-blue:#1e66f5; --ctp-green:#40a02b;
  --ctp-yellow:#df8e1d; --ctp-red:#d20f39; --ctp-peach:#fe640b;
  /* …remaining accents… */

  /* semantic layer */
  --bg: var(--ctp-base);
  --bg-elevated: var(--ctp-mantle);
  --bg-sunken: var(--ctp-crust);
  --card: var(--ctp-mantle);
  --border: var(--ctp-surface0);
  --fg: var(--ctp-text);
  --fg-muted: var(--ctp-subtext0);
  --fg-subtle: var(--ctp-overlay1);
  --primary: var(--ctp-mauve);           /* brand accent */
  --primary-fg: #ffffff;
  --focus-ring: var(--ctp-lavender);
  --success: var(--ctp-green);
  --warning: var(--ctp-yellow);
  --danger:  var(--ctp-red);
  --link:    var(--ctp-blue);
}

:root[data-theme="dark"] {                    /* Mocha */
  --ctp-base:#1e1e2e; --ctp-mantle:#181825; --ctp-crust:#11111b;
  --ctp-surface0:#313244; --ctp-surface1:#45475a; --ctp-surface2:#585b70;
  --ctp-overlay0:#6c7086; --ctp-overlay1:#7f849c; --ctp-overlay2:#9399b2;
  --ctp-text:#cdd6f4; --ctp-subtext1:#bac2de; --ctp-subtext0:#a6adc8;
  --ctp-mauve:#cba6f7; --ctp-blue:#89b4fa; --ctp-green:#a6e3a1;
  --ctp-yellow:#f9e2af; --ctp-red:#f38ba8; --ctp-peach:#fab387;
  /* …remaining accents… */
  --primary-fg: #1e1e2e;                  /* dark text on light accent */
  /* semantic vars inherit the same names, now resolving to Mocha */
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { /* apply Mocha when system is dark and no explicit light */ }
}
```

Tailwind is configured so utilities reference these variables (e.g.
`colors.primary = 'var(--primary)'`), so class names like `bg-card`, `text-fg-muted`,
`ring-focus` work in both themes automatically.

### 5.2.3 Accent color choice

- **Primary accent defaults to `mauve`** (Catppuccin's signature).
- Users may pick a different accent (`user.accent_pref`) from the accent set; it only
  remaps `--primary`/`--focus-ring`, so contrast stays managed.
- Relationship categories, tags, and interaction kinds each map to a **fixed accent**
  for consistency across list, profile, and graph (see 5.6).

## 5.3 Typography, spacing, radius, elevation

- **Type:** a friendly humanist sans (e.g. **Inter**), self-hosted (no external CDN, per
  §4.7). Optional monospaced accents (JetBrains Mono) for dates/keys. System-font
  fallback stack for a zero-FOIT baseline.
- **Scale (rem):** 0.75 / 0.875 / 1 / 1.125 / 1.25 / 1.5 / 1.875 / 2.25. Comfortable line
  length (~65ch) for note bodies.
- **Spacing:** 4px base grid (Tailwind default).
- **Radius:** soft, consistent — `--radius: 0.75rem` for cards, full round for avatars
  and pills.
- **Elevation:** low, tinted shadows over hard borders; cards sit on `--card` above
  `--bg`. Dark theme leans on surface steps rather than heavy shadow.

## 5.4 Layout & navigation

- **App shell:**
  - **Desktop:** left sidebar (Home/Dashboard, Contacts, Graph, Circles, Reminders, Search, Settings),
    a top bar with global search (`/` or ⌘K) and the quick-add button, content area.
  - **Mobile:** bottom tab bar (Contacts, Graph, Add, Feed, Search); quick-add is the
    prominent center action. Sidebar collapses to a drawer.
  - **Breadcrumb trail** in the top bar, derived from the route + loaded data
    (`Home / Contacts / {name} / Journal`). Every segment links, so Home is always one
    click away; the active destination is marked with `aria-current="page"` in the
    sidebar and tab bar. The account menu (theme + sign out) lives in the shell, not per page.
  - The shell is a single `(app)/+layout.svelte`; pages render content only — no per-page
    headers or back links.
- **Responsive, mobile-first.** Capture flows are optimized for one-handed phone use.
- **Global search palette** (⌘K): fuzzy across contacts/notes with keyboard nav.

## 5.5 Key screens

- **Home / Dashboard** — personal overview (§2.12): panels for recent activity, new
  people, recent notes, gifts given, upcoming dates, "your contributions"; each drills
  down to the detail. Plus quick-add.
- **Contacts list** — searchable, filterable (tag, category, living), avatar-led rows or
  cards; density toggle.
- **Contact profile** — hero header (avatar, name, description, key dates, tags, quick
  actions), then sections: Relationships (grouped, with a mini-graph), Notes (pinned
  first), Interactions timeline, Photos gallery, Contact fields. "Added by / last edited"
  footer.
- **Quick add** — a focused sheet: name, optional photo, "how we met", optional first
  relationship. Everything else deferred.
- **Graph** — full-screen canvas with filter chips, search-to-focus, ego/full toggle,
  legend.
- **Circles** — overview of all circles (§2.4.2): searchable/filterable list with member
  counts and periods, a per-circle member view (roles + dates), and a **visualization** of
  members clustered by circle. Adding a member uses name autocomplete with create-on-the-fly.
- **Reminders** — upcoming birthdays/anniversaries grouped by timeframe.
- **Settings** — account, appearance (theme + accent + reduced motion), household
  (members, invitations, relationship types, tags), data (export/import/backup), auth.
- **Auth** — clean login offering **"Sign in with SSO"** (Authelia) and, if enabled, a
  local email/password form; invite-accept screen.

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
| Success | green · **Warning** yellow · **Danger** red · **Link** blue |

Tags choose from the full accent set. All pairings are verified for AA contrast on their
backgrounds in both themes.

## 5.7 Components (design-system inventory)

Buttons (primary/secondary/ghost/danger), inputs & selects, tag/chip, avatar (+ stack),
card, section header, tabs, modal/sheet, toast, dropdown menu, command palette, empty
states, timeline item, note card, relationship row, photo grid + lightbox, graph legend,
skeleton loaders. All themeable via semantic tokens, all keyboard-accessible.

## 5.8 Relationship & context explorer styling

The explorer (§2.7, core feature) should feel alive and effortless. Interaction detail:

- **Nodes:** people as circular avatars with a name label; **circle nodes** are a distinct
  shape (rounded pill) so contexts read differently from people. Node size can encode
  degree; deceased contacts subtly desaturated.
- **Edges:** styled by kind — relationship category (5.6), **circle membership** (dashed /
  circle-colored), and **derived kinship** (lighter, dotted, clearly "inferred"). Labels
  on hover/zoom; asymmetric relationship types show subtle direction.
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

- AA contrast for text and essential UI in both themes (validated against the token map).
- Visible focus rings (`--focus-ring`), logical tab order, skip-to-content.
- All actions reachable without a pointer; graph has a list-based fallback view.
- Respect `prefers-reduced-motion`; no motion-only information.
- Form fields labeled; errors announced; adequate touch targets (≥44px).

## 5.10 Iconography & imagery

- A single lightweight, self-hosted icon set (e.g. Lucide) for consistency.
- Avatar fallback: initials on a deterministic accent derived from the contact id.
- Empty states use friendly copy and a clear primary action, never a dead end.
