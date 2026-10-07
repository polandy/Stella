# Concept — Welcome animation on start

Status: **proposed, not built.** Asked for by the maintainer on 2026-10-08; the four choices in
§6 were made with them the same day. Mockup: `docs/concepts/welcome-animation.html` (Latte and
Mocha, phone and desktop, slow motion, reduced motion, and both exits under §3.3).
Roadmap: docs/06 M3, *Welcome animation*.

---

## 1. Why

Opening Stella should feel like opening *our* place, not a generic web page. The logo is
already a small constellation of people joined by threads. Letting it **come together**, once,
when the app starts gives Stella a face without costing a second of anyone's time.

---

## 2. When it shows

- **On a cold start, once per session**: the installed PWA launched from the home screen, or
  Stella opened in a new browser tab.
- **Not** on navigation inside the app, **not** on a reload in the same tab, **not** when the PWA
  comes back from the background, and **not** on the sign-in redirect round trip (OIDC/Authelia
  returns into the same tab, so the session flag is already set).
- The rule is a `sessionStorage` flag, `stella-welcomed`. The browser keeps it for exactly this
  span: one tab, surviving reloads, gone with the tab or the PWA's window.
- The sign-in page counts as a start too. A first visit that lands on `/login` gets the
  animation there.

---

## 3. What it shows

### 3.1 The sequence (≈ 1.2 s, then 200 ms out)

The mark is drawn at about 96 px (phone) or 112 px (desktop), centred on `--bg`, with the
wordmark *Stella* under it. Nothing else is shown.

| ms | what happens |
|---|---|
| 0–260 | the **pink centre node** pops in (scale 0 → 1, slight overshoot) |
| 170–520 | the three **threads from the centre** draw outwards, to mauve, blue and yellow |
| 420–740 | those three **nodes** pop in as their thread reaches them |
| 500–730 | the last **thread** draws on from blue to peach |
| 680–940 | the **peach node** pops in, and the constellation is complete |
| 700–1220 | a soft **halo** ripples once from the centre node and fades |
| 620–940 | ***Stella*** fades in and rises 6 px, its letter spacing settling |
| 1150–1350 | the whole overlay **fades out** (`--motion-fade`) and the app is there |

The threads use `--ease-standard`. The nodes use their own small overshoot curve: the pop is
what makes a node read as a star lighting up rather than a dot appearing. This is the only
place with an easing of its own, which §5.11.4 allows because the welcome is not an in-place
change.

### 3.2 Colours

The same semantic tokens as `Logo.svelte`: `--accent-teal` threads; `--accent-pink`, `-mauve`,
`-yellow`, `-blue` and `-peach` nodes; `--fg` wordmark; `--bg` backdrop. They come out as
Latte or Mocha according to the stored theme, which `app.html` already applies before the first
paint, so there is no flash. The PWA manifest's `background_color` is the same `--bg`, so the
step from Android's own launch screen into the animation is seamless.

### 3.3 The exit — **open, see the mockup**

- **A — fade (recommended):** the overlay fades out in place, 200 ms. This is calm and works on
  every page, including `/login`, which has no top bar.
- **B — dock into the bar:** the mark shrinks and flies into the top bar's logo while the
  backdrop fades out. It ties the welcome to the app, but it needs the bar logo's position
  before the app has hydrated, and it has nowhere to fly on `/login`.

---

## 4. Rules

- **It never waits on anything.** The overlay sits above the server-rendered page, which loads
  and hydrates underneath. When the animation ends, the page is already there. It holds back
  no request and no hydration.
- **It is skippable.** Any `pointerdown` or key press removes it at once.
- **Reduced motion.** Under `prefers-reduced-motion` nothing moves: the finished mark and
  wordmark stand for 600 ms and are then gone without a fade (docs/05 §5.11.1).
- **It is decorative.** It is `aria-hidden="true"` and takes pointer input only to be skipped. Focus
  and the screen reader start on the page underneath, as if the overlay were not there.
- **No JavaScript bundle dependency.** The overlay is inline SVG and CSS in `src/app.html`,
  plus a few lines of inline script next to the theme init. That script checks and sets the
  flag, and removes the overlay at once when the flag was already set. Only then is the
  animation instant on a cold start, before the app's JS has arrived. The overlay removes
  itself on `animationend`.
- **i18n.** The only text is the product name *Stella*, which is the same in every language. No
  new catalogue entry is needed.

---

## 5. Build notes

- `src/app.html`: the overlay markup and its `<style>`, plus the inline script. The SVG paths are
  the ones in `Logo.svelte` and `static/logo.svg`. A unit test holds the three copies of the
  geometry together, like `icon-art.test.ts` does for the PWA icons.
- The timing table above lives as constants in a small pure module (e.g. `src/lib/motion/welcome.ts`),
  tested. `app.html` cannot import it, so a test reads `app.html` and checks that its delays
  match.
- The session decision (`shouldWelcome(flag, reducedMotion)` → `'animate' | 'still' | 'skip'`)
  is pure and unit-tested. The inline script mirrors it in a few lines.
- E2e (after the owner's OK): a fresh context shows the overlay and it is gone after the
  sequence; a reload shows none; reduced motion shows the still mark. All of these use the Web
  Animations API's `currentTime` rather than waiting, so no test sleeps.
- Docs: docs/05 §5.11.4 gets *the welcome on start* as its own case, and docs/02 gets a short
  paragraph under the PWA/shell section. `using-stella.md` gets a line.

---

## 6. Decisions (maintainer, 2026-10-08)

| | question | decided |
|---|---|---|
| Q1 | when | cold start, once per session |
| Q2 | style | the constellation comes together: centre node, threads, nodes, wordmark |
| Q3 | length | short, about 1.2 s, skippable; reduced motion shows the still mark |
| Q4 | text | only *Stella*, no personal greeting |
| Q5 | exit | **open**: A fade (recommended) or B dock into the bar (§3.3) |
