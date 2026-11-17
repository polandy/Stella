import { describe, expect, it } from 'bun:test';
import type { PartialDate } from '../dates/partial-date';
import { asks, waits, whenState, type WhenHistory, type WhenState } from './state';
import type { When } from './when';

/* Where a when stands (§2.25.8): Mia 2022-03-14, Leap 2020-02-29, Ruth estimated, Heinz no year. */

const mia: PartialDate = { value: '2022-03-14', precision: 'full' };
const leap: PartialDate = { value: '2020-02-29', precision: 'full' };
const ruth: PartialDate = { value: '1950', precision: 'age' };
const heinz: PartialDate = { value: '--05-12', precision: 'month_day' };

const fromSix: When = { kind: 'from_age', age: 6 };
const atSix: When = { kind: 'at_age', age: 6 };
const christmas: When = { kind: 'on_date', on: '2026-12-24' };
const later: When = { kind: 'later' };

const noted = (birth: PartialDate | null, checkedOn: string | null = null): WhenHistory => ({
	birth,
	notedOn: '2026-11-17',
	checkedOn
});

describe('whenState, for an age or a day', () => {
	it.each([
		['from an age, before the lead time', fromSix, mia, '2027-12-14', { kind: 'waiting' }],
		[
			'from an age, the first day of the lead time',
			fromSix,
			mia,
			'2027-12-15',
			{ kind: 'soon', on: '2028-03-14', approximate: false, inDays: 90 }
		],
		[
			'from an age, the day before',
			fromSix,
			mia,
			'2028-03-13',
			{ kind: 'soon', on: '2028-03-14', approximate: false, inDays: 1 }
		],
		[
			'from an age, on the birthday',
			fromSix,
			mia,
			'2028-03-14',
			{ kind: 'due', on: '2028-03-14', approximate: false }
		],
		[
			'from an age, years on it still holds',
			fromSix,
			mia,
			'2031-07-01',
			{ kind: 'due', on: '2028-03-14', approximate: false }
		],
		[
			'for a birthday, on it',
			atSix,
			mia,
			'2028-03-14',
			{ kind: 'due', on: '2028-03-14', approximate: false }
		],
		[
			'for a birthday, the day after',
			atSix,
			mia,
			'2028-03-15',
			{ kind: 'passed', on: '2028-03-14', approximate: false }
		],
		['for a day, the day before the lead time', christmas, null, '2026-09-24', { kind: 'waiting' }],
		[
			'for a day, within the lead time',
			christmas,
			null,
			'2026-11-17',
			{ kind: 'soon', on: '2026-12-24', approximate: false, inDays: 37 }
		],
		[
			'for a day, on it',
			christmas,
			null,
			'2026-12-24',
			{ kind: 'due', on: '2026-12-24', approximate: false }
		],
		[
			'for a day, gone by',
			christmas,
			null,
			'2026-12-25',
			{ kind: 'passed', on: '2026-12-24', approximate: false }
		],
		[
			'29 February in a common year falls on 1 March',
			{ kind: 'at_age', age: 1 },
			leap,
			'2021-03-01',
			{ kind: 'due', on: '2021-03-01', approximate: false }
		],
		[
			'an estimated year, before its lead time',
			{ kind: 'at_age', age: 80 },
			ruth,
			'2029-10-02',
			{ kind: 'waiting' }
		],
		[
			'an estimated year, soon',
			{ kind: 'at_age', age: 80 },
			ruth,
			'2029-10-03',
			{ kind: 'soon', on: '2030-01-01', approximate: true, inDays: 90 }
		],
		[
			'an estimated year, due all its year',
			{ kind: 'at_age', age: 80 },
			ruth,
			'2030-12-31',
			{ kind: 'due', on: '2030-01-01', approximate: true }
		],
		[
			'an estimated year, passed with the year',
			{ kind: 'at_age', age: 80 },
			ruth,
			'2031-01-01',
			{ kind: 'passed', on: '2030-01-01', approximate: true }
		],
		[
			'an age whose birth year went is due, never lost',
			fromSix,
			heinz,
			'2026-11-17',
			{ kind: 'due', on: null, approximate: false }
		]
	] as const)('%s', (_, when, birth, today, expected) => {
		expect(whenState(when, noted(birth), today)).toEqual(expected as WhenState);
	});
});

describe('whenState, for later', () => {
	it.each([
		['just noted, its birthday too far for a look', noted(mia), '2026-11-17', { kind: 'waiting' }],
		[
			'from 90 days before the birthday',
			noted(mia),
			'2026-12-14',
			{ kind: 'review', on: '2027-03-14' }
		],
		[
			'unanswered, it asks on after the birthday',
			noted(mia),
			'2027-05-01',
			{ kind: 'review', on: '2027-03-14' }
		],
		[
			'answered, it waits for next year',
			noted(mia, '2027-01-10'),
			'2027-05-01',
			{ kind: 'waiting' }
		],
		[
			'answered last year, it asks again',
			noted(mia, '2027-01-10'),
			'2027-12-15',
			{ kind: 'review', on: '2028-03-14' }
		],
		[
			'a birthday without its year still has its day',
			noted(heinz),
			'2027-02-10',
			{ kind: 'waiting' }
		],
		['without a birthday, before the anniversary', noted(null), '2027-08-18', { kind: 'waiting' }],
		[
			'without a birthday, 90 days before the anniversary',
			noted(null),
			'2027-08-19',
			{ kind: 'review', on: '2027-11-17' }
		],
		[
			'an estimated year names no birthday: the anniversary',
			noted(ruth),
			'2027-08-19',
			{ kind: 'review', on: '2027-11-17' }
		],
		[
			'29 February in a common year falls on 1 March',
			{ birth: leap, notedOn: '2026-01-01', checkedOn: null },
			'2026-12-01',
			{ kind: 'review', on: '2027-03-01' }
		],
		[
			'a look that began before the birthday of next year',
			{ birth: { value: '2020-01-20', precision: 'full' }, notedOn: '2026-05-01', checkedOn: null },
			'2026-10-22',
			{ kind: 'review', on: '2027-01-20' }
		]
	] as const)('%s', (_, history, today, expected) => {
		expect(whenState(later, history, today)).toEqual(expected as WhenState);
	});

	it('a look at a birthday without its year', () => {
		expect(whenState(later, noted(heinz), '2027-02-11')).toEqual({
			kind: 'review',
			on: '2027-05-12'
		});
	});
});

describe('waits and asks', () => {
	it('now never waits', () => expect(waits(null, noted(mia), '2026-11-17')).toBe(false));
	it('a far day waits', () => expect(waits(fromSix, noted(mia), '2026-11-17')).toBe(true));
	it('a near day does not', () => expect(waits(christmas, noted(mia), '2026-11-17')).toBe(false));
	it.each([
		[{ kind: 'passed', on: '2026-12-24', approximate: false }, true],
		[{ kind: 'review', on: '2027-03-14' }, true],
		[{ kind: 'due', on: '2026-12-24', approximate: false }, false],
		[{ kind: 'waiting' }, false]
	] as const)('%o asks: %p', (state, expected) => {
		expect(asks(state as WhenState)).toBe(expected);
	});
});
