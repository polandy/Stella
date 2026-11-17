CREATE TABLE `activity_idea` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`created_by` text NOT NULL,
	`visibility` text DEFAULT 'shared' NOT NULL,
	`hidden_from_person` integer DEFAULT 0 NOT NULL,
	`title` text NOT NULL,
	`note` text,
	`url` text,
	`when_kind` text,
	`when_on` text,
	`when_age` integer,
	`booked_at` integer,
	`booked_by` text,
	`done_at` integer,
	`done_on` text,
	`done_by` text,
	`moment_id` text,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`booked_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`done_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`moment_id`) REFERENCES `journal_entry`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `activity_idea_contact_done_idx` ON `activity_idea` (`contact_id`,`done_at`);--> statement-breakpoint
CREATE INDEX `activity_idea_done_when_idx` ON `activity_idea` (`done_at`,`when_on`);