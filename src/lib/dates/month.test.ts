import { describe, expect, test } from 'bun:test';
import { addDays, firstDayOfWeek, inYear, yearsBack, monthGrid, monthOf, monthName, shiftMonth, weekdayNames } from './month';

// The calendar behind the composer's *Another day…* (docs/05 §5.7).

describe('monthGrid', () => {
	test('lays September 2026 out in Monday-first weeks, padding before the 1st', () => {
		const weeks = monthGrid('2026-09', 1);
		// 1 September 2026 is a Tuesday.
		expect(weeks[0]).toEqual([null, '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06']);
		expect(weeks[4]).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', null, null, null, null]);
	});

	test('always has six weeks, so the calendar keeps its height from month to month', () => {
		// February 2021 starts on a Monday and fills exactly four weeks.
		expect(monthGrid('2021-02', 1)).toHaveLength(6);
		expect(monthGrid('2026-09', 1)).toHaveLength(6);
		expect(monthGrid('2021-02', 1)[5]).toEqual(Array(7).fill(null));
	});

	test('starts the week on Sunday where the locale does', () => {
		expect(monthGrid('2026-09', 0)[0]).toEqual([null, null, '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05']);
	});

	test('knows February in a leap year', () => {
		expect(monthGrid('2028-02', 1).flat().filter(Boolean).at(-1)).toBe('2028-02-29');
	});
});

describe('shiftMonth', () => {
	test('steps across a year in either direction', () => {
		expect(shiftMonth('2026-01', -1)).toBe('2025-12');
		expect(shiftMonth('2026-12', 1)).toBe('2027-01');
		expect(shiftMonth('2026-09', -1)).toBe('2026-08');
	});
});

test('monthOf takes the month of a day', () => {
	expect(monthOf('2026-09-29')).toBe('2026-09');
});

describe('language', () => {
	test('titles the month in the reader’s language', () => {
		expect(monthName('2026-09', 'de-DE')).toBe('September');
		expect(monthName('2026-03', 'de-DE')).toBe('März');
	});

	test('names the weekdays from the first day of the week', () => {
		expect(weekdayNames('de-DE', 1)).toEqual(['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']);
		expect(weekdayNames('en-GB', 0)[0]).toBe('Sun');
	});

	test('starts the week where the locale does', () => {
		expect(firstDayOfWeek('de-DE')).toBe(1);
		expect(firstDayOfWeek('en-US')).toBe(0);
	});
});

test('addDays steps a day across month and year ends', () => {
	expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
	expect(addDays('2026-03-01', -7)).toBe('2026-02-22');
});

describe('choosing a year', () => {
	test('keeps the month when moving to another year', () => {
		expect(inYear('2026-03', 2019, '2026-09')).toBe('2019-03');
	});

	test('stops at the last month allowed rather than opening the future', () => {
		expect(inYear('2019-11', 2026, '2026-09')).toBe('2026-09');
	});

	test('offers the years from the latest allowed backwards', () => {
		const years = yearsBack('2026-09-29');
		expect(years[0]).toBe(2026);
		expect(years[1]).toBe(2025);
		expect(years.at(-1)).toBe(1926);
	});
});
