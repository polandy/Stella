-- The nickname joins the shown name it shapes (docs/02 §2.2, docs/03 §contact):
-- *Thomas „Tom“ Brunner*. Updates once the names the old rule made — first and last name, or
-- the nickname alone — where a nickname is set and is not the first name again; a name somebody
-- chose (*Opa Kurt*) does not equal the old rule and is left alone. The rule is the one of
-- `nameWithNickname` (src/lib/people/display-name.ts), held together by its migration test; SQLite
-- folds only ASCII case here, so a nickname that is the first name with other accents is quoted.
-- The quote marks follow the language of the member who added the person, else of any member of
-- the household who picked one, else English: a migration has no member acting.
-- The search index's update trigger, present on every running installation, re-indexes each row.
UPDATE contact
SET display_name = (
	CASE WHEN coalesce(trim(first_name), '') <> ''
		THEN trim(first_name) || ' ' ||
			(CASE WHEN q.lang = 'de' THEN '„' ELSE '“' END) || trim(nickname) ||
			(CASE WHEN q.lang = 'de' THEN '“' ELSE '”' END)
		ELSE trim(nickname)
	END ||
	CASE WHEN coalesce(trim(last_name), '') <> '' THEN ' ' || trim(last_name) ELSE '' END
)
FROM (
	SELECT c.id AS contact_id,
		coalesce(
			(SELECT u.locale_pref FROM user u WHERE u.id = c.created_by),
			(SELECT u.locale_pref FROM user u WHERE u.household_id = c.household_id AND u.locale_pref IS NOT NULL ORDER BY u.id LIMIT 1),
			'en'
		) AS lang
	FROM contact c
) AS q
WHERE q.contact_id = contact.id
	AND coalesce(trim(nickname), '') <> ''
	AND lower(trim(nickname)) <> lower(coalesce(trim(first_name), ''))
	AND display_name = (
		CASE WHEN trim(coalesce(trim(first_name), '') || ' ' || coalesce(trim(last_name), '')) <> ''
			THEN trim(coalesce(trim(first_name), '') || ' ' || coalesce(trim(last_name), ''))
			ELSE trim(nickname)
		END
	)
	-- Only where the new rule changes it: a nickname alone already is the whole name.
	AND (coalesce(trim(first_name), '') <> '' OR coalesce(trim(last_name), '') <> '');
