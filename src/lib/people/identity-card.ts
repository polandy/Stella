/*
 * The identity card at the top of a person's page (docs/05 §5.5): who they are, as a few
 * labelled facts, the editable rows the record holds something for, and one quiet button for
 * the rest. Pure, so what the card shows is decided here rather than in its markup.
 */

/** An editable row of the identity card, each one an existing editor. */
export type ProfileRow = 'contact' | 'tags' | 'job' | 'dates' | 'circles' | 'gender';

/**
 * The card's order: contact details and tags lead, because those are what the quiet button
 * names ("Add phone, email, tags …") and what a household adds most.
 */
const ROW_ORDER: readonly ProfileRow[] = ['contact', 'job', 'dates', 'circles', 'gender', 'tags'];

/**
 * Which rows the card shows and which fold behind its one quiet button. An empty row is an
 * invitation, and six of them read as a form; one button holding them all reads as a person.
 * A job on record is stated — and edited — among the facts, so it is neither.
 */
export function profileRows(
	holds: Record<ProfileRow, boolean>,
	{
		revealed = false,
		kept = []
	}: {
		/** Whether the quiet button was pressed, so the folded rows are on the card too. */
		revealed?: boolean;
		/**
		 * Rows the card listed a moment ago. One just emptied stays where it was — a row that
		 * vanished under the tap that cleared it would take its own Undo with it.
		 */
		kept?: readonly ProfileRow[];
	} = {}
): {
	shown: ProfileRow[];
	behindAddMore: ProfileRow[];
	/** What the card lists right now, each row in its own place rather than appended. */
	listed: ProfileRow[];
} {
	const shown = ROW_ORDER.filter((row) => holds[row] && row !== 'job');
	const behindAddMore = ROW_ORDER.filter((row) => !holds[row] && !kept.includes(row));
	return {
		shown,
		behindAddMore,
		listed: ROW_ORDER.filter(
			(row) => shown.includes(row) || kept.includes(row) || (revealed && behindAddMore.includes(row))
		)
	};
}

/** Whole years from a `YYYY-MM-DD` birth day to `today`; null without a year or before birth. */
export function ageOn(birthDate: string, today: string): number | null {
	if (birthDate.startsWith('--')) return null;
	const [birthYear, birthMonthDay] = [Number(birthDate.slice(0, 4)), birthDate.slice(5)];
	const [year, monthDay] = [Number(today.slice(0, 4)), today.slice(5)];
	// `MM-DD` strings compare as the calendar does.
	const age = year - birthYear - (monthDay < birthMonthDay ? 1 : 0);
	return age >= 0 ? age : null;
}

/** The birthday the card states: a day (with an age when the year is known), or a guessed year. */
export type BirthdayFact =
	| { kind: 'day'; date: string; age: number | null }
	| { kind: 'around'; year: string }
	| null;

/**
 * A birthday entered among the dates wins over the profile's: the load already drops the
 * profile's when one is (`derivedBirthday` is null then), and the dates are what a member keeps.
 */
export function birthdayFact(
	record: {
		derivedBirthday: string | null;
		estimatedBirthYear: string | null;
		dates: readonly { kind: string; date: string }[];
	},
	today: string
): BirthdayFact {
	const day = record.dates.find((date) => date.kind === 'birthday')?.date ?? record.derivedBirthday;
	if (day) return { kind: 'day', date: day, age: ageOn(day, today) };
	if (record.estimatedBirthYear) return { kind: 'around', year: record.estimatedBirthYear };
	return null;
}

/** Where they live, as the card's one line: the first address among the contact details. */
export function addressLine(fields: readonly { kind: string; value: string }[]): string | null {
	const address = fields.find((field) => field.kind === 'address');
	if (!address) return null;
	return address.value
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)
		.join(', ');
}

/**
 * Which confirm step a look at this person's page opens on its own: the merge step when a
 * *same person?* link sent an admin here, otherwise none. Used both at mount and whenever the
 * page keeps its identity card across a client-side navigation to somebody else's page — so an
 * open step does not follow a reader from the person who opened it to the next (docs/05 §5.5).
 */
export function initialPanel(
	mergeTargetId: string | null,
	isAdmin: boolean
): 'archive' | 'merge' | 'delete' | null {
	return mergeTargetId !== null && isAdmin ? 'merge' : null;
}

/** An entry of the card's ⋯ menu, or the line between the two groups. */
export type RecordMenuEntry =
	| 'logContact'
	| 'divider'
	| 'thisIsMe'
	| 'notMe'
	| 'tracePath'
	| 'archive'
	| 'restore'
	| 'merge'
	| 'delete';

/**
 * What the ⋯ menu offers: logging a touchpoint, then the actions about the record rather than
 * the person (docs/02 §2.2, §2.1.3). Merging and deleting end a record, so they are an admin's;
 * the connection question needs somebody else in the household to ask about.
 */
export function recordMenu(viewer: {
	isAdmin: boolean;
	archived: boolean;
	isSelf: boolean;
	canTracePath: boolean;
}): RecordMenuEntry[] {
	const entries: RecordMenuEntry[] = ['logContact', 'divider', viewer.isSelf ? 'notMe' : 'thisIsMe'];
	if (viewer.canTracePath) entries.push('tracePath');
	entries.push(viewer.archived ? 'restore' : 'archive');
	if (viewer.isAdmin) entries.push('merge', 'delete');
	return entries;
}
