/*
 * *On this day* (docs/02 §2.12.1): what the household wrote on today's day and month in earlier
 * years. Pure and handed the day — the household's, read off the injected clock at the edge —
 * so the 29 February rule and the grouping are tested without a calendar on the wall.
 */

/** Home's band stops after three entries, as *Coming up* and *To do* do (docs/05 §5.5.1). */
export const MEMORY_BAND_CAP = 3;

/** The photos that fit one row of the 17 rem rail. */
export const MEMORY_STRIP_CAP = 4;

const isLeapYear = (year: number): boolean =>
	(year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

const yearOf = (day: string): number => Number(day.slice(0, 4));

/**
 * The `MM-DD` days a day remembers: its own, and on 28 February of a common year also the 29th,
 * which would otherwise only come round every fourth year.
 */
export function memoryDaysFor(day: string): string[] {
	const monthDay = day.slice(5, 10);
	if (monthDay === '02-28' && !isLeapYear(yearOf(day))) return ['02-28', '02-29'];
	return [monthDay];
}

/** Whole years between a remembered day and the day it is remembered on. */
export function yearsAgoOn(date: string, day: string): number {
	return yearOf(day) - yearOf(date);
}

/** One earlier year's entries, as a group of the band and the page. */
export interface MemoryYear<T> {
	year: number;
	yearsAgo: number;
	items: T[];
}

type Remembered = { date: string; at: number };

/**
 * The entries grouped by year, newest year first, and within a year the last written first.
 * Only earlier years count: what was written today is not a memory yet.
 */
export function memoryYears<T extends Remembered>(
	items: readonly T[],
	day: string
): MemoryYear<T>[] {
	const byYear = new Map<number, T[]>();
	for (const item of items) {
		const year = yearOf(item.date);
		if (year >= yearOf(day)) continue;
		byYear.set(year, [...(byYear.get(year) ?? []), item]);
	}
	return [...byYear.entries()]
		.sort(([a], [b]) => b - a)
		.map(([year, list]) => ({
			year,
			yearsAgo: yearOf(day) - year,
			items: list.toSorted((a, b) => b.at - a.at)
		}));
}

export interface MemoryBand<T, P> {
	/** At most three entries, still under their years. */
	years: MemoryYear<T>[];
	/** At most one row of photos. */
	photos: P[];
	/** Whether `/on-this-day` holds more than the band shows — then *More* links there. */
	more: boolean;
	/** Nothing to remember: Home leaves the band out (docs/05 §5.5.1). */
	empty: boolean;
}

/** What Home's band keeps of a day's memories. */
export function memoryBand<T, P>(
	years: readonly MemoryYear<T>[],
	photos: readonly P[]
): MemoryBand<T, P> {
	const kept: MemoryYear<T>[] = [];
	let room = MEMORY_BAND_CAP;
	for (const year of years) {
		if (room === 0) break;
		kept.push({ ...year, items: year.items.slice(0, room) });
		room -= Math.min(room, year.items.length);
	}
	const entries = years.reduce((n, year) => n + year.items.length, 0);
	return {
		years: kept,
		photos: photos.slice(0, MEMORY_STRIP_CAP),
		more: entries > MEMORY_BAND_CAP || photos.length > MEMORY_STRIP_CAP,
		empty: entries === 0 && photos.length === 0
	};
}

const DAY_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The day `/on-this-day?day=` asks for: a real `YYYY-MM-DD` no later than today — a day still to
 * come has nothing to remember yet. Anything else reads as today.
 */
export function pickedDay(param: string | null, today: string): string {
	if (param === null || !DAY_SHAPE.test(param) || param > today) return today;
	const at = Date.parse(`${param}T00:00:00Z`);
	// A day that does not exist either fails to parse or rolls over into the next month.
	const real = !Number.isNaN(at) && new Date(at).toISOString().slice(0, 10) === param;
	return real ? param : today;
}
