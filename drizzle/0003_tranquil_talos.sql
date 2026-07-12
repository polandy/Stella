CREATE TABLE `journal_mention` (
	`journal_entry_id` text NOT NULL,
	`contact_id` text NOT NULL,
	PRIMARY KEY(`journal_entry_id`, `contact_id`),
	FOREIGN KEY (`journal_entry_id`) REFERENCES `journal_entry`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `journal_mention_contact_idx` ON `journal_mention` (`contact_id`);