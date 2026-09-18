-- A relationship that is on record holds until someone ends it (docs/02 §2.4), so the
-- status loses its unset state: rows written before the column meant anything — and any
-- value the model never knew — carry over as 'current'; only 'former' is kept as said.
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
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_relationship`("id", "household_id", "from_contact_id", "to_contact_id", "type_id", "note", "since_date", "status", "created_by", "created_at", "updated_at") SELECT "id", "household_id", "from_contact_id", "to_contact_id", "type_id", "note", "since_date", CASE WHEN "status" = 'former' THEN 'former' ELSE 'current' END, "created_by", "created_at", "updated_at" FROM `relationship`;--> statement-breakpoint
DROP TABLE `relationship`;--> statement-breakpoint
ALTER TABLE `__new_relationship` RENAME TO `relationship`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `relationship_from_idx` ON `relationship` (`from_contact_id`);--> statement-breakpoint
CREATE INDEX `relationship_to_idx` ON `relationship` (`to_contact_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `relationship_unique` ON `relationship` (`from_contact_id`,`to_contact_id`,`type_id`);