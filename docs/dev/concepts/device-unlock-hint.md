# Concept: the device-unlock hint after sign-in

Status: **design only, awaiting the owner's go.** Nothing here is built yet. When it is, the
rules move into `docs/dev/features/2.10-privacy-model.md` and
`docs/dev/design/screens/home.md`, and this file is deleted (concept retirement).

Mockup: [`device-unlock-hint.html`](device-unlock-hint.html) — every state, clickable, light
and dark, English and German.

## 1. The problem

Device unlock (docs/dev/02 §2.10.1) lets one fingerprint, face or PIN check show every private
entry for five minutes. It lives only in *Settings · Privacy*, so a member who never opens
Settings never learns it exists and keeps tapping blurs one at a time. The owner wants the
member told about it at the first sign-in.

## 2. When the hint shows

Device unlock is **a fact about this device** (the credential id sits in `localStorage`), so
"first sign-in" is read as **the first time this member uses Stella on this device**. The hint
shows on Home when all of these hold:

1. *Blur my private entries* is on for the member (`user.blur_private`). Off, there is nothing
   to unlock.
2. The browser can do it: a secure context, `PublicKeyCredential` present and
   `isUserVerifyingPlatformAuthenticatorAvailable()` true — the same check Settings makes.
3. Device unlock is **not** set up for this member on this device.
4. The member has not answered it on this device: no *Not on this device*, and no *Later* whose
   week is still running.

So it appears after the first sign-in on a new phone or laptop, after a new member's first SSO
sign-in, and **once for existing members on their devices** after the rollout. A second member
signing in on the same device gets their own hint.

The capability check is asynchronous; the card is **absent until it answers**, so it never
flashes in and out.

## 3. Where and how it looks

- A **card on Home**, at the top of the stream column, the same width as the stream — under the
  first-run card (docs/dev/02 §2.22.3) when both show, because adding people comes first.
- Card anatomy, like the first-run card: a small label *Privacy* in `--fg-muted`, a heading, two
  lines of body, a row of buttons. The `private` (lock) icon in a `--primary-soft` disc on the
  left. No colour alarm: it is an offer, not a warning.
- Buttons, left to right: **Set up device unlock** (primary), **Later** (ghost), **Not on this
  device** (ghost). On a phone they wrap: the primary on its own full-width line, the two
  ghosts side by side under it.
- Not a modal and not a toast: a modal right after sign-in blocks the page the member came for;
  a toast is gone before it is read.

## 4. The answers

| Action | What happens | Stored on the device |
|---|---|---|
| **Set up device unlock** | Runs the Settings flow in place (`navigator.credentials.create`, docs/dev/02 §2.10.1). While the device prompt is open the button reads *Waiting for your device…* and the others are disabled. | the credential id and day (as today) |
| — set up | The card becomes one success line (green tick, `--success-text`): what to tap now, and a ghost **Done**. Done, or leaving Home, removes it for good: condition 3 no longer holds. | — |
| — cancelled or failed | The card stays, with one line in `--danger` above the buttons; the buttons are back. | nothing |
| **Later** | The card goes; a toast says when it comes back and where to find it meanwhile. | `snoozedUntil` = now + 7 days |
| **Not on this device** | The card goes; a toast with **Undo** (the usual window) says Settings still has it. | `never` |

The answer is kept per member on this device:
`localStorage['stella.unlockHint.<memberId>'] = { snoozedUntil: <ISO day> } | 'never'`.
Forgetting device unlock in Settings does **not** bring the hint back: the member has just
chosen against it.

## 5. Without passkey support

A browser without WebAuthn, without a platform authenticator, or Stella over plain http:
**no hint at all**. There is nothing to offer, and Settings already says *This browser can't use
a passkey, so a tap shows a private entry here.* A notice the member cannot act on is noise.

## 6. Texts

| Key (`privacy.hint.*`) | English | Deutsch |
|---|---|---|
| `label` | Privacy | Privatsphäre |
| `title` | Show private entries with your fingerprint, face or PIN | Private Einträge mit Fingerabdruck, Gesicht oder PIN zeigen |
| `body` | Your private entries are blurred against a glance over your shoulder. Set up device unlock, and one check shows them all for five minutes. It uses a passkey in your password manager. | Deine privaten Einträge sind verschwommen, gegen den Blick über die Schulter. Richte die Geräte-Entsperrung ein, dann zeigt eine Bestätigung alle für fünf Minuten. Dafür nutzt Stella einen Passkey in deinem Passwortmanager. |
| `setUp` | Set up device unlock *(reuses `privacy.unlock.setUp`)* | Geräte-Entsperrung einrichten |
| `waiting` | Waiting for your device… | Warte auf dein Gerät … |
| `later` | Later | Später |
| `never` | Not on this device | Nicht auf diesem Gerät |
| `done` | Device unlock is set up on this device. Tap a blurred entry or the lock in the top bar to use it. | Die Geräte-Entsperrung ist auf diesem Gerät eingerichtet. Tippe auf einen verschwommenen Eintrag oder das Schloss oben, um sie zu nutzen. |
| `doneButton` | Done | Fertig |
| `failed` | Device unlock wasn't set up. Try again, or later in Settings · Privacy. | Die Geräte-Entsperrung wurde nicht eingerichtet. Versuch es noch einmal oder später unter Einstellungen · Privatsphäre. |
| `snoozed` | We'll ask again in a week. Settings · Privacy has it any time. | Wir fragen in einer Woche wieder. Unter Einstellungen · Privatsphäre geht es jederzeit. |
| `dismissed` | We won't ask on this device. Settings · Privacy still has it. | Auf diesem Gerät fragen wir nicht mehr. Unter Einstellungen · Privatsphäre geht es weiterhin. |

## 7. How it would be built (for the later implementation PR)

- A pure decision `#lib/privacy/unlock-hint.ts`: `unlockHint({ blurOn, capability, setUp,
  answer, today })` → `'hidden' | 'show'`, and `answerLater(today)` → the stored answer. The day
  is passed in, never read from the clock, so the week is unit-tested without waiting.
- Its browser adapter `unlock-hint.svelte.ts` reads and writes the `localStorage` answer;
  `DeviceUnlockHint.svelte` only draws the card and reuses the Settings set-up call.
- Copy in `privacy.ts` en + de; an e2e spec after the owner's OK (a virtual authenticator via
  CDP covers set-up, cancel, Later and Not on this device).

## 8. Open questions (recommendation first)

1. **Who sees it?** *(a)* every member from the first sign-in on a device, whether or not they
   have a private entry yet **(recommended: it is what was asked, and it is shown once)**;
   *(b)* only once the member has at least one private entry — more relevant, but then it is no
   longer "at the first sign-in".
2. **Where?** *(a)* card on Home **(recommended: seen right after sign-in, not in the way)**;
   *(b)* a one-time sheet over Home after sign-in; *(c)* only at the first tap on a veil, as an
   offer in the toast.
3. **How long does *Later* wait?** *(a)* 7 days **(recommended: sessions last long, so "next
   sign-in" could mean months)**; *(b)* until the next sign-in; *(c)* 30 days.
4. **Existing members after the rollout?** *(a)* yes, once per device **(recommended: they are
   the ones who never found it)**; *(b)* only devices signed in after the rollout.
5. **No passkey support?** *(a)* no hint **(recommended: nothing to act on)**; *(b)* a one-time
   line explaining why device unlock isn't available here.
