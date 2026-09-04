import { describe, expect, test } from 'bun:test';
import { dayLabel, occasionLabel, whenLabel, withoutYear } from './labels';

describe('whenLabel', () => {
	test('says today and tomorrow rather than a date', () => {
		expect(whenLabel(0, '2026-09-04')).toBe('today');
		expect(whenLabel(1, '2026-09-05')).toBe('tomorrow');
	});

	test('counts days within the week', () => {
		expect(whenLabel(4, '2026-09-08')).toBe('in 4 days');
	});

	test('falls back to a weekday and date further out', () => {
		// Matched loosely on purpose: the separator differs between ICU builds (Bun says
		// "Sun, 13 Sept", Chromium "Sun 13 Sept"), and the wording is what matters.
		expect(whenLabel(9, '2026-09-13')).toMatch(/Sun.*13 Sept/);
	});
});

describe('occasionLabel', () => {
	test('gives an age when the birth year is known', () => {
		expect(occasionLabel({ kind: 'birthday', label: null, turning: 9 })).toBe('turns 9');
	});

	test('says nothing about age when the year is unknown', () => {
		expect(occasionLabel({ kind: 'birthday', label: null, turning: null })).toBe('has a birthday');
	});

	test('prefers a named anniversary over a bare count', () => {
		expect(occasionLabel({ kind: 'anniversary', label: 'Goldene Hochzeit', turning: 46 })).toBe(
			'Goldene Hochzeit · 46 years'
		);
	});

	test('counts the years when the anniversary has no name', () => {
		expect(occasionLabel({ kind: 'anniversary', label: null, turning: 12 })).toBe(
			'12 years together'
		);
	});

	test('uses the label of a custom date', () => {
		expect(occasionLabel({ kind: 'custom', label: 'Umzug', turning: null })).toBe('Umzug');
	});
});

describe('dayLabel', () => {
	test('renders a full day with its year', () => {
		expect(dayLabel('2017-09-08')).toBe('8 September 2017');
	});

	test('renders a year-less day without inventing one', () => {
		expect(dayLabel('--03-11')).toBe('11 March');
	});

	test('renders 29 February, which needs a leap year to exist', () => {
		expect(dayLabel('--02-29')).toBe('29 February');
	});
});

describe('withoutYear', () => {
	test('drops the year a date input always supplies', () => {
		expect(withoutYear('2015-05-20')).toBe('--05-20');
	});

	test('leaves an already year-less day alone', () => {
		expect(withoutYear('--05-20')).toBe('--05-20');
	});
});
