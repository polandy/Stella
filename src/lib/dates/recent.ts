import type { DateLanguage } from './labels';
import { addDays } from './month';

/*
 * The days the composer's day pill offers (docs/02 §2.22.1). Almost every moment is from
 * today or the last few days, so those are one tap away and any other day is left to the
 * full date field.
 *
 * Days are ISO strings stepped and formatted in UTC: the day is already the viewer's local
 * one, and reading it back in a local zone west of Greenwich would name the day before.
 */

/** Today and the six days before it: one week, so every weekday is named once. */
const RECENT_DAY_COUNT = 7;

/** One entry of the pill's menu. */
export interface RecentDay {
	/** `YYYY-MM-DD`. */
	day: string;
	/** "Today", "Yesterday", or the weekday. */
	name: string;
	/** The short date beside the name, e.g. "27 Sept". */
	date: string;
}

const atUtcMidnight = (day: string) => new Date(`${day}T00:00:00Z`);

function relativeName(lang: DateLanguage, back: number): string | null {
	if (back === 0) return lang.t('composer.dayToday');
	if (back === 1) return lang.t('composer.dayYesterday');
	return null;
}

/** Today and the days just before it, newest first. */
export function recentDays(lang: DateLanguage, today: string): RecentDay[] {
	return Array.from({ length: RECENT_DAY_COUNT }, (_, back) => {
		const day = addDays(today, -back);
		const date = atUtcMidnight(day);
		return {
			day,
			name:
				relativeName(lang, back) ??
				date.toLocaleDateString(lang.intlLocale, { weekday: 'long', timeZone: 'UTC' }),
			date: date.toLocaleDateString(lang.intlLocale, { day: 'numeric', month: 'short', timeZone: 'UTC' })
		};
	});
}

/** What the pill says for the chosen day: short, and with a year only when it is another one. */
export function pickedDayLabel(lang: DateLanguage, day: string, today: string): string {
	const back = recentDays(lang, today).findIndex((recent) => recent.day === day);
	const relative = relativeName(lang, back);
	if (relative) return relative;
	return atUtcMidnight(day).toLocaleDateString(lang.intlLocale, {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' }),
		timeZone: 'UTC'
	});
}
