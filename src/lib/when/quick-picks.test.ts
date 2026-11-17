import { describe, expect, it } from 'bun:test';
import { quickDays } from './quick-picks';

/* The days a picker offers at one tap (docs/dev/02 §2.25.8). */

const mia = { value: '2022-03-14', precision: 'full' as const };
const heinz = { value: '--05-12', precision: 'month_day' as const };
const tom = { value: '2019', precision: 'year' as const };

describe('quickDays', () => {
	it('offers the coming Saturday, Christmas and the next birthday', () => {
		// 2026-11-17 is a Tuesday.
		expect(quickDays(['saturday', 'christmas', 'birthday'], mia, '2026-11-17')).toEqual([
			{ pick: 'saturday', on: '2026-11-21' },
			{ pick: 'christmas', on: '2026-12-24' },
			{ pick: 'christmas', on: '2027-12-24' },
			{ pick: 'birthday', on: '2027-03-14' }
		]);
	});

	it('takes today when it is a Saturday', () => {
		expect(quickDays(['saturday'], null, '2026-11-21')).toEqual([
			{ pick: 'saturday', on: '2026-11-21' }
		]);
	});

	it('drops a Christmas gone by', () => {
		expect(quickDays(['christmas'], null, '2026-12-25')).toEqual([
			{ pick: 'christmas', on: '2027-12-24' }
		]);
	});

	it('finds a birthday without its year, and none from a year alone', () => {
		expect(quickDays(['birthday'], heinz, '2026-05-12')).toEqual([
			{ pick: 'birthday', on: '2026-05-12' }
		]);
		expect(quickDays(['birthday'], tom, '2026-05-12')).toEqual([]);
		expect(quickDays(['birthday'], null, '2026-05-12')).toEqual([]);
	});
});
