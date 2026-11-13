CREATE TABLE `journal_immich_photo` (
	`journal_entry_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`added_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	PRIMARY KEY(`journal_entry_id`, `asset_id`),
	FOREIGN KEY (`journal_entry_id`) REFERENCES `journal_entry`(`id`) ON UPDATE no action ON DELETE cascade
);
