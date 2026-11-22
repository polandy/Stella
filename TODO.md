# TODO

Open implementation work, in order. A finished item is deleted in the PR that finishes it.

## TypeScript 7 (after the SvelteKit 3 migration, 2026-11-19)

`typescript` stays on 6.0.3 and `.github/dependabot.yml` ignores its major: SvelteKit 3 peers on
TypeScript 6, and TypeScript 7 (the native compiler) has no `ts.sys`, which Kit's sync reads.
Move once Kit supports it, and drop the ignore.

## Gifts: givers, occasions and stock (owner study 2026-11, ADR-140)

PR 1, the giver on a gift, PR 2, the card by occasion with *Erledigt* / *Besorgt…* and
`stored_at`, and PR 3, *Nachtragen…* (docs/dev/02 §2.25.9, §2.25.13, §2.25.14), are done. The rest, one PR each, in order:

- **The rest of the card**: *Für jemand anderen…* on a bought gift (D22); *Verschenkt* with a
  giver takes the occasion's day as its default, the story line says *Bekommen von Sandra*, and
  *Already given* names the giver.
- **`/gifts` by occasion**: every recipient, the tally; the household list shows
  the giver.
- **The giver's *Schenkt* tab** on every person, with *+ Tomy schenkt…* and a brief line. Its access
  test: a gift kept from its recipient stays hidden in every read by giver.
- **Stock** (`gift_stock`, `stock.assign`), its own ADR.
- **Share ideas…**: free ideas exclude *Wir* and procured ones.
- **Home and calendar wording**: *Ready:* only ours, done gifts leave the feed.
- **A giver on an idea for several** (`gift_group`): PR 1 sets it per gift only.

## e2e gaps (analysis 2026-11-15)

Each is one PR; the owner OKs the behaviour first (`docs/dev/08` §8.4.1).

- **A report-only `scripts/spec-coverage.sh`**: lists each `docs/dev/features` subsection that no e2e header cites and that is not marked unit.
