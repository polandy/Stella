import { describe, expect, it } from 'bun:test';
import { compareMonthDay, dayParts, isRealCalendarDay, isWholeDay } from './calendar';

/* The calendar-day reading every stored day goes through (docs/03 §3.4). */

describe('dayParts', () => {
	it('reads a full ISO day', () => {
		expect(dayParts('1990-04-23')).toEqual({ year: 1990, month: 4, day: 23 });
	});

	it('reads a year-less day without inventing a year', () => {
		expect(dayParts('--04-23')).toEqual({ year: null, month: 4, day: 23 });
	});

	it('finds no day in a bare year, an age estimate or free text', () => {
		expect(dayParts('1990')).toBeNull();
		expect(dayParts('summer 1990')).toBeNull();
		expect(dayParts('')).toBeNull();
	});

	it('reads the shape only; whether the day exists is a separate question', () => {
		expect(dayParts('2026-02-30')).toEqual({ year: 2026, month: 2, day: 30 });
	});
});

describe('compareMonthDay', () => {
	it('orders by month, then day, whatever the years', () => {
		const at = (value: string) => dayParts(value)!;
		expect(compareMonthDay(at('2026-04-22'), at('1990-04-23'))).toBeLessThan(0);
		expect(compareMonthDay(at('--05-01'), at('1990-04-23'))).toBeGreaterThan(0);
		expect(compareMonthDay(at('--04-23'), at('1990-04-23'))).toBe(0);
	});
});

describe('isRealCalendarDay', () => {
	it('refuses a day the month does not have', () => {
		expect(isRealCalendarDay('2026-02-30')).toBe(false);
		expect(isRealCalendarDay('2026-13-01')).toBe(false);
		expect(isRealCalendarDay('2026-02-28')).toBe(true);
	});

	it('keeps 29 February for a year-less day, but not in a common year', () => {
		expect(isRealCalendarDay('--02-29')).toBe(true);
		expect(isRealCalendarDay('2025-02-29')).toBe(false);
		expect(isRealCalendarDay('2024-02-29')).toBe(true);
	});
});

describe('isWholeDay', () => {
	it('wants a year and a day that exists', () => {
		expect(isWholeDay('2019-06-01')).toBe(true);
		expect(isWholeDay('--06-01')).toBe(false);
		expect(isWholeDay('2019-02-30')).toBe(false);
		expect(isWholeDay('2019')).toBe(false);
	});
});
