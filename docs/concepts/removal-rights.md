# Concept — Who may remove what

Status: **built, all four slices** — decided with the maintainer on 2026-10-10. Removing and
editing a note, removing the other authored kinds and editing a touchpoint are built: their
rules live in docs/02 §2.5, §2.6, §2.10, §2.11, §2.14, §2.20, §2.23 and docs/03 §3.7 and
`activity_log`, and are not repeated here. Only the finding below is left, for a separate
refactor PR; once it is built this file is deleted.

---

## 6. Finding outside the scope

Removing an **important date** or a **contact field** goes from the route straight to the
repository: `actions/dates.ts:63` and `actions/fields.ts:96` call
`locals.services.records.{importantDates,contactFields}.remove`. That skips the domain layer.
`removeImportantDate` (`domain/dates/important-dates.ts:126`) is never called.

It is **not an access bypass**. Both actions check that the viewer sees the person first, and
the delete pins `contact_id`, so a foreign id touches nothing. Decided 2026-10-10: kept as a
TODO for a small separate refactor PR. That PR routes both removals through domain use-cases
that take the viewer and check visibility themselves.
