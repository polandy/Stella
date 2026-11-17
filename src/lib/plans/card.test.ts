import { describe, expect, it } from 'bun:test';
import type { PartialDate } from '../dates/partial-date';
import { openIdeaCount, splitPlans, type PlanTiming } from './card';
import { planVisibilityFromForm } from './plans';

/* The Outings card's lists (docs/dev/02 §2.27): what is open, what waits under *Later*, what was done. */

const TODAY = '2026-11-17';
const birth: PartialDate = { value: '2019-06-02', precision: 'full' };

const plan = (id: string, over: Partial<PlanTiming> = {}) => ({
	id,
	when: null,
	bookedAt: null,
	doneOn: null,
	createdAt: 0,
	...over
});

const ids = (list: { id: string }[]) => list.map((p) => p.id);

describe('splitPlans', () => {
	it('puts the soonest first and *some time* last, newest first among those', () => {
		const { open } = splitPlans(
			[
				plan('anytime-old', { createdAt: 1 }),
				plan('month', { when: { kind: 'in_month', on: '2026-12' } }),
				plan('saturday', { when: { kind: 'on_date', on: '2026-11-21' } }),
				plan('anytime-new', { createdAt: 2 })
			],
			birth,
			TODAY
		);
		expect(ids(open)).toEqual(['saturday', 'month', 'anytime-new', 'anytime-old']);
	});

	it('folds an idea more than ninety days ahead under Later, and opens it once it nears', () => {
		const far = plan('far', { when: { kind: 'on_date', on: '2027-06-01' } });
		expect(ids(splitPlans([far], birth, TODAY).later)).toEqual(['far']);
		expect(ids(splitPlans([far], birth, '2027-03-10').open)).toEqual(['far']);
	});

	it('folds an age ahead by the birthday it comes to', () => {
		const tenth = plan('tenth', { when: { kind: 'at_age', age: 10 } });
		expect(ids(splitPlans([tenth], birth, TODAY).later)).toEqual(['tenth']);
	});

	it('never folds a booked idea, however far ahead it is', () => {
		const booked = plan('booked', { when: { kind: 'on_date', on: '2027-06-01' }, bookedAt: 5 });
		expect(ids(splitPlans([booked], birth, TODAY).open)).toEqual(['booked']);
	});

	it('lists the done ones apart, the latest first', () => {
		const { open, done } = splitPlans(
			[plan('a', { doneOn: '2026-10-01' }), plan('b', { doneOn: '2026-11-01' }), plan('c')],
			birth,
			TODAY
		);
		expect(ids(open)).toEqual(['c']);
		expect(ids(done)).toEqual(['b', 'a']);
	});
});

describe('openIdeaCount', () => {
	it('counts only what is still an idea, not what is booked', () => {
		expect(openIdeaCount([plan('a'), plan('b', { bookedAt: 3 })])).toBe(1);
	});
});

describe('planVisibilityFromForm', () => {
	it('reads the three-way choice', () => {
		expect(planVisibilityFromForm('shared')).toEqual({
			visibility: 'shared',
			hiddenFromPerson: false
		});
		expect(planVisibilityFromForm('surprise')).toEqual({
			visibility: 'shared',
			hiddenFromPerson: true
		});
		expect(planVisibilityFromForm('private')).toEqual({
			visibility: 'private',
			hiddenFromPerson: false
		});
		expect(planVisibilityFromForm(null)).toEqual({ visibility: 'shared', hiddenFromPerson: false });
	});
});
