CREATE TABLE `nextcloud_card` (
	`household_id` text NOT NULL,
	`source` text NOT NULL,
	`href` text NOT NULL,
	`uid` text NOT NULL,
	`etag` text NOT NULL,
	`vcard` text NOT NULL,
	`stella_hash` text,
	PRIMARY KEY(`household_id`, `source`, `href`),
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `nextcloud_card_uid_unique` ON `nextcloud_card` (`household_id`,`source`,`uid`);--> statement-breakpoint
CREATE TABLE `nextcloud_conflict` (
	`contact_id` text NOT NULL,
	`kind` text NOT NULL,
	`household_id` text NOT NULL,
	`source` text NOT NULL,
	`stella_value` text NOT NULL,
	`card_value` text NOT NULL,
	`found_at` integer NOT NULL,
	PRIMARY KEY(`contact_id`, `kind`),
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `nextcloud_conflict_household_idx` ON `nextcloud_conflict` (`household_id`);--> statement-breakpoint
CREATE TABLE `nextcloud_sync` (
	`household_id` text NOT NULL,
	`source` text NOT NULL,
	`sync_token` text,
	`synced_at` integer NOT NULL,
	PRIMARY KEY(`household_id`, `source`),
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `user` ADD `kind` text DEFAULT 'member' NOT NULL;