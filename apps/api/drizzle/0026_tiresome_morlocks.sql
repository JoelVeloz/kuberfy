ALTER TABLE `applications` ADD `remote_access_host` text;--> statement-breakpoint
ALTER TABLE `applications` ADD `remote_access_allowlist` text;--> statement-breakpoint
CREATE UNIQUE INDEX `applications_remote_access_host_idx` ON `applications` (`remote_access_host`);