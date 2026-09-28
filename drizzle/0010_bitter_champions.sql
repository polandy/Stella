CREATE TABLE `command_receipt` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`member_id` text NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`result` text,
	`claimed_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
