ALTER TABLE `gift` ADD `giver_contact_id` text REFERENCES contact(id);--> statement-breakpoint
ALTER TABLE `gift` ADD `giver_is_household` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `gift` ADD `giver_left_name` text;--> statement-breakpoint
CREATE INDEX `gift_giver_idx` ON `gift` (`giver_contact_id`,`state`);