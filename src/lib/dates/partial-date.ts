import { compareMonthDay, dayParts, type DayParts } from './calendar';

/*
 * A date that may be known only in part (docs/03 §3.4): the stored text plus how much of it is
 * known. A plain value rather than a class, so it crosses a `load` and an import plan unchanged;
 * the storage keeps its two columns, and this is where the rules about them live.
 */

/** How much of a date is known: a whole day, a day without a year, a year, or an estimated year. */
export type DatePrecision = 'full' | 'month_day' | 'year' | 'age';

/**
 * `full` is `YYYY-MM-DD`, `month_day` is `--MM-DD`, and `year` and `age` are a bare `YYYY` —
 * `age` one worked out from an age someone gave.
 */
export interface PartialDate {
	readonly value: string;
	readonly precision: DatePrecision;
}

/** The precisions that name a day, so a birthday and its reminder can fall on them. */
export const DAY_PRECISIONS = ['full', 'month_day'] as const satisfies readonly DatePrecision[];

/** Whether a date of this precision falls on a day — a birthday can be shown and reminded. */
export function namesADay(precision: DatePrecision): boolean {
	return (DAY_PRECISIONS as readonly DatePrecision[]).includes(precision);
}

/** A typed or imported day with the precision its shape says; null when it is not a day. */
export function partialDateOfDay(value: string): PartialDate | null {
	const parts = dayParts(value);
	if (!parts) return null;
	return { value, precision: parts.year === null ? 'month_day' : 'full' };
}

const BARE_YEAR = /^\d{4}$/;

/** What a partial date says, as numbers; null when the value does not have its precision's shape. */
function known(date: PartialDate): { year: number | null; day: DayParts | null } | null {
	if (date.precision === 'year' || date.precision === 'age') {
		return BARE_YEAR.test(date.value) ? { year: Number(date.value), day: null } : null;
	}
	const parts = dayParts(date.value);
	if (!parts || (parts.year === null) !== (date.precision === 'month_day')) return null;
	return { year: parts.year, day: parts };
}

/**
 * Which of two partial dates came first, as far as both say: negative, zero or positive, or
 * null when what is known cannot decide it — a year-less day against a dated one, or two dates
 * in the same year when either knows only the year.
 */
export function comparePartialDates(a: PartialDate, b: PartialDate): number | null {
	const x = known(a);
	const y = known(b);
	if (!x || !y) return null;
	if ((x.year === null) !== (y.year === null)) return null;
	if (x.year !== null && y.year !== null && x.year !== y.year) return x.year - y.year;
	if (!x.day || !y.day) return null;
	return compareMonthDay(x.day, y.day);
}
