ALTER TABLE `domains` ADD `is_primary` integer DEFAULT false NOT NULL;
--> statement-breakpoint
-- backfill: every application that already had domains gets its oldest one marked primary, so existing apps aren't left without one
UPDATE `domains` SET `is_primary` = 1 WHERE `id` IN (
  SELECT `d`.`id` FROM `domains` `d`
  WHERE NOT EXISTS (SELECT 1 FROM `domains` `d2` WHERE `d2`.`application_id` = `d`.`application_id` AND `d2`.`is_primary` = 1)
  AND `d`.`created_at` = (SELECT MIN(`d3`.`created_at`) FROM `domains` `d3` WHERE `d3`.`application_id` = `d`.`application_id`)
);