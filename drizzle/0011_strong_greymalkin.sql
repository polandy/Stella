ALTER TABLE `photo` ADD `framing_of` text;--> statement-breakpoint
ALTER TABLE `photo` ADD `crop_x` real;--> statement-breakpoint
ALTER TABLE `photo` ADD `crop_y` real;--> statement-breakpoint
ALTER TABLE `photo` ADD `crop_size` real;--> statement-breakpoint
CREATE INDEX `photo_framing_idx` ON `photo` (`framing_of`);