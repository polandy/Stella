import type { DateLanguage } from '$lib/dates/labels';
import { addDays } from '$lib/dates/month';

/*
 * How an open to-do stands and reads (docs/02 §2.26). Pure and handed *today* — the server's
 * day, never the wall clock — so the card's order, the overdue mark and the label are tested
 * without a browser; the card only renders.
 *
 * Days are ISO strings compared as text and formatted in UTC: the day is already the
 * household's, and reading it in a zone west of Greenwich would name the day before.
 */

/** How far ahead a day still counts as *soon*: the coming week. */
const SOON_DAYS = 7;

/** Where a to-do's day stands against today; null when it has none. */
export type DueStanding = 'overdue' | 'today' | 'soon' | 'later';

export function dueStanding(dueOn: string | null, today: string): DueStanding | null {
	if (dueOn === null) return null;
	if (dueOn < today) return 'overdue';
	if (dueOn === today) return 'today';
	return dueOn <= addDays(today, SOON_DAYS) ? 'soon' : 'later';
}

/** The day as a row shows it: *Fri 6 Nov*, with the year only when it is another one. */
function shortDay(lang: DateLanguage, day: string, today: string): string {
	return new Date(`${day}T00:00:00Z`).toLocaleDateString(lang.intlLocale, {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' }),
		timeZone: 'UTC'
	});
}

/** What a row says about its day: *today*, *tomorrow*, *by Fri 6 Nov*, *overdue since …*. */
export function dueLabel(lang: DateLanguage, dueOn: string | null, today: string): string | null {
	if (dueOn === null) return null;
	if (dueOn === today) return lang.t('common.today');
	if (dueOn === addDays(today, 1)) return lang.t('common.tomorrow');
	const day = shortDay(lang, dueOn, today);
	return dueOn < today ? lang.t('todos.overdueSince', { day }) : lang.t('todos.dueBy', { day });
}

/**
 * The card's order: to-dos with a day first, soonest first, then those without, newest first —
 * what is pressing on top, and among the rest what was just thought of.
 */
export function orderOpenTodos<T extends { dueOn: string | null; createdAt: number }>(
	todos: readonly T[]
): T[] {
	return [...todos].sort((a, b) => {
		if (a.dueOn !== null && b.dueOn !== null)
			return a.dueOn === b.dueOn ? a.createdAt - b.createdAt : a.dueOn < b.dueOn ? -1 : 1;
		if (a.dueOn !== null) return -1;
		if (b.dueOn !== null) return 1;
		return b.createdAt - a.createdAt;
	});
}

const TODO_PARAM = 'todo';

/**
 * Where the command palette's *To do for …* lands (docs/05 §5.4): the person's page with the
 * card's add field open. No hash, for the reason `giftIdeaPath` gives.
 */
export function newTodoPath(contactId: string): string {
	return `/contacts/${contactId}?${TODO_PARAM}=new`;
}

/** Whether a page address asks for the add field (`newTodoPath`). */
export function asksForNewTodo(url: URL): boolean {
	return url.searchParams.get(TODO_PARAM) === 'new';
}
