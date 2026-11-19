import { describe, expect, it } from 'bun:test';
import type { PartialDate } from '../dates/partial-date';
import { planListGroups, type ListPlan } from './list';

/* The household's list of outing ideas (docs/dev/02 §2.27.9): this month, later, some time. */

const TODAY = '2026-11-17';
const born: PartialDate = { value: '2019-06-02', precision: 'full' };

const plan = (id: string, over: Partial<ListPlan> = {}): ListPlan & { id: string } => ({
	id,
	when: null,
	bookedAt: null,
	createdAt: Date.parse('2026-10-01T12:00:00Z'),
	birth: born,
	...over
});

const shape = (plans: ReturnType<typeof plan>[], showLater = false, today = TODAY) => {
	const { groups, hidden } = planListGroups(plans, today, showLater);
	return { groups: groups.map((g) => [g.key, g.plans.map((p) => p.id)]), hidden };
};

describe('planListGroups', () => {
	it('puts what is due or passed and what comes this month first, soonest first', () => {
		expect(
			shape([
				plan('saturday', { when: { kind: 'on_date', on: '2026-11-21' } }),
				plan('month', { when: { kind: 'in_month', on: '2026-11' } }),
				plan('gone', { when: { kind: 'on_date', on: '2026-11-10' } })
			]).groups
		).toEqual([['thisMonth', ['month', 'gone', 'saturday']]]);
	});

	it('puts a day next month under Later, and *some time* last, newest first', () => {
		expect(
			shape([
				plan('old', { createdAt: 1 }),
				plan('december', { when: { kind: 'on_date', on: '2026-12-06' } }),
				plan('new', { createdAt: 2 })
			]).groups
		).toEqual([
			['later', ['december']],
			['someTime', ['new', 'old']]
		]);
	});

	it('hides what is more than ninety days ahead until asked, and counts it', () => {
		const ideas = [
			plan('december', { when: { kind: 'on_date', on: '2026-12-06' } }),
			plan('june', { when: { kind: 'on_date', on: '2027-06-01' } })
		];
		expect(shape(ideas)).toEqual({ groups: [['later', ['december']]], hidden: 1 });
		expect(shape(ideas, true)).toEqual({ groups: [['later', ['december', 'june']]], hidden: 1 });
	});

	it('keeps the count of hidden ones when Later holds nothing else', () => {
		expect(shape([plan('june', { when: { kind: 'on_date', on: '2027-06-01' } })])).toEqual({
			groups: [],
			hidden: 1
		});
	});

	it('never hides a booked idea, however far ahead', () => {
		expect(
			shape([plan('june', { when: { kind: 'on_date', on: '2027-06-01' }, bookedAt: 5 })])
		).toEqual({ groups: [['later', ['june']]], hidden: 0 });
	});

	it('places an age by the birthday it comes to', () => {
		expect(shape([plan('eighth', { when: { kind: 'at_age', age: 8 } })], true)).toEqual({
			groups: [['later', ['eighth']]],
			hidden: 1
		});
	});

	it('counts an age already reached, or one without a birth year, as *some time*', () => {
		expect(
			shape([
				plan('reached', { when: { kind: 'from_age', age: 5 } }),
				plan('unknown', { when: { kind: 'at_age', age: 10 }, birth: null, createdAt: 0 })
			]).groups
		).toEqual([['someTime', ['reached', 'unknown']]]);
	});

	it('reads a new month from its first day', () => {
		const december = plan('december', { when: { kind: 'on_date', on: '2026-12-06' } });
		expect(shape([december], false, '2026-12-01').groups).toEqual([['thisMonth', ['december']]]);
	});
});
