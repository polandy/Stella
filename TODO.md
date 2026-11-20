# TODO

Open implementation work, in order. A finished item is deleted in the PR that finishes it.

## TypeScript 7 (after the SvelteKit 3 migration, 2026-11-19)

`typescript` stays on 6.0.3 and `.github/dependabot.yml` ignores its major: SvelteKit 3 peers on
TypeScript 6, and TypeScript 7 (the native compiler) has no `ts.sys`, which Kit's sync reads.
Move once Kit supports it, and drop the ignore.

## e2e gaps (analysis 2026-11-15)

Each is one PR; the owner OKs the behaviour first (`docs/dev/08` §8.4.1).

- **Shared → private warning** (§2.10): owner decision open, see issue #548; the e2e follows its answer.
- **Cleanup of the older e2e specs**: the `new Date()` specs (`gallery`, `mentioned-in`, `note-date`) wait on issue #556 (the server stamps the day, so `page.clock` cannot pin it). The map link and social links of §2.3 wait on issue #554 (the e2e for `tel:`, `mailto:` and URL is in).
- **A report-only `scripts/spec-coverage.sh`**: lists each `docs/dev/features` subsection that no e2e header cites and that is not marked unit.
- **`home-and-people.spec.ts` on a phone (lines 140, 194) against `gift-list.spec.ts`**: the latter adds a person born tomorrow, who can push the demo's Pirmin Quellet and Yannick Zwahlen out of the five-row *Coming up*; both pass alone (seen 2026-11-15).
