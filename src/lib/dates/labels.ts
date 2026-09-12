import type { Translate } from '$lib/i18n/translate';

/*
 * How a date reads on screen (docs/02 §2.13.3). Pure and framework-free so the wording is
 * unit-tested rather than eyeballed in a component: an upcoming date is a countdown, not a
 * calendar entry, and a named anniversary says more than a bare count.
 *
 * The words themselves come from the message catalogue and the calendar formatting from
 * `Intl`, both handed in as `DateLanguage` — the viewer's `I18n` satisfies it as it is.
 */

/** What these labels need of the viewer's language (docs/02 §2.19). */
export interface DateLanguage {
	t: Translate;
	/** The BCP-47 tag `Intl` formats with, e.g. "de-DE". */
	intlLocale: string;
}

/** What an upcoming date is, as the label functions need it. */
export interface Occasion {
	kind: 'birthday' | 'anniversary' | 'custom';
	label: string | null;
	/** Age or count reached, or null when the original year is unknown. */
	turning: number | null;
}

/** Days from now, worded the way someone would say it out loud. */
export function whenLabel(lang: DateLanguage, daysUntil: number, date: string): string {
	if (daysUntil === 0) return lang.t('common.today');
	if (daysUntil === 1) return lang.t('common.tomorrow');
	if (daysUntil < 7) return lang.t('dates.inDays', { days: daysUntil });
	return new Date(date).toLocaleDateString(lang.intlLocale, {
		weekday: 'short',
		day: 'numeric',
		month: 'short'
	});
}

/** What the occasion is, in the sentence "<Name> …". */
export function occasionLabel(lang: DateLanguage, occasion: Occasion): string {
	if (occasion.kind === 'birthday') {
		return occasion.turning === null
			? lang.t('dates.hasBirthday')
			: lang.t('dates.turns', { age: occasion.turning });
	}
	if (occasion.kind === 'anniversary') {
		if (occasion.label) {
			return occasion.turning === null
				? occasion.label
				: lang.t('dates.namedAnniversary', { label: occasion.label, years: occasion.turning });
		}
		return occasion.turning === null
			? lang.t('dates.hasAnniversary')
			: lang.t('dates.yearsTogether', { years: occasion.turning });
	}
	return occasion.label ?? lang.t('dates.somethingComingUp');
}

/** Render `YYYY-MM-DD`, or a year-less `--MM-DD` without inventing a year. */
export function dayLabel(lang: DateLanguage, value: string): string {
	const yearless = value.startsWith('--');
	// Any leap year works as a carrier so 29 February still renders.
	const date = new Date(yearless ? `2000${value.slice(1)}` : value);
	return date.toLocaleDateString(lang.intlLocale, {
		day: 'numeric',
		month: 'long',
		...(yearless ? {} : { year: 'numeric' })
	});
}

const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;
const MONTH_DAYS = 30;
const YEAR_DAYS = 365;

/** A silence rounded to the coarsest unit that still reads honestly. */
interface Span {
	unit: 'year' | 'month' | 'week' | 'day';
	amount: number;
}

function coarseSpan(days: number): Span {
	if (days >= YEAR_DAYS) return { unit: 'year', amount: Math.round(days / YEAR_DAYS) };
	if (days >= MONTH_DAYS * 2) return { unit: 'month', amount: Math.round(days / MONTH_DAYS) };
	if (days >= WEEK_DAYS * 2) return { unit: 'week', amount: Math.round(days / WEEK_DAYS) };
	return { unit: 'day', amount: days };
}

/** How long a silence has lasted, on its own: "3 months", "a year". */
export function quietLabel(lang: DateLanguage, days: number): string {
	const span = coarseSpan(days);
	if (span.unit === 'year') {
		return span.amount === 1 ? lang.t('dates.aYear') : lang.t('dates.years', { years: span.amount });
	}
	if (span.unit === 'month') return lang.t('dates.months', { months: span.amount });
	if (span.unit === 'week') return lang.t('dates.weeks', { weeks: span.amount });
	return lang.t('dates.days', { days: span.amount });
}

/**
 * The same silence as a point in the past: "3 months ago". A separate set of messages
 * rather than a duration glued to an "ago", because German declines the duration there
 * ("3 Monate" but "vor 3 Monaten").
 */
export function agoLabel(lang: DateLanguage, days: number): string {
	const span = coarseSpan(days);
	if (span.unit === 'year') {
		return span.amount === 1
			? lang.t('dates.ago.aYear')
			: lang.t('dates.ago.years', { years: span.amount });
	}
	if (span.unit === 'month') return lang.t('dates.ago.months', { months: span.amount });
	if (span.unit === 'week') return lang.t('dates.ago.weeks', { weeks: span.amount });
	return lang.t('dates.ago.days', { days: span.amount });
}

/**
 * How long ago something was last written about someone, for the People directory: `null`
 * when nothing ever was, so the screen can show a dash rather than a made-up date.
 */
export function sinceLabel(
	lang: DateLanguage,
	lastTouchedOn: string | null,
	today: string
): string | null {
	if (lastTouchedOn === null) return null;
	const days = Math.round(
		(Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastTouchedOn}T00:00:00Z`)) / DAY_MS
	);
	if (days <= 0) return lang.t('common.today');
	if (days === 1) return lang.t('common.yesterday');
	return agoLabel(lang, days);
}
