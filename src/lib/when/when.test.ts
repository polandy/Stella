import { describe, expect, it } from 'bun:test';
import * as v from 'valibot';
import { parsedWhenFromForm, whenFromForm } from './form';
import { optionalWhen, optionalWhenOf } from './schema';
import { sameWhen, whenColumns, whenFromOutside, whenOfColumns, type When } from './when';

/* A when stored, posted and carried (docs/dev/02 §2.25.8). */

const WHENS: (When | null)[] = [
	null,
	{ kind: 'from_age', age: 6 },
	{ kind: 'at_age', age: 18 },
	{ kind: 'christmas_at_age', age: 6 },
	{ kind: 'on_date', on: '2027-12-24' },
	{ kind: 'in_month', on: '2027-05' },
	{ kind: 'later' }
];

describe('the columns', () => {
	it.each(WHENS.map((when) => [JSON.stringify(when), when]))('round-trip %s', (_, when) => {
		expect(whenOfColumns(whenColumns(when))).toEqual(when);
	});

	it('refuse a row the use-cases never write', () => {
		expect(() => whenOfColumns({ whenKind: 'from_age', whenOn: null, whenAge: null })).toThrow();
		expect(() => whenOfColumns({ whenKind: 'on_date', whenOn: null, whenAge: null })).toThrow();
	});

	it('tell two whens apart', () => {
		expect(sameWhen({ kind: 'at_age', age: 6 }, { kind: 'at_age', age: 6 })).toBe(true);
		expect(sameWhen({ kind: 'at_age', age: 6 }, { kind: 'from_age', age: 6 })).toBe(false);
		expect(sameWhen(null, { kind: 'later' })).toBe(false);
	});
});

describe('whenFromOutside', () => {
	const outside = (whenKind: string | null, whenOn: string | null, whenAge: number | null) =>
		whenFromOutside({ whenKind, whenOn, whenAge });

	it('reads every when the columns can hold', () => {
		for (const when of WHENS) {
			expect(whenFromOutside(whenColumns(when))).toEqual(when);
		}
	});

	it.each([
		['an unknown kind', outside('soon', null, null)],
		['an age out of range', outside('at_age', null, 151)],
		['an age with a fraction', outside('from_age', null, 2.5)],
		['an age missing', outside('at_age', null, null)],
		['a Christmas without an age', outside('christmas_at_age', null, null)],
		['a day not shaped as one', outside('on_date', 'Christmas', null)],
		['a month not shaped as one', outside('in_month', '2027-13', null)],
		['a month that is a day', outside('in_month', '2027-05-01', null)]
	])('takes %s as now', (_, when) => {
		expect(when).toBeNull();
	});
});

describe('whenFromForm', () => {
	const read = (fields: Record<string, string>) => (key: string) => fields[key] ?? null;
	it.each([
		['no picker', {}, undefined],
		['now', { whenKind: 'now' }, null],
		['an age', { whenKind: 'from_age', whenAge: '6' }, { kind: 'from_age', age: 6 }],
		[
			'Christmas at an age',
			{ whenKind: 'christmas_at_age', whenAge: '6' },
			{ kind: 'christmas_at_age', age: 6 }
		],
		['a day', { whenKind: 'on_date', whenOn: '2027-12-24' }, { kind: 'on_date', on: '2027-12-24' }],
		['a month', { whenKind: 'in_month', whenOn: '2027-05' }, { kind: 'in_month', on: '2027-05' }],
		['later', { whenKind: 'later', whenAge: '6' }, { kind: 'later' }],
		[
			'an age left empty, for the schema to refuse',
			{ whenKind: 'at_age' },
			{ kind: 'at_age', age: 0 }
		]
	] as const)('reads %s', (_, fields, expected) => {
		expect(whenFromForm(read(fields))).toEqual(expected);
	});

	it('is checked against the schema where a command is built in the browser', () => {
		const kinds = ['at_age', 'on_date'] as const;
		expect(parsedWhenFromForm(read({ whenKind: 'at_age', whenAge: '10' }), kinds)).toEqual({
			when: { kind: 'at_age', age: 10 }
		});
		expect(parsedWhenFromForm(read({}), kinds)).toEqual({ when: undefined });
		expect(parsedWhenFromForm(read({ whenKind: 'at_age', whenAge: '' }), kinds)).toBeNull();
		expect(parsedWhenFromForm(read({ whenKind: 'later' }), kinds)).toBeNull();
	});
});

describe('optionalWhen', () => {
	it.each([undefined, ...WHENS].map((when) => [JSON.stringify(when), when]))(
		'takes %s',
		(_, when) => {
			expect(v.is(optionalWhen, when)).toBe(true);
		}
	);

	it.each([
		{ kind: 'from_age', age: 0 },
		{ kind: 'from_age', age: 2.5 },
		{ kind: 'at_age' },
		{ kind: 'on_date', on: 'Christmas' },
		{ kind: 'in_month', on: '2027-5' },
		{ kind: 'someday' }
	])('refuses %j', (when) => {
		expect(v.is(optionalWhen, when)).toBe(false);
	});
});

describe('optionalWhenOf', () => {
	const some = optionalWhenOf(['on_date', 'in_month']);

	it('takes the kinds it names, now and absent', () => {
		for (const when of [undefined, null, { kind: 'in_month', on: '2027-05' }]) {
			expect(v.is(some, when)).toBe(true);
		}
	});

	it('refuses a kind the record does not have', () => {
		expect(v.is(some, { kind: 'later' })).toBe(false);
		expect(v.is(some, { kind: 'at_age', age: 6 })).toBe(false);
	});
});
