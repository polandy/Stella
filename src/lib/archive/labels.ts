import { hasMessage, type Translate } from '$lib/i18n/translate';

/*
 * What a restored table is called on screen (docs/02 §2.15). The report comes back keyed by
 * table name, and "journal_entry: 4" is not something to show a household. The order lives
 * here; the words live in the message catalogue, so the report reads in the viewer's
 * language (docs/02 §2.19).
 */

/** Every table a report can mention, in the order a report reads best. */
export const RESTORE_TABLES: readonly string[] = [
	'contact',
	'relationship',
	'relationship_type',
	'contact_field',
	'important_date',
	'note',
	'note_mention',
	'journal_entry',
	'journal_mention',
	'interaction',
	'interaction_participant',
	'photo',
	'tag',
	'contact_tag',
	'circle',
	'circle_membership',
	'activity_log'
];

/** One line of the report: what it is, how many arrived, how many were already there. */
export interface RestoreLine {
	table: string;
	added: number;
	skipped: number;
}

/** What a table is called, for `count` of them; the raw name for one Stella has no words for. */
export function tableLabel(t: Translate, table: string, count: number): string {
	const key = `archive.table.${table}`;
	// Every `archive.table.*` message counts; the cast picks one of them as the shape.
	return hasMessage(key) ? t(key as 'archive.table.note', { count }) : table;
}

/** "3 people", "1 note" — the count with the right word for it. */
export function countLabel(t: Translate, table: string, count: number): string {
	if (!hasMessage(`archive.table.${table}`)) return `${count} × ${table}`;
	return t('archive.count', { count, what: tableLabel(t, table, count) });
}

/**
 * The report as lines to read, in the order above and leaving out what the archive had none
 * of. A kind that was entirely already here still gets a line — "0 added, 12 already here" is
 * the answer to the question a second import raises.
 */
export function summariseRestore(
	added: Readonly<Record<string, number>>,
	skipped: Readonly<Record<string, number>>
): RestoreLine[] {
	return RESTORE_TABLES.map((table) => ({
		table,
		added: added[table] ?? 0,
		skipped: skipped[table] ?? 0
	})).filter((line) => line.added > 0 || line.skipped > 0);
}
