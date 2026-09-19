INSERT INTO `domains` (`id`, `application_id`, `host`, `port`, `is_primary`, `ssl_enabled`, `allowlist`)
SELECT
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))),
  a.`id`,
  a.`remote_access_host`,
  5432,
  NOT EXISTS (SELECT 1 FROM `domains` d WHERE d.`application_id` = a.`id`),
  1,
  a.`remote_access_allowlist`
FROM `applications` a
WHERE a.`remote_access_host` IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `domains` d WHERE d.`host` = a.`remote_access_host`);
