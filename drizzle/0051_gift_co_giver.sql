CREATE TABLE `gift_co_giver` (
	`gift_id` text NOT NULL,
	`position` integer NOT NULL,
	`contact_id` text,
	`left_name` text,
	PRIMARY KEY(`gift_id`, `position`),
	FOREIGN KEY (`gift_id`) REFERENCES `gift`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `gift_co_giver_contact_idx` ON `gift_co_giver` (`contact_id`);