CREATE TABLE `immich_name_ignore` (
	`household_id` text NOT NULL,
	`immich_person_id` text NOT NULL,
	`ignored_by` text NOT NULL,
	`ignored_at` integer NOT NULL,
	PRIMARY KEY(`household_id`, `immich_person_id`),
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ignored_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
