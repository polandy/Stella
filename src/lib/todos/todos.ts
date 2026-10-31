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

/**
 * The day as a row shows it: *Fri, 6 Nov*, with the year only when it is another one. ICU
 * versions differ on what stands between weekday and date, so that literal is set here.
 */
function shortDay(lang: DateLanguage, day: string, today: string): string {
	const parts = new Intl.DateTimeFormat(lang.intlLocale, {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' }),
		timeZone: 'UTC'
	}).formatToParts(new Date(`${day}T00:00:00Z`));
	const at = parts.findIndex((part) => part.type === 'weekday');
	const date = parts
		.filter((_part, i) => i !== at && i !== at + 1)
		.map((part) => part.value)
		.join('');
	return `${parts[at]?.value ?? ''}, ${date}`;
}

/** What a row says about its day: *today*, *tomorrow*, *by Fri, 6 Nov*, *was due Wed, 28 Oct*. */
export function dueLabel(lang: DateLanguage, dueOn: string | null, today: string): string | null {
	if (dueOn === null) return null;
	if (dueOn === today) return lang.t('common.today');
	if (dueOn === addDays(today, 1)) return lang.t('common.tomorrow');
	const day = shortDay(lang, dueOn, today);
	return dueOn < today ? lang.t('todos.wasDue', { day }) : lang.t('todos.dueBy', { day });
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

/** A to-do ticked on this card, kept in view while the toast announcing it stands. */
export interface JustDone<T> {
	todo: T;
	/** The toast's notice (`RemovalsSnapshot.notices`); null while the tick is being saved. */
	noticeId: number | null;
	/** Its *Undo* is on its way: shown open until the page is read again. */
	reopening: boolean;
}

/** A row of the card: an open to-do, or one just ticked and still struck through there. */
export interface CardTodo<T> {
	todo: T;
	done: boolean;
}

/**
 * What the card shows: the open to-dos, and each one just ticked where it stood, struck
 * through, while its toast stands — so ticking the last one does not take the card away under
 * the reader's thumb, as a removal waits for its window (docs/02 §2.23). `standing` holds the
 * ids of the notices still shown.
 */
export function cardTodos<T extends { id: string; dueOn: string | null; createdAt: number }>(
	open: readonly T[],
	justDone: readonly JustDone<T>[],
	standing: ReadonlySet<number>
): CardTodo<T>[] {
	const shown = new Map(open.map((todo) => [todo.id, todo]));
	// Saved, the page has been read again: if Stella still lists it as open, it was opened again.
	const struck = (entry: JustDone<T>) =>
		!entry.reopening &&
		(entry.noticeId === null || (standing.has(entry.noticeId) && !shown.has(entry.todo.id)));
	const done = new Set(justDone.filter(struck).map((entry) => entry.todo.id));
	for (const entry of justDone) {
		if ((entry.reopening || struck(entry)) && !shown.has(entry.todo.id))
			shown.set(entry.todo.id, entry.todo);
	}
	return orderOpenTodos([...shown.values()]).map((todo) => ({ todo, done: done.has(todo.id) }));
}

const TODO_PARAM = 'todo';

/**
 * Where the command palette's *To-do for …* lands (docs/05 §5.4): the person's page with the
 * card's add field open. No hash, for the reason `giftIdeaPath` gives.
 */
export function newTodoPath(contactId: string): string {
	return `/contacts/${contactId}?${TODO_PARAM}=new`;
}

/** Whether a page address asks for the add field (`newTodoPath`). */
export function asksForNewTodo(url: URL): boolean {
	return url.searchParams.get(TODO_PARAM) === 'new';
}
