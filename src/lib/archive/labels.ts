/*
 * What a restored table is called on screen (docs/02 §2.15). The report comes back keyed by
 * table name, and "journal_entry: 4" is not something to show a household. Pure and outside
 * `server/` so the page can read it.
 */

interface Label {
	one: string;
	many: string;
}

/** Table name → the words for it, in the order a report reads best. */
const LABELS: Record<string, Label> = {
	contact: { one: 'person', many: 'people' },
	relationship: { one: 'relationship', many: 'relationships' },
	relationship_type: { one: 'relationship type', many: 'relationship types' },
	contact_field: { one: 'contact detail', many: 'contact details' },
	important_date: { one: 'important date', many: 'important dates' },
	note: { one: 'note', many: 'notes' },
	note_mention: { one: 'note mention', many: 'note mentions' },
	journal_entry: { one: 'journal entry', many: 'journal entries' },
	journal_mention: { one: 'journal mention', many: 'journal mentions' },
	interaction: { one: 'touchpoint', many: 'touchpoints' },
	interaction_participant: { one: 'participant', many: 'participants' },
	photo: { one: 'photo', many: 'photos' },
	tag: { one: 'tag', many: 'tags' },
	contact_tag: { one: 'tagged person', many: 'tagged people' },
	circle: { one: 'circle', many: 'circles' },
	circle_membership: { one: 'circle member', many: 'circle members' },
	activity_log: { one: 'log entry', many: 'log entries' }
};

/** One line of the report: what it is, how many arrived, how many were already there. */
export interface RestoreLine {
	table: string;
	label: string;
	added: number;
	skipped: number;
}

/** "3 people", "1 note" — the count with the right word for it. */
export function countLabel(table: string, count: number): string {
	const label = LABELS[table];
	if (!label) return `${count} × ${table}`;
	return `${count} ${count === 1 ? label.one : label.many}`;
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
	return Object.keys(LABELS)
		.map((table) => ({
			table,
			label: LABELS[table].many,
			added: added[table] ?? 0,
			skipped: skipped[table] ?? 0
		}))
		.filter((line) => line.added > 0 || line.skipped > 0);
}
