import { beforeEach, describe, expect, it } from 'bun:test';
import { fakeOwnPeople } from '../shared/idea-on-person.fixture';
import { fakePlans } from './plans.fixture';
import { addPlan, PlanGoneError, type PlanDeps } from './plans';
import { donePlan } from './progress';
import { againPlan, linkPlanMoment } from './afterwards';

/*
 * What follows a done outing idea (docs/dev/02 §2.27.8): the moment written about it, and the
 * idea noted again for some time. Each reaches only whoever may see the idea.
 */

const ANDY = { userId: 'andy', householdId: 'h1' };
const JULIA = { userId: 'julia', householdId: 'h1' };
const MIA = 'mia';
const JULIA_SELF = 'julia-self';

let plans: ReturnType<typeof fakePlans>;
let deps: PlanDeps;
let counter: number;

beforeEach(() => {
	plans = fakePlans(new Map([[JULIA_SELF, 'julia']]));
	counter = 0;
	deps = {
		plans,
		ownPeople: fakeOwnPeople(new Map([[JULIA_SELF, 'julia']])),
		contacts: {
			async findByIdVisibleTo(_viewer, id) {
				return id === MIA || id === JULIA_SELF
					? ({ id, birthDate: null, birthDatePrecision: 'full' } as never)
					: null;
			}
		},
		ids: { next: () => `plan-${++counter}` },
		clock: { now: () => Date.UTC(2026, 10, 17, 9) }
	};
});

const climbing = {
	contactId: MIA,
	title: 'Climbing hall',
	note: 'Bring socks',
	url: 'https://example.org/climb',
	visibility: 'shared' as const,
	when: { kind: 'on_date' as const, on: '2026-12-05' }
};

async function doneIdea(input: Parameters<typeof addPlan>[2] = climbing, by = ANDY) {
	const { planId } = await addPlan(deps, by, input);
	const ref = { contactId: input.contactId, planId };
	await donePlan(deps, by, ref);
	return ref;
}

describe('linkPlanMoment', () => {
	it('links the moment written about a done idea', async () => {
		const ref = await doneIdea();
		await linkPlanMoment(deps, JULIA, { ...ref, momentId: 'entry-1' });
		expect(plans.rows.get(ref.planId)?.momentId).toBe('entry-1');
	});

	it('leaves an idea opened again unlinked', async () => {
		const { planId } = await addPlan(deps, ANDY, climbing);
		await linkPlanMoment(deps, ANDY, { contactId: MIA, planId, momentId: 'entry-1' });
		expect(plans.rows.get(planId)?.momentId).toBeNull();
	});

	it('never links a private idea for anybody but its author', async () => {
		const ref = await doneIdea({ ...climbing, visibility: 'private' });
		await linkPlanMoment(deps, JULIA, { ...ref, momentId: 'entry-1' });
		expect(plans.rows.get(ref.planId)?.momentId).toBeNull();
	});

	it('never links a surprise for the person it is kept from', async () => {
		const ref = await doneIdea({ ...climbing, contactId: JULIA_SELF, hiddenFromPerson: true });
		await linkPlanMoment(deps, JULIA, { ...ref, momentId: 'entry-1' });
		expect(plans.rows.get(ref.planId)?.momentId).toBeNull();
	});

	it('leaves the moment saved when the idea is gone, or is on somebody else', async () => {
		const ref = await doneIdea();
		await linkPlanMoment(deps, ANDY, { ...ref, planId: 'gone', momentId: 'entry-1' });
		await linkPlanMoment(deps, ANDY, { ...ref, contactId: JULIA_SELF, momentId: 'entry-1' });
		expect(plans.rows.get(ref.planId)?.momentId).toBeNull();
	});
});

describe('againPlan', () => {
	it('notes a done idea again for some time, by whoever asked', async () => {
		const ref = await doneIdea();
		const { planId } = await againPlan(deps, JULIA, ref);
		expect(planId).not.toBe(ref.planId);
		expect(plans.rows.get(planId)).toMatchObject({
			contactId: MIA,
			createdBy: 'julia',
			title: 'Climbing hall',
			note: 'Bring socks',
			url: 'https://example.org/climb',
			visibility: 'shared',
			hiddenFromPerson: false,
			when: null,
			bookedAt: null,
			doneAt: null,
			momentId: null
		});
		// The done one stays in the person's story.
		expect(plans.rows.get(ref.planId)?.doneOn).toBe('2026-11-17');
	});

	it('keeps a private idea private and a surprise a surprise', async () => {
		const secret = await doneIdea({ ...climbing, visibility: 'private' });
		const copy = await againPlan(deps, ANDY, secret);
		expect(plans.rows.get(copy.planId)?.visibility).toBe('private');
		const surprise = await doneIdea({ ...climbing, contactId: JULIA_SELF, hiddenFromPerson: true });
		const again = await againPlan(deps, ANDY, surprise);
		expect(plans.rows.get(again.planId)?.hiddenFromPerson).toBe(true);
	});

	it('refuses an idea the asker may not see', async () => {
		const secret = await doneIdea({ ...climbing, visibility: 'private' });
		await expect(againPlan(deps, JULIA, secret)).rejects.toBeInstanceOf(PlanGoneError);
		const surprise = await doneIdea({ ...climbing, contactId: JULIA_SELF, hiddenFromPerson: true });
		await expect(againPlan(deps, JULIA, surprise)).rejects.toBeInstanceOf(PlanGoneError);
		expect(plans.rows.size).toBe(2);
	});
});
