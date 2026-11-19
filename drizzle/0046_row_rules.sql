-- The rules a row must keep (docs/dev/03 §3.1): enum values, a surprise only when shared, a done
-- day with its tick. Triggers, since a CHECK needs a table rebuild that cascades inside a migration.
-- The closing updates touch only rows that already break a rule, so such a database stops here.
CREATE TRIGGER `contact_visibility_insert` BEFORE INSERT ON `contact`
WHEN new.`visibility` NOT IN ('shared', 'private')
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: contact_visibility');
END;--> statement-breakpoint
CREATE TRIGGER `contact_visibility_update` BEFORE UPDATE OF `visibility` ON `contact`
WHEN new.`visibility` NOT IN ('shared', 'private')
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: contact_visibility');
END;--> statement-breakpoint
CREATE TRIGGER `note_visibility_insert` BEFORE INSERT ON `note`
WHEN new.`visibility` NOT IN ('shared', 'private')
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: note_visibility');
END;--> statement-breakpoint
CREATE TRIGGER `note_visibility_update` BEFORE UPDATE OF `visibility` ON `note`
WHEN new.`visibility` NOT IN ('shared', 'private')
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: note_visibility');
END;--> statement-breakpoint
CREATE TRIGGER `journal_entry_visibility_insert` BEFORE INSERT ON `journal_entry`
WHEN new.`visibility` NOT IN ('shared', 'private')
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: journal_entry_visibility');
END;--> statement-breakpoint
CREATE TRIGGER `journal_entry_visibility_update` BEFORE UPDATE OF `visibility` ON `journal_entry`
WHEN new.`visibility` NOT IN ('shared', 'private')
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: journal_entry_visibility');
END;--> statement-breakpoint
CREATE TRIGGER `interaction_visibility_insert` BEFORE INSERT ON `interaction`
WHEN new.`visibility` NOT IN ('shared', 'private')
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: interaction_visibility');
END;--> statement-breakpoint
CREATE TRIGGER `interaction_visibility_update` BEFORE UPDATE OF `visibility` ON `interaction`
WHEN new.`visibility` NOT IN ('shared', 'private')
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: interaction_visibility');
END;--> statement-breakpoint
CREATE TRIGGER `gift_group_visibility_insert` BEFORE INSERT ON `gift_group`
WHEN new.`visibility` NOT IN ('shared', 'private')
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: gift_group_visibility');
END;--> statement-breakpoint
CREATE TRIGGER `gift_group_visibility_update` BEFORE UPDATE OF `visibility` ON `gift_group`
WHEN new.`visibility` NOT IN ('shared', 'private')
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: gift_group_visibility');
END;--> statement-breakpoint
CREATE TRIGGER `gift_visibility_insert` BEFORE INSERT ON `gift`
WHEN new.`visibility` NOT IN ('shared', 'private')
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: gift_visibility');
END;--> statement-breakpoint
CREATE TRIGGER `gift_visibility_update` BEFORE UPDATE OF `visibility` ON `gift`
WHEN new.`visibility` NOT IN ('shared', 'private')
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: gift_visibility');
END;--> statement-breakpoint
CREATE TRIGGER `todo_visibility_insert` BEFORE INSERT ON `todo`
WHEN new.`visibility` NOT IN ('shared', 'private')
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: todo_visibility');
END;--> statement-breakpoint
CREATE TRIGGER `todo_visibility_update` BEFORE UPDATE OF `visibility` ON `todo`
WHEN new.`visibility` NOT IN ('shared', 'private')
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: todo_visibility');
END;--> statement-breakpoint
CREATE TRIGGER `activity_idea_visibility_insert` BEFORE INSERT ON `activity_idea`
WHEN new.`visibility` NOT IN ('shared', 'private')
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: activity_idea_visibility');
END;--> statement-breakpoint
CREATE TRIGGER `activity_idea_visibility_update` BEFORE UPDATE OF `visibility` ON `activity_idea`
WHEN new.`visibility` NOT IN ('shared', 'private')
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: activity_idea_visibility');
END;--> statement-breakpoint
CREATE TRIGGER `photo_visibility_insert` BEFORE INSERT ON `photo`
WHEN new.`visibility` NOT IN ('shared', 'private')
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: photo_visibility');
END;--> statement-breakpoint
CREATE TRIGGER `photo_visibility_update` BEFORE UPDATE OF `visibility` ON `photo`
WHEN new.`visibility` NOT IN ('shared', 'private')
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: photo_visibility');
END;--> statement-breakpoint
CREATE TRIGGER `circle_visibility_insert` BEFORE INSERT ON `circle`
WHEN new.`visibility` NOT IN ('shared', 'private')
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: circle_visibility');
END;--> statement-breakpoint
CREATE TRIGGER `circle_visibility_update` BEFORE UPDATE OF `visibility` ON `circle`
WHEN new.`visibility` NOT IN ('shared', 'private')
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: circle_visibility');
END;--> statement-breakpoint
CREATE TRIGGER `activity_log_visibility_insert` BEFORE INSERT ON `activity_log`
WHEN new.`visibility` NOT IN ('shared', 'private')
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: activity_log_visibility');
END;--> statement-breakpoint
CREATE TRIGGER `activity_log_visibility_update` BEFORE UPDATE OF `visibility` ON `activity_log`
WHEN new.`visibility` NOT IN ('shared', 'private')
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: activity_log_visibility');
END;--> statement-breakpoint
CREATE TRIGGER `gift_surprise_shared_insert` BEFORE INSERT ON `gift`
WHEN new.`hidden_from_recipient` NOT IN (0, 1) OR (new.`hidden_from_recipient` = 1 AND new.`visibility` <> 'shared')
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: gift_surprise_shared');
END;--> statement-breakpoint
CREATE TRIGGER `gift_surprise_shared_update` BEFORE UPDATE OF `visibility`, `hidden_from_recipient` ON `gift`
WHEN new.`hidden_from_recipient` NOT IN (0, 1) OR (new.`hidden_from_recipient` = 1 AND new.`visibility` <> 'shared')
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: gift_surprise_shared');
END;--> statement-breakpoint
CREATE TRIGGER `gift_group_surprise_shared_insert` BEFORE INSERT ON `gift_group`
WHEN new.`hidden_from_recipients` NOT IN (0, 1) OR (new.`hidden_from_recipients` = 1 AND new.`visibility` <> 'shared')
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: gift_group_surprise_shared');
END;--> statement-breakpoint
CREATE TRIGGER `gift_group_surprise_shared_update` BEFORE UPDATE OF `visibility`, `hidden_from_recipients` ON `gift_group`
WHEN new.`hidden_from_recipients` NOT IN (0, 1) OR (new.`hidden_from_recipients` = 1 AND new.`visibility` <> 'shared')
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: gift_group_surprise_shared');
END;--> statement-breakpoint
CREATE TRIGGER `activity_idea_surprise_shared_insert` BEFORE INSERT ON `activity_idea`
WHEN new.`hidden_from_person` NOT IN (0, 1) OR (new.`hidden_from_person` = 1 AND new.`visibility` <> 'shared')
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: activity_idea_surprise_shared');
END;--> statement-breakpoint
CREATE TRIGGER `activity_idea_surprise_shared_update` BEFORE UPDATE OF `visibility`, `hidden_from_person` ON `activity_idea`
WHEN new.`hidden_from_person` NOT IN (0, 1) OR (new.`hidden_from_person` = 1 AND new.`visibility` <> 'shared')
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: activity_idea_surprise_shared');
END;--> statement-breakpoint
CREATE TRIGGER `gift_state_insert` BEFORE INSERT ON `gift`
WHEN new.`state` NOT IN ('idea', 'bought', 'given', 'received')
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: gift_state');
END;--> statement-breakpoint
CREATE TRIGGER `gift_state_update` BEFORE UPDATE OF `state` ON `gift`
WHEN new.`state` NOT IN ('idea', 'bought', 'given', 'received')
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: gift_state');
END;--> statement-breakpoint
CREATE TRIGGER `gift_when_kind_insert` BEFORE INSERT ON `gift`
WHEN new.`when_kind` NOT IN ('from_age', 'at_age', 'christmas_at_age', 'on_date', 'in_month', 'later')
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: gift_when_kind');
END;--> statement-breakpoint
CREATE TRIGGER `gift_when_kind_update` BEFORE UPDATE OF `when_kind` ON `gift`
WHEN new.`when_kind` NOT IN ('from_age', 'at_age', 'christmas_at_age', 'on_date', 'in_month', 'later')
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: gift_when_kind');
END;--> statement-breakpoint
CREATE TRIGGER `gift_group_when_kind_insert` BEFORE INSERT ON `gift_group`
WHEN new.`when_kind` NOT IN ('from_age', 'at_age', 'christmas_at_age', 'on_date', 'in_month', 'later')
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: gift_group_when_kind');
END;--> statement-breakpoint
CREATE TRIGGER `gift_group_when_kind_update` BEFORE UPDATE OF `when_kind` ON `gift_group`
WHEN new.`when_kind` NOT IN ('from_age', 'at_age', 'christmas_at_age', 'on_date', 'in_month', 'later')
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: gift_group_when_kind');
END;--> statement-breakpoint
CREATE TRIGGER `activity_idea_when_kind_insert` BEFORE INSERT ON `activity_idea`
WHEN new.`when_kind` NOT IN ('from_age', 'at_age', 'christmas_at_age', 'on_date', 'in_month', 'later')
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: activity_idea_when_kind');
END;--> statement-breakpoint
CREATE TRIGGER `activity_idea_when_kind_update` BEFORE UPDATE OF `when_kind` ON `activity_idea`
WHEN new.`when_kind` NOT IN ('from_age', 'at_age', 'christmas_at_age', 'on_date', 'in_month', 'later')
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: activity_idea_when_kind');
END;--> statement-breakpoint
CREATE TRIGGER `todo_done_insert` BEFORE INSERT ON `todo`
WHEN (new.`done_at` IS NULL) <> (new.`done_on` IS NULL) OR (new.`done_by` IS NOT NULL AND new.`done_at` IS NULL)
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: todo_done');
END;--> statement-breakpoint
CREATE TRIGGER `todo_done_update` BEFORE UPDATE OF `done_at`, `done_on`, `done_by` ON `todo`
WHEN (new.`done_at` IS NULL) <> (new.`done_on` IS NULL) OR (new.`done_by` IS NOT NULL AND new.`done_at` IS NULL)
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: todo_done');
END;--> statement-breakpoint
CREATE TRIGGER `activity_idea_done_insert` BEFORE INSERT ON `activity_idea`
WHEN (new.`done_at` IS NULL) <> (new.`done_on` IS NULL) OR (new.`done_by` IS NOT NULL AND new.`done_at` IS NULL)
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: activity_idea_done');
END;--> statement-breakpoint
CREATE TRIGGER `activity_idea_done_update` BEFORE UPDATE OF `done_at`, `done_on`, `done_by` ON `activity_idea`
WHEN (new.`done_at` IS NULL) <> (new.`done_on` IS NULL) OR (new.`done_by` IS NOT NULL AND new.`done_at` IS NULL)
BEGIN
	SELECT RAISE(ABORT, 'CHECK constraint failed: activity_idea_done');
END;--> statement-breakpoint
UPDATE `contact` SET `visibility` = `visibility` WHERE `visibility` NOT IN ('shared', 'private');--> statement-breakpoint
UPDATE `note` SET `visibility` = `visibility` WHERE `visibility` NOT IN ('shared', 'private');--> statement-breakpoint
UPDATE `journal_entry` SET `visibility` = `visibility` WHERE `visibility` NOT IN ('shared', 'private');--> statement-breakpoint
UPDATE `interaction` SET `visibility` = `visibility` WHERE `visibility` NOT IN ('shared', 'private');--> statement-breakpoint
UPDATE `gift_group` SET `visibility` = `visibility` WHERE `visibility` NOT IN ('shared', 'private');--> statement-breakpoint
UPDATE `gift` SET `visibility` = `visibility` WHERE `visibility` NOT IN ('shared', 'private');--> statement-breakpoint
UPDATE `todo` SET `visibility` = `visibility` WHERE `visibility` NOT IN ('shared', 'private');--> statement-breakpoint
UPDATE `activity_idea` SET `visibility` = `visibility` WHERE `visibility` NOT IN ('shared', 'private');--> statement-breakpoint
UPDATE `photo` SET `visibility` = `visibility` WHERE `visibility` NOT IN ('shared', 'private');--> statement-breakpoint
UPDATE `circle` SET `visibility` = `visibility` WHERE `visibility` NOT IN ('shared', 'private');--> statement-breakpoint
UPDATE `activity_log` SET `visibility` = `visibility` WHERE `visibility` NOT IN ('shared', 'private');--> statement-breakpoint
UPDATE `gift` SET `visibility` = `visibility` WHERE `hidden_from_recipient` NOT IN (0, 1) OR (`hidden_from_recipient` = 1 AND `visibility` <> 'shared');--> statement-breakpoint
UPDATE `gift_group` SET `visibility` = `visibility` WHERE `hidden_from_recipients` NOT IN (0, 1) OR (`hidden_from_recipients` = 1 AND `visibility` <> 'shared');--> statement-breakpoint
UPDATE `activity_idea` SET `visibility` = `visibility` WHERE `hidden_from_person` NOT IN (0, 1) OR (`hidden_from_person` = 1 AND `visibility` <> 'shared');--> statement-breakpoint
UPDATE `gift` SET `state` = `state` WHERE `state` NOT IN ('idea', 'bought', 'given', 'received');--> statement-breakpoint
UPDATE `gift` SET `when_kind` = `when_kind` WHERE `when_kind` NOT IN ('from_age', 'at_age', 'christmas_at_age', 'on_date', 'in_month', 'later');--> statement-breakpoint
UPDATE `gift_group` SET `when_kind` = `when_kind` WHERE `when_kind` NOT IN ('from_age', 'at_age', 'christmas_at_age', 'on_date', 'in_month', 'later');--> statement-breakpoint
UPDATE `activity_idea` SET `when_kind` = `when_kind` WHERE `when_kind` NOT IN ('from_age', 'at_age', 'christmas_at_age', 'on_date', 'in_month', 'later');--> statement-breakpoint
UPDATE `todo` SET `done_at` = `done_at` WHERE (`done_at` IS NULL) <> (`done_on` IS NULL) OR (`done_by` IS NOT NULL AND `done_at` IS NULL);--> statement-breakpoint
UPDATE `activity_idea` SET `done_at` = `done_at` WHERE (`done_at` IS NULL) <> (`done_on` IS NULL) OR (`done_by` IS NOT NULL AND `done_at` IS NULL);
