import { describe, expect, it } from 'bun:test';
import { isoToParts, monthNames, partsToIso, segmentOrder, type DateParts } from './field';

const parts = (overrides: Partial<DateParts> = {}): DateParts => ({
	day: '',
	month: '',
	year: '',
	...overrides
});

describe('segmentOrder', () => {
	it('puts the day first for a language that writes it first', () => {
		expect(segmentOrder('de-DE')).toEqual(['day', 'month', 'year']);
	});

	it('puts the month first for a language that writes it first', () => {
		expect(segmentOrder('en-US')).toEqual(['month', 'day', 'year']);
	});

	it('names every segment exactly once, whatever the locale', () => {
		for (const locale of ['de-DE', 'en-GB', 'en-US', 'ja-JP']) {
			expect([...segmentOrder(locale)].sort()).toEqual(['day', 'month', 'year']);
		}
	});
});

describe('monthNames', () => {
	it('names the months in the given language', () => {
		expect(monthNames('de-DE')[0]).toBe('Januar');
		expect(monthNames('en-GB')[11]).toBe('December');
	});

	it('returns twelve of them', () => {
		expect(monthNames('de-DE')).toHaveLength(12);
	});
});

describe('partsToIso', () => {
	it('builds a full ISO day, padding single digits', () => {
		expect(partsToIso(parts({ day: '5', month: '3', year: '1987' }))).toBe('1987-03-05');
	});

	it('drops the year when it is left blank, rather than inventing one', () => {
		expect(partsToIso(parts({ day: '24', month: '12' }))).toBe('--12-24');
	});

	it('is empty while the day or month is still missing', () => {
		expect(partsToIso(parts({ month: '12', year: '1987' }))).toBe('');
		expect(partsToIso(parts({ day: '24', year: '1987' }))).toBe('');
		expect(partsToIso(parts())).toBe('');
	});

	it('refuses a day that does not exist in that month', () => {
		expect(partsToIso(parts({ day: '30', month: '2', year: '1987' }))).toBe('');
	});

	it('keeps 29 February when the year is unknown, because leap years exist', () => {
		expect(partsToIso(parts({ day: '29', month: '2' }))).toBe('--02-29');
	});

	it('refuses 29 February in a year that had no such day', () => {
		expect(partsToIso(parts({ day: '29', month: '2', year: '1987' }))).toBe('');
	});

	it('refuses a year outside the four-digit range the store accepts', () => {
		expect(partsToIso(parts({ day: '1', month: '1', year: '87' }))).toBe('');
	});
});

describe('isoToParts', () => {
	it('splits a full ISO day', () => {
		expect(isoToParts('1987-03-05')).toEqual({ day: '5', month: '3', year: '1987' });
	});

	it('leaves the year blank for a year-less day', () => {
		expect(isoToParts('--12-24')).toEqual({ day: '24', month: '12', year: '' });
	});

	it('gives empty parts for no value at all', () => {
		expect(isoToParts('')).toEqual({ day: '', month: '', year: '' });
	});

	it('round-trips what partsToIso produced', () => {
		for (const iso of ['1987-03-05', '--12-24', '--02-29', '2026-02-29'.replace('2026', '2024')]) {
			expect(partsToIso(isoToParts(iso))).toBe(iso);
		}
	});
});
