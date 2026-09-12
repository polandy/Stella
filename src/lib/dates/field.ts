import { isRealCalendarDay } from './calendar';

/*
 * The pieces a date field is made of (docs/05 §5.7). A native `<input type="date">` takes its
 * order, its separators and its month names from the *browser's* locale, which has nothing to
 * do with the language Stella is being read in — a German household on an English browser is
 * asked for `mm/dd/yyyy`. So the field is assembled here instead, from the app's own locale,
 * and this module is the part that can be tested without a browser.
 *
 * The year is a segment like any other, which is also how a birthday whose year nobody
 * remembers becomes expressible at all: leave it blank and the value is `--MM-DD` (docs/03).
 */

/** The three segments, as text exactly as typed — empty means "not filled in yet". */
export interface DateParts {
	day: string;
	month: string;
	year: string;
}

/** One segment of the field. */
export type DateSegment = keyof DateParts;

/** Years are stored four-digit; anything else is a typo, not a date. */
const YEAR_SHAPE = /^\d{4}$/;

/** A leap year, so a year-less 29 February validates rather than being refused. */
const CARRIER_YEAR = 2000;

/**
 * The order the segments are written in, for this language: `day, month, year` in German,
 * `month, day, year` in American English. Read out of `Intl` rather than listed per locale,
 * so a language Stella gains later is ordered correctly without anyone editing a table.
 */
export function segmentOrder(intlLocale: string): DateSegment[] {
	const order = new Intl.DateTimeFormat(intlLocale)
		.formatToParts(new Date(Date.UTC(CARRIER_YEAR, 0, 1)))
		.map((part) => part.type)
		.filter((type): type is DateSegment => type === 'day' || type === 'month' || type === 'year');
	// A locale that somehow names fewer than three must not cost the field a segment.
	return order.length === 3 ? order : ['day', 'month', 'year'];
}

/** The twelve month names in this language, January first. */
export function monthNames(intlLocale: string): string[] {
	const format = new Intl.DateTimeFormat(intlLocale, { month: 'long', timeZone: 'UTC' });
	return Array.from({ length: 12 }, (_, index) =>
		format.format(new Date(Date.UTC(CARRIER_YEAR, index, 1)))
	);
}

const pad = (value: string): string => value.padStart(2, '0');

/**
 * The stored value for what has been typed: a full ISO day, a year-less `--MM-DD` when the
 * year was left out, or an empty string while the date is incomplete or impossible. Empty is
 * how the field says "nothing to submit" — the same thing a blank native date input says.
 */
export function partsToIso(parts: DateParts): string {
	const day = parts.day.trim();
	const month = parts.month.trim();
	const year = parts.year.trim();
	if (day === '' || month === '') return '';
	if (year !== '' && !YEAR_SHAPE.test(year)) return '';

	const value = year === '' ? `--${pad(month)}-${pad(day)}` : `${year}-${pad(month)}-${pad(day)}`;
	return isRealCalendarDay(value) ? value : '';
}

/** What is wrong with the segments as they stand, in the field's own terms. */
export type DateProblem = 'incomplete' | 'noSuchDay' | 'inFuture';

/** What the field may be told about the date it is asking for. */
export interface DateExpectation {
	/** The year may be left blank, making the value a year-less `--MM-DD`. */
	allowYearUnknown?: boolean;
	/** The latest day allowed, as a full ISO day. */
	max?: string;
}

/**
 * What is wrong with what has been typed, or null when it is usable — including the untouched
 * field, whose emptiness is the edge's own `required` to complain about.
 *
 * The half-filled case is the one that matters: three separate controls can hold a day and a
 * month with no year, which is not a date and which nothing native objects to. Left unsaid, an
 * optional field would submit and store nothing at all, losing what someone just typed.
 */
export function dateProblem(parts: DateParts, expected: DateExpectation = {}): DateProblem | null {
	const day = parts.day.trim();
	const month = parts.month.trim();
	const year = parts.year.trim();
	if (day === '' && month === '' && year === '') return null;

	const yearAnswered = expected.allowYearUnknown === true || year !== '';
	if (day === '' || month === '' || !yearAnswered) return 'incomplete';

	const iso = partsToIso(parts);
	if (iso === '') return 'noSuchDay';
	// A year-less day has no year to be later than anything.
	if (expected.max !== undefined && !iso.startsWith('--') && iso > expected.max) return 'inFuture';
	return null;
}

/** What a stored value looks like in the three segments; empty parts for no value. */
export function isoToParts(value: string): DateParts {
	const yearless = value.startsWith('--');
	const match = /^(?:(\d{4})-)?-?(\d{2})-(\d{2})$/.exec(yearless ? value.slice(1) : value);
	if (!match) return { day: '', month: '', year: '' };
	return {
		day: String(Number(match[3])),
		month: String(Number(match[2])),
		year: match[1] ?? ''
	};
}
