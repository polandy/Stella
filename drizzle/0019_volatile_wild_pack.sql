ALTER TABLE `photo` ADD `cut_from` text;--> statement-breakpoint
ALTER TABLE `photo` ADD `view_path` text;--> statement-breakpoint
CREATE UNIQUE INDEX `photo_framing_person_idx` ON `photo` (`framing_of`,`contact_id`) WHERE "photo"."framing_of" IS NOT NULL;