import { describe, expect, it } from 'bun:test';
import {
	MEMORY_BAND_CAP,
	MEMORY_STRIP_CAP,
	memoryBand,
	memoryDaysFor,
	memoryYears,
	pickedDay,
	yearsAgoOn
} from './memories';

/*
 * *On this day* (docs/02 §2.12.1): which calendar days a day remembers, the years they fall in,
 * and what Home's band keeps of them — handed the day, never the clock.
 */

type M = { id: string; date: string; at: number };
const m = (id: string, date: string, at = 0): M => ({ id, date, at });
const ids = (years: { items: M[] }[]) => years.map((y) => y.items.map((i) => i.id));

describe('memoryDaysFor', () => {
	it('is the day and month', () => {
		expect(memoryDaysFor('2026-11-01')).toEqual(['11-01']);
	});

	it('takes 29 February in on 28 February of a common year', () => {
		expect(memoryDaysFor('2027-02-28')).toEqual(['02-28', '02-29']);
	});

	it('leaves 29 February to itself in a leap year', () => {
		expect(memoryDaysFor('2028-02-28')).toEqual(['02-28']);
		expect(memoryDaysFor('2028-02-29')).toEqual(['02-29']);
	});

	it('counts a century as common unless it divides by 400', () => {
		expect(memoryDaysFor('2100-02-28')).toEqual(['02-28', '02-29']);
		expect(memoryDaysFor('2000-02-28')).toEqual(['02-28']);
	});
});

describe('yearsAgoOn', () => {
	it('counts whole years back from the day', () => {
		expect(yearsAgoOn('2025-11-01', '2026-11-01')).toBe(1);
		expect(yearsAgoOn('2024-02-29', '2027-02-28')).toBe(3);
	});
});

describe('memoryYears', () => {
	it('groups by year, newest year first', () => {
		const years = memoryYears(
			[m('a', '2019-11-01'), m('b', '2025-11-01'), m('c', '2021-11-01'), m('d', '2025-11-01')],
			'2026-11-01'
		);
		expect(years.map((y) => [y.year, y.yearsAgo])).toEqual([
			[2025, 1],
			[2021, 5],
			[2019, 7]
		]);
	});

	it('orders a year by what was written last first', () => {
		const years = memoryYears(
			[m('early', '2025-11-01', 1), m('late', '2025-11-01', 3), m('mid', '2025-11-01', 2)],
			'2026-11-01'
		);
		expect(ids(years)).toEqual([['late', 'mid', 'early']]);
	});

	it('keeps only earlier years: the day itself is not a memory yet', () => {
		const years = memoryYears([m('today', '2026-11-01'), m('then', '2025-11-01')], '2026-11-01');
		expect(ids(years)).toEqual([['then']]);
	});

	it('puts a 29 February entry under its own year on 28 February', () => {
		const years = memoryYears([m('leap', '2024-02-29')], '2027-02-28');
		expect(years).toEqual([{ year: 2024, yearsAgo: 3, items: [m('leap', '2024-02-29')] }]);
	});

	it('is empty when nothing was written', () => {
		expect(memoryYears([], '2026-11-01')).toEqual([]);
	});
});

describe('memoryBand', () => {
	const years = memoryYears(
		[
			m('a', '2025-11-01', 2),
			m('b', '2025-11-01', 1),
			m('c', '2021-11-01'),
			m('d', '2019-11-01'),
			m('e', '2018-11-01')
		],
		'2026-11-01'
	);
	const photos = ['p1', 'p2', 'p3', 'p4', 'p5'];

	it('stops after three entries, keeping their years', () => {
		const band = memoryBand(years, []);
		expect(MEMORY_BAND_CAP).toBe(3);
		expect(ids(band.years)).toEqual([['a', 'b'], ['c']]);
		expect(band.more).toBe(true);
	});

	it('strips four photos, and says there is more beyond them', () => {
		const band = memoryBand([], photos);
		expect(MEMORY_STRIP_CAP).toBe(4);
		expect(band.photos).toEqual(['p1', 'p2', 'p3', 'p4']);
		expect(band.more).toBe(true);
	});

	it('offers nothing more when everything fits', () => {
		const band = memoryBand(memoryYears([m('a', '2025-11-01')], '2026-11-01'), ['p1']);
		expect(band.more).toBe(false);
		expect(band.empty).toBe(false);
	});

	it('is empty without an entry or a photo, so Home leaves it out', () => {
		expect(memoryBand([], []).empty).toBe(true);
	});
});

describe('pickedDay', () => {
	it('reads a real day up to today', () => {
		expect(pickedDay('2024-02-29', '2026-11-01')).toBe('2024-02-29');
		expect(pickedDay('2026-11-01', '2026-11-01')).toBe('2026-11-01');
	});

	it('falls back on today for nothing, a day that does not exist, or one still to come', () => {
		expect(pickedDay(null, '2026-11-01')).toBe('2026-11-01');
		expect(pickedDay('2025-02-29', '2026-11-01')).toBe('2026-11-01');
		expect(pickedDay('2025-13-01', '2026-11-01')).toBe('2026-11-01');
		expect(pickedDay('1 Nov', '2026-11-01')).toBe('2026-11-01');
		expect(pickedDay('2026-11-02', '2026-11-01')).toBe('2026-11-01');
	});
});
