CREATE TABLE `entry_tag` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`key` text NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entry_tag_household_key` ON `entry_tag` (`household_id`,`key`);--> statement-breakpoint
CREATE TABLE `journal_entry_tag` (
	`journal_entry_id` text NOT NULL,
	`entry_tag_id` text NOT NULL,
	PRIMARY KEY(`journal_entry_id`, `entry_tag_id`),
	FOREIGN KEY (`journal_entry_id`) REFERENCES `journal_entry`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entry_tag_id`) REFERENCES `entry_tag`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `journal_entry_tag_tag_idx` ON `journal_entry_tag` (`entry_tag_id`);