import { describe, expect, it } from 'bun:test';
import {
	comparePartialDates,
	DAY_PRECISIONS,
	namesADay,
	partialDateOfDay,
	type PartialDate
} from './partial-date';

/* A date that may be known only in part (docs/03 §3.4). */

const full = (value: string): PartialDate => ({ value, precision: 'full' });
const monthDay = (value: string): PartialDate => ({ value, precision: 'month_day' });
const year = (value: string): PartialDate => ({ value, precision: 'year' });
const age = (value: string): PartialDate => ({ value, precision: 'age' });

describe('partialDateOfDay', () => {
	it('takes the precision from the shape of a day', () => {
		expect(partialDateOfDay('1990-04-23')).toEqual(full('1990-04-23'));
		expect(partialDateOfDay('--04-23')).toEqual(monthDay('--04-23'));
	});

	it('is not a day without a month and day', () => {
		expect(partialDateOfDay('1990')).toBeNull();
		expect(partialDateOfDay('23.04.1990')).toBeNull();
		expect(partialDateOfDay('')).toBeNull();
	});
});

describe('namesADay', () => {
	it('is true where a birthday can fall: a full day or a year-less one', () => {
		expect(namesADay('full')).toBe(true);
		expect(namesADay('month_day')).toBe(true);
	});

	it('is false for a known year or one estimated from an age', () => {
		expect(namesADay('year')).toBe(false);
		expect(namesADay('age')).toBe(false);
	});

	it('agrees with the list the SQL filter reads', () => {
		expect([...DAY_PRECISIONS]).toEqual(['full', 'month_day']);
	});
});

describe('comparePartialDates', () => {
	it('orders two full days as the calendar does', () => {
		expect(comparePartialDates(full('1990-04-23'), full('1990-05-01'))).toBeLessThan(0);
		expect(comparePartialDates(full('2001-01-01'), full('1999-12-31'))).toBeGreaterThan(0);
		expect(comparePartialDates(full('1990-04-23'), full('1990-04-23'))).toBe(0);
	});

	it('orders two year-less days within the year', () => {
		expect(comparePartialDates(monthDay('--02-29'), monthDay('--03-01'))).toBeLessThan(0);
		expect(comparePartialDates(monthDay('--12-24'), monthDay('--12-24'))).toBe(0);
	});

	it('orders by year when the years differ, whatever else is known', () => {
		expect(comparePartialDates(year('1990'), full('1991-01-01'))).toBeLessThan(0);
		expect(comparePartialDates(full('1992-06-01'), age('1991'))).toBeGreaterThan(0);
		expect(comparePartialDates(age('1980'), year('1985'))).toBeLessThan(0);
	});

	it('cannot order within one year when either side knows only the year', () => {
		expect(comparePartialDates(year('1990'), full('1990-04-23'))).toBeNull();
		expect(comparePartialDates(year('1990'), year('1990'))).toBeNull();
		expect(comparePartialDates(age('1990'), year('1990'))).toBeNull();
	});

	it('cannot order a year-less day against anything that has a year', () => {
		expect(comparePartialDates(monthDay('--04-23'), full('1990-04-23'))).toBeNull();
		expect(comparePartialDates(year('1990'), monthDay('--01-01'))).toBeNull();
	});

	it('cannot order a value its precision does not describe', () => {
		expect(comparePartialDates(full('1990'), full('1990-04-23'))).toBeNull();
		expect(comparePartialDates(year('--04-23'), year('1990'))).toBeNull();
	});
});
