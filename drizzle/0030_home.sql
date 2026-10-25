CREATE TABLE `home` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`label` text,
	`value` text NOT NULL,
	`meta` text,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `home_household_idx` ON `home` (`household_id`);--> statement-breakpoint
CREATE TABLE `home_member` (
	`home_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	PRIMARY KEY(`home_id`, `contact_id`),
	FOREIGN KEY (`home_id`) REFERENCES `home`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `home_member_contact_idx` ON `home_member` (`contact_id`);