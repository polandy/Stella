import { describe, expect, it } from 'bun:test';
import type { PartialDate } from '../dates/partial-date';
import type { When } from '../when/when';
import type { GiftState } from './gifts';
import type { GiverView } from './giver';
import { byOccasion, handsOver, occasionTally } from './occasions';

/* The Gifts card by occasion (docs/dev/02 §2.25.13). */

const BIRTH: PartialDate = { value: '2021-03-04', precision: 'full' };
const NOBODY: GiverView = { kind: 'none' };
const SANDRA: GiverView = { kind: 'person', contactId: 'sandra', name: 'Sandra' };

interface Gift {
	id: string;
	state: GiftState;
	when: When | null;
	giver: GiverView;
}
const gift = (id: string, when: When | null, more: Partial<Gift> = {}): Gift => ({
	id,
	state: 'idea',
	when,
	giver: NOBODY,
	...more
});
const ids = (groups: { gifts: Gift[] }[]) => groups.map((group) => group.gifts.map((g) => g.id));

describe('whether the card groups at all', () => {
	it('stays as it is while no gift has a giver or a day', () => {
		const gifts = [
			gift('now', null),
			gift('from', { kind: 'from_age', age: 6 }),
			gift('bought', null, { state: 'bought' })
		];
		expect(byOccasion(gifts, BIRTH)).toBeNull();
	});

	it('groups once one gift has a giver', () => {
		expect(byOccasion([gift('a', null, { giver: SANDRA })], BIRTH)).not.toBeNull();
	});

	it('groups once one gift is for a day', () => {
		expect(byOccasion([gift('a', { kind: 'at_age', age: 6 })], BIRTH)).not.toBeNull();
	});
});

describe('the groups', () => {
	it('keys each gift by the day its when falls on, soonest first, the rest last', () => {
		const groups = byOccasion(
			[
				gift('loose', null),
				gift('xmas', { kind: 'on_date', on: '2026-12-24' }),
				gift('sixth', { kind: 'at_age', age: 6 }),
				gift('xmas5', { kind: 'christmas_at_age', age: 5 }),
				gift('from', { kind: 'from_age', age: 8 })
			],
			BIRTH
		)!;
		expect(groups.map((group) => group.on)).toEqual(['2026-12-24', '2027-03-04', null]);
		expect(ids(groups)).toEqual([['xmas', 'xmas5'], ['sixth'], ['loose', 'from']]);
	});

	it('puts a bought gift at the end of its own group', () => {
		const groups = byOccasion(
			[
				gift('done', { kind: 'on_date', on: '2026-12-24' }, { state: 'bought' }),
				gift('open', { kind: 'on_date', on: '2026-12-24' })
			],
			BIRTH
		)!;
		expect(ids(groups)).toEqual([['open', 'done']]);
	});

	it('names a group by the when it was found under', () => {
		const [first] = byOccasion([gift('a', { kind: 'christmas_at_age', age: 5 })], BIRTH)!;
		expect(first!.when).toEqual({ kind: 'christmas_at_age', age: 5 });
	});

	it('cannot key an age without a birth year, so that gift has no occasion', () => {
		const groups = byOccasion([gift('a', { kind: 'at_age', age: 6 }, { giver: SANDRA })], null)!;
		expect(groups.map((group) => group.on)).toEqual([null]);
	});
});

describe('the tally', () => {
	it('counts done, taken on and still free', () => {
		expect(
			occasionTally([
				gift('a', null, { state: 'bought' }),
				gift('b', null, { giver: SANDRA }),
				gift('c', null, { giver: { kind: 'household' } }),
				gift('d', null)
			])
		).toEqual({ done: 1, assigned: 2, free: 1 });
	});
});

describe('whose turn it is to hand it over (D17)', () => {
	const household = new Set(['mama', 'lena']);
	it('is ours with nobody named, the household, or one of its people', () => {
		expect(handsOver(NOBODY, household)).toBe(true);
		expect(handsOver({ kind: 'household' }, household)).toBe(true);
		expect(handsOver({ kind: 'person', contactId: 'lena', name: 'Lena' }, household)).toBe(true);
	});

	it('is not ours for anyone else, unseen or gone', () => {
		expect(handsOver(SANDRA, household)).toBe(false);
		expect(handsOver({ kind: 'unseen' }, household)).toBe(false);
		expect(handsOver({ kind: 'left', name: 'Ruth' }, household)).toBe(false);
	});
});
