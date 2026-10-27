-- Which card of another address book is which person, or that it was skipped (docs/03 §3.3).
CREATE TABLE `contact_source_link` (
	`household_id` text NOT NULL,
	`source` text NOT NULL,
	`external_uid` text NOT NULL,
	`contact_id` text,
	`state` text NOT NULL,
	`card_name` text NOT NULL,
	`card_hash` text NOT NULL,
	`answered_by` text NOT NULL,
	`answered_at` integer NOT NULL,
	PRIMARY KEY(`household_id`, `source`, `external_uid`),
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`answered_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "contact_source_link_state" CHECK(("contact_source_link"."state" = 'linked' AND "contact_source_link"."contact_id" IS NOT NULL) OR ("contact_source_link"."state" = 'skipped' AND "contact_source_link"."contact_id" IS NULL))
);
--> statement-breakpoint
CREATE INDEX `contact_source_link_contact_idx` ON `contact_source_link` (`contact_id`);