import { describe, expect, it } from 'bun:test';
import {
	birthYearFromAge,
	dateProblem,
	isoToParts,
	monthNames,
	partsToIso,
	segmentOrder,
	weekdayDate,
	type DateParts
} from './field';

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
		for (const iso of ['1987-03-05', '--12-24', '--02-29', '2024-02-29']) {
			expect(partsToIso(isoToParts(iso))).toBe(iso);
		}
	});
});

describe('dateProblem', () => {
	it('says nothing about a field nobody has touched', () => {
		expect(dateProblem(parts())).toBe(null);
	});

	it('says nothing about a complete, real day', () => {
		expect(dateProblem(parts({ day: '5', month: '3', year: '1987' }))).toBe(null);
	});

	/*
	 * The case splitting one control into three introduced: a day and a month with no year is
	 * not a date, but nothing native complains about it on an optional field — so it would
	 * submit and be stored as nothing at all.
	 */
	it('refuses a half-filled date rather than letting it be posted as blank', () => {
		expect(dateProblem(parts({ day: '24', month: '12' }))).toBe('incomplete');
	});

	it('accepts the missing year where the caller allows it', () => {
		expect(dateProblem(parts({ day: '24', month: '12' }), { allowYearUnknown: true })).toBe(null);
	});

	it('refuses a year typed on its own', () => {
		expect(dateProblem(parts({ year: '1987' }), { allowYearUnknown: true })).toBe('incomplete');
	});

	it('names a day that does not exist', () => {
		expect(dateProblem(parts({ day: '30', month: '2', year: '1987' }))).toBe('noSuchDay');
	});

	it('names a day past the latest one allowed', () => {
		expect(dateProblem(parts({ day: '2', month: '1', year: '2030' }), { max: '2026-09-13' })).toBe(
			'inFuture'
		);
	});

	it('allows the latest day itself', () => {
		expect(dateProblem(parts({ day: '13', month: '9', year: '2026' }), { max: '2026-09-13' })).toBe(
			null
		);
	});

	it('never calls a year-less day a future one, having no year to judge it by', () => {
		expect(
			dateProblem(parts({ day: '31', month: '12' }), { allowYearUnknown: true, max: '2026-09-13' })
		).toBe(null);
	});
});

describe('birthYearFromAge', () => {
	const TODAY = '2026-11-15';

	it('counts back the age when this year’s birthday has passed', () => {
		expect(birthYearFromAge(parts({ day: '3', month: '4' }), '36', TODAY)).toBe('1990');
	});

	it('counts back one more year when this year’s birthday is still to come', () => {
		expect(birthYearFromAge(parts({ day: '20', month: '12' }), '36', TODAY)).toBe('1989');
	});

	it('takes a birthday today as already passed', () => {
		expect(birthYearFromAge(parts({ day: '15', month: '11' }), '36', TODAY)).toBe('1990');
	});

	it('places an age of 0 in this year or the last, never the future', () => {
		expect(birthYearFromAge(parts({ day: '15', month: '11' }), '0', TODAY)).toBe('2026');
		expect(birthYearFromAge(parts({ day: '1', month: '1' }), '0', TODAY)).toBe('2026');
		expect(birthYearFromAge(parts({ day: '16', month: '11' }), '0', TODAY)).toBe('2025');
	});

	it('counts 29 February as not yet passed until March in a common year', () => {
		const leapDay = parts({ day: '29', month: '2' });
		expect(birthYearFromAge(leapDay, '6', '2027-02-28')).toBe('2020');
		expect(birthYearFromAge(leapDay, '7', '2027-03-01')).toBe('2020');
	});

	it('hands back a year without that 29 February, for the field to refuse', () => {
		const year = birthYearFromAge(parts({ day: '29', month: '2' }), '5', TODAY);
		expect(year).toBe('2021');
		expect(dateProblem(parts({ day: '29', month: '2', year }))).toBe('noSuchDay');
	});

	it('gives no year while the day or month is missing', () => {
		expect(birthYearFromAge(parts({ month: '4' }), '36', TODAY)).toBe('');
		expect(birthYearFromAge(parts({ day: '3' }), '36', TODAY)).toBe('');
	});

	it('gives no year for an age that is not a whole number of years', () => {
		for (const age of ['', ' ', '-1', '3.5', 'abc', '151']) {
			expect(birthYearFromAge(parts({ day: '3', month: '4' }), age, TODAY)).toBe('');
		}
	});

	it('reads an age with surrounding spaces', () => {
		expect(birthYearFromAge(parts({ day: '3', month: '4' }), ' 36 ', TODAY)).toBe('1990');
	});
});

describe('weekdayDate', () => {
	it('names the weekday with the date, in the reader’s language', () => {
		expect(weekdayDate('2026-11-15', 'de-DE')).toBe('So., 15.11.2026');
		expect(weekdayDate('2026-11-15', 'en-GB')).toBe('Sun, 15/11/2026');
	});

	it('finds the weekday of a leap day', () => {
		expect(weekdayDate('2024-02-29', 'de-DE')).toBe('Do., 29.02.2024');
	});

	it('has nothing to say for a year-less day or no value', () => {
		expect(weekdayDate('--04-03', 'de-DE')).toBeNull();
		expect(weekdayDate('', 'de-DE')).toBeNull();
	});
});

describe('dateProblem with an age typed', () => {
	it('calls an age that gave no year unreadable once the day and month are in', () => {
		expect(dateProblem(parts({ day: '3', month: '4' }), { age: 'abc' })).toBe('ageUnreadable');
	});

	it('leaves a usable age to the date it worked out', () => {
		expect(dateProblem(parts({ day: '3', month: '4', year: '1990' }), { age: '36' })).toBeNull();
	});

	it('asks for the day and month first, and ignores an emptied age', () => {
		expect(dateProblem(parts({ month: '4' }), { age: '36' })).toBe('incomplete');
		expect(
			dateProblem(parts({ day: '3', month: '4' }), { age: ' ', allowYearUnknown: true })
		).toBeNull();
	});
});
