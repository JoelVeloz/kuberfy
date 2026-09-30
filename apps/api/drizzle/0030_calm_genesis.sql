ALTER TABLE `applications` ADD `host_port` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `applications_host_port_unique` ON `applications` (`host_port`);