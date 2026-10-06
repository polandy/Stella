/*
 * The identity card at the top of a person's page (docs/05 §5.5): who they are, as a few
 * labelled facts each edited where it is read, the rows that have no fact, and one quiet button
 * for what the record does not hold yet. Pure, so what the card shows is decided here rather
 * than in its markup.
 */

import type { Translate } from '$lib/i18n/translate';

/** A fact the card states, in the order it states them. */
export type IdentityFact = 'birthday' | 'dates' | 'address' | 'job' | 'lastContact' | 'circles';

/** A row below the facts: what has no fact of its own (*How we met* is the card's, not a rule's). */
export type ProfileRow = 'contact' | 'tags';

/**
 * What the record can hold nothing of. While empty, each waits behind the quiet button and,
 * once pressed, stands on the card as a dashed slot (a fact) or an empty row. The other dates
 * and the last contact are not among them: a date is added in the birthday's editor, and a
 * contact is logged on the *Activity* card.
 */
export type Fillable = 'birthday' | 'address' | 'job' | 'circles' | 'contact' | 'tags';

/** What the quiet button names; an empty *Contact* row stands in for a phone and an email. */
export type Missing = 'address' | 'birthday' | 'job' | 'phone' | 'email' | 'tags' | 'circles';

const FACT_ORDER: readonly IdentityFact[] = [
	'birthday',
	'dates',
	'address',
	'job',
	'lastContact',
	'circles'
];
const ROW_ORDER: readonly ProfileRow[] = ['contact', 'tags'];
const FILLABLE: readonly Fillable[] = ['birthday', 'address', 'job', 'circles', 'contact', 'tags'];
/**
 * The order the quiet button names them in: where they live and when they were born first,
 * because that is what a household looks up; the circles last, as the rarest to add.
 */
const MISSING_ORDER: readonly { missing: Missing; for: Fillable }[] = [
	{ missing: 'address', for: 'address' },
	{ missing: 'birthday', for: 'birthday' },
	{ missing: 'job', for: 'job' },
	{ missing: 'phone', for: 'contact' },
	{ missing: 'email', for: 'contact' },
	{ missing: 'tags', for: 'tags' },
	{ missing: 'circles', for: 'circles' }
];

const isFillable = (fact: IdentityFact | ProfileRow): fact is Fillable =>
	(FILLABLE as readonly string[]).includes(fact);

/**
 * What the identity card shows (docs/05 §5.5): the facts the record holds, each edited where it
 * is read, and below them only the rows that have no fact — *Contact* and *Tags*. Anything empty
 * waits behind one quiet button: six invitations read as a form, one button naming them reads as
 * a person. Pressed, the empty facts appear in their places as slots and the empty rows below.
 */
export function identityLayout(
	holds: Record<Exclude<IdentityFact, 'dates'> | ProfileRow | 'otherDates', boolean>,
	{
		revealed = false,
		kept = [],
		editingDates = false
	}: {
		/** Whether the quiet button was pressed, so the empty facts and rows are on the card too. */
		revealed?: boolean;
		/**
		 * What the card listed a moment ago. One just emptied stays where it was, as a slot — a
		 * fact or row that vanished under the tap that cleared it would take its own Undo with it.
		 */
		kept?: readonly Fillable[];
		/**
		 * The dates' editor is open where the dates are read. Removing the last of them must not
		 * take the editor away, so the birthday's place stays — for as long as it is open only.
		 */
		editingDates?: boolean;
	} = {}
): {
	facts: { name: IdentityFact; slot: boolean }[];
	rows: ProfileRow[];
	/** What the quiet button names; empty once pressed, or with nothing left to add. */
	behindAddMore: Missing[];
	/** What the card lists right now that could be emptied, for the caller to keep. */
	listed: Fillable[];
} {
	const held = (name: IdentityFact | ProfileRow) =>
		name === 'dates' ? holds.otherDates : holds[name];
	const waiting = (name: Fillable) => revealed || kept.includes(name);
	const onCard = (name: IdentityFact | ProfileRow) =>
		held(name) || (isFillable(name) && waiting(name));

	const facts = FACT_ORDER.filter(
		(name) =>
			onCard(name) || (name === 'birthday' && editingDates && !holds.otherDates && !holds.birthday)
	).map((name) => ({ name, slot: !held(name) }));
	const rows = ROW_ORDER.filter(onCard);
	const behindAddMore = revealed
		? []
		: MISSING_ORDER.filter((entry) => !holds[entry.for] && !kept.includes(entry.for)).map(
				(entry) => entry.missing
			);
	return {
		facts,
		rows,
		behindAddMore,
		listed: FILLABLE.filter(onCard)
	};
}

/** The quiet button, naming what it holds: "Add address, phone, email …" (three at most). */
export function addMoreLabel(behind: readonly Missing[], t: Translate): string {
	const named = behind
		.slice(0, 3)
		.map((missing) => t(`contact.identity.missing.${missing}`))
		.join(', ');
	return t('contact.identity.addThings', {
		things: behind.length > 3 ? `${named} …` : named
	});
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
	{ kind: 'day'; date: string; age: number | null } | { kind: 'around'; year: string } | null;

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

/**
 * Every date but the birthday, each its own fact beside it ("Wedding · 13 June · 17 years").
 * Only the first birthday is the birthday fact's (see `birthdayFact`); a second one stands here.
 */
export function otherDateFacts<
	Date extends { id: string; kind: string; label: string | null; date: string }
>(
	dates: readonly Date[],
	today: string
): { id: string; kind: string; label: string | null; date: string; years: number | null }[] {
	const birthday = dates.find((date) => date.kind === 'birthday');
	return dates
		.filter((date) => date !== birthday)
		.map(({ id, kind, label, date }) => ({ id, kind, label, date, years: ageOn(date, today) }));
}

/** Where they live: every address among the contact details, each on one line. */
export function addressLines(
	fields: readonly { id: string; kind: string; label: string | null; value: string }[]
): { id: string; label: string | null; line: string }[] {
	return fields
		.filter((field) => field.kind === 'address')
		.map((field) => ({
			id: field.id,
			label: field.label,
			line: field.value
				.split('\n')
				.map((line) => line.trim())
				.filter(Boolean)
				.join(', ')
		}));
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
	const entries: RecordMenuEntry[] = [
		'logContact',
		'divider',
		viewer.isSelf ? 'notMe' : 'thisIsMe'
	];
	if (viewer.canTracePath) entries.push('tracePath');
	entries.push(viewer.archived ? 'restore' : 'archive');
	if (viewer.isAdmin) entries.push('merge', 'delete');
	return entries;
}
