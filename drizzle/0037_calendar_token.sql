PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_api_token` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`scope` text DEFAULT 'api' NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	`expires_at` integer,
	`last_used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_api_token`("id", "user_id", "name", "token_hash", "scope", "created_at", "expires_at", "last_used_at") SELECT "id", "user_id", "name", "token_hash", 'api', "created_at", "expires_at", "last_used_at" FROM `api_token`;--> statement-breakpoint
DROP TABLE `api_token`;--> statement-breakpoint
ALTER TABLE `__new_api_token` RENAME TO `api_token`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `api_token_token_hash_unique` ON `api_token` (`token_hash`);--> statement-breakpoint
CREATE INDEX `api_token_user_idx` ON `api_token` (`user_id`);