DROP INDEX `contact_household_idx`;--> statement-breakpoint
DROP INDEX `interaction_contact_idx`;--> statement-breakpoint
CREATE INDEX `interaction_contact_happened_idx` ON `interaction` (`contact_id`,`happened_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `interaction_created_idx` ON `interaction` (`created_at`);--> statement-breakpoint
CREATE INDEX `contact_household_created_idx` ON `contact` (`household_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `relationship_created_idx` ON `relationship` (`created_at`);