import { describe, expect, test } from 'bun:test';
import { INTL_LOCALES } from '$lib/i18n/locales';
import { createTranslator } from '$lib/i18n/translate';
import {
	createdLabel,
	createdOnLabel,
	dayLabel,
	occasionLabel,
	sinceLabel,
	whenLabel,
	type DateLanguage
} from './labels';

/** The real catalogues, so a wording change has to be made in both places at once. */
const en: DateLanguage = { t: createTranslator('en'), intlLocale: INTL_LOCALES.en };
const de: DateLanguage = { t: createTranslator('de'), intlLocale: INTL_LOCALES.de };

describe('whenLabel', () => {
	test('says today and tomorrow rather than a date', () => {
		expect(whenLabel(en, 0, '2026-09-04')).toBe('today');
		expect(whenLabel(en, 1, '2026-09-05')).toBe('tomorrow');
	});

	test('counts days within the week', () => {
		expect(whenLabel(en, 4, '2026-09-08')).toBe('in 4 days');
	});

	test('falls back to a weekday and date further out', () => {
		// Matched loosely on purpose: the separator differs between ICU builds (Bun says
		// "Sun, 13 Sept", Chromium "Sun 13 Sept"), and the wording is what matters.
		expect(whenLabel(en, 9, '2026-09-13')).toMatch(/Sun.*13 Sept/);
	});
});

describe('occasionLabel', () => {
	test('gives an age when the birth year is known', () => {
		expect(occasionLabel(en, { kind: 'birthday', label: null, turning: 9 })).toBe('turns 9');
	});

	test('says nothing about age when the year is unknown', () => {
		expect(occasionLabel(en, { kind: 'birthday', label: null, turning: null })).toBe(
			'has a birthday'
		);
	});

	test('prefers a named anniversary over a bare count', () => {
		expect(occasionLabel(en, { kind: 'anniversary', label: 'Goldene Hochzeit', turning: 46 })).toBe(
			'Goldene Hochzeit · 46 years'
		);
	});

	test('counts the years when the anniversary has no name', () => {
		expect(occasionLabel(en, { kind: 'anniversary', label: null, turning: 12 })).toBe(
			'12 years together'
		);
	});

	test('uses the label of a custom date', () => {
		expect(occasionLabel(en, { kind: 'custom', label: 'Umzug', turning: null })).toBe('Umzug');
	});
});

describe('dayLabel', () => {
	test('renders a full day with its year', () => {
		expect(dayLabel(en, '2017-09-08')).toBe('8 September 2017');
	});

	test('renders a year-less day without inventing one', () => {
		expect(dayLabel(en, '--03-11')).toBe('11 March');
	});

	test('renders 29 February, which needs a leap year to exist', () => {
		expect(dayLabel(en, '--02-29')).toBe('29 February');
	});
});

describe('sinceLabel', () => {
	test('says nothing when nothing was ever written, so the screen can show a dash', () => {
		expect(sinceLabel(en, null, '2026-09-05')).toBeNull();
	});

	test('names today and yesterday, then falls back to the coarse unit', () => {
		expect(sinceLabel(en, '2026-09-05', '2026-09-05')).toBe('today');
		expect(sinceLabel(en, '2026-09-04', '2026-09-05')).toBe('yesterday');
		expect(sinceLabel(en, '2026-08-26', '2026-09-05')).toBe('10 days ago');
		expect(sinceLabel(en, '2026-06-05', '2026-09-05')).toBe('3 months ago');
	});
});

const DAY_MS = 86_400_000;

describe('createdLabel', () => {
	const noon = Date.parse('2026-09-10T12:00:00Z');

	test('names today and yesterday, then falls back to the coarse unit', () => {
		expect(createdLabel(en, noon, noon, 'UTC')).toBe('today');
		expect(createdLabel(en, noon - DAY_MS, noon, 'UTC')).toBe('yesterday');
		expect(createdLabel(en, noon - 10 * DAY_MS, noon, 'UTC')).toBe('10 days ago');
	});

	test("reads the calendar day in the viewer's own time zone, not the runtime's", () => {
		// 23:50 UTC on the 9th is already the 10th in Tokyo but still the 9th in Honolulu.
		const atMs = Date.parse('2026-09-09T23:50:00Z');
		const nowMs = Date.parse('2026-09-10T00:10:00Z');
		expect(createdLabel(en, atMs, nowMs, 'UTC')).toBe('yesterday');
		expect(createdLabel(en, atMs, nowMs, 'Pacific/Honolulu')).toBe('today');
	});
});

describe('createdOnLabel', () => {
	test('names the exact calendar day, the way any day on the page is named', () => {
		expect(createdOnLabel(en, Date.parse('2026-09-08T10:00:00Z'), 'UTC')).toBe('8 September 2026');
	});

	test("reads the calendar day in the viewer's own time zone", () => {
		const atMs = Date.parse('2026-09-09T23:50:00Z');
		expect(createdOnLabel(en, atMs, 'UTC')).toBe('9 September 2026');
		expect(createdOnLabel(en, atMs, 'Asia/Tokyo')).toBe('10 September 2026');
	});
});

describe('in German', () => {
	test("counts down and names the occasion in the viewer's language", () => {
		expect(whenLabel(de, 0, '2026-09-04')).toBe('heute');
		expect(whenLabel(de, 4, '2026-09-08')).toBe('in 4 Tagen');
		expect(occasionLabel(de, { kind: 'birthday', label: null, turning: 9 })).toBe('wird 9');
		expect(occasionLabel(de, { kind: 'anniversary', label: null, turning: 12 })).toBe(
			'12 Jahre zusammen'
		);
	});

	test('formats the calendar with the German locale', () => {
		expect(dayLabel(de, '2017-09-08')).toBe('8. September 2017');
	});

	test('words a silence the way it is said in German', () => {
		expect(sinceLabel(de, '2026-08-26', '2026-09-05')).toBe('vor 10 Tagen');
	});

	test('words a note creation the same way', () => {
		const noon = Date.parse('2026-09-10T12:00:00Z');
		expect(createdLabel(de, noon - DAY_MS, noon, 'UTC')).toBe('gestern');
		expect(createdOnLabel(de, Date.parse('2017-09-08T10:00:00Z'), 'UTC')).toBe('8. September 2017');
	});
});
