import { describe, expect, it } from 'bun:test';
import { welcomeSteps, type HouseholdSoFar } from './welcome';

/*
 * The first-run card on Home (docs/02 §2.22.3): when it shows, which steps it offers, and which
 * of them are already done.
 */

const newHousehold: HouseholdSoFar = { peopleIds: [], selfContactId: null, isAdmin: true };

describe('welcomeSteps', () => {
	it('greets a household nobody has been added to yet, with all three steps open', () => {
		expect(welcomeSteps(newHousehold)).toEqual([
			{ id: 'self', href: '/contacts/new?self=1', done: false },
			{ id: 'import', href: '/settings/import', done: false },
			{ id: 'add', href: '/contacts/new', done: false }
		]);
	});

	it('stays once the member has added themselves, with that step ticked off', () => {
		const steps = welcomeSteps({ ...newHousehold, peopleIds: ['me'], selfContactId: 'me' });

		expect(steps?.map((step) => [step.id, step.done])).toEqual([
			['self', true],
			['import', false],
			['add', false]
		]);
	});

	it('goes away as soon as there is somebody besides the member', () => {
		expect(
			welcomeSteps({ ...newHousehold, peopleIds: ['me', 'anna'], selfContactId: 'me' })
		).toBeNull();
	});

	it('goes away when the one person there is somebody else', () => {
		// positive control: the same household with that person being the member still greets
		expect(
			welcomeSteps({ ...newHousehold, peopleIds: ['anna'], selfContactId: 'anna' })
		).not.toBeNull();

		expect(welcomeSteps({ ...newHousehold, peopleIds: ['anna'], selfContactId: null })).toBeNull();
	});

	it('offers the Monica import only to an admin, who is the only one who may run it', () => {
		const ids = (household: HouseholdSoFar) => welcomeSteps(household)?.map((step) => step.id);

		expect(ids(newHousehold)).toContain('import');
		expect(ids({ ...newHousehold, isAdmin: false })).toEqual(['self', 'add']);
	});

	it('does not count a self link to somebody the member can no longer see as done', () => {
		// The link outlives an archived or deleted record; the step is only done while it holds.
		const steps = welcomeSteps({ ...newHousehold, peopleIds: [], selfContactId: 'gone' });

		expect(steps?.find((step) => step.id === 'self')?.done).toBe(false);
	});
});
