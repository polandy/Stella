/*
 * Calendar-day validation shared by everything that stores a day as text (important dates,
 * interactions). A shape check alone lets `2026-02-30` through, and the date maths downstream
 * would silently roll it into March rather than refuse it.
 *
 * Client-safe on purpose: the date field refuses an impossible day while it is being typed,
 * and it has to refuse exactly the days the server would, not a second opinion.
 */

/** A full ISO day, or a year-less `--MM-DD`. */
export const DATE_SHAPE = /^(?:(\d{4})-(\d{2})-(\d{2})|--(\d{2})-(\d{2}))$/;

/** A full ISO day only. */
export const FULL_DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/** A stored day read into numbers; `year` is null for a year-less `--MM-DD`. */
export interface DayParts {
	year: number | null;
	month: number;
	day: number;
}

/**
 * The parts of a full ISO day or a year-less `--MM-DD`; null for anything else — a bare year or
 * an age estimate has no day in it (docs/03 §3.4). Shape only: `2026-02-30` still reads.
 */
export function dayParts(value: string): DayParts | null {
	const m = DATE_SHAPE.exec(value);
	if (!m) return null;
	return {
		year: m[1] ? Number(m[1]) : null,
		month: Number(m[2] ?? m[4]),
		day: Number(m[3] ?? m[5])
	};
}

/** Order two days within a year, by month and then day; the years are not looked at. */
export function compareMonthDay(a: DayParts, b: DayParts): number {
	return a.month - b.month || a.day - b.day;
}

/**
 * Whether the value names a day that exists. A year-less date is validated against a leap
 * year so 29 February stays legal.
 */
export function isRealCalendarDay(value: string): boolean {
	const parts = dayParts(value);
	if (!parts) return false;
	const { month, day } = parts;
	if (month < 1 || month > 12 || day < 1) return false;
	const lastDayOfMonth = new Date(Date.UTC(parts.year ?? 2000, month, 0)).getUTCDate();
	return day <= lastDayOfMonth;
}

/**
 * A day with its year that exists — what a relationship's since day must be, and what a since
 * day can be suggested from: `--06-01` is a birthday but says nothing about *when*.
 */
export function isWholeDay(value: string): boolean {
	return FULL_DATE_SHAPE.test(value) && isRealCalendarDay(value);
}
