import { describe, expect, it } from 'bun:test';
import {
	AUNT_UNCLE_TYPE_KEY,
	COUSIN_TYPE_KEY,
	GRANDPARENT_GRANDCHILD_TYPE_KEY,
	GREAT_GRANDPARENT_TYPE_KEY,
	HALF_SIBLING_TYPE_KEY,
	PARENT_CHILD_TYPE_KEY,
	PARENT_IN_LAW_TYPE_KEY,
	SIBLING_IN_LAW_TYPE_KEY,
	SIBLING_TYPE_KEY
} from '$lib/relationships/type-keys';
import { claimEndpoints, confirmedClaimFor, directClaimFor } from './claims';
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
			elder: 'subject'
		});
	});

	it('reads a step-parent as the relative being the parent', () => {
		expect(directClaimFor('step-parent')).toEqual({
			typeKey: PARENT_CHILD_TYPE_KEY,
			elder: 'relative'
		});
	});

	it('reads a step-sibling as a plain sibling, which has no direction', () => {
		expect(directClaimFor('step-sibling')).toEqual({
			typeKey: SIBLING_TYPE_KEY,
			elder: null
		});
	});

	it('offers a correction for the step terms and nothing else', () => {
		const offered = ALL_TERMS.filter((term) => directClaimFor(term) !== null);
		expect(offered).toEqual(['step-parent', 'step-child', 'step-sibling']);
	});
});

describe('confirmedClaimFor', () => {
	it('stores every term that is not a step term as the relationship it names', () => {
		expect(Object.fromEntries(ALL_TERMS.map((term) => [term, confirmedClaimFor(term)]))).toEqual({
			sibling: { typeKey: SIBLING_TYPE_KEY, elder: null },
			'half-sibling': { typeKey: HALF_SIBLING_TYPE_KEY, elder: null },
			grandparent: { typeKey: GRANDPARENT_GRANDCHILD_TYPE_KEY, elder: 'relative' },
			grandchild: { typeKey: GRANDPARENT_GRANDCHILD_TYPE_KEY, elder: 'subject' },
			'aunt-uncle': { typeKey: AUNT_UNCLE_TYPE_KEY, elder: 'relative' },
			'niece-nephew': { typeKey: AUNT_UNCLE_TYPE_KEY, elder: 'subject' },
			'great-grandparent': { typeKey: GREAT_GRANDPARENT_TYPE_KEY, elder: 'relative' },
			'great-grandchild': { typeKey: GREAT_GRANDPARENT_TYPE_KEY, elder: 'subject' },
			cousin: { typeKey: COUSIN_TYPE_KEY, elder: null },
			'step-parent': null,
			'step-child': null,
			'step-sibling': null,
			'parent-in-law': { typeKey: PARENT_IN_LAW_TYPE_KEY, elder: 'relative' },
			'child-in-law': { typeKey: PARENT_IN_LAW_TYPE_KEY, elder: 'subject' },
			'sibling-in-law': { typeKey: SIBLING_IN_LAW_TYPE_KEY, elder: null }
		});
	});

	it('gives every term exactly one way to be stored — a correction or a confirmation', () => {
		const both = ALL_TERMS.filter(
			(term) => (directClaimFor(term) === null) === (confirmedClaimFor(term) === null)
		);
		expect(both).toEqual([]);
	});
});

describe('claimEndpoints', () => {
	const ends = (term: KinTerm) =>
		claimEndpoints(directClaimFor(term)!, 'subject-id', 'relative-id');

	it('writes the subject as the parent when their step-child is really their own', () => {
		expect(ends('step-child')).toEqual({ fromId: 'subject-id', toId: 'relative-id' });
	});

	it('writes the relative as the parent when a step-parent is really a parent', () => {
		expect(ends('step-parent')).toEqual({ fromId: 'relative-id', toId: 'subject-id' });
	});

	it('stores a sibling subject-first, since neither end is the parent', () => {
		expect(ends('step-sibling')).toEqual({ fromId: 'subject-id', toId: 'relative-id' });
	});

	it('writes the elder generation first for a confirmed term', () => {
		const confirmed = (term: KinTerm) =>
			claimEndpoints(confirmedClaimFor(term)!, 'subject-id', 'relative-id');
		expect(confirmed('grandparent')).toEqual({ fromId: 'relative-id', toId: 'subject-id' });
		expect(confirmed('niece-nephew')).toEqual({ fromId: 'subject-id', toId: 'relative-id' });
	});
});
