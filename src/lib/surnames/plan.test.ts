import { describe, expect, it } from 'bun:test';
import { planLastName } from './plan';

/*
 * The confirmation of *Set last name* (docs/concepts/surnames.md §3.2): a bulk action never
 * overwrites silently, and whoever already carries the name is left alone and not counted.
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
});
