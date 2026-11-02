ALTER TABLE `interaction` ADD `happened_month_day` text GENERATED ALWAYS AS (substr(happened_at, 6, 5)) VIRTUAL;--> statement-breakpoint
CREATE INDEX `interaction_month_day_idx` ON `interaction` (`happened_month_day`);--> statement-breakpoint
ALTER TABLE `journal_entry` ADD `entry_month_day` text GENERATED ALWAYS AS (substr(entry_date, 6, 5)) VIRTUAL;--> statement-breakpoint
CREATE INDEX `journal_month_day_idx` ON `journal_entry` (`entry_month_day`);--> statement-breakpoint
ALTER TABLE `photo` ADD `taken_month_day` text GENERATED ALWAYS AS (substr(taken_at, 6, 5)) VIRTUAL;--> statement-breakpoint
CREATE INDEX `photo_taken_month_day_idx` ON `photo` (`taken_month_day`);