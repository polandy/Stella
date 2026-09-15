import { describe, expect, it } from 'bun:test';
import { PARENT_CHILD_TYPE_KEY, SIBLING_TYPE_KEY } from '$lib/relationships/type-keys';
import { claimEndpoints, directClaimFor } from './claims';
import type { KinTerm } from './kinship';

/*
 * Every term the engine can produce, so a term added later has to be classified here
 * on purpose rather than silently defaulting to "no correction offered".
 */
const ALL_TERMS: readonly KinTerm[] = [
	'sibling',
	'half-sibling',
	'grandparent',
	'grandchild',
	'aunt-uncle',
	'niece-nephew',
	'great-grandparent',
	'great-grandchild',
	'cousin',
	'step-parent',
	'step-child',
	'step-sibling',
	'parent-in-law',
	'child-in-law',
	'sibling-in-law'
];

describe('directClaimFor', () => {
	it('reads a step-child as the subject being the parent', () => {
		expect(directClaimFor('step-child')).toEqual({
			typeKey: PARENT_CHILD_TYPE_KEY,
			parent: 'subject'
		});
	});

	it('reads a step-parent as the relative being the parent', () => {
		expect(directClaimFor('step-parent')).toEqual({
			typeKey: PARENT_CHILD_TYPE_KEY,
			parent: 'relative'
		});
	});

	it('reads a step-sibling as a plain sibling, which has no direction', () => {
		expect(directClaimFor('step-sibling')).toEqual({
			typeKey: SIBLING_TYPE_KEY,
			parent: null
		});
	});

	it('offers a correction for the step terms and nothing else', () => {
		const offered = ALL_TERMS.filter((term) => directClaimFor(term) !== null);
		expect(offered).toEqual(['step-parent', 'step-child', 'step-sibling']);
	});
});

describe('claimEndpoints', () => {
	const ends = (term: KinTerm) => claimEndpoints(directClaimFor(term)!, 'subject-id', 'relative-id');

	it('writes the subject as the parent when their step-child is really their own', () => {
		expect(ends('step-child')).toEqual({ fromId: 'subject-id', toId: 'relative-id' });
	});

	it('writes the relative as the parent when a step-parent is really a parent', () => {
		expect(ends('step-parent')).toEqual({ fromId: 'relative-id', toId: 'subject-id' });
	});

	it('stores a sibling subject-first, since neither end is the parent', () => {
		expect(ends('step-sibling')).toEqual({ fromId: 'subject-id', toId: 'relative-id' });
	});
});
