CREATE TABLE `gift` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`created_by` text NOT NULL,
	`visibility` text DEFAULT 'shared' NOT NULL,
	`state` text NOT NULL,
	`title` text NOT NULL,
	`note` text,
	`url` text,
	`given_on` text,
	`occasion` text,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `gift_contact_state_given_idx` ON `gift` (`contact_id`,`state`,`given_on`);