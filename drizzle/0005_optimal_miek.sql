-- The interface language each member reads Stella in (docs/03 §user, docs/02 §2.19).
-- Nullable on purpose: NULL means "has not chosen yet", so the browser's own preference
-- still decides and only a real choice outranks it.
-- drizzle-kit also proposed rebuilding `photo` here, because the snapshots from `0003` on
-- record a cascade on `photo.journal_entry_id` that the database never had — `0002` added
-- that column with a plain reference and could not carry one. The declaration in
-- `schema.ts` already says so; this migration's snapshot records it, and the rebuild was
-- dropped rather than rewriting a table for no change.
ALTER TABLE `user` ADD `locale_pref` text;
