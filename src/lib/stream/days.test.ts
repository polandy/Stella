import { describe, expect, test } from 'bun:test';
import { INTL_LOCALES } from '$lib/i18n/locales';
import { createTranslator } from '$lib/i18n/translate';
import type { DateLanguage } from '$lib/dates/labels';
import { streamDays, streamTime } from './days';

/*
 * Home's stream, grouped by the day a thing was written, and the time an item shows under its
 * day (docs/02 §2.22.2). Days are the household's, in the zone handed in; every instant is
 * written in UTC against Zurich's summer time (UTC+2), so the cases hold in any zone the
 * runner happens to be in.
 */

const en: DateLanguage = { t: createTranslator('en'), intlLocale: INTL_LOCALES.en };
const de: DateLanguage = { t: createTranslator('de'), intlLocale: INTL_LOCALES.de };

const ZONE = 'Europe/Zurich';
/** An instant at a Zurich wall-clock time in October 2026 (UTC+2). */
const at = (day: number, hour: number, minute: number) => Date.UTC(2026, 9, day, hour - 2, minute);
/** Wednesday 7 October 2026, 14:00 in Zurich — the clock every case reads. */
const NOW = at(7, 14, 0);

describe('streamDays', () => {
	test('groups the newest-first stream under Today, Yesterday and then the date', () => {
		const items = [
			{ id: 'a', at: at(7, 8, 41) },
			{ id: 'b', at: at(7, 0, 5) },
			{ id: 'c', at: at(6, 23, 59) },
			{ id: 'd', at: at(5, 21, 5) },
			{ id: 'e', at: at(5, 9, 0) }
		];
		const days = streamDays(en, items, NOW, ZONE);
		expect(days.map((d) => d.label)).toEqual(['Today', 'Yesterday', 'Monday 5 October']);
		expect(days.map((d) => d.items.map((i) => i.id))).toEqual([['a', 'b'], ['c'], ['d', 'e']]);
	});

	test('names the days in the reader’s language', () => {
		const days = streamDays(
			de,
			[{ at: at(7, 8, 0) }, { at: at(6, 8, 0) }, { at: at(1, 8, 0) }],
			NOW,
			ZONE
		);
		expect(days.map((d) => d.label)).toEqual(['Heute', 'Gestern', 'Donnerstag, 1. Oktober']);
	});

	test('counts days in the household zone, not the zone the code runs in', () => {
		// 00:30 in Zurich is still the evening before in UTC, where a server container runs.
		const justAfterMidnight = { id: 'a', at: at(7, 0, 30) };
		const lateLastNight = { id: 'b', at: at(6, 23, 30) };
		const days = streamDays(en, [justAfterMidnight, lateLastNight], at(7, 9, 0), ZONE);
		expect(days.map((d) => d.label)).toEqual(['Today', 'Yesterday']);
		expect(streamDays(en, [justAfterMidnight], at(7, 9, 0), 'UTC')[0].label).toBe('Yesterday');
	});

	test('keeps a day across the daylight-saving change', () => {
		// Sunday 25 October 2026 is 23 hours long in Zurich (UTC+2 until 03:00, then UTC+1).
		const now = Date.UTC(2026, 9, 26, 11, 0); // Monday 12:00 in Zurich
		const sundayLate = Date.UTC(2026, 9, 25, 22, 30); // Sunday 23:30
		const saturdayLate = Date.UTC(2026, 9, 24, 21, 30); // Saturday 23:30
		const days = streamDays(en, [{ at: sundayLate }, { at: saturdayLate }], now, ZONE);
		expect(days.map((d) => d.label)).toEqual(['Yesterday', 'Saturday 24 October']);
	});

	test('has no day for an empty stream', () => {
		expect(streamDays(en, [], NOW, ZONE)).toEqual([]);
	});
});

describe('streamTime', () => {
	test('gives the time of day under Today and Yesterday', () => {
		expect(streamTime(en, at(7, 8, 41), NOW, ZONE).label).toBe('08:41');
		expect(streamTime(en, at(6, 19, 20), NOW, ZONE).label).toBe('19:20');
		expect(streamTime(de, at(6, 19, 20), NOW, ZONE).label).toBe('19:20');
	});

	test('gives nothing for an older day: its heading already says when', () => {
		expect(streamTime(en, at(5, 21, 5), NOW, ZONE).label).toBe('');
		expect(streamTime(en, Date.UTC(2025, 9, 7, 6, 0), NOW, ZONE).label).toBe('');
	});

	test('keeps the full date and time for the tooltip, on every day', () => {
		const older = streamTime(en, at(5, 21, 5), NOW, ZONE);
		// Loose on purpose: the separators differ between ICU builds; the parts are what matter.
		expect(older.title).toMatch(/Monday.*5 October 2026.*21:05/);
		expect(streamTime(en, at(7, 8, 41), NOW, ZONE).title).toMatch(
			/Wednesday.*7 October 2026.*08:41/
		);
	});

	test('gives the instant in a machine-readable form', () => {
		const instant = at(7, 8, 41);
		expect(streamTime(en, instant, NOW, ZONE).datetime).toBe(new Date(instant).toISOString());
	});
});
