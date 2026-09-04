/*
 * How a date reads on screen (docs/02 §2.13.3). Pure and framework-free so the wording is
 * unit-tested rather than eyeballed in a component: an upcoming date is a countdown, not a
 * calendar entry, and a named anniversary says more than a bare count.
 */

/** What an upcoming date is, as the label functions need it. */
export interface Occasion {
	kind: 'birthday' | 'anniversary' | 'custom';
	label: string | null;
	/** Age or count reached, or null when the original year is unknown. */
	turning: number | null;
}

/** Days from now, worded the way someone would say it out loud. */
export function whenLabel(daysUntil: number, date: string, locale = 'en-GB'): string {
	if (daysUntil === 0) return 'today';
	if (daysUntil === 1) return 'tomorrow';
	if (daysUntil < 7) return `in ${daysUntil} days`;
	return new Date(date).toLocaleDateString(locale, {
		weekday: 'short',
		day: 'numeric',
		month: 'short'
	});
}

/** What the occasion is, in the sentence "<Name> …". */
export function occasionLabel(occasion: Occasion): string {
	if (occasion.kind === 'birthday') {
		return occasion.turning === null ? 'has a birthday' : `turns ${occasion.turning}`;
	}
	if (occasion.kind === 'anniversary') {
		if (occasion.label) {
			return occasion.turning === null
				? occasion.label
				: `${occasion.label} · ${occasion.turning} years`;
		}
		return occasion.turning === null ? 'has an anniversary' : `${occasion.turning} years together`;
	}
	return occasion.label ?? 'has something coming up';
}

/** Render `YYYY-MM-DD`, or a year-less `--MM-DD` without inventing a year. */
export function dayLabel(value: string, locale = 'en-GB'): string {
	const yearless = value.startsWith('--');
	// Any leap year works as a carrier so 29 February still renders.
	const date = new Date(yearless ? `2000${value.slice(1)}` : value);
	return date.toLocaleDateString(locale, {
		day: 'numeric',
		month: 'long',
		...(yearless ? {} : { year: 'numeric' })
	});
}

/**
 * Strip the year off a full ISO day, for "the year is unknown" on an `<input type="date">`
 * that can only ever produce one.
 */
export function withoutYear(isoDay: string): string {
	return isoDay.replace(/^\d{4}-/, '--');
}

const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;
const MONTH_DAYS = 30;
const YEAR_DAYS = 365;

/** How long a silence has lasted, in the coarsest unit that still reads honestly. */
export function quietLabel(days: number): string {
	if (days >= YEAR_DAYS) {
		const years = Math.round(days / YEAR_DAYS);
		return years === 1 ? 'a year' : `${years} years`;
	}
	if (days >= MONTH_DAYS * 2) return `${Math.round(days / MONTH_DAYS)} months`;
	if (days >= WEEK_DAYS * 2) return `${Math.round(days / WEEK_DAYS)} weeks`;
	return `${days} days`;
}

/**
 * How long ago something was last written about someone, for the People directory: `null`
 * when nothing ever was, so the screen can show a dash rather than a made-up date.
 */
export function sinceLabel(lastTouchedOn: string | null, today: string): string | null {
	if (lastTouchedOn === null) return null;
	const days = Math.round(
		(Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastTouchedOn}T00:00:00Z`)) / DAY_MS
	);
	if (days <= 0) return 'today';
	if (days === 1) return 'yesterday';
	return `${quietLabel(days)} ago`;
}
