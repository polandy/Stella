CREATE TABLE `immich_link` (
	`contact_id` text PRIMARY KEY NOT NULL,
	`immich_person_id` text NOT NULL,
	`linked_by` text NOT NULL,
	`linked_at` integer NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`linked_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
