-- A parent link says its kind (docs/dev/03 §relationship): every one stored so far is biological.
-- Triggers, not a CHECK, for the same reason as 0046: a CHECK needs a table rebuild.
ALTER TABLE `relationship` ADD `parent_kind` text;--> statement-breakpoint
UPDATE `relationship` SET `parent_kind` = 'biological' WHERE `type_id` = 'parent_child';--> statement-breakpoint
CREATE TRIGGER `relationship_parent_kind_insert` BEFORE INSERT ON `relationship`
WHEN (new.`type_id` = 'parent_child') <> (new.`parent_kind` IS NOT NULL)
	OR new.`parent_kind` NOT IN ('biological', 'adoptive', 'foster', 'step')
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: relationship_parent_kind');
END;--> statement-breakpoint
CREATE TRIGGER `relationship_parent_kind_update` BEFORE UPDATE OF `type_id`, `parent_kind` ON `relationship`
WHEN (new.`type_id` = 'parent_child') <> (new.`parent_kind` IS NOT NULL)
	OR new.`parent_kind` NOT IN ('biological', 'adoptive', 'foster', 'step')
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: relationship_parent_kind');
END;
