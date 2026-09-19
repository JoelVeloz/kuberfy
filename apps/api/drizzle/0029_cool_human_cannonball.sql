DROP INDEX `applications_remote_access_host_idx`;--> statement-breakpoint
ALTER TABLE `applications` DROP COLUMN `remote_access_host`;--> statement-breakpoint
ALTER TABLE `applications` DROP COLUMN `remote_access_allowlist`;