import type { DateLanguage } from '$lib/dates/labels';

/*
 * A circle's period as its page's header line shows it (docs/02 §2.4.2). A circle's period is
 * a school year or a season, so months say it better than days: *Aug 2025 – Jul 2026*.
 */

/** One end of the period: month and year, or the year alone when that is all that is stored. */
function monthOrYear(lang: DateLanguage, value: string): string {
	const [year, month] = value.split('-');
	if (!month) return year;
	return new Date(`${year}-${month}-01T00:00:00Z`).toLocaleDateString(lang.intlLocale, {
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC'
	});
}

/** The period in the reader's language, or null when the circle has none. */
export function circlePeriodLabel(
	lang: DateLanguage,
	startDate: string | null,
	endDate: string | null
): string | null {
	const start = startDate ? monthOrYear(lang, startDate) : null;
	const end = endDate ? monthOrYear(lang, endDate) : null;
	if (start && end) return lang.t('circles.period.range', { start, end });
	if (start) return lang.t('circles.period.from', { start });
	if (end) return lang.t('circles.period.until', { end });
	return null;
}
