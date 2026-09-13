ALTER TABLE `request_log` ADD `user_agent` text;--> statement-breakpoint
ALTER TABLE `request_log` ADD `protocol` text;--> statement-breakpoint
ALTER TABLE `request_log` ADD `origin_status` integer;--> statement-breakpoint
ALTER TABLE `request_log` ADD `request_content_size` integer;--> statement-breakpoint
ALTER TABLE `request_log` ADD `downstream_content_size` integer;