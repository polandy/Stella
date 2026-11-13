# TODO

Open implementation work, in order. A finished item is deleted in the PR that finishes it.

## Photos in a diary entry (owner request 2026-11-13)

Step 1 (adding and removing own photos while editing a moment) is built. Left:

- **Immich photos as a reference in the composer.** The moment editor already refers to Immich
  photos instead of copying them (ADR-132); the composer, which writes through the offline
  outbox, still copies. Make its *From Immich* a reference too, the outbox carrying the signed
  tokens.
