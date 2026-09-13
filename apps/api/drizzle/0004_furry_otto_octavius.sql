CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`kuberfy_domain` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
