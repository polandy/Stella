import { dayParts } from '../dates/calendar';

/*
 * The household's list of open gift ideas (docs/02 §2.25.6), a Christmas shopping list. Pure, so
 * its order is tested without a database: one group per person, whoever's occasion comes next
 * on top. A person's occasion is their next birthday, or Christmas Eve when that comes first or
 * no birthday is on the household's radar.
 */

/** The occasion a person's ideas are for, and how far off it is. */
export interface NextOccasion {
	kind: 'birthday' | 'christmas';
	/** ISO `YYYY-MM-DD`. */
	date: string;
	/** Whole days from today; 0 means today. */
	daysUntil: number;
}

/** An idea as the list needs it: whom it is for. */
export interface IdeaOnList {
	contactId: string;
	contactName: string;
	avatarPhotoId: string | null;
}

/** An upcoming date of the viewer's (`upcomingDates`), of which only birthdays count here. */
export interface DateAhead {
	contactId: string;
	kind: string;
	date: string;
	daysUntil: number;
}

/** One person on the list, their ideas in the order they arrived. */
export interface IdeaGroup<I extends IdeaOnList> {
	contactId: string;
	contactName: string;
	avatarPhotoId: string | null;
	next: NextOccasion;
	ideas: I[];
}

const DAY_MS = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The next Christmas Eve on or after `today` — the evening presents are given (docs/02 §2.25.6). */
export function christmasFrom(today: string): Omit<NextOccasion, 'kind'> {
	const from = dayParts(today);
	if (!from || from.year === null) throw new Error(`Not a calendar day: ${today}`);
	const todayMs = Date.UTC(from.year, from.month - 1, from.day);
	let eve = Date.UTC(from.year, 11, 24);
	if (eve < todayMs) eve = Date.UTC(from.year + 1, 11, 24);
	return { date: iso(eve), daysUntil: Math.round((eve - todayMs) / DAY_MS) };
}

/**
 * The ideas by person, whoever's occasion comes next first; people sharing a day by name.
 * `datesAhead` is nearest first, so a person's first birthday in it is their next.
 */
export function ideaListGroups<I extends IdeaOnList>(
	ideas: readonly I[],
	datesAhead: readonly DateAhead[],
	today: string
): IdeaGroup<I>[] {
	const christmas: NextOccasion = { kind: 'christmas', ...christmasFrom(today) };
	const birthdays = new Map<string, NextOccasion>();
	for (const date of datesAhead) {
		if (date.kind !== 'birthday' || birthdays.has(date.contactId)) continue;
		birthdays.set(date.contactId, {
			kind: 'birthday',
			date: date.date,
			daysUntil: date.daysUntil
		});
	}

	const groups = new Map<string, IdeaGroup<I>>();
	for (const idea of ideas) {
		const group = groups.get(idea.contactId);
		if (group) {
			group.ideas.push(idea);
			continue;
		}
		const birthday = birthdays.get(idea.contactId);
		groups.set(idea.contactId, {
			contactId: idea.contactId,
			contactName: idea.contactName,
			avatarPhotoId: idea.avatarPhotoId,
			next: birthday && birthday.daysUntil < christmas.daysUntil ? birthday : christmas,
			ideas: [idea]
		});
	}
	return [...groups.values()].sort(
		(a, b) => a.next.daysUntil - b.next.daysUntil || a.contactName.localeCompare(b.contactName)
	);
}
