import * as v from 'valibot';

/*
 * What a stream notice says (docs/02 §2.11, docs/03 §activity_log). A removal is stored as the
 * prose written when the record went — nothing is left to say it from later. A line about
 * people who are still there (last names given, a rename) is stored as **facts** instead, in
 * `summary` as JSON, and said at read time in the reader's language, so a German member's
 * batch never reads half in German on an English Home.
 */

/** The batch of last names (docs/02 §2.2.4.4). */
export const LAST_NAMES_ENTITY = 'last_name';
/** A name edited on the profile (docs/02 §2.2). */
export const RENAME_ENTITY = 'contact_name';

/**
 * The authored records a member other than the author may remove (docs/03 §3.7). A removal of
 * one is logged under its kind as entity type, with facts — never its text (docs/02 §2.11).
 */
export const REMOVED_RECORD_KINDS = [
	'note',
	'journal_entry',
	'interaction',
	'photo',
	'circle_photo'
] as const;
export type RemovedRecordKind = (typeof REMOVED_RECORD_KINDS)[number];

/** A notice as the stream renders it. */
export type NoticeContent =
	| { kind: 'text'; text: string }
	| { kind: 'lastNames'; lastName: string; count: number }
	| { kind: 'rename'; from: string; to: string; contactId: string | null }
	| {
			kind: 'removed';
			recordKind: RemovedRecordKind;
			/** The person the record was on, as they were named when it went. */
			person: string;
			contactId: string | null;
			/** Whose record it was: the reader is told "your note" when it was theirs. */
			authorId: string;
			authorName: string;
	  };

const LastNamesFacts = v.object({ lastName: v.string(), count: v.number() });
const RenameFacts = v.object({ from: v.string(), to: v.string() });
const RemovalFacts = v.object({ person: v.string(), authorId: v.string(), authorName: v.string() });

/** The facts of a last-names batch, as stored. */
export const lastNamesFacts = (lastName: string, count: number): string =>
	JSON.stringify({ lastName, count });

/** The facts of a rename, as stored. */
export const renameFacts = (from: string, to: string): string => JSON.stringify({ from, to });

/** The facts of a record removed by someone other than its author, as stored. */
export const removalFacts = (person: string, authorId: string, authorName: string): string =>
	JSON.stringify({ person, authorId, authorName });

const isRemovedRecordKind = (entityType: string): entityType is RemovedRecordKind =>
	(REMOVED_RECORD_KINDS as readonly string[]).includes(entityType);

/** The lines a batch stored as prose before it stored facts, in the giver's language. */
const LEGACY_LAST_NAMES: readonly { pattern: RegExp; name: number; count: number }[] = [
	{ pattern: /^set the last name (.+) on (\d+) (?:person|people)$/, name: 1, count: 2 },
	{ pattern: /^hat (\d+) Person(?:en)? den Nachnamen (.+) gegeben$/, name: 2, count: 1 }
];

function parsed<T>(schema: v.GenericSchema<unknown, T>, text: string): T | null {
	try {
		const result = v.safeParse(schema, JSON.parse(text));
		return result.success ? result.output : null;
	} catch {
		return null; // Not JSON: a line stored as prose, read below.
	}
}

/** What a logged line says, from its entity type and stored summary. */
export function noticeContentOf(row: {
	entityType: string;
	summary: string;
	contactId: string | null;
}): NoticeContent {
	if (row.entityType === LAST_NAMES_ENTITY) {
		const facts = parsed(LastNamesFacts, row.summary);
		if (facts) return { kind: 'lastNames', ...facts };
		for (const legacy of LEGACY_LAST_NAMES) {
			const match = legacy.pattern.exec(row.summary);
			if (match)
				return {
					kind: 'lastNames',
					lastName: match[legacy.name]!,
					count: Number(match[legacy.count])
				};
		}
	}
	if (row.entityType === RENAME_ENTITY) {
		const facts = parsed(RenameFacts, row.summary);
		if (facts) return { kind: 'rename', ...facts, contactId: row.contactId };
	}
	if (isRemovedRecordKind(row.entityType)) {
		const facts = parsed(RemovalFacts, row.summary);
		if (facts)
			return { kind: 'removed', recordKind: row.entityType, ...facts, contactId: row.contactId };
	}
	return { kind: 'text', text: row.summary };
}
