/*
 * Calendar-day validation shared by everything that stores a day as text (important dates,
 * interactions). A shape check alone lets `2026-02-30` through, and the date maths downstream
 * would silently roll it into March rather than refuse it.
 */

/** A full ISO day, or a year-less `--MM-DD`. */
export const DATE_SHAPE = /^(?:(\d{4})-(\d{2})-(\d{2})|--(\d{2})-(\d{2}))$/;

/** A full ISO day only. */
export const FULL_DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Whether the value names a day that exists. A year-less date is validated against a leap
 * year so 29 February stays legal.
 */
export function isRealCalendarDay(value: string): boolean {
	const m = DATE_SHAPE.exec(value);
	if (!m) return false;
	const year = m[1] ? Number(m[1]) : 2000;
	const month = Number(m[2] ?? m[4]);
	const day = Number(m[3] ?? m[5]);
	if (month < 1 || month > 12 || day < 1) return false;
	const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
	return day <= lastDayOfMonth;
}
