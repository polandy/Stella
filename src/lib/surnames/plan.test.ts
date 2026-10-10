import { describe, expect, it } from 'bun:test';
import { planLastName, replaceAll } from './plan';

/*
 * The confirmation of *Set last name* (docs/02 §2.2.4.3): a bulk action never
 * overwrites silently, and whoever already carries the name is left alone and not counted.
 * The confirmation is asked only when someone would lose a last name.
 */

const anna = { id: 'anna', displayName: 'Anna Meier', lastName: 'Meier' };
const lea = { id: 'lea', displayName: 'Lea', lastName: null };
const sophie = { id: 'sophie', displayName: 'Sophie Brünner', lastName: 'Brünner' };

describe('planLastName', () => {
	it('names the blanks, asks about a different name, and leaves the same name alone', () => {
		const plan = planLastName([anna, lea, sophie], 'Brunner', {});
		expect(plan.written.map((p) => p.id)).toEqual(['lea']);
		expect(plan.different.map((p) => p.id)).toEqual(['anna']);
		expect(plan.replaceIds).toEqual([]);
	});

	it('replaces a different name only when ticked by hand', () => {
		const plan = planLastName([anna, lea], 'Brunner', { anna: true });
		expect(plan.written.map((p) => p.id)).toEqual(['lea', 'anna']);
		expect(plan.replaceIds).toEqual(['anna']);
	});

	it('asks only when someone already has a different last name', () => {
		expect(planLastName([lea, sophie], 'Brunner', {}).asks).toBe(false);
		expect(planLastName([anna, lea], 'Brunner', {}).asks).toBe(true);
	});

	it('knows whether every different name is ticked, for the replace-all tick', () => {
		const ben = { id: 'ben', displayName: 'Ben Roth', lastName: 'Roth' };
		expect(planLastName([anna, ben], 'Brunner', { anna: true }).replacesAll).toBe(false);
		expect(planLastName([anna, ben], 'Brunner', { anna: true, ben: true }).replacesAll).toBe(true);
		expect(planLastName([lea], 'Brunner', {}).replacesAll).toBe(false);
	});
});

describe('replaceAll', () => {
	it('ticks or unticks everyone with a different last name at once', () => {
		const plan = planLastName([anna, lea, sophie], 'Brunner', {});
		expect(replaceAll(plan, true)).toEqual({ anna: true });
		expect(replaceAll(plan, false)).toEqual({ anna: false });
	});
});
