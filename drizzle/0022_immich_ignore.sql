CREATE TABLE `immich_ignore` (
	`contact_id` text NOT NULL,
	`immich_person_id` text NOT NULL,
	`ignored_by` text NOT NULL,
	`ignored_at` integer NOT NULL,
	PRIMARY KEY(`contact_id`, `immich_person_id`),
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ignored_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
