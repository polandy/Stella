import type { LibraryLevel } from './library-nav';

/*
 * How the photo picker names the timeline in the reader's locale (docs/dev/02 §2.24.9). Dates are
 * on the camera's clock, so they are read as UTC and never moved into the device's zone.
 */

const dateOf = (day: string) => new Date(`${day}T00:00:00Z`);

const format = (day: string, locale: string, options: Intl.DateTimeFormatOptions) =>
	dateOf(day).toLocaleDateString(locale, { ...options, timeZone: 'UTC' });

/** A day as the day view's heading says it: *Wednesday, 21 October 2026*. */
export const longDay = (day: string, locale: string): string =>
	format(day, locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** A day as a month's list heads its photos: *Wednesday 21 October*. */
export const dayHeading = (day: string, locale: string): string =>
	format(day, locale, { weekday: 'long', day: 'numeric', month: 'long' });

/** A month by its name: *October*. */
export const monthName = (month: string, locale: string): string =>
	format(`${month}-01`, locale, { month: 'long' });

/** A month with its year: *October 2026*. */
export const monthAndYear = (month: string, locale: string): string =>
	format(`${month}-01`, locale, { month: 'long', year: 'numeric' });

/** When a photo found by a search was taken: *21 Oct 2026*. */
export const shortDate = (takenAt: string, locale: string): string =>
	format(takenAt.slice(0, 10), locale, { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * When an album's photos were taken, as briefly as its first and last day allow: *Jul 2026*,
 * *Feb – Mar 2025*, *2019–2026*.
 */
export function albumRange(from: string, to: string, locale: string): string {
	const month = (day: string, year: boolean) =>
		format(day, locale, { month: 'short', ...(year ? { year: 'numeric' } : {}) });
	if (from.slice(0, 7) === to.slice(0, 7)) return month(from, true);
	if (from.slice(0, 4) === to.slice(0, 4)) return `${month(from, false)} – ${month(to, true)}`;
	return `${from.slice(0, 4)}–${to.slice(0, 4)}`;
}

/**
 * What a crumb of the trail says; `allYears` and `allAlbums` are the tops', already translated.
 * Without the overview the month is the top, so it names its year too.
 */
export function crumbLabel(
	at: LibraryLevel,
	locale: string,
	{ overview, allYears, allAlbums }: { overview: boolean; allYears: string; allAlbums: string }
): string {
	switch (at.level) {
		case 'years':
			return allYears;
		case 'albums':
			return allAlbums;
		case 'album':
			return at.name;
		case 'year':
			return at.year;
		case 'month':
			return overview ? monthName(at.month, locale) : monthAndYear(at.month, locale);
		case 'day':
			return format(at.day, locale, { weekday: 'short', day: 'numeric' });
	}
}
