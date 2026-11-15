# TODO

Open implementation work, in order. A finished item is deleted in the PR that finishes it.

## Photos in a diary entry (owner request 2026-11-13)

Step 1 (adding and removing own photos while editing a moment) is built. Left:

- **Immich photos as a reference in the composer.** The moment editor already refers to Immich
  photos instead of copying them (ADR-132); the composer, which writes through the offline
  outbox, still copies. Make its *From Immich* a reference too, the outbox carrying the signed
  tokens.

## e2e gaps (analysis 2026-11-15)

Each is one PR; the owner OKs the behaviour first (`docs/dev/08` §8.4.1).

- **Privacy across members** (§2.10): `privacy-across-members.spec.ts` — a private person stays invisible to the second member in People, search, graph, stream and relationships (with a positive control), plus the shared → private warning.
- **A moment across several people** (§2.20.3) and **photos while editing a moment**: `journal-subjects.spec.ts` for subjects in each journal, the Home offer, the stream row and the lock chip; a case for adding and removing photos in the editor.
- **Family-name correction** (§2.2.4.7) and the **notices** *renamed* and *last names given* (§2.11).
- **Contact-field links** (§2.3): `tel:`, `mailto:`, social, URL and map link; also move the `new Date()` specs (`gallery`, `mentioned-in`, `note-date`) to fixed days or `page.clock`, replace the `concepts/review-2026-11.md` citation in `ux-shell.spec.ts`, and merge the three duplicated unlink helpers.
- **A report-only `scripts/spec-coverage.sh`**: lists each `docs/dev/features` subsection that no e2e header cites and that is not marked unit.
- **SSO sign-in** (§2.1.2): an OIDC stub like `release-feed-stub.ts` and an e2e for the sign-in.
- **Flaky `pwa-offline.spec.ts:216`**: failed once in #500's CI and passed on retry; find the race (no sleeps, no wall clock, §8.4.2).
- **`home-and-people.spec.ts` on a phone (lines 140, 194) against `gift-list.spec.ts`**: the latter adds a person born tomorrow, who can push the demo's Pirmin Quellet and Yannick Zwahlen out of the five-row *Coming up*; both pass alone (seen 2026-11-15).
