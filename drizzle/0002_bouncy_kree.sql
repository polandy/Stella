ALTER TABLE `photo` ADD `journal_entry_id` text REFERENCES journal_entry(id);--> statement-breakpoint
CREATE INDEX `photo_journal_idx` ON `photo` (`journal_entry_id`);