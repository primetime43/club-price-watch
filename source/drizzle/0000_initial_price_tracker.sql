CREATE TABLE `tracked_items` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`item_number` text,
	`image_url` text,
	`current_price_cents` integer,
	`previous_price_cents` integer,
	`target_price_cents` integer,
	`last_checked_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `price_checks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` text NOT NULL,
	`price_cents` integer NOT NULL,
	`checked_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `tracked_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_price_checks_item_checked` ON `price_checks` (`item_id`,`checked_at`);
--> statement-breakpoint
PRAGMA optimize;
