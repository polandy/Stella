# TODO

Open implementation work, in order. A finished item is deleted in the PR that finishes it.

## TypeScript 7 (after the SvelteKit 3 migration, 2026-11-19)

`typescript` stays on 6.0.3 and `.github/dependabot.yml` ignores its major: SvelteKit 3 peers on
TypeScript 6, and TypeScript 7 (the native compiler) has no `ts.sys`, which Kit's sync reads.
Move once Kit supports it, and drop the ignore.

## e2e gaps (analysis 2026-11-15)

Each is one PR; the owner OKs the behaviour first (`docs/dev/08` §8.4.1).

- **Shared → private warning** (§2.10): owner decision open, see issue #548; the e2e follows its answer.
- **Family-name correction** (§2.2.4.7) and the **notices** *renamed* and *last names given* (§2.11).
- **Contact-field links** (§2.3): `tel:`, `mailto:`, social, URL and map link; also move the `new Date()` specs (`gallery`, `mentioned-in`, `note-date`) to fixed days or `page.clock`, replace the `concepts/review-2026-11.md` citation in `ux-shell.spec.ts`, and merge the three duplicated unlink helpers.
- **A report-only `scripts/spec-coverage.sh`**: lists each `docs/dev/features` subsection that no e2e header cites and that is not marked unit.
- **SSO sign-in** (§2.1.2): an OIDC stub like `release-feed-stub.ts` and an e2e for the sign-in.
- **Flaky `pwa-offline.spec.ts:216`**: failed once in #500's CI and passed on retry; find the race (no sleeps, no wall clock, §8.4.2).
- **`home-and-people.spec.ts` on a phone (lines 140, 194) against `gift-list.spec.ts`**: the latter adds a person born tomorrow, who can push the demo's Pirmin Quellet and Yannick Zwahlen out of the five-row *Coming up*; both pass alone (seen 2026-11-15).
