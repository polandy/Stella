-- The interface language each user reads Stella in (docs/03 §user, docs/02 §2.19).
-- drizzle-kit also proposed rebuilding `photo` here; both snapshots describe that table
-- identically, so the rebuild was dropped rather than rewriting a table for no change
-- (same reasoning as the note on `photo.journal_entry_id` in the schema).
ALTER TABLE `user` ADD `locale_pref` text DEFAULT 'en' NOT NULL;
