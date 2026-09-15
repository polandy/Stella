import { describe, expect, it } from 'bun:test';
import { PARENT_CHILD_TYPE_KEY, SIBLING_TYPE_KEY } from '$lib/relationships/type-keys';
import { directClaimFor } from './claims';
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
