# TODO

Open implementation work, in order. A finished item is deleted in the PR that finishes it.

## One moment about several people (docs/02 §2.20.3, ADR-131)

1. **Model, domain and reads.** Migration: `journal_subject` (cascade both sides, indexed on
   `contact_id`) and `journal_entry.subject_key` replacing the day-slot unique index (copied from
   `contact_id`). `domain/journal` carries the subject list, keeps `subject_key`, joins entries
   whose people become equal, re-anchors on removing the anchor or deleting a person, moves rows
   on a merge. Reads "about X" everywhere: Activity, journal page, Home's stream row (faces,
   names), *On this day*, *last written about*, search hits, tag pages; *Mentioned in* skips
   subjects. Shared moments only about household-visible people (`allowedForAudience`). The
   editor (`JournalEntryEditor`) gains the chips row; `journal.edit` takes the subjects.
   Archive `subjects` round trip. EN + DE copy, `docs/using-stella.md`.
2. **The composer offer.** `MomentComposer` on the person page and on Home (once an anchor
   exists): *＋ Sandra, Lea & Tim · live with Markus* from `home_member`, one offer per home,
   *＋ Person*, removable chips, *· goes to 4 journals*; a private person greyed unless
   *Private*. `moment.capture` takes optional `subjectIds`; older kept commands stay
   single-person. EN + DE copy, `docs/using-stella.md`.
