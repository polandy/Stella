CREATE TABLE `journal_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`created_by` text NOT NULL,
	`visibility` text DEFAULT 'shared' NOT NULL,
	`entry_date` text NOT NULL,
	`title` text,
	`body` text NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `journal_contact_idx` ON `journal_entry` (`contact_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `journal_day_slot` ON `journal_entry` (`contact_id`,`created_by`,`entry_date`,`visibility`);