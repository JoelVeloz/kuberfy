PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`repo_url` text NOT NULL,
	`branch` text DEFAULT 'main' NOT NULL,
	`build_type` text NOT NULL,
	`dockerfile_path` text,
	`env_vars` text,
	`registry_username` text,
	`registry_password` text,
	`memory_limit_mb` integer DEFAULT 128 NOT NULL,
	`cpu_limit` real DEFAULT 0.1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_applications`("id", "project_id", "name", "repo_url", "branch", "build_type", "dockerfile_path", "env_vars", "registry_username", "registry_password", "memory_limit_mb", "cpu_limit", "created_at", "updated_at") SELECT "id", "project_id", "name", "repo_url", "branch", "build_type", "dockerfile_path", "env_vars", "registry_username", "registry_password", "memory_limit_mb", "cpu_limit", "created_at", "updated_at" FROM `applications`;--> statement-breakpoint
DROP TABLE `applications`;--> statement-breakpoint
ALTER TABLE `__new_applications` RENAME TO `applications`;--> statement-breakpoint
PRAGMA foreign_keys=ON;