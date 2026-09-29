import { describe, expect, test } from 'bun:test';
import { INTL_LOCALES } from '$lib/i18n/locales';
import { createTranslator } from '$lib/i18n/translate';
import type { DateLanguage } from './labels';
import { pickedDayLabel, recentDays } from './recent';

// The composer's day pill (docs/02 §2.22.1). Tuesday, 29 September 2026 is "today" throughout.
const en: DateLanguage = { t: createTranslator('en'), intlLocale: INTL_LOCALES.en };
const de: DateLanguage = { t: createTranslator('de'), intlLocale: INTL_LOCALES.de };
const TODAY = '2026-09-29';

describe('recentDays', () => {
	test('offers today and the six days before it, newest first', () => {
		expect(recentDays(en, TODAY).map((d) => d.day)).toEqual([
			'2026-09-29',
			'2026-09-28',
			'2026-09-27',
			'2026-09-26',
			'2026-09-25',
			'2026-09-24',
			'2026-09-23'
		]);
	});

	test('names today and yesterday, and the rest by their weekday', () => {
		const names = recentDays(en, TODAY).map((d) => d.name);
		expect(names.slice(0, 3)).toEqual(['Today', 'Yesterday', 'Sunday']);
		expect(names[6]).toBe('Wednesday');
		expect(recentDays(de, TODAY).map((d) => d.name).slice(0, 3)).toEqual(['Heute', 'Gestern', 'Sonntag']);
	});

	test('gives each day its date beside the name', () => {
		expect(recentDays(de, TODAY)[2].date).toMatch(/27\. Sept/);
	});

	test('steps back across a month and a year boundary', () => {
		expect(recentDays(en, '2027-01-02').map((d) => d.day).slice(0, 4)).toEqual([
			'2027-01-02',
			'2027-01-01',
			'2026-12-31',
			'2026-12-30'
		]);
	});
});

describe('pickedDayLabel', () => {
	test('says today and yesterday', () => {
		expect(pickedDayLabel(de, TODAY, TODAY)).toBe('Heute');
		expect(pickedDayLabel(en, '2026-09-28', TODAY)).toBe('Yesterday');
	});

	test('shows an older day with its weekday and date, leaving out this year', () => {
		const label = pickedDayLabel(de, '2026-09-14', TODAY);
		expect(label).toMatch(/Mo.*14\. Sept/);
		expect(label).not.toContain('2026');
	});

	test('adds the year when the day lies in another one', () => {
		expect(pickedDayLabel(en, '2025-12-24', TODAY)).toMatch(/24 Dec.*2025/);
	});
});
