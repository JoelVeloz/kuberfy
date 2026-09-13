CREATE INDEX `request_log_time_idx` ON `request_log` (`time`);--> statement-breakpoint
CREATE INDEX `request_log_host_time_idx` ON `request_log` (`host`,`time`);