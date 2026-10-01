DROP INDEX `contact_visibility_idx`;--> statement-breakpoint
DROP INDEX `journal_contact_idx`;--> statement-breakpoint
CREATE INDEX `journal_contact_day_idx` ON `journal_entry` (`contact_id`,`entry_date`,`created_at`);--> statement-breakpoint
CREATE INDEX `journal_updated_idx` ON `journal_entry` (`updated_at`);--> statement-breakpoint
CREATE INDEX `contact_tag_tag_idx` ON `contact_tag` (`tag_id`);--> statement-breakpoint
CREATE INDEX `interaction_participant_contact_idx` ON `interaction_participant` (`contact_id`);--> statement-breakpoint
CREATE INDEX `note_mention_contact_idx` ON `note_mention` (`contact_id`);--> statement-breakpoint
CREATE INDEX `relationship_type_idx` ON `relationship` (`type_id`);--> statement-breakpoint
CREATE INDEX `session_user_idx` ON `session` (`user_id`);