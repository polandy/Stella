import { beforeEach, describe, expect, it } from 'bun:test';
import { inEnglish } from '../../../i18n/phrase';
import { ContactGoneError } from '../contacts/require-visible';
import { fakePlans } from './plans.fixture';
import {
	addPlan,
	editPlan,
	InvalidPlanError,
	listPlansForContact,
	PlanGoneError,
	removePlan,
	type PlanDeps
} from './plans';
import { bookPlan, donePlan, reopenPlan, unbookPlan } from './progress';

/*
 * The outing use-cases (docs/dev/02 §2.27), over an in-memory port. What the database scopes —
 * a private idea, a surprise kept from its person — is the Drizzle adapter's to prove
 * (`db/plan-repository.test.ts`); the fake keeps the same rule.
 */

const ANDY = { userId: 'andy', householdId: 'h1' };
const JULIA = { userId: 'julia', householdId: 'h1' };
const MIA = 'mia';
// Julia's own person is the contact `julia-self`.
const JULIA_SELF = 'julia-self';

let plans: ReturnType<typeof fakePlans>;
let deps: PlanDeps;
let now: number;
let counter: number;

beforeEach(() => {
	plans = fakePlans(new Map([[JULIA_SELF, 'julia']]));
	// 2026-11-17, a Tuesday, in the morning.
	now = Date.UTC(2026, 10, 17, 9);
	counter = 0;
	deps = {
		plans,
		contacts: {
			async findByIdVisibleTo(_viewer, id) {
				if (id === MIA) return { id, birthDate: '2022-03-14', birthDatePrecision: 'full' } as never;
				if (id === JULIA_SELF)
					return { id, birthDate: null, birthDatePrecision: 'full' } as never;
				return null;
			}
		},
		ids: { next: () => `plan-${++counter}` },
		clock: { now: () => now }
	};
});

const zoo = (title = 'Zoo') => ({
	contactId: MIA,
	title,
	note: null,
	url: null,
	visibility: 'shared' as const
});

async function refusal(promise: Promise<unknown>): Promise<string> {
	try {
		await promise;
	} catch (error) {
		if (error instanceof InvalidPlanError || error instanceof PlanGoneError)
			return inEnglish(error.phrase);
		throw error;
	}
	throw new Error('expected a refusal');
}

describe('addPlan', () => {
	it('notes an open idea for some time, shared, by its author', async () => {
		const { planId } = await addPlan(deps, ANDY, { ...zoo('  Zoo  '), note: '  ' });
		expect(plans.rows.get(planId)).toEqual({
			id: planId,
			contactId: MIA,
			createdBy: 'andy',
			visibility: 'shared',
			hiddenFromPerson: false,
			title: 'Zoo',
			note: null,
			url: null,
			when: null,
			bookedAt: null,
			bookedBy: null,
			doneAt: null,
			doneOn: null,
			doneBy: null,
			momentId: null,
			createdAt: now,
			updatedAt: now
		});
	});

	it('keeps a month, a link read as https, and a note', async () => {
		const { planId } = await addPlan(deps, ANDY, {
			...zoo(),
			note: 'Elephants',
			url: 'zoo.example',
			when: { kind: 'in_month', on: '2027-05' }
		});
		expect(plans.rows.get(planId)).toMatchObject({
			note: 'Elephants',
			url: 'https://zoo.example',
			when: { kind: 'in_month', on: '2027-05' }
		});
	});

	it('stores an age already reached as some time', async () => {
		const { planId } = await addPlan(deps, ANDY, { ...zoo(), when: { kind: 'from_age', age: 3 } });
		expect(plans.rows.get(planId)?.when).toBeNull();
	});

	it('refuses an empty line, a link that is none, and a when gone by', async () => {
		expect(await refusal(addPlan(deps, ANDY, zoo(' ')))).toBe('Write what you want to do.');
		expect(await refusal(addPlan(deps, ANDY, { ...zoo(), url: 'javascript:alert(1)' }))).toBe(
			'The link must be a web address.'
		);
		expect(
			await refusal(addPlan(deps, ANDY, { ...zoo(), when: { kind: 'in_month', on: '2026-10' } }))
		).toBe('That month is over. Choose one still ahead.');
	});

	it('refuses an age for someone without a birth year', async () => {
		expect(
			await refusal(
				addPlan(deps, ANDY, { ...zoo(), contactId: JULIA_SELF, when: { kind: 'at_age', age: 40 } })
			)
		).toBe('An age needs their birth year, or an estimate of it.');
	});

	it('refuses a person the author cannot see', async () => {
		expect(addPlan(deps, ANDY, { ...zoo(), contactId: 'ghost' })).rejects.toBeInstanceOf(
			ContactGoneError
		);
	});

	it('keeps a shared idea from the person it is with, but never a private one', async () => {
		const surprise = { ...zoo(), contactId: JULIA_SELF, hiddenFromPerson: true };
		const shared = await addPlan(deps, ANDY, surprise);
		const own = await addPlan(deps, ANDY, { ...surprise, visibility: 'private' });
		expect(plans.rows.get(shared.planId)?.hiddenFromPerson).toBe(true);
		expect(plans.rows.get(own.planId)?.hiddenFromPerson).toBe(false);
	});

	it('refuses a surprise kept from oneself', async () => {
		expect(
			await refusal(
				addPlan(deps, JULIA, { ...zoo(), contactId: JULIA_SELF, hiddenFromPerson: true })
			)
		).toBe('You cannot keep an idea from yourself — it is with you.');
	});
});

describe('who sees an idea', () => {
	it('a surprise reaches the household, never the member it is with', async () => {
		await addPlan(deps, ANDY, { ...zoo(), contactId: JULIA_SELF, hiddenFromPerson: true });
		const viewer = (actor: typeof ANDY) => ({ id: actor.userId, householdId: actor.householdId });
		expect(await listPlansForContact(deps, viewer(ANDY), JULIA_SELF)).toHaveLength(1);
		expect(await listPlansForContact(deps, viewer(JULIA), JULIA_SELF)).toEqual([]);
	});

	it('a private idea reaches only its author', async () => {
		const { planId } = await addPlan(deps, ANDY, { ...zoo(), visibility: 'private' });
		const ref = { contactId: MIA, planId };
		expect(await refusal(donePlan(deps, JULIA, ref))).toBe('This idea is no longer there.');
		expect(await refusal(removePlan(deps, JULIA, ref))).toBe('This idea is no longer there.');
	});
});

describe('editPlan', () => {
	it('rewrites the line, note, link and when', async () => {
		const { planId } = await addPlan(deps, ANDY, zoo());
		await editPlan(deps, JULIA, {
			...zoo('Zoo with grandma'),
			planId,
			note: 'Sunday',
			url: 'https://zoo.example',
			when: { kind: 'on_date', on: '2026-11-21' }
		});
		expect(plans.rows.get(planId)).toMatchObject({
			title: 'Zoo with grandma',
			note: 'Sunday',
			url: 'https://zoo.example',
			when: { kind: 'on_date', on: '2026-11-21' },
			createdBy: 'andy'
		});
	});

	it('keeps a when gone by that was left as it was', async () => {
		const { planId } = await addPlan(deps, ANDY, {
			...zoo(),
			when: { kind: 'on_date', on: '2026-11-20' }
		});
		now = Date.UTC(2026, 11, 1, 9);
		await editPlan(deps, ANDY, { ...zoo('Zoo!'), planId });
		expect(plans.rows.get(planId)?.when).toEqual({ kind: 'on_date', on: '2026-11-20' });
	});

	it('lets only its author change who sees it', async () => {
		const { planId } = await addPlan(deps, ANDY, zoo());
		await editPlan(deps, JULIA, { ...zoo(), planId, visibility: 'private' });
		expect(plans.rows.get(planId)?.visibility).toBe('shared');
		await editPlan(deps, ANDY, { ...zoo(), planId, visibility: 'private' });
		expect(plans.rows.get(planId)?.visibility).toBe('private');
	});

	it('drops the surprise when the idea turns private', async () => {
		const surprise = { ...zoo(), contactId: JULIA_SELF, hiddenFromPerson: true };
		const { planId } = await addPlan(deps, ANDY, surprise);
		await editPlan(deps, ANDY, { ...surprise, planId, visibility: 'private' });
		expect(plans.rows.get(planId)?.hiddenFromPerson).toBe(false);
	});
});

describe('booking and ticking off', () => {
	it('books once, by whoever did first, and unbooks', async () => {
		const { planId } = await addPlan(deps, ANDY, zoo());
		const ref = { contactId: MIA, planId };
		await bookPlan(deps, JULIA, ref);
		const booked = now;
		now += 1000;
		await bookPlan(deps, ANDY, ref);
		expect(plans.rows.get(planId)).toMatchObject({ bookedAt: booked, bookedBy: 'julia' });
		await unbookPlan(deps, ANDY, ref);
		expect(plans.rows.get(planId)).toMatchObject({ bookedAt: null, bookedBy: null });
	});

	it('ticks off on the household day, once, and reopens with the booking kept', async () => {
		const { planId } = await addPlan(deps, ANDY, zoo());
		const ref = { contactId: MIA, planId };
		await bookPlan(deps, ANDY, ref);
		await donePlan(deps, JULIA, ref);
		const done = now;
		now += 1000;
		await donePlan(deps, ANDY, ref);
		expect(plans.rows.get(planId)).toMatchObject({
			doneAt: done,
			doneOn: '2026-11-17',
			doneBy: 'julia'
		});
		await reopenPlan(deps, ANDY, ref);
		expect(plans.rows.get(planId)).toMatchObject({
			doneAt: null,
			doneOn: null,
			doneBy: null,
			bookedBy: 'andy'
		});
	});

	it('does not book one already done', async () => {
		const { planId } = await addPlan(deps, ANDY, zoo());
		const ref = { contactId: MIA, planId };
		await donePlan(deps, ANDY, ref);
		await bookPlan(deps, ANDY, ref);
		expect(plans.rows.get(planId)?.bookedAt).toBeNull();
	});

	it('removes an idea, done or not', async () => {
		const { planId } = await addPlan(deps, ANDY, zoo());
		await removePlan(deps, JULIA, { contactId: MIA, planId });
		expect(plans.rows.size).toBe(0);
		expect(await refusal(removePlan(deps, JULIA, { contactId: MIA, planId }))).toBe(
			'This idea is no longer there.'
		);
	});
});
