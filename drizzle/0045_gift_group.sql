CREATE TABLE `gift_group` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`created_by` text NOT NULL,
	`title` text NOT NULL,
	`note` text,
	`url` text,
	`when_kind` text,
	`when_on` text,
	`when_age` integer,
	`occasion` text,
	`visibility` text DEFAULT 'shared' NOT NULL,
	`hidden_from_recipients` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `gift` ADD `group_id` text REFERENCES gift_group(id);--> statement-breakpoint
CREATE INDEX `gift_group_idx` ON `gift` (`group_id`);