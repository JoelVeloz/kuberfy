CREATE TABLE `request_log` (
	`id` text PRIMARY KEY NOT NULL,
	`time` integer NOT NULL,
	`method` text NOT NULL,
	`host` text NOT NULL,
	`path` text NOT NULL,
	`status` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`service` text
);
