CREATE TABLE `suggestion_dismissal` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`relation` text NOT NULL,
	`pair_key` text NOT NULL,
	`dismissed_by` text NOT NULL,
	`dismissed_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dismissed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suggestion_dismissal_claim` ON `suggestion_dismissal` (`household_id`,`relation`,`pair_key`);