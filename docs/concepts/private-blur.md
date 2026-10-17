# Concept: private entries veiled on screen

Status: **decided with the maintainer on 2026-10-17 (§6); nothing built yet.** Mockup:
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

## 3. The design

1. **What is veiled:** the **title, text and picture** of every record that carries the
   *Private* mark: notes, moments (journal entries), touchpoints and photos. The **kind, day,
   author and the mark stay readable**, so the story still reads in order and you know where
   to tap.
2. **Not veiled:** a private **person's or circle's name** (you need it to find them; their
   page's private children are veiled like any other), gift rows (no visibility of their own),
   and everything shared.
3. **Reveal: device unlock (variant C), checked on the device.** Tapping a veil, or the page
   header's lock (*3 private*), asks for the device's own unlock (a WebAuthn passkey:
   fingerprint, face or PIN). Once confirmed, every private entry on every page is shown for
   **five minutes**; meanwhile the lock reads *Private shown · 4:59* and a tap locks again.
   The check stays on the device (§5), so it works offline.
   - **Without a passkey** on this device, or in a browser that can't do one, it behaves as
     variant B: tapping a veil shows that one entry until you leave the page (a *Hide* next
     to its mark blurs it again), and the header lock shows all for five minutes without a
     prompt. Settings suggests *Set up device unlock*.
   - Not chosen: *A* (tap each entry only) and *B* as the main way.
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
8. **Offline:** the veil, the window and the device check are all client-side, so they work
   offline unchanged. The five-minute window lives in memory for the tab, never stored.
9. **A per-member switch:** *Blur my private entries* in Settings, **on by default**, for a
   member who keeps Stella on a device nobody else sees. (This is a display preference, not a
   default visibility, so it doesn't touch *shared by default*.)
10. **Settings · Privacy**, a new section after *You* (mockup: *Screen → Settings*): the switch
    with one line on what it does, and below it, only while the switch is on, *Device unlock on
    this device*:
    - *not set up*: one line (a tap shows an entry for now) and a secondary *Set up device
      unlock*, which opens the device's own passkey prompt; done, a toast;
    - *set up*: a green *Set up* mark, where and since when, and a ghost *Forget on this
      device…* opening the sunken confirm step (docs/05): private entries stay blurred and a
      tap shows them here again, the passkey stays in the phone's password manager, other
      devices keep theirs; **Forget** beside **Keep it** (focused), Escape keeps;
    - *browser can't*: one line saying so; nothing to press.

## 4. Shape of the build

- **Pure decision** `src/lib/privacy/veil.ts`: given the record's visibility, the member's
  switch, the per-tap reveals, the window's end and *now*, say whether it is veiled, and
  whether a reveal needs the device check first. Test-first, no clock of its own (now is
  passed in).
- **Browser adapter** `veil.svelte.ts`: the runes state (tapped ids, window end), the
  `visibilitychange` listener, the timer that ends the window; one instance per app shell,
  read through context.
- **Device unlock adapter** `device-unlock.svelte.ts` behind a small port (`isSetUp`,
  `setUp`, `verify`), so the decision and the components are tested with a fake:
  - *Set up* (Settings): `navigator.credentials.create` with a platform authenticator,
    `userVerification: 'required'`, the member's id as the user handle; the credential id is
    kept in `localStorage`, because being set up is a fact about this device.
  - *Verify*: `navigator.credentials.get` with that credential, a locally generated random
    challenge and `userVerification: 'required'`; success opens the window, a cancel or an
    error leaves everything veiled and says so.
  - *Forget on this device* in Settings drops the stored id (the passkey itself stays in the
    phone's password manager, where the member may delete it).
- **One component** `ui/Veil.svelte` wrapping the content; `NoteItem`, `StoryTimeline`, the
  journal page, `PhotoGrid`/lightbox, `MentionsSection`, the home stream and search use it.
  The header lock lives in the app shell's page header, shown only when the page holds a
  veiled entry.
- **Data model:** one boolean on the member's preferences for the switch (docs/03). No
  passkey table: nothing is verified on the server.
- **Slices:** (1) the veil with tap-to-reveal (the no-passkey behaviour) on the person page,
  journal and stream; (2) the header lock and the five-minute window; (3) device unlock: set up
  in Settings, the prompt before a reveal; (4) search, palette, photos and the lightbox, and
  the Settings switch.

## 5. Device unlock, honestly

- **It guards the screen, not the data.** The private text is already in the page, as in
  every variant; the fingerprint only decides whether the blur lifts. That is what was chosen:
  the threat is a glance or a phone handed round, not someone who takes the unlocked phone and
  opens the developer tools.
- **Why not server-verified:** sending private text only after a fresh assertion would be
  real protection, but a private entry could then not be read offline (docs/02 §2.18), every
  page with private entries would need a second request, and Stella would need a passkey
  table and verify endpoints beside Authelia. Kept written down here in case the aim changes.
- **WebAuthn needs a secure context:** production (https) is fine; the http preview
  (`preview` skill) needs the browser flag or falls back to tap-to-reveal.

## 6. Decisions

Asked and answered on 2026-10-17:

1. **Reveal:** device unlock (C), checked **on the device only** (§5).
2. **Without a passkey:** behave as B (tap one, or show all for five minutes), with a hint in
   Settings to set one up.
3. **Titles** are veiled with the text.
4. **Settings switch** *Blur my private entries*, on by default.
5. **Photos** are veiled too: grid, story, lightbox.
