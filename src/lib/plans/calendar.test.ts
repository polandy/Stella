import { describe, expect, it } from 'bun:test';
import type { PartialDate } from '../dates/partial-date';
import { planLeadDay } from './calendar';
import type { PlanTiming } from './card';

/* An outing idea in the phone's calendar (docs/dev/02 §2.27.9): one entry ahead, never on its day. */

const born: PartialDate = { value: '2019-06-02', precision: 'full' };
const NOTED = Date.UTC(2026, 0, 10, 12);

const plan = (over: Partial<PlanTiming> = {}): PlanTiming => ({
	when: { kind: 'on_date', on: '2026-12-06' },
	bookedAt: null,
	doneOn: null,
	createdAt: NOTED,
	...over
});

describe('planLeadDay', () => {
	it('stands ninety days before the day, not on it', () => {
		expect(planLeadDay(plan(), born, '2026-08-01')).toBe('2026-09-07');
	});

	it('keeps that day once it is behind, so the entry does not move each day', () => {
		expect(planLeadDay(plan(), born, '2026-11-17')).toBe('2026-09-07');
		expect(planLeadDay(plan(), born, '2026-12-06')).toBe('2026-09-07');
	});

	it('stands on the day it was noted when that came later', () => {
		const late = plan({ createdAt: Date.UTC(2026, 10, 1, 12) });
		expect(planLeadDay(late, born, '2026-11-17')).toBe('2026-11-01');
	});

	it('counts a month from its first day, an age from its birthday', () => {
		expect(
			planLeadDay(plan({ when: { kind: 'in_month', on: '2027-03' } }), born, '2026-11-17')
		).toBe('2026-12-01');
		expect(planLeadDay(plan({ when: { kind: 'at_age', age: 8 } }), born, '2026-11-17')).toBe(
			'2027-03-04'
		);
	});

	it('has none without a when, once passed, for an age reached or unknown, or an estimated year', () => {
		expect(planLeadDay(plan({ when: null }), born, '2026-11-17')).toBeNull();
		expect(planLeadDay(plan(), born, '2026-12-07')).toBeNull();
		expect(
			planLeadDay(plan({ when: { kind: 'from_age', age: 5 } }), born, '2026-11-17')
		).toBeNull();
		expect(planLeadDay(plan({ when: { kind: 'at_age', age: 8 } }), null, '2026-11-17')).toBeNull();
		const estimate: PartialDate = { value: '2019', precision: 'age' };
		expect(
			planLeadDay(plan({ when: { kind: 'at_age', age: 8 } }), estimate, '2026-11-17')
		).toBeNull();
	});

	it('has none once done', () => {
		expect(planLeadDay(plan({ doneOn: '2026-11-01' }), born, '2026-11-17')).toBeNull();
	});
});
