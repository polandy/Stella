-- A merge used to repoint a link one column at a time, which could leave a symmetric link
-- unsorted (docs/03 §relationship) — beside a sorted twin the survivor already had. The twin
-- keeps its row and takes what the copy can fill of its blanks (`foldedLinkDetails`), the copy
-- goes, and every other unsorted symmetric link is turned round. Directed links keep their order.
UPDATE `relationship` AS `twin`
SET
	`note` = coalesce(nullif(`twin`.`note`, ''), nullif(`copy`.`note`, ''), `twin`.`note`),
	`since_date` = coalesce(nullif(`twin`.`since_date`, ''), nullif(`copy`.`since_date`, ''), `twin`.`since_date`)
FROM `relationship` AS `copy`
JOIN `relationship_type` AS `type` ON `type`.`id` = `copy`.`type_id` AND `type`.`symmetric` = 1
WHERE `copy`.`from_contact_id` > `copy`.`to_contact_id`
	AND `twin`.`from_contact_id` = `copy`.`to_contact_id`
	AND `twin`.`to_contact_id` = `copy`.`from_contact_id`
	AND `twin`.`type_id` = `copy`.`type_id`;
--> statement-breakpoint
DELETE FROM `relationship`
WHERE `from_contact_id` > `to_contact_id`
	AND `type_id` IN (SELECT `id` FROM `relationship_type` WHERE `symmetric` = 1)
	AND EXISTS (
		SELECT 1 FROM `relationship` AS `twin`
		WHERE `twin`.`from_contact_id` = `relationship`.`to_contact_id`
			AND `twin`.`to_contact_id` = `relationship`.`from_contact_id`
			AND `twin`.`type_id` = `relationship`.`type_id`
	);
--> statement-breakpoint
UPDATE `relationship`
SET `from_contact_id` = `to_contact_id`, `to_contact_id` = `from_contact_id`
WHERE `from_contact_id` > `to_contact_id`
	AND `type_id` IN (SELECT `id` FROM `relationship_type` WHERE `symmetric` = 1);
