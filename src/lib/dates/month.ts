/*
 * A month as a calendar shows it (docs/05 §5.7): the grid behind the composer's
 * *Another day…*. Built here rather than taken from `<input type="date">`, whose calendar
 * speaks the browser's language instead of the app's — the reason the date field exists.
 *
 * Months are `YYYY-MM`, days `YYYY-MM-DD`, all handled in UTC so no local zone can move a
 * day across midnight. Weekdays are numbered as `Date#getUTCDay` does, Sunday = 0.
 */

const DAYS_IN_WEEK = 7;
/** Enough for any month, so a calendar keeps one height and its header never moves. */
const WEEKS_SHOWN = 6;
/** A Monday, from which the weekday names are counted. */
const A_MONDAY = Date.UTC(2024, 0, 1);
const DAY_MS = 86_400_000;
/** Where a locale says nothing about its week, Monday — ISO 8601, and both of Stella's. */
const MONDAY = 1;

const pad = (n: number) => String(n).padStart(2, '0');

/** The month a day lies in. */
export function monthOf(day: string): string {
	return day.slice(0, 7);
}

/** The month `delta` months after `month` (before, when negative). */
export function shiftMonth(month: string, delta: number): string {
	const [year, monthIndex] = month.split('-').map(Number);
	const shifted = new Date(Date.UTC(year, monthIndex - 1 + delta, 1));
	return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}`;
}

/**
 * The month's days in six weeks of seven starting on `weekStart`, with `null` filling the
 * days before the 1st and after the last.
 */
export function monthGrid(month: string, weekStart: number): (string | null)[][] {
	const [year, monthIndex] = month.split('-').map(Number);
	const length = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
	const lead = (new Date(Date.UTC(year, monthIndex - 1, 1)).getUTCDay() - weekStart + DAYS_IN_WEEK) % DAYS_IN_WEEK;
	const cells: (string | null)[] = [
		...Array<null>(lead).fill(null),
		...Array.from({ length }, (_, i) => `${month}-${pad(i + 1)}`)
	];
	while (cells.length < WEEKS_SHOWN * DAYS_IN_WEEK) cells.push(null);
	return Array.from({ length: cells.length / DAYS_IN_WEEK }, (_, w) =>
		cells.slice(w * DAYS_IN_WEEK, (w + 1) * DAYS_IN_WEEK)
	);
}

/** The month's name alone, "September", in the reader's language; the year is chosen beside it. */
export function monthName(month: string, intlLocale: string): string {
	return new Date(`${month}-01T00:00:00Z`).toLocaleDateString(intlLocale, {
		month: 'long',
		timeZone: 'UTC'
	});
}

/** The weekdays' short names, in the order the calendar's columns stand. */
export function weekdayNames(intlLocale: string, weekStart: number): string[] {
	const format = new Intl.DateTimeFormat(intlLocale, { weekday: 'short', timeZone: 'UTC' });
	return Array.from({ length: DAYS_IN_WEEK }, (_, column) => {
		// A_MONDAY is weekday 1; step to the column's weekday from there.
		const weekday = (weekStart + column) % DAYS_IN_WEEK;
		const offset = (weekday - MONDAY + DAYS_IN_WEEK) % DAYS_IN_WEEK;
		return format.format(A_MONDAY + offset * DAY_MS).replace(/\.$/, '');
	});
}

/** The week's first day in `intlLocale`, Sunday = 0; Monday where the browser cannot say. */
export function firstDayOfWeek(intlLocale: string): number {
	// `getWeekInfo` is recent; older engines exposed the same as a `weekInfo` getter.
	const locale = new Intl.Locale(intlLocale) as Intl.Locale & {
		getWeekInfo?: () => { firstDay: number };
		weekInfo?: { firstDay: number };
	};
	const firstDay = (locale.getWeekInfo?.() ?? locale.weekInfo)?.firstDay;
	return firstDay === undefined ? MONDAY : firstDay % DAYS_IN_WEEK;
}

/** The day `delta` days after `day` (before, when negative). */
export function addDays(day: string, delta: number): string {
	return new Date(Date.parse(`${day}T00:00:00Z`) + delta * DAY_MS).toISOString().slice(0, 10);
}

/** How far back the year choice reaches: a lifetime, for a memory written down late. */
const YEARS_OFFERED = 101;

/** The years a calendar ending on `max` offers, newest first. */
export function yearsBack(max: string): number[] {
	const latest = Number(max.slice(0, 4));
	return Array.from({ length: YEARS_OFFERED }, (_, i) => latest - i);
}

/** `month` moved to `year`, held back to `lastMonth` so a year choice never opens the future. */
export function inYear(month: string, year: number, lastMonth: string): string {
	const moved = `${year}-${month.slice(5)}`;
	return moved > lastMonth ? lastMonth : moved;
}
