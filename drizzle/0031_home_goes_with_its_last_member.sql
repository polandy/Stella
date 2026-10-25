-- A home is one address and the people who live there (docs/03 §3.3): it goes with its last
-- member, whichever way they leave — moving out, being deleted, or a merge leaving them behind.
CREATE TRIGGER `home_goes_with_its_last_member` AFTER DELETE ON `home_member`
WHEN NOT EXISTS (SELECT 1 FROM `home_member` WHERE `home_id` = old.`home_id`)
BEGIN
	DELETE FROM `home` WHERE `id` = old.`home_id`;
END;
