-- The interface language each member reads Stella in (docs/03 §user, docs/02 §2.19).
-- Nullable on purpose: NULL means "has not chosen yet", so the browser's own preference
-- still decides and only a real choice outranks it.
-- drizzle-kit also proposed rebuilding `photo` here; both snapshots describe that table
-- identically, so the rebuild was dropped rather than rewriting a table for no change
-- (the same reasoning as the note on `photo.journal_entry_id` in the schema).
ALTER TABLE `user` ADD `locale_pref` text;
