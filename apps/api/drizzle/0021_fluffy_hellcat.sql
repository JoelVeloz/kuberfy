CREATE TABLE `host_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`time` integer NOT NULL,
	`cpu` real NOT NULL,
	`mem_used` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `host_metrics_time_idx` ON `host_metrics` (`time`);