UPDATE `domains` SET `port` = COALESCE((SELECT `port` FROM `applications` WHERE `applications`.`id` = `domains`.`application_id`), 3000);
