# TODO

Open implementation work, in order. A finished item is deleted in the PR that finishes it.

## TypeScript 7 (after the SvelteKit 3 migration, 2026-11-19)

`typescript` stays on 6.0.3 and `.github/dependabot.yml` ignores its major: SvelteKit 3 peers on
TypeScript 6, and TypeScript 7 (the native compiler) has no `ts.sys`, which Kit's sync reads.
Move once Kit supports it, and drop the ignore.

## e2e gaps (analysis 2026-11-15)

Each is one PR; the owner OKs the behaviour first (`docs/dev/08` §8.4.1).

- **A report-only `scripts/spec-coverage.sh`**: lists each `docs/dev/features` subsection that no e2e header cites and that is not marked unit.
