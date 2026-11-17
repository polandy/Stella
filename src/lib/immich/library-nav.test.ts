import { describe, expect, it } from 'bun:test';
import type { LibraryPhoto } from './library';
import {
	crumbsOf,
	groupByDay,
	isMonth,
	isoWeekOf,
	lastDayOf,
	monthsOfYear,
	weekLookup,
	weeksOfMonth,
	yearTotals
} from './library-nav';

const photo = (id: string, takenAt: string | null): LibraryPhoto => ({
	id,
	takenAt,
	thumbnailUrl: `/t/${id}`,
	previewUrl: `/p/${id}`
});

describe('crumbsOf', () => {
	it('leads from all years down to where the picker is, the last crumb being there', () => {
		expect(crumbsOf({ level: 'years' }, true)).toEqual([{ level: 'years' }]);
		expect(crumbsOf({ level: 'year', year: '2026' }, true)).toEqual([
			{ level: 'years' },
			{ level: 'year', year: '2026' }
		]);
		expect(crumbsOf({ level: 'day', day: '2026-10-21' }, true)).toEqual([
			{ level: 'years' },
			{ level: 'year', year: '2026' },
			{ level: 'month', month: '2026-10' },
			{ level: 'day', day: '2026-10-21' }
		]);
	});

	it('leaves out the years without the overview, so only the month and the day remain', () => {
		expect(crumbsOf({ level: 'day', day: '2026-10-21' }, false)).toEqual([
			{ level: 'month', month: '2026-10' },
			{ level: 'day', day: '2026-10-21' }
		]);
		expect(crumbsOf({ level: 'month', month: '2026-10' }, false)).toEqual([
			{ level: 'month', month: '2026-10' }
		]);
	});
});

describe('isMonth and lastDayOf', () => {
	it('takes a month as YYYY-MM only', () => {
		expect(isMonth('2026-10')).toBe(true);
		expect(isMonth('2026-01')).toBe(true);
		for (const value of ['2026-13', '2026-00', '2026-7', '2026-07-01', '', 202610, null]) {
			expect(isMonth(value)).toBe(false);
		}
	});

	it('ends a month on its last day, leap years too', () => {
		expect(lastDayOf('2026-10')).toBe('2026-10-31');
		expect(lastDayOf('2026-12')).toBe('2026-12-31');
		expect(lastDayOf('2024-02')).toBe('2024-02-29');
		expect(lastDayOf('2025-02')).toBe('2025-02-28');
		expect(() => lastDayOf('2025-13')).toThrow(/YYYY-MM/);
	});
});

describe('yearTotals', () => {
	it('adds up each year’s months, newest year first, each against the busiest', () => {
		expect(
			yearTotals([
				{ month: '2024-03', count: 100 },
				{ month: '2026-10', count: 300 },
				{ month: '2026-01', count: 100 },
				{ month: '2024-12', count: 100 }
			])
		).toEqual([
			{ year: '2026', count: 400, share: 1 },
			{ year: '2024', count: 200, share: 0.5 }
		]);
	});

	it('has no years for an empty library', () => {
		expect(yearTotals([])).toEqual([]);
		expect(yearTotals([{ month: '2026-01', count: 0 }])).toEqual([]);
	});
});

describe('monthsOfYear', () => {
	it('gives all twelve months of a year in order, the empty ones at nought', () => {
		const months = monthsOfYear(
			[
				{ month: '2026-10', count: 812 },
				{ month: '2025-10', count: 5 },
				{ month: '2026-02', count: 3 }
			],
			'2026'
		);
		expect(months.map(({ month }) => month)).toEqual([
			'2026-01',
			'2026-02',
			'2026-03',
			'2026-04',
			'2026-05',
			'2026-06',
			'2026-07',
			'2026-08',
			'2026-09',
			'2026-10',
			'2026-11',
			'2026-12'
		]);
		expect(months.map(({ count }) => count)).toEqual([0, 3, 0, 0, 0, 0, 0, 0, 0, 812, 0, 0]);
	});
});

describe('groupByDay', () => {
	it('has no days for no photos', () => {
		expect(groupByDay([])).toEqual([]);
	});

	it('groups consecutive photos of one day on the camera’s clock, keeping their order', () => {
		const morning = photo('morning', '2026-10-21T07:00:00');
		const evening = photo('evening', '2026-10-21T23:59:59');
		const next = photo('next', '2026-10-22T00:10:00Z');
		expect(groupByDay([morning, evening, next])).toEqual([
			{ day: '2026-10-21', photos: [morning, evening] },
			{ day: '2026-10-22', photos: [next] }
		]);
	});

	it('merges a later page that continues the same day into the last group', () => {
		const first = [photo('a', '2026-10-20T10:00:00'), photo('b', '2026-10-21T08:00:00')];
		const second = [photo('c', '2026-10-21T20:00:00'), photo('d', '2026-10-23T08:00:00')];
		expect(
			groupByDay([...first, ...second]).map(({ day, photos }) => [day, photos.map(({ id }) => id)])
		).toEqual([
			['2026-10-20', ['a']],
			['2026-10-21', ['b', 'c']],
			['2026-10-23', ['d']]
		]);
	});

	it('leaves out a photo without a date, which belongs to no day', () => {
		expect(groupByDay([photo('undated', null)])).toEqual([]);
	});
});

describe('isoWeekOf', () => {
	it('numbers a day’s week as ISO 8601 does, Monday first', () => {
		expect(isoWeekOf('2026-10-21')).toBe(43);
		expect(isoWeekOf('2026-01-01')).toBe(1);
		// 1 January 2027 is a Friday: it belongs to the last week of 2026.
		expect(isoWeekOf('2027-01-01')).toBe(53);
		expect(isoWeekOf('2024-12-30')).toBe(1);
	});
});

describe('weeksOfMonth', () => {
	it('lists the ISO weeks a month touches, each with the month’s days in it', () => {
		expect(weeksOfMonth('2026-10')).toEqual([
			{ week: 40, from: '2026-10-01', to: '2026-10-04' },
			{ week: 41, from: '2026-10-05', to: '2026-10-11' },
			{ week: 42, from: '2026-10-12', to: '2026-10-18' },
			{ week: 43, from: '2026-10-19', to: '2026-10-25' },
			{ week: 44, from: '2026-10-26', to: '2026-10-31' }
		]);
	});

	it('numbers the first days of January by the year before when ISO does', () => {
		expect(weeksOfMonth('2027-01')[0]).toEqual({ week: 53, from: '2027-01-01', to: '2027-01-03' });
	});

	it('refuses a value that is not a month', () => {
		expect(() => weeksOfMonth('2026-13')).toThrow();
	});
});

describe('weekLookup', () => {
	const week = { week: 43, from: '2026-10-19', to: '2026-10-25' };
	const days = (...list: string[]) => list.map((day) => ({ day, photos: [] }));

	it('finds the week’s first day with photos, settled', () => {
		expect(weekLookup(days('2026-10-02', '2026-10-21', '2026-10-23'), week)).toEqual({
			day: '2026-10-21',
			settled: true
		});
	});

	it('settles on no day once a later week has been read, so the week is empty', () => {
		expect(weekLookup(days('2026-10-02', '2026-10-27'), week)).toEqual({
			day: null,
			settled: true
		});
	});

	it('is not settled while the pages read stop before the week', () => {
		expect(weekLookup(days('2026-10-02'), week)).toEqual({ day: null, settled: false });
		expect(weekLookup([], week)).toEqual({ day: null, settled: false });
	});
});
