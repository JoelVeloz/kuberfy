CREATE TABLE `volumes` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`mount_path` text NOT NULL,
	`volume_name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `volumes_volume_name_unique` ON `volumes` (`volume_name`);