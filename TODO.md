# TODO

Open implementation work, in order. A finished item is deleted in the PR that finishes it.

## One moment about several people (docs/02 §2.20.3, ADR-131)

1. **The composer offer.** `MomentComposer` on the person page and on Home (once an anchor
   exists): *＋ Sandra, Lea & Tim · live with Markus* from `home_member`, one offer per home,
   *＋ Person*, removable chips, *· goes to 4 journals*; a private person greyed unless
   *Private*. `moment.capture` takes optional `subjectIds`; older kept commands stay
   single-person. EN + DE copy, `docs/using-stella.md`.
