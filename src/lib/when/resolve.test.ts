import { describe, expect, it } from 'bun:test';
import type { PartialDate } from '../dates/partial-date';
import {
	ageOn,
	birthdayAtAge,
	checkWhen,
	christmasAtAge,
	isWaiting,
	knowsBirthYear,
	monthEnd,
	whenOutlook,
	WHEN_LEAD_DAYS
} from './resolve';
import type { When } from './when';

/* When a when comes due (§2.25.8): Mia 2022-03-14, Leap 2020-02-29, Ruth estimated, Heinz no year. */

const mia: PartialDate = { value: '2022-03-14', precision: 'full' };
const leap: PartialDate = { value: '2020-02-29', precision: 'full' };
const ruth: PartialDate = { value: '1950', precision: 'age' };
const tom: PartialDate = { value: '2019', precision: 'year' };
const heinz: PartialDate = { value: '--05-12', precision: 'month_day' };

describe('birthdayAtAge', () => {
	it.each([
		['a full birth date, the birthday that year', mia, 6, { on: '2028-03-14', approximate: false }],
		[
			'29 February in a common year falls on 1 March',
			leap,
			1,
			{ on: '2021-03-01', approximate: false }
		],
		['29 February in a leap year stays', leap, 4, { on: '2024-02-29', approximate: false }],
		['an estimated year, 1 January and about', ruth, 80, { on: '2030-01-01', approximate: true }],
		['a bare year, the same', tom, 6, { on: '2025-01-01', approximate: true }],
		['no year, no birthday', heinz, 6, null],
		['no birth date, none', null, 6, null]
	] as const)('%s', (_, birth, age, expected) => {
		expect(birthdayAtAge(birth, age)).toEqual(expected);
	});
});

describe('christmasAtAge', () => {
	const born = (value: string): PartialDate => ({ value, precision: 'full' });
	it.each([
		['a birthday before Christmas, that year', mia, 6, { on: '2028-12-24', approximate: false }],
		[
			'a birthday after Christmas, the next: on that Christmas they are still five',
			born('2023-12-28'),
			6,
			{ on: '2030-12-24', approximate: false }
		],
		[
			'a birthday on Christmas Eve, that very day',
			born('2022-12-24'),
			6,
			{ on: '2028-12-24', approximate: false }
		],
		['29 February plays no part', leap, 6, { on: '2026-12-24', approximate: false }],
		['a bare year, about that Christmas', tom, 6, { on: '2025-12-24', approximate: true }],
		['an estimated year, the same', ruth, 80, { on: '2030-12-24', approximate: true }],
		['no year, no Christmas', heinz, 6, null],
		['no birth date, none', null, 6, null]
	] as const)('%s', (_, birth, age, expected) => {
		expect(christmasAtAge(birth, age)).toEqual(expected);
	});
});

describe('ageOn', () => {
	it.each([
		['the day before the birthday', mia, '2026-03-13', 3],
		['on the birthday', mia, '2026-03-14', 4],
		['a 29 February child on 28 February of a common year', leap, '2021-02-28', 0],
		['… and on 1 March', leap, '2021-03-01', 1],
		['an estimated year, by the year alone', ruth, '2026-01-01', 76],
		['no year', heinz, '2026-11-17', null]
	] as const)('%s', (_, birth, today, expected) => {
		expect(ageOn(birth, today)).toBe(expected);
	});
});

describe('knowsBirthYear', () => {
	it('knows it from a full date, a year or an estimate, not from a day alone', () => {
		expect([mia, ruth, tom, heinz, null].map(knowsBirthYear)).toEqual([
			true,
			true,
			true,
			false,
			false
		]);
	});
});

describe('isWaiting', () => {
	const fromSix: When = { kind: 'from_age', age: 6 };
	it.each([
		['now never waits', null, mia, '2026-11-17', false],
		['later always waits', { kind: 'later' }, mia, '2026-11-17', true],
		['an age years ahead waits', fromSix, mia, '2026-11-17', true],
		['… until the lead time before it', fromSix, mia, '2027-12-14', true],
		['… and joins the open ones on its first day', fromSix, mia, '2027-12-15', false],
		['… and stays there once the day is over', fromSix, mia, '2030-01-01', false],
		['an age without a birth year is open, never lost', fromSix, heinz, '2026-11-17', false],
		['a day ahead waits', { kind: 'on_date', on: '2027-12-24' }, mia, '2026-11-17', true],
		['a month ahead waits', { kind: 'in_month', on: '2027-05' }, mia, '2026-11-17', true],
		[
			'… from the lead time before its first day it does not',
			{ kind: 'in_month', on: '2027-02' },
			mia,
			'2026-11-17',
			false
		],
		[
			'a day within the lead time does not',
			{ kind: 'on_date', on: '2027-01-10' },
			mia,
			'2026-11-17',
			false
		]
	] as const)('%s', (_, when, birth, today, expected) => {
		expect(isWaiting(when, birth, today)).toBe(expected);
	});

	it('leads by 90 days', () => {
		expect(WHEN_LEAD_DAYS).toBe(90);
	});
});

describe('whenOutlook', () => {
	const today = '2026-11-17';
	it.each([
		['now', null, mia, { kind: 'now' }],
		['later', { kind: 'later' }, mia, { kind: 'later' }],
		['an age without a birth year', { kind: 'at_age', age: 6 }, heinz, { kind: 'needsBirthYear' }],
		[
			'from an age already reached',
			{ kind: 'from_age', age: 3 },
			mia,
			{ kind: 'ageReached', age: 4 }
		],
		[
			'from an age reached today',
			{ kind: 'from_age', age: 4 },
			{ value: '2022-11-17', precision: 'full' },
			{ kind: 'ageReached', age: 4 }
		],
		[
			'a birthday that is over',
			{ kind: 'at_age', age: 4 },
			mia,
			{ kind: 'birthdayPassed', age: 4 }
		],
		[
			'an estimated birthday within its year is not over',
			{ kind: 'at_age', age: 76 },
			ruth,
			{
				kind: 'due',
				when: { kind: 'at_age', age: 76 },
				on: '2026-01-01',
				approximate: true,
				waits: false
			}
		],
		['a day gone by', { kind: 'on_date', on: '2026-11-16' }, mia, { kind: 'dayPassed' }],
		['no such day', { kind: 'on_date', on: '2027-02-30' }, mia, { kind: 'noSuchDay' }],
		['a month gone by', { kind: 'in_month', on: '2026-10' }, mia, { kind: 'monthPassed' }],
		['no such month', { kind: 'in_month', on: '2026-13' }, mia, { kind: 'noSuchDay' }],
		[
			'the month we are in, from its first day',
			{ kind: 'in_month', on: '2026-11' },
			mia,
			{
				kind: 'due',
				when: { kind: 'in_month', on: '2026-11' },
				on: '2026-11-01',
				approximate: false,
				waits: false
			}
		],
		[
			'Christmas at an age gone by',
			{ kind: 'christmas_at_age', age: 3 },
			mia,
			{ kind: 'christmasPassed', age: 3 }
		],
		[
			'Christmas at an age, this year',
			{ kind: 'christmas_at_age', age: 4 },
			mia,
			{
				kind: 'due',
				when: { kind: 'christmas_at_age', age: 4 },
				on: '2026-12-24',
				approximate: false,
				waits: false
			}
		],
		[
			'Christmas at an age without a birth year',
			{ kind: 'christmas_at_age', age: 6 },
			heinz,
			{ kind: 'needsBirthYear' }
		],
		['an age out of range', { kind: 'from_age', age: 0 }, mia, { kind: 'badAge' }],
		[
			'an age ahead',
			{ kind: 'from_age', age: 6 },
			mia,
			{
				kind: 'due',
				when: { kind: 'from_age', age: 6 },
				on: '2028-03-14',
				approximate: false,
				waits: true
			}
		],
		[
			'today itself',
			{ kind: 'on_date', on: today },
			mia,
			{
				kind: 'due',
				when: { kind: 'on_date', on: today },
				on: today,
				approximate: false,
				waits: false
			}
		]
	] as const)('%s', (_, when, birth, expected) => {
		expect(whenOutlook(when, birth, today)).toEqual(expected);
	});
});

describe('monthEnd', () => {
	it.each([
		['2026-11', '2026-11-30'],
		['2028-02', '2028-02-29'],
		['2027-02', '2027-02-28'],
		['2026-12', '2026-12-31']
	])('%s ends on %s', (month, end) => {
		expect(monthEnd(month)).toBe(end);
	});
});

describe('checkWhen', () => {
	const today = '2026-11-17';
	it('stores an age already reached as now', () => {
		expect(checkWhen({ kind: 'from_age', age: 2 }, mia, today)).toEqual({ ok: true, when: null });
	});

	it('stores a when still ahead as it is', () => {
		const when: When = { kind: 'at_age', age: 18 };
		expect(checkWhen(when, mia, today)).toEqual({ ok: true, when });
	});

	it('refuses what cannot come', () => {
		expect(checkWhen({ kind: 'at_age', age: 2 }, mia, today)).toEqual({
			ok: false,
			problem: 'birthdayPassed'
		});
		expect(checkWhen({ kind: 'christmas_at_age', age: 3 }, mia, today)).toEqual({
			ok: false,
			problem: 'christmasPassed'
		});
		expect(checkWhen({ kind: 'from_age', age: 6 }, null, today)).toEqual({
			ok: false,
			problem: 'needsBirthYear'
		});
	});
});
