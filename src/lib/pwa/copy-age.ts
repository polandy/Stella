import type { DateLanguage } from '$lib/dates/labels';

/*
 * How old the page on screen is, as the offline line says it (docs/02 §2.18,
 * *Saying so*): "yesterday 18:04". An old copy is normal offline; what must not happen is that it
 * looks current. Pure: the moment, "now" and the viewer's time zone are handed in.
 */

const DAY_MS = 86_400_000;

/** The calendar day `time` falls on in `timeZone`, as `YYYY-MM-DD` (en-CA writes it so). */
function dayIn(time: number, timeZone: string): string {
	return new Date(time).toLocaleDateString('en-CA', { timeZone });
}

/** Whole days from the day of `then` to the day of `now`, in the viewer's zone. */
function daysBack(then: number, now: number, timeZone: string): number {
	return Math.round(
		(Date.parse(dayIn(now, timeZone)) - Date.parse(dayIn(then, timeZone))) / DAY_MS
	);
}

/** When the copy was kept: today, yesterday or a date, each with the time of day. */
export function copyAge(lang: DateLanguage, keptAt: number, now: number, timeZone: string): string {
	const moment = new Date(keptAt);
	const time = moment.toLocaleTimeString(lang.intlLocale, {
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
		timeZone
	});
	const back = daysBack(keptAt, now, timeZone);
	// A copy stamped a little ahead of this device's clock is from today, not from tomorrow.
	if (back <= 0) return lang.t('pwa.offline.keptToday', { time });
	if (back === 1) return lang.t('pwa.offline.keptYesterday', { time });

	const sameYear = dayIn(keptAt, timeZone).slice(0, 4) === dayIn(now, timeZone).slice(0, 4);
	const date = moment.toLocaleDateString(lang.intlLocale, {
		day: 'numeric',
		month: 'short',
		...(sameYear ? {} : { year: 'numeric' }),
		timeZone
	});
	return lang.t('pwa.offline.keptOn', { date, time });
}
