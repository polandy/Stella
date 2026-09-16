import { describe, expect, it } from 'bun:test';
import { exclusionFor, MAX_PARENTS, type ExclusionFacts } from './exclusions';

/*
 * Which ties cannot be claimed beside the ties already on record (docs/02 §2.4). The
 * facts are written out per test rather than built by a helper: a rule about what may not
 * be stored is only convincing when the starting point is readable at a glance.
 */

const spouse = { key: 'spouse', category: 'romantic' } as const;
const partner = { key: 'partner', category: 'romantic' } as const;
const parentChild = { key: 'parent_child', category: 'family' } as const;
const sibling = { key: 'sibling', category: 'family' } as const;
const friend = { key: 'friend', category: 'social' } as const;
const colleague = { key: 'colleague', category: 'professional' } as const;

const NOTHING_KNOWN: ExclusionFacts = {
	subjectTies: [],
	romanticPairs: [],
	parentEdges: [],
	derivedSiblingIds: []
};

const facts = (overrides: Partial<ExclusionFacts>): ExclusionFacts => ({
	...NOTHING_KNOWN,
	...overrides
});

const ask = (given: ExclusionFacts, query: Parameters<typeof exclusionFor>[1]) =>
	exclusionFor(given, query);

describe('exclusionFor — nothing on record', () => {
	it('lets any type be claimed between two people who are not linked', () => {
		for (const type of [spouse, partner, parentChild, sibling, friend]) {
			expect(
				ask(NOTHING_KNOWN, { subjectId: 'anna', targetId: 'bert', type, side: 'forward' })
			).toBeNull();
		}
	});
});

describe('exclusionFor — one active romantic tie per person', () => {
	const marriedToCarl = facts({
		subjectTies: [{ relationshipId: 'r1', otherContactId: 'carl', category: 'romantic' }],
		romanticPairs: [{ a: 'anna', b: 'carl' }]
	});

	it('refuses a second spouse while the first marriage still holds', () => {
		expect(
			ask(marriedToCarl, { subjectId: 'anna', targetId: 'bert', type: spouse, side: 'forward' })
		).toEqual({ reason: 'romanticTaken', personId: 'carl' });
	});

	it('refuses a partner too — partner and spouse are the same claim', () => {
		expect(
			ask(marriedToCarl, { subjectId: 'anna', targetId: 'bert', type: partner, side: 'forward' })
		).toEqual({ reason: 'romanticTaken', personId: 'carl' });
	});

	it('refuses it from the other end as well: the target is the one who is taken', () => {
		const bertIsMarried = facts({ romanticPairs: [{ a: 'bert', b: 'carl' }] });
		expect(
			ask(bertIsMarried, { subjectId: 'anna', targetId: 'bert', type: spouse, side: 'forward' })
		).toEqual({ reason: 'romanticTaken', personId: 'carl' });
	});

	it('leaves every other kind of tie alone — a married person still gains friends', () => {
		expect(
			ask(marriedToCarl, { subjectId: 'anna', targetId: 'bert', type: friend, side: 'forward' })
		).toBeNull();
	});

	it('frees the claim once the marriage is over — a former tie is not in the facts', () => {
		const divorced = facts({
			subjectTies: [{ relationshipId: 'r1', otherContactId: 'carl', category: 'romantic' }]
		});
		expect(
			ask(divorced, { subjectId: 'anna', targetId: 'bert', type: spouse, side: 'forward' })
		).toBeNull();
	});
});

describe('exclusionFor — one family or romantic band per pair', () => {
	const annaMothersBert = facts({
		subjectTies: [{ relationshipId: 'r1', otherContactId: 'bert', category: 'family' }]
	});

	it('refuses a second family claim about the same two people', () => {
		expect(
			ask(annaMothersBert, { subjectId: 'anna', targetId: 'bert', type: sibling, side: 'forward' })
		).toEqual({ reason: 'alreadyRelated', personId: 'bert' });
	});

	it('refuses a romantic claim over a family one', () => {
		expect(
			ask(annaMothersBert, { subjectId: 'anna', targetId: 'bert', type: spouse, side: 'forward' })
		).toEqual({ reason: 'alreadyRelated', personId: 'bert' });
	});

	it('refuses a second romantic claim — partner becoming spouse is an edit, not a new row', () => {
		const partnered = facts({
			subjectTies: [{ relationshipId: 'r1', otherContactId: 'bert', category: 'romantic' }],
			romanticPairs: [{ a: 'anna', b: 'bert' }]
		});
		expect(
			ask(partnered, { subjectId: 'anna', targetId: 'bert', type: spouse, side: 'forward' })
		).toEqual({ reason: 'alreadyRelated', personId: 'bert' });
	});

	it('still refuses it once the tie is former — an ex-spouse is no sibling', () => {
		const divorced = facts({
			subjectTies: [{ relationshipId: 'r1', otherContactId: 'bert', category: 'romantic' }]
		});
		expect(
			ask(divorced, { subjectId: 'anna', targetId: 'bert', type: sibling, side: 'forward' })
		).toEqual({ reason: 'alreadyRelated', personId: 'bert' });
	});

	it('leaves the loose categories combinable — a colleague can be a friend', () => {
		const colleagues = facts({
			subjectTies: [{ relationshipId: 'r1', otherContactId: 'bert', category: 'professional' }]
		});
		expect(
			ask(colleagues, { subjectId: 'anna', targetId: 'bert', type: friend, side: 'forward' })
		).toBeNull();
		expect(
			ask(colleagues, { subjectId: 'anna', targetId: 'bert', type: colleague, side: 'forward' })
		).toBeNull();
	});

	it('says nothing about a third person — the band is about this pair', () => {
		expect(
			ask(annaMothersBert, { subjectId: 'anna', targetId: 'dora', type: sibling, side: 'forward' })
		).toBeNull();
	});

	it('does not measure a link being retyped against itself', () => {
		expect(
			ask(annaMothersBert, {
				subjectId: 'anna',
				targetId: 'bert',
				type: sibling,
				side: 'forward',
				exceptId: 'r1'
			})
		).toBeNull();
	});
});

describe('exclusionFor — siblings Stella already works out', () => {
	const sharedParents = facts({ derivedSiblingIds: ['bert'] });

	it('refuses a sibling link that shared parents already say', () => {
		expect(
			ask(sharedParents, { subjectId: 'anna', targetId: 'bert', type: sibling, side: 'forward' })
		).toEqual({ reason: 'siblingDerived', personId: 'bert' });
	});

	it('leaves other types alone between the same two', () => {
		expect(
			ask(sharedParents, { subjectId: 'anna', targetId: 'bert', type: friend, side: 'forward' })
		).toBeNull();
	});

	it('leaves a sibling link to someone else alone', () => {
		expect(
			ask(sharedParents, { subjectId: 'anna', targetId: 'dora', type: sibling, side: 'forward' })
		).toBeNull();
	});
});

describe('exclusionFor — at most two parents', () => {
	const bertHasTwoParents = facts({
		parentEdges: [
			{ parentId: 'carl', childId: 'bert' },
			{ parentId: 'dora', childId: 'bert' }
		]
	});

	it('refuses a third parent for the child named by the forward side', () => {
		expect(
			ask(bertHasTwoParents, {
				subjectId: 'anna',
				targetId: 'bert',
				type: parentChild,
				side: 'forward'
			})
		).toEqual({ reason: 'parentsComplete', personId: 'bert' });
	});

	it('reads the reverse side the other way round — the subject is the child then', () => {
		const annaHasTwoParents = facts({
			parentEdges: [
				{ parentId: 'carl', childId: 'anna' },
				{ parentId: 'dora', childId: 'anna' }
			]
		});
		expect(
			ask(annaHasTwoParents, {
				subjectId: 'anna',
				targetId: 'bert',
				type: parentChild,
				side: 'reverse'
			})
		).toEqual({ reason: 'parentsComplete', personId: 'anna' });
	});

	it('allows the second parent', () => {
		const oneParent = facts({ parentEdges: [{ parentId: 'carl', childId: 'bert' }] });
		expect(
			ask(oneParent, { subjectId: 'anna', targetId: 'bert', type: parentChild, side: 'forward' })
		).toBeNull();
		expect(MAX_PARENTS).toBe(2);
	});

	it('does not count the pair being asked about — flipping a parent link is not a third parent', () => {
		const annaAlreadyParents = facts({
			parentEdges: [
				{ parentId: 'anna', childId: 'bert' },
				{ parentId: 'carl', childId: 'bert' }
			]
		});
		expect(
			ask(annaAlreadyParents, {
				subjectId: 'anna',
				targetId: 'bert',
				type: parentChild,
				side: 'forward'
			})
		).toBeNull();
	});

	it('leaves grandparents uncapped — that cap would be a guess', () => {
		const fourGrandparents = facts({
			subjectTies: [],
			parentEdges: [
				{ parentId: 'carl', childId: 'bert' },
				{ parentId: 'dora', childId: 'bert' }
			]
		});
		expect(
			ask(fourGrandparents, {
				subjectId: 'anna',
				targetId: 'bert',
				type: { key: 'grandparent_grandchild', category: 'family' },
				side: 'forward'
			})
		).toBeNull();
	});
});

describe('exclusionFor — which reason answers first', () => {
	it('names the pair before the person: correcting the existing link is the way out', () => {
		const partnered = facts({
			subjectTies: [{ relationshipId: 'r1', otherContactId: 'bert', category: 'romantic' }],
			romanticPairs: [
				{ a: 'anna', b: 'bert' },
				{ a: 'bert', b: 'anna' }
			]
		});
		expect(
			ask(partnered, { subjectId: 'anna', targetId: 'bert', type: spouse, side: 'forward' })
		).toEqual({ reason: 'alreadyRelated', personId: 'bert' });
	});
});
