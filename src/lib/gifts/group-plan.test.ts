import { describe, expect, it } from 'bun:test';
import type { PartialDate } from '../dates/partial-date';
import { GIFT_GROUP_MAX_RECIPIENTS, planGiftGroup, type GroupRecipient } from './group-plan';

/* One idea for several people (§2.25.11): the children of the concept's examples, today 2026-11-18. */

const TODAY = '2026-11-18';
const born = (value: string): PartialDate => ({ value, precision: 'full' });
const mia: GroupRecipient = { contactId: 'mia', birth: born('2022-01-20') };
const ben: GroupRecipient = { contactId: 'ben', birth: born('2022-08-02') };
const lea: GroupRecipient = { contactId: 'lea', birth: born('2023-12-28') };
const tom: GroupRecipient = { contactId: 'tom', birth: { value: '2022', precision: 'age' } };
const noah: GroupRecipient = { contactId: 'noah', birth: null };
const emma: GroupRecipient = { contactId: 'emma', birth: born('2019-05-10') };
const jan: GroupRecipient = { contactId: 'jan', birth: born('2020-02-01') };

describe('planGiftGroup', () => {
	it('works out the fifth birthday for each child, and who waits', () => {
		const plan = planGiftGroup({ kind: 'at_age', age: 5 }, [mia, ben, lea, tom], TODAY);
		expect(
			plan.map((p) =>
				p.ok && p.outlook.kind === 'due' ? [p.contactId, p.outlook.on, p.outlook.waits] : p
			)
		).toEqual([
			['mia', '2027-01-20', false],
			['ben', '2027-08-02', true],
			['lea', '2028-12-28', true],
			['tom', '2027-01-01', false]
		]);
		expect(plan.every((p) => p.ok && p.when?.kind === 'at_age' && !p.own)).toBe(true);
	});

	it('works out Christmas at six, a year later for a child born after Christmas Eve', () => {
		const plan = planGiftGroup({ kind: 'christmas_at_age', age: 6 }, [jan, lea], TODAY);
		expect(plan.map((p) => p.ok && p.outlook.kind === 'due' && p.outlook.on)).toEqual([
			'2026-12-24',
			'2030-12-24'
		]);
	});

	it('leaves out a child too old for it and one without a birth year', () => {
		const plan = planGiftGroup({ kind: 'at_age', age: 5 }, [emma, noah, mia], TODAY);
		expect(plan.map((p) => (p.ok ? p.contactId : [p.contactId, p.problem]))).toEqual([
			['emma', 'birthdayPassed'],
			['noah', 'needsBirthYear'],
			'mia'
		]);
	});

	it('keeps an own when for one child instead of the shared one, checked the same way', () => {
		const nextBirthday = { kind: 'on_date', on: '2027-05-10' } as const;
		const [instead, past] = planGiftGroup(
			{ kind: 'at_age', age: 5 },
			[
				{ ...emma, when: nextBirthday },
				{ ...ben, when: { kind: 'on_date', on: '2026-01-01' } }
			],
			TODAY
		);
		expect(instead).toMatchObject({ ok: true, when: nextBirthday, own: true });
		expect(past).toEqual({ contactId: 'ben', ok: false, problem: 'dayPassed' });
	});

	it('stores *from an age* already reached as now, as for one person', () => {
		const [plan] = planGiftGroup({ kind: 'from_age', age: 5 }, [emma], TODAY);
		expect(plan).toMatchObject({ ok: true, when: null, outlook: { kind: 'ageReached', age: 7 } });
	});

	it('needs no birth date for a day or for now', () => {
		const christmas = { kind: 'on_date', on: '2027-12-24' } as const;
		expect(planGiftGroup(christmas, [noah], TODAY)).toMatchObject([{ ok: true, when: christmas }]);
		expect(planGiftGroup(null, [noah], TODAY)).toMatchObject([{ ok: true, when: null }]);
	});

	it('plans each person once, the first time they are named', () => {
		const plan = planGiftGroup(null, [mia, { ...mia, when: { kind: 'later' } }, ben], TODAY);
		expect(plan.map((p) => p.contactId)).toEqual(['mia', 'ben']);
		expect(plan[0]).toMatchObject({ when: null, own: false });
	});

	it('caps a group at fifty people', () => {
		expect(GIFT_GROUP_MAX_RECIPIENTS).toBe(50);
	});
});
