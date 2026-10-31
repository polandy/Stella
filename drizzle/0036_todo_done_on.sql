ALTER TABLE `todo` ADD `done_on` text;--> statement-breakpoint
CREATE INDEX `todo_contact_done_on_idx` ON `todo` (`contact_id`,`done_on`,`done_at`);