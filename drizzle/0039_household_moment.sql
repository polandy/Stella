CREATE TABLE `journal_subject` (
	`journal_entry_id` text NOT NULL,
	`contact_id` text NOT NULL,
	PRIMARY KEY(`journal_entry_id`, `contact_id`),
	FOREIGN KEY (`journal_entry_id`) REFERENCES `journal_entry`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `journal_subject_contact_idx` ON `journal_subject` (`contact_id`);--> statement-breakpoint
DROP INDEX `journal_day_slot`;--> statement-breakpoint
ALTER TABLE `journal_entry` ADD `subject_key` text NOT NULL DEFAULT '';--> statement-breakpoint
UPDATE `journal_entry` SET `subject_key` = `contact_id`;--> statement-breakpoint
CREATE UNIQUE INDEX `journal_day_slot` ON `journal_entry` (`subject_key`,`created_by`,`entry_date`,`visibility`);