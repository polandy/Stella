import { writeIcs, type IcsEvent } from '../../../calendar/ics';
import { dayParts } from '../../../dates/calendar';
import type { DateLanguage } from '../../../dates/labels';
import { todayFor } from '../../../dates/today';
import { ideaState } from '../../../gifts/idea-when';
import type { Translate } from '../../../i18n/translate';
import { whenChip } from '../../../when/labels';
import type { Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { GiftRepository, IdeaWithBirth, OpenIdea } from '../gifts/gifts';
import type { HouseholdTodo, TodoRepository } from '../todos/todos';
import type { ImportantDateRepository } from './important-dates';
import { datesOnTheRadar, type UpcomingSource } from './upcoming';

/*
 * A member's dates as a subscribed calendar (docs/dev/02 §2.13.4): what *Coming up* would show
 * them, without its 30-day horizon — every date on the radar of every person they may see,
 * read through the same scoped port — every open to-do of theirs with a day, on that day, and
 * every gift idea of theirs whose time draws near, on its day. The phone's calendar then does
 * the reminding.
 *
 * "Anna turns 11" cannot be said by one event that repeats every year, so an event names the
 * occasion and its description carries the year it began.
 */

export interface CalendarFeedDeps {
	dates: Pick<ImportantDateRepository, 'listSourcesVisibleTo'>;
	/** The same list Home's *To-dos* band reads, so the calendar never shows more. */
	todos: Pick<TodoRepository, 'listOpenVisibleTo'>;
	/** The same scoped list `/gifts` reads, so a private idea stays its author's. */
	gifts: Pick<GiftRepository, 'listOpenIdeasVisibleTo'>;
	clock: Clock;
}

export interface CalendarFeedReader {
	viewer: Viewer;
	/** In the member's own language, not the fetching app's. */
	translate: Translate;
	/** The BCP-47 tag a gift idea's day is written in, matching `translate`. */
	intlLocale: string;
	/** The member's own person: an idea for them never reaches their calendar (§2.25.8). */
	selfContactId: string | null;
	/** Where the person pages live, for the link in each event. */
	origin: string;
}

/** The calendar's name, as the subscribing app first shows it; the member may rename it there. */
const CALENDAR_NAME = 'Stella';

/**
 * The first year of a date whose year nobody knows. A leap year, so a year-less 29 February is
 * a real day to start from.
 */
const YEARLESS_START_YEAR = 2000;

const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');

function summaryOf(source: UpcomingSource, t: Translate): string {
	const name = source.contactName;
	switch (source.kind) {
		case 'birthday':
			return t('dates.feed.birthday', { name });
		case 'anniversary':
			return t('dates.feed.anniversary', { name });
		case 'custom':
			return t('dates.feed.custom', { name, label: source.label ?? '' });
	}
}

function eventOf(source: UpcomingSource, t: Translate, origin: string): IcsEvent | null {
	const day = dayParts(source.date);
	if (!day) return null;
	// A one-off date with no year has no day to stand on.
	if (!source.recursYearly && day.year === null) return null;
	const year = day.year ?? YEARLESS_START_YEAR;
	const since =
		day.year === null || !source.recursYearly
			? null
			: source.kind === 'birthday'
				? t('dates.feed.born', { year: day.year })
				: t('dates.feed.since', { year: day.year });
	return {
		uid: `${source.dateId ?? `${source.contactId}-birthday`}@stella`,
		start: `${year}-${pad(day.month)}-${pad(day.day)}`,
		yearly: source.recursYearly,
		summary: summaryOf(source, t),
		description: since,
		url: `${origin}/contacts/${source.contactId}`
	};
}

/**
 * A fixed order: the same records give the same bytes whatever order the database returned
 * them in.
 */
const byUid = (events: IcsEvent[]) =>
	events.sort((a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));

/** The events for these sources, in a fixed order. */
export function calendarEvents(
	sources: readonly UpcomingSource[],
	t: Translate,
	origin: string
): IcsEvent[] {
	return byUid(
		datesOnTheRadar(sources)
			.map((source) => eventOf(source, t, origin))
			.filter((event) => event !== null)
	);
}

/**
 * The events for these open to-dos, in a fixed order. One without a day has none to stand on;
 * an overdue one stays on the day it was given rather than following the reader to today —
 * the calendar brings back only what a member wrote down, on their day (§2.26).
 */
export function todoEvents(
	todos: readonly HouseholdTodo[],
	t: Translate,
	origin: string
): IcsEvent[] {
	return byUid(
		todos.flatMap((todo) =>
			todo.dueOn === null
				? []
				: [
						{
							uid: `todo-${todo.id}@stella`,
							start: todo.dueOn,
							yearly: false,
							summary: t('dates.feed.todo', { title: todo.title, name: todo.contactName }),
							description: null,
							url: `${origin}/contacts/${todo.contactId}`
						}
					]
		)
	);
}

/**
 * The events for these open gift ideas on `today`, in a fixed order: one whose time is near or
 * here stands on its day; a waiting one, one asking whether it still stands, one meant for now
 * and an estimated year, which names no day, stay out — and so does every idea for the member.
 */
export function giftIdeaEvents(
	ideas: readonly IdeaWithBirth<OpenIdea>[],
	today: string,
	lang: DateLanguage,
	origin: string,
	selfContactId: string | null
): IcsEvent[] {
	return byUid(
		ideas.flatMap((idea) => {
			if (idea.when === null || idea.contactId === selfContactId) return [];
			const state = ideaState(idea, idea.birth, today);
			if (state === null || (state.kind !== 'soon' && state.kind !== 'due')) return [];
			if (state.on === null || state.approximate) return [];
			return [
				{
					uid: `gift-${idea.id}@stella`,
					start: state.on,
					yearly: false,
					summary: lang.t('dates.feed.giftIdea', { title: idea.title, name: idea.contactName }),
					description: whenChip(lang, idea.when),
					url: `${origin}/contacts/${idea.contactId}`
				}
			];
		})
	);
}

/**
 * The member's calendar as iCalendar text. Stamped with the start of today (UTC) rather than
 * the moment of the fetch, so the hourly re-fetches of one day give the same bytes and the
 * same ETag.
 */
export async function calendarFeed(
	deps: CalendarFeedDeps,
	reader: CalendarFeedReader
): Promise<string> {
	const [sources, todos, ideas] = await Promise.all([
		deps.dates.listSourcesVisibleTo(reader.viewer),
		deps.todos.listOpenVisibleTo(reader.viewer),
		deps.gifts.listOpenIdeasVisibleTo(reader.viewer)
	]);
	const lang = { t: reader.translate, intlLocale: reader.intlLocale };
	return writeIcs({
		name: CALENDAR_NAME,
		stamp: Math.floor(deps.clock.now() / DAY_MS) * DAY_MS,
		events: [
			...calendarEvents(sources, reader.translate, reader.origin),
			...todoEvents(todos, reader.translate, reader.origin),
			...giftIdeaEvents(ideas, todayFor(deps.clock), lang, reader.origin, reader.selfContactId)
		]
	});
}
