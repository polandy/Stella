# TODO

Open implementation work, in order. A finished item is deleted in the PR that finishes it.

## TypeScript 7 (after the SvelteKit 3 migration, 2026-11-19)

`typescript` stays on 6.0.3 and `.github/dependabot.yml` ignores its major: SvelteKit 3 peers on
TypeScript 6, and TypeScript 7 (the native compiler) has no `ts.sys`, which Kit's sync reads.
Move once Kit supports it, and drop the ignore.

## Gifts: givers, occasions and stock (owner study 2026-11, ADR-140)

PR 1, the giver on a gift, is done (docs/dev/02 §2.25.12). The rest, one PR each, in order:

- **Card grouped by occasion, done and procured**: *Erledigt* / *Besorgt…* by giver, `stored_at`
  with a places sheet, the tally *erledigt · vergeben · frei*, *Für jemand anderen…*.
- **Nachtragen**: the batch sheet for gifts given at a passed occasion, *Für: Uns* as received.
- **`/gifts` by occasion**: every recipient, the tally, *Nachtragen…*; the household list shows
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
