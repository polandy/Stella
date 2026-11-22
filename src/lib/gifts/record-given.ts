import { dayParts } from '../dates/calendar';
import type { PartialDate } from '../dates/partial-date';
import { ageOn } from '../when/resolve';
import type { When } from '../when/when';
import { giverFromForm, HOUSEHOLD_GIVER, type GiftOccasionPreset, type GiftState } from './gifts';
import { isAssigned, type GiverView } from './giver';
import { occasionDayOf, type OccasionGift } from './occasions';

/*
 * *Nachtragen…* (docs/dev/02 §2.25.14): what was given at a passed occasion, several at once — the
 * planned gifts marked given, the rest noted as given, or as received when it was for us. One
 * command per gift (docs/dev/04 §4.11.2), so every path it takes is one that already exists.
 */

/** A passed day the sheet offers, with the occasion a given gift then says. */
export interface PastOccasion {
	on: string;
	occasion: GiftOccasionPreset | null;
	/** What the chip is named after; null for a birthday without a year (*Birthday*). */
	when: When | null;
}

/** How many occasions the sheet offers before *Another day…*. */
const OFFERED = 4;

const pad = (n: number) => String(n).padStart(2, '0');

/** The occasion a planned gift's day was. */
function occasionOf(on: string, when: When): GiftOccasionPreset | null {
	if (when.kind === 'christmas_at_age' || on.endsWith('-12-24')) return 'christmas';
	return when.kind === 'at_age' || when.kind === 'from_age' ? 'birthday' : null;
}

/** The last birthday on or before `today`, for a birth date that names a day. */
function lastBirthday(birth: PartialDate | null, today: string): PastOccasion | null {
	if (birth === null) return null;
	const born = dayParts(birth.value);
	const now = dayParts(today);
	if (born === null || now === null || now.year === null) return null;
	const monthDay = `${pad(born.month)}-${pad(born.day)}`;
	const year = today.slice(5) >= monthDay ? now.year : now.year - 1;
	// `Date.UTC` rolls 29 February into 1 March in a common year, as `whenDay` does.
	const on = new Date(Date.UTC(year, born.month - 1, born.day)).toISOString().slice(0, 10);
	const age = born.year === null ? null : ageOn(birth, on);
	return { on, occasion: 'birthday', when: age === null ? null : { kind: 'at_age', age } };
}

/**
 * The passed occasions, latest first: the last Christmas Eve, the person's last birthday where it is
 * known, and every passed day a planned gift is for.
 */
export function pastOccasions(input: {
	today: string;
	birth: PartialDate | null;
	planned: readonly { on: string | null; when: When | null }[];
}): PastOccasion[] {
	const { today } = input;
	const christmasYear =
		today.slice(5) >= '12-24' ? today.slice(0, 4) : String(Number(today.slice(0, 4)) - 1);
	const christmas = `${christmasYear}-12-24`;
	const found = new Map<string, PastOccasion>();
	for (const { on, when } of input.planned) {
		if (on === null || when === null || on > today || found.has(on)) continue;
		found.set(on, { on, occasion: occasionOf(on, when), when });
	}
	const birthday = lastBirthday(input.birth, today);
	if (birthday && !found.has(birthday.on)) found.set(birthday.on, birthday);
	if (!found.has(christmas)) {
		found.set(christmas, {
			on: christmas,
			occasion: 'christmas',
			when: { kind: 'on_date', on: christmas }
		});
	}
	return [...found.values()]
		.sort((a, b) => (a.on < b.on ? 1 : a.on > b.on ? -1 : 0))
		.slice(0, OFFERED);
}

/** A gift the sheet may tick: open or bought, with whom it is for and its occasion's day. */
export interface PlannedGift {
	id: string;
	contactId: string;
	contactName: string;
	title: string;
	state: GiftState;
	giver: GiverView;
	when: When | null;
	/** Its occasion's day, as `occasionDayOf` tells it; null for one without. */
	on: string | null;
}

/** A person's open and bought gifts as the sheet ticks them, each on its occasion's day. */
export function plannedOfPerson(
	gifts: readonly (OccasionGift & { id: string; title: string })[],
	person: { id: string; name: string },
	birth: PartialDate | null
): PlannedGift[] {
	return gifts
		.filter((gift) => gift.state === 'idea' || gift.state === 'bought')
		.map((gift) => ({
			id: gift.id,
			contactId: person.id,
			contactName: person.name,
			title: gift.title,
			state: gift.state,
			giver: gift.giver,
			when: gift.when,
			on: occasionDayOf(gift, birth)
		}));
}

/** The open and bought gifts that were for `on`. */
export function plannedOn<T extends OccasionGift>(
	gifts: readonly T[],
	on: string,
	birth: PartialDate | null
): T[] {
	return gifts.filter(
		(gift) =>
			(gift.state === 'idea' || gift.state === 'bought') && occasionDayOf(gift, birth) === on
	);
}

/** Ticked when the sheet opens: somebody took it on, or it was bought — a free idea may not have been given. */
export const tickedAtFirst = (gift: Pick<OccasionGift, 'state' | 'giver'>): boolean =>
	gift.state === 'bought' || isAssigned(gift.giver);

/** What *Für* posts for a gift to the household itself: it is then received from its giver (D11). */
export const RECORD_FOR_US = 'us';

/** One free row: *Was · Für · Von*, as posted — `from` as the giver field posts it. */
export interface RecordRow {
	title: string;
	/** A person's id, `RECORD_FOR_US`, or empty for nobody chosen yet. */
	forId: string;
	from: string;
}

const isPersonGiver = (from: string) => from.trim() !== '' && from !== HOUSEHOLD_GIVER;

const isBlank = (row: RecordRow) => row.title.trim() === '';

/** Why a row with a title cannot be noted, or null when it can. */
function rowProblem(row: RecordRow): 'needRecipient' | 'needGiver' | null {
	if (row.forId === '') return 'needRecipient';
	return row.forId === RECORD_FOR_US && !isPersonGiver(row.from) ? 'needGiver' : null;
}

/** Whether a row is filled in enough to be noted. */
export const rowCounts = (row: RecordRow): boolean => !isBlank(row) && rowProblem(row) === null;

/** One command the sheet sends, as `readCommand` takes its type and payload. */
export type RecordedCommand =
	| { type: 'gift.markGiven'; payload: Record<string, unknown> }
	| { type: 'gift.add'; payload: Record<string, unknown> };

/** Why nothing was sent. */
export type RecordProblem = 'nothing' | 'needRecipient' | 'needGiver';

/**
 * The commands for a filled-in sheet: the ticked gifts marked given, then each row noted — a gift
 * recorded after it was given is shared, no surprise left to keep (D12). A blank row is left out;
 * a row that cannot be noted refuses the whole sheet, so nothing is half sent.
 */
export function recordedCommands(input: {
	givenOn: string;
	occasion: string | null;
	planned: readonly { contactId: string; giftId: string }[];
	rows: readonly RecordRow[];
}): { ok: true; commands: RecordedCommand[] } | { ok: false; reason: RecordProblem } {
	const { givenOn, occasion } = input;
	const rows = input.rows.filter((row) => !isBlank(row));
	const problem = rows.map(rowProblem).find((found) => found !== null);
	if (problem) return { ok: false, reason: problem };
	if (input.planned.length === 0 && rows.length === 0) return { ok: false, reason: 'nothing' };
	const given: RecordedCommand[] = input.planned.map(({ contactId, giftId }) => ({
		type: 'gift.markGiven',
		payload: { contactId, giftId, givenOn, occasion }
	}));
	const noted: RecordedCommand[] = rows.map((row) => {
		const content = { title: row.title.trim(), givenOn, occasion, visibility: 'shared' };
		return row.forId === RECORD_FOR_US
			? { type: 'gift.add', payload: { contactId: row.from, state: 'received', ...content } }
			: {
					type: 'gift.add',
					payload: {
						contactId: row.forId,
						state: 'given',
						...content,
						giver: giverFromForm(row.from)
					}
				};
	});
	return { ok: true, commands: [...given, ...noted] };
}
