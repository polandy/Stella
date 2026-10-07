import type { DateLanguage } from '$lib/dates/labels';

/*
 * Home's stream by day (docs/02 §2.22.2): newest first under a heading per calendar day —
 * *Today*, *Yesterday*, then the weekday and date — and, beside each item, what that heading
 * does not already say. Under *Today* and *Yesterday* that is the time of day it was written;
 * under an older date it is nothing, since the heading is as precise as anything a row could
 * add. The full date and time stay in the tooltip.
 *
 * Pure: the clock is handed in as `now`, the words and formats come from `DateLanguage`. Days
 * are the viewer's local calendar days, as the stream is read where the viewer is.
 */

/** One day of the stream: its heading and its items, in the order they came. */
export interface StreamDay<T> {
	label: string;
	items: T[];
}

/** The time an item shows under its day. */
export interface StreamTime {
	/** The time of day under *Today* and *Yesterday*; empty under an older day. */
	label: string;
	/** The full date and time, for the tooltip. */
	title: string;
	/** The instant, for `<time datetime>`. */
	datetime: string;
}

/** Groups a newest-first stream by the local calendar day each item was written on. */
export function streamDays<T extends { at: number }>(
	lang: DateLanguage,
	items: readonly T[],
	now: number
): StreamDay<T>[] {
	const days: StreamDay<T>[] = [];
	for (const item of items) {
		const label = dayHeading(lang, item.at, now);
		const last = days.at(-1);
		if (last && last.label === label) last.items.push(item);
		else days.push({ label, items: [item] });
	}
	return days;
}

/** What an item shows beside it, given the day heading it sits under. */
export function streamTime(lang: DateLanguage, at: number, now: number): StreamTime {
	const instant = new Date(at);
	return {
		label:
			daysBefore(at, now) <= YESTERDAY
				? instant.toLocaleTimeString(lang.intlLocale, { hour: '2-digit', minute: '2-digit' })
				: '',
		title: instant.toLocaleString(lang.intlLocale, {
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		}),
		datetime: instant.toISOString()
	};
}

const TODAY = 0;
const YESTERDAY = 1;
const DAY_MS = 86_400_000;

function dayHeading(lang: DateLanguage, at: number, now: number): string {
	const days = daysBefore(at, now);
	if (days === TODAY) return lang.t('home.today');
	if (days === YESTERDAY) return lang.t('home.yesterday');
	return new Date(at).toLocaleDateString(lang.intlLocale, {
		weekday: 'long',
		day: 'numeric',
		month: 'long'
	});
}

/** Whole local calendar days between `at` and `now`; rounding absorbs a daylight-saving hour. */
function daysBefore(at: number, now: number): number {
	const midnight = (ms: number) => new Date(ms).setHours(0, 0, 0, 0);
	return Math.round((midnight(now) - midnight(at)) / DAY_MS);
}
