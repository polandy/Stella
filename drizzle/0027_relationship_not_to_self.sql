-- A link from a person to themselves is not copied across, and goes unreported: it means
-- nothing and shows on no profile (docs/03 §relationship).
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_relationship` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`from_contact_id` text NOT NULL,
	`to_contact_id` text NOT NULL,
	`type_id` text NOT NULL,
	`note` text,
	`since_date` text,
	`status` text DEFAULT 'current' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`type_id`) REFERENCES `relationship_type`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "relationship_not_to_self" CHECK("__new_relationship"."from_contact_id" <> "__new_relationship"."to_contact_id")
);
--> statement-breakpoint
INSERT INTO `__new_relationship`("id", "household_id", "from_contact_id", "to_contact_id", "type_id", "note", "since_date", "status", "created_by", "created_at", "updated_at") SELECT "id", "household_id", "from_contact_id", "to_contact_id", "type_id", "note", "since_date", "status", "created_by", "created_at", "updated_at" FROM `relationship` WHERE "from_contact_id" <> "to_contact_id";--> statement-breakpoint
DROP TABLE `relationship`;--> statement-breakpoint
ALTER TABLE `__new_relationship` RENAME TO `relationship`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `relationship_from_idx` ON `relationship` (`from_contact_id`);--> statement-breakpoint
CREATE INDEX `relationship_to_idx` ON `relationship` (`to_contact_id`);--> statement-breakpoint
CREATE INDEX `relationship_type_idx` ON `relationship` (`type_id`);--> statement-breakpoint
CREATE INDEX `relationship_created_idx` ON `relationship` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `relationship_unique` ON `relationship` (`from_contact_id`,`to_contact_id`,`type_id`);