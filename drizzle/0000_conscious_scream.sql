CREATE TABLE `activity_log` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`contact_id` text,
	`visibility` text DEFAULT 'shared' NOT NULL,
	`summary` text NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `activity_household_idx` ON `activity_log` (`household_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `circle` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`created_by` text NOT NULL,
	`visibility` text DEFAULT 'shared' NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`kind` text DEFAULT 'other' NOT NULL,
	`color` text DEFAULT 'blue' NOT NULL,
	`parent_circle_id` text,
	`start_date` text,
	`end_date` text,
	`archived_at` integer,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_circle_id`) REFERENCES `circle`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `circle_household_idx` ON `circle` (`household_id`);--> statement-breakpoint
CREATE TABLE `circle_membership` (
	`id` text PRIMARY KEY NOT NULL,
	`circle_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`role` text,
	`start_date` text,
	`end_date` text,
	`note` text,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`circle_id`) REFERENCES `circle`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `circle_membership_circle_idx` ON `circle_membership` (`circle_id`);--> statement-breakpoint
CREATE INDEX `circle_membership_contact_idx` ON `circle_membership` (`contact_id`);--> statement-breakpoint
CREATE TABLE `contact` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`created_by` text NOT NULL,
	`visibility` text DEFAULT 'shared' NOT NULL,
	`first_name` text,
	`last_name` text,
	`nickname` text,
	`prefix` text,
	`suffix` text,
	`former_name` text,
	`display_name` text NOT NULL,
	`gender` text,
	`pronouns` text,
	`description` text,
	`avatar_photo_id` text,
	`birth_date` text,
	`birth_date_precision` text DEFAULT 'full' NOT NULL,
	`is_deceased` integer DEFAULT 0 NOT NULL,
	`death_date` text,
	`job_title` text,
	`company` text,
	`how_we_met` text,
	`met_date` text,
	`met_place` text,
	`archived_at` integer,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `contact_household_idx` ON `contact` (`household_id`);--> statement-breakpoint
CREATE INDEX `contact_visibility_idx` ON `contact` (`visibility`);--> statement-breakpoint
CREATE TABLE `contact_field` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`kind` text NOT NULL,
	`label` text,
	`value` text NOT NULL,
	`meta` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `contact_field_contact_idx` ON `contact_field` (`contact_id`);--> statement-breakpoint
CREATE TABLE `contact_tag` (
	`contact_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`contact_id`, `tag_id`),
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tag`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `household` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`default_visibility` text DEFAULT 'shared' NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `identity` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`issuer` text NOT NULL,
	`subject` text NOT NULL,
	`email_at_link` text,
	`last_login_at` integer,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `identity_iss_sub` ON `identity` (`issuer`,`subject`);--> statement-breakpoint
CREATE TABLE `important_date` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`kind` text NOT NULL,
	`label` text,
	`date` text NOT NULL,
	`recurs_yearly` integer DEFAULT 1 NOT NULL,
	`remind` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `important_date_contact_idx` ON `important_date` (`contact_id`);--> statement-breakpoint
CREATE TABLE `interaction` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`created_by` text NOT NULL,
	`visibility` text DEFAULT 'shared' NOT NULL,
	`kind` text NOT NULL,
	`title` text,
	`description` text,
	`happened_at` text NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `interaction_contact_idx` ON `interaction` (`contact_id`);--> statement-breakpoint
CREATE TABLE `interaction_participant` (
	`interaction_id` text NOT NULL,
	`contact_id` text NOT NULL,
	PRIMARY KEY(`interaction_id`, `contact_id`),
	FOREIGN KEY (`interaction_id`) REFERENCES `interaction`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `invitation` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`email` text,
	`role` text DEFAULT 'member' NOT NULL,
	`token_hash` text NOT NULL,
	`created_by` text NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `note` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`created_by` text NOT NULL,
	`visibility` text DEFAULT 'shared' NOT NULL,
	`title` text,
	`body` text NOT NULL,
	`is_pinned` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `note_contact_idx` ON `note` (`contact_id`);--> statement-breakpoint
CREATE TABLE `note_mention` (
	`note_id` text NOT NULL,
	`contact_id` text NOT NULL,
	PRIMARY KEY(`note_id`, `contact_id`),
	FOREIGN KEY (`note_id`) REFERENCES `note`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `photo` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`contact_id` text,
	`created_by` text NOT NULL,
	`visibility` text DEFAULT 'shared' NOT NULL,
	`file_path` text NOT NULL,
	`thumb_path` text NOT NULL,
	`mime` text NOT NULL,
	`width` integer,
	`height` integer,
	`size_bytes` integer,
	`caption` text,
	`taken_at` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `photo_contact_idx` ON `photo` (`contact_id`);--> statement-breakpoint
CREATE TABLE `relationship` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`from_contact_id` text NOT NULL,
	`to_contact_id` text NOT NULL,
	`type_id` text NOT NULL,
	`note` text,
	`since_date` text,
	`status` text,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`type_id`) REFERENCES `relationship_type`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `relationship_from_idx` ON `relationship` (`from_contact_id`);--> statement-breakpoint
CREATE INDEX `relationship_to_idx` ON `relationship` (`to_contact_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `relationship_unique` ON `relationship` (`from_contact_id`,`to_contact_id`,`type_id`);--> statement-breakpoint
CREATE TABLE `relationship_type` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text,
	`key` text NOT NULL,
	`forward_label` text NOT NULL,
	`reverse_label` text NOT NULL,
	`category` text NOT NULL,
	`symmetric` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`user_agent` text,
	`ip` text,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tag` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT 'lavender' NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tag_household_name` ON `tag` (`household_id`,`name`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text,
	`role` text DEFAULT 'member' NOT NULL,
	`role_locked` integer DEFAULT 0 NOT NULL,
	`avatar_photo_id` text,
	`theme_pref` text DEFAULT 'system' NOT NULL,
	`accent_pref` text DEFAULT 'mauve' NOT NULL,
	`default_visibility` text DEFAULT 'shared' NOT NULL,
	`reduced_motion` integer DEFAULT 0 NOT NULL,
	`totp_secret` text,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);