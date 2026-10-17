# Concept: private entries veiled on screen

Status: **proposal, waiting for the maintainer's choices (§6).** Mockup:
[private-blur.html](private-blur.html) (variants A/B/C, Latte/Mocha, phone and desktop; URL
params `?variant=a|b|c&theme=latte|mocha`). Once built, the rules move into docs/02 §2.10,
docs/05 and the screen files, and this file is deleted.

---

## 1. What exists today

- **Private is about who sees a record** (docs/02 §2.10): a private note, moment, touchpoint,
  photo, person or circle is visible to its creator alone, admins included. Each one carries a
  small *Private* mark (`common.privateInline`, the `private` lock icon) wherever it shows:
  the person page's notes (`NoteItem`) and story (`StoryTimeline`), the journal page, photo grid
  and lightbox, mentions, the home stream, the contacts and circles lists, kept offline items.
- **For its author, a private entry reads like any other.** Its full text is on screen
  whenever the page is: someone looking over the shoulder, or a phone handed round to show a
  photo, reads it too.

## 2. The goal, and what it is not

- **Goal:** a private entry's content stays blurred until its author asks for it, so a glance
  at the screen shows *that* something private is there, never *what*.
- **Not access control.** The access layer (docs/03 §3.7) already keeps everyone else out. The
  veil guards the author's own screen. Every variant except a server-side C keeps the text in
  the page; a determined person at the unlocked device could still read it. That is accepted:
  the threat is a glance, not an attacker.

## 3. Proposal

1. **What is veiled:** the **title, text and picture** of every record that carries the
   *Private* mark: notes, moments (journal entries), touchpoints and photos. The **kind, day,
   author and the mark stay readable**, so the story still reads in order and you know where
   to tap.
2. **Not veiled:** a private **person's or circle's name** (you need it to find them; their
   page's private children are veiled like any other), gift rows (no visibility of their own),
   and everything shared.
3. **Reveal: variant B (recommended).** Tapping a veil shows that one entry; a *Hide* next to
   its mark blurs it again. The page header's lock (*3 private*) shows every private entry, on
   every page, for **five minutes**; meanwhile it reads *Private shown · 4:59* and a tap locks
   again. A tap's reveal lasts until you leave the page.
   - *A* is B without the header lock: lightest, but tedious on a page with many.
   - *C* asks for the device's unlock (WebAuthn passkey: fingerprint, face, PIN) before any
     reveal, then shows everything for five minutes. See §5.
4. **It locks itself.** Stella going to the background (`visibilitychange` → hidden) blurs
   everything again at once, whatever was shown. Nothing stays open for whoever picks up the
   phone next.
5. **Editing shows it.** Opening the editor on a private note or touchpoint reveals it; the
   author is writing it anyway. The composer never veils what is being typed.
6. **Search and the palette:** a private hit shows its kind and person, with the snippet
   veiled the same way. Search still finds private text (it is the author's search).
7. **Accessibility:** while veiled the content is `aria-hidden` and not selectable, and the
   veil is a real button announced *Private note, hidden. Show*. To keep Ctrl+F from finding
   veiled words, the veiled text is a placeholder of the same length, and the real text is
   swapped in on reveal. The unveil animation (blur fading out, 250 ms) follows reduced motion
   (docs/05 §5.11).
8. **Offline:** A and B are pure client state, so they work offline unchanged. Nothing is
   stored; the five-minute window lives in memory for the tab.
9. **A per-member switch?** Proposed: a *Blur my private entries* switch in Settings, **on by
   default**, for a member who keeps Stella on a device nobody else sees. (This is a display
   preference, not a default visibility, so it doesn't touch *shared by default*.)

## 4. Shape of the build

- **Pure decision** `src/lib/privacy/veil.ts`: given the record's visibility, the per-tap
  reveals, the window's end and *now*, say whether it is veiled. Test-first, no clock of its
  own (now is passed in).
- **Browser adapter** `veil.svelte.ts`: the runes state (tapped ids, window end), the
  `visibilitychange` listener, the timer that ends the window; one instance per app shell,
  read through context.
- **One component** `ui/Veil.svelte` wrapping the content; `NoteItem`, `StoryTimeline`, the
  journal page, `PhotoGrid`/lightbox, `MentionsSection`, the home stream and search use it.
  The header lock lives in the app shell's page header, shown only when the page holds a
  veiled entry.
- **No data model change** for A/B, apart from the Settings switch (one boolean on the member's
  preferences, docs/03). C adds a `passkey` table (credential id, public key, member, device
  label) and register/verify endpoints.
- **Slices:** (1) the veil and tap-to-reveal on the person page, journal and stream; (2) the
  header lock and the five-minute window; (3) search, palette, photos and the lightbox; (4)
  the Settings switch. C, if wanted, is its own later slice.

## 5. Variant C, honestly

- **Needs a passkey per device**, set up in Settings, because Stella signs in through
  Authelia and has no WebAuthn of its own yet. A device without one falls back to B.
- **Two ways to build it, neither free.** *On-device only:* the browser prompts for the
  fingerprint against a locally generated challenge; works offline, but the text is already in
  the page, so it guards the screen exactly as much as B does, with more friction. *Server
  verified:* private text is sent only after a fresh assertion, so it is real protection; then
  a private entry can't be read offline (docs/02 §2.18) and every page with private entries
  needs a second request.
- So C is worth it only if the aim moves from *shoulder-surfing* to *someone holding my
  unlocked phone*. Recommendation: build B now and keep C written down.

## 6. Open for the maintainer

1. **Reveal variant:** A, B (recommended) or C?
2. **Titles:** blur them with the text (recommended — *The loan* already says a lot), or keep
   them readable as a hint?
3. **Settings switch** to turn the veil off for a member (recommended, on by default), or
   always on?
4. **Photos:** veil private photos too (recommended), or text only?
