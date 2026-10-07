import { describe, expect, test } from 'bun:test';
import { INTL_LOCALES } from '$lib/i18n/locales';
import { createTranslator } from '$lib/i18n/translate';
import type { DateLanguage } from '$lib/dates/labels';
import { streamDays, streamTime } from './days';

/*
 * Home's stream, grouped by the day a thing was written, and the time an item shows under its
 * day (docs/02 §2.22.2). Every instant is built from the local calendar, so the cases hold in
 * any time zone the runner happens to be in.
 */

const en: DateLanguage = { t: createTranslator('en'), intlLocale: INTL_LOCALES.en };
const de: DateLanguage = { t: createTranslator('de'), intlLocale: INTL_LOCALES.de };

/** Wednesday 7 October 2026, 14:00 local — the clock every case reads. */
const NOW = new Date(2026, 9, 7, 14, 0).getTime();
const at = (day: number, hour: number, minute: number) =>
	new Date(2026, 9, day, hour, minute).getTime();

describe('streamDays', () => {
	test('groups the newest-first stream under Today, Yesterday and then the date', () => {
		const items = [
			{ id: 'a', at: at(7, 8, 41) },
			{ id: 'b', at: at(7, 0, 5) },
			{ id: 'c', at: at(6, 23, 59) },
			{ id: 'd', at: at(5, 21, 5) },
			{ id: 'e', at: at(5, 9, 0) }
		];
		const days = streamDays(en, items, NOW);
		expect(days.map((d) => d.label)).toEqual(['Today', 'Yesterday', 'Monday 5 October']);
		expect(days.map((d) => d.items.map((i) => i.id))).toEqual([['a', 'b'], ['c'], ['d', 'e']]);
	});

	test('names the days in the reader’s language', () => {
		const days = streamDays(
			de,
			[{ at: at(7, 8, 0) }, { at: at(6, 8, 0) }, { at: at(1, 8, 0) }],
			NOW
		);
		expect(days.map((d) => d.label)).toEqual(['Heute', 'Gestern', 'Donnerstag, 1. Oktober']);
	});

	test('has no day for an empty stream', () => {
		expect(streamDays(en, [], NOW)).toEqual([]);
	});
});

describe('streamTime', () => {
	test('gives the time of day under Today and Yesterday', () => {
		expect(streamTime(en, at(7, 8, 41), NOW).label).toBe('08:41');
		expect(streamTime(en, at(6, 19, 20), NOW).label).toBe('19:20');
		expect(streamTime(de, at(6, 19, 20), NOW).label).toBe('19:20');
	});

	test('gives nothing for an older day: its heading already says when', () => {
		expect(streamTime(en, at(5, 21, 5), NOW).label).toBe('');
		expect(streamTime(en, new Date(2025, 9, 7, 8, 0).getTime(), NOW).label).toBe('');
	});

	test('keeps the full date and time for the tooltip, on every day', () => {
		const older = streamTime(en, at(5, 21, 5), NOW);
		// Loose on purpose: the separators differ between ICU builds; the parts are what matter.
		expect(older.title).toMatch(/Monday.*5 October 2026.*21:05/);
		expect(streamTime(en, at(7, 8, 41), NOW).title).toMatch(/Wednesday.*7 October 2026.*08:41/);
	});

	test('gives the instant in a machine-readable form', () => {
		const instant = at(7, 8, 41);
		expect(streamTime(en, instant, NOW).datetime).toBe(new Date(instant).toISOString());
	});
});
