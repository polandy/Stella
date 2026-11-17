import { describe, expect, it } from 'bun:test';
import type { PartialDate } from '../dates/partial-date';
import type { When } from '../when/when';
import {
	ASK_DAYS,
	COMING_PLANS,
	comingUpFirst,
	comingUpRows,
	homePlans,
	nextYearWhen,
	type HomePlan
} from './home';

/* What Home shows of the outing ideas (docs/dev/02 §2.27.7): mixed into *Coming up*, asked once passed. */

const TODAY = '2026-11-17';
const mia: PartialDate = { value: '2019-06-02', precision: 'full' };

const plan = (id: string, over: Partial<HomePlan> = {}): HomePlan => ({
	id,
	contactId: 'mia',
	visibility: 'shared',
	hiddenFromPerson: false,
	birth: mia,
	when: null,
	bookedAt: null,
	doneOn: null,
	createdAt: 0,
	...over
});

const on = (day: string): When => ({ kind: 'on_date', on: day });
const ids = (list: readonly { plan: { id: string } }[]) => list.map((row) => row.plan.id);
const none = new Set<string>();

describe('homePlans — the coming ideas', () => {
	it('shows the next three dated ideas, however far ahead, soonest first', () => {
		const { coming } = homePlans(
			[
				plan('far', { when: on('2028-01-05') }),
				plan('next-week', { when: on('2026-11-24') }),
				plan('summer', { when: on('2027-07-01') }),
				plan('spring', { when: on('2027-04-01') })
			],
			none,
			TODAY
		);
		expect(COMING_PLANS).toBe(3);
		expect(ids(coming)).toEqual(['next-week', 'spring', 'summer']);
	});

	it('sorts a month at its first day, and keeps the current month until it is over', () => {
		const { coming } = homePlans(
			[
				plan('march', { when: { kind: 'in_month', on: '2027-03' } }),
				plan('march-2nd', { when: on('2027-03-02') }),
				plan('this-month', { when: { kind: 'in_month', on: '2026-11' } })
			],
			none,
			TODAY
		);
		expect(ids(coming)).toEqual(['this-month', 'march', 'march-2nd']);
		expect(coming[1].on).toBe('2027-03-01');
	});

	it('places an age at the birthday it comes to', () => {
		const { coming } = homePlans(
			[plan('eighth', { when: { kind: 'at_age', age: 8 } })],
			none,
			TODAY
		);
		expect(coming).toEqual([
			{ plan: expect.objectContaining({ id: 'eighth' }), on: '2027-06-02', approximate: false }
		]);
	});

	it.each([
		['some time', plan('anytime')],
		['an age without a birth year', plan('age', { when: { kind: 'at_age', age: 8 }, birth: null })],
		['an age already reached', plan('from', { when: { kind: 'from_age', age: 5 } })],
		['a done one', plan('done', { when: on('2026-12-01'), doneOn: '2026-11-10' })]
	])('never lists %s among the coming', (_, idea) => {
		expect(homePlans([idea], none, TODAY).coming).toEqual([]);
	});
});

describe('homePlans — the passed ones ask', () => {
	it.each([
		['the day after', on('2026-11-16'), TODAY, true],
		['a week after', on('2026-11-10'), TODAY, true],
		['eight days after', on('2026-11-09'), TODAY, false],
		[
			'a month, days after its last day',
			{ kind: 'in_month', on: '2026-10' } as When,
			'2026-11-03',
			true
		],
		[
			'a month, eight days after its last day',
			{ kind: 'in_month', on: '2026-10' } as When,
			'2026-11-08',
			false
		],
		['today, not yet passed', on(TODAY), TODAY, false]
	])('%s', (_, when, today, asks) => {
		const { asking } = homePlans([plan('x', { when })], none, today);
		expect(asking.length).toBe(asks ? 1 : 0);
	});

	it('asks for exactly a week', () => {
		expect(ASK_DAYS).toBe(7);
	});

	it('asks for an estimated year once that year is over', () => {
		const guess: PartialDate = { value: '2018', precision: 'year' };
		const idea = plan('eighth', { when: { kind: 'at_age', age: 8 }, birth: guess });
		expect(homePlans([idea], none, '2026-12-31').asking).toEqual([]);
		expect(ids(homePlans([idea], none, '2027-01-07').asking)).toEqual(['eighth']);
		expect(homePlans([idea], none, '2027-01-08').asking).toEqual([]);
	});

	it('lists a passed one only there, booked or not, the longest gone first', () => {
		const { asking, coming, lines } = homePlans(
			[
				plan('sunday', { when: on('2026-11-15'), bookedAt: 1 }),
				plan('friday', { when: on('2026-11-13') })
			],
			new Set(['mia']),
			TODAY
		);
		expect(ids(asking)).toEqual(['friday', 'sunday']);
		expect(coming).toEqual([]);
		expect(lines.get('mia')).toBeUndefined();
	});

	it('drops a passed one from Home after the week', () => {
		const { asking, coming, lines } = homePlans(
			[plan('old', { when: on('2026-10-01') })],
			new Set(['mia']),
			TODAY
		);
		expect([asking, coming, lines.size]).toEqual([[], [], 0]);
	});
});

describe('homePlans — the person’s date line', () => {
	it('puts a booked idea on the line of a person who has one, out of the coming', () => {
		const { coming, lines } = homePlans(
			[plan('zoo', { when: on('2027-04-01'), bookedAt: 1 }), plan('lake', { bookedAt: 2 })],
			new Set(['mia']),
			TODAY
		);
		expect(coming).toEqual([]);
		expect(lines.get('mia')?.booked.map((p) => p.id)).toEqual(['zoo', 'lake']);
	});

	it('keeps a booked dated idea a row of its own when its person has no line', () => {
		const { coming, lines } = homePlans(
			[plan('zoo', { when: on('2027-04-01'), bookedAt: 1 }), plan('lake', { bookedAt: 2 })],
			none,
			TODAY
		);
		expect(ids(coming)).toEqual(['zoo']);
		expect(lines.size).toBe(0);
	});

	it('counts the undated ideas, on the line only', () => {
		const ideas = [
			plan('a'),
			plan('b', { when: { kind: 'from_age', age: 5 } }),
			plan('c', { contactId: 'ben' })
		];
		const { lines } = homePlans(ideas, new Set(['mia']), TODAY);
		expect(lines.get('mia')).toEqual({ booked: [], undated: 2 });
		expect(lines.get('ben')).toBeUndefined();
	});
});

describe('comingUpRows', () => {
	const date = (contactId: string, day: string) => ({ contactId, date: day });

	it('asks first, then mixes dates and ideas by day, a date before an idea on the same day', () => {
		const { asking, coming } = homePlans(
			[
				plan('passed', { when: on('2026-11-15') }),
				plan('dec', { when: on('2026-12-01') }),
				plan('soon', { when: on('2026-11-20') })
			],
			none,
			TODAY
		);
		const rows = comingUpRows(
			[date('ben', '2026-11-20'), date('ada', '2026-11-28')],
			asking,
			coming
		);
		expect(rows.map((row) => (row.kind === 'date' ? row.date.contactId : row.plan.id))).toEqual([
			'passed',
			'ben',
			'soon',
			'ada',
			'dec'
		]);
		expect(rows.map((row) => row.kind)).toEqual(['ask', 'date', 'plan', 'date', 'plan']);
	});
});

describe('comingUpFirst', () => {
	const rows = (...ideas: HomePlan[]) => comingUpRows([], [], homePlans(ideas, none, TODAY).coming);

	it.each([
		['a private idea', { visibility: 'private' as const }],
		['a surprise', { hiddenFromPerson: true }]
	])('never names %s, but the next shared row', (_, over) => {
		const first = comingUpFirst(
			rows(
				plan('secret', { when: on('2026-11-20'), ...over }),
				plan('zoo', { when: on('2026-12-01') })
			)
		);
		expect(first?.kind === 'plan' && first.plan.id).toBe('zoo');
	});

	it('names nothing when every row is kept close', () => {
		expect(
			comingUpFirst(rows(plan('secret', { when: on('2026-11-20'), visibility: 'private' })))
		).toBe(null);
	});
});

describe('nextYearWhen', () => {
	it.each([
		[on('2026-11-15'), on('2027-11-15')],
		[on('2028-02-29'), on('2029-03-01')],
		[{ kind: 'in_month', on: '2026-10' } as When, { kind: 'in_month', on: '2027-10' } as When],
		[{ kind: 'at_age', age: 7 } as When, { kind: 'at_age', age: 8 } as When]
	])('%o comes again as %o', (when, next) => {
		expect(nextYearWhen(when)).toEqual(next);
	});
});
