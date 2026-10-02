ALTER TABLE `photo` ADD `circle_id` text;--> statement-breakpoint
ALTER TABLE `photo` ADD `circle_role` text;--> statement-breakpoint
CREATE INDEX `photo_circle_idx` ON `photo` (`circle_id`);