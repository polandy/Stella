import type { LibraryMonth, LibraryPhoto } from './library';

/*
 * How the photo picker walks the Immich timeline — all years, one year, one month, one day
 * (docs/dev/02 §2.24.9). Pure: the sheet renders these decisions, the server pages the photos.
 */

/** Where in the timeline the picker is. */
export type LibraryLevel =
	| { level: 'years' }
	| { level: 'year'; year: string }
	| { level: 'month'; month: string }
	| { level: 'day'; day: string };

export interface LibraryYear {
	year: string;
	count: number;
	/** Its count against the busiest year's, 0–1, for the meter. */
	share: number;
}

export interface LibraryDayGroup {
	day: string;
	photos: LibraryPhoto[];
}

const MONTH = /^\d{4}-(?:0[1-9]|1[0-2])$/;

/** Whether a value is a month as `YYYY-MM`. */
export function isMonth(value: unknown): value is string {
	return typeof value === 'string' && MONTH.test(value);
}

/** The last day of a month, `YYYY-MM-DD`. */
export function lastDayOf(month: string): string {
	if (!isMonth(month)) throw new Error(`lastDayOf: ${month} is not a month as YYYY-MM`);
	const [year, index] = month.split('-').map(Number);
	const days = new Date(Date.UTC(year, index, 0)).getUTCDate();
	return `${month}-${String(days).padStart(2, '0')}`;
}

/**
 * The trail from all years down to `at`, the last crumb being `at` itself. Without the overview
 * (the key lacks `timeline.read`) there are no years to go back to: the trail starts at the month.
 */
export function crumbsOf(at: LibraryLevel, overview: boolean): LibraryLevel[] {
	const day = at.level === 'day' ? at.day : null;
	const month = at.level === 'month' ? at.month : day?.slice(0, 7);
	const year = at.level === 'year' ? at.year : month?.slice(0, 4);
	const trail: LibraryLevel[] = [];
	if (overview) trail.push({ level: 'years' });
	if (overview && year !== undefined) trail.push({ level: 'year', year });
	if (month !== undefined) trail.push({ level: 'month', month });
	if (day !== null) trail.push({ level: 'day', day });
	return trail;
}

/** Each year that has photos, newest first, with its share of the busiest year. */
export function yearTotals(months: readonly LibraryMonth[]): LibraryYear[] {
	const totals = new Map<string, number>();
	for (const { month, count } of months) {
		const year = month.slice(0, 4);
		totals.set(year, (totals.get(year) ?? 0) + count);
	}
	const years = [...totals].filter(([, count]) => count > 0).sort(([a], [b]) => b.localeCompare(a));
	const busiest = Math.max(0, ...years.map(([, count]) => count));
	return years.map(([year, count]) => ({ year, count, share: count / busiest }));
}

/** The twelve months of a year in order, an empty one at a count of 0. */
export function monthsOfYear(months: readonly LibraryMonth[], year: string): LibraryMonth[] {
	const counts = new Map(months.map(({ month, count }) => [month, count]));
	return Array.from({ length: 12 }, (_, index) => {
		const month = `${year}-${String(index + 1).padStart(2, '0')}`;
		return { month, count: counts.get(month) ?? 0 };
	});
}

/**
 * Photos in the camera clock's order, grouped by the day they were taken on. A later page that
 * continues the last day joins its group; a photo without a date belongs to no day.
 */
export function groupByDay(photos: readonly LibraryPhoto[]): LibraryDayGroup[] {
	const groups: LibraryDayGroup[] = [];
	for (const photo of photos) {
		if (photo.takenAt === null) continue;
		const day = photo.takenAt.slice(0, 10);
		const last = groups.at(-1);
		if (last?.day === day) last.photos.push(photo);
		else groups.push({ day, photos: [photo] });
	}
	return groups;
}

const DAY_MS = 86_400_000;

/** The ISO 8601 week number of a day (`YYYY-MM-DD`): weeks start on Monday, week 1 holds a Thursday. */
export function isoWeekOf(day: string): number {
	const date = new Date(`${day}T00:00:00Z`);
	const weekday = (date.getUTCDay() + 6) % 7;
	const thursday = new Date(date.getTime() + (3 - weekday) * DAY_MS);
	const newYear = Date.UTC(thursday.getUTCFullYear(), 0, 1);
	return Math.floor((thursday.getTime() - newYear) / DAY_MS / 7) + 1;
}
