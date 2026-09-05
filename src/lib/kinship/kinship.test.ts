import { describe, expect, it } from 'bun:test';
import { deriveKinship, type KinshipGraph } from './kinship';

/*
 * Derived kinship (docs/02 §2.4.1). From the primary links a household actually enters —
 * parent/child, sibling, partner — Stella names the extended relatives *for display only*:
 * nothing here is stored, and a pair that already has a stored link is never re-derived.
 *
 * The family used throughout:
 *
 *   Otto ── Rosa            (partners, Otto male, Rosa female)
 *      └── Bettina ── Kurt  (Bettina their child; Kurt her partner)
 *      │      ├── Hans      (Bettina's children)
 *      │      └── Lisa
 *      └── Peter            (Bettina's brother; Otto+Rosa's child)
 *             └── Nina      (Peter's child ⇒ Hans's cousin)
 */

const p = (id: string, gender?: 'male' | 'female') => ({ id, displayName: id, gender: gender ?? null });

function family(over: Partial<KinshipGraph> = {}): KinshipGraph {
	return {
		people: [
			p('Otto', 'male'),
			p('Rosa', 'female'),
			p('Bettina', 'female'),
			p('Kurt', 'male'),
			p('Peter', 'male'),
			p('Hans', 'male'),
			p('Lisa', 'female'),
			p('Nina', 'female')
		],
		parentEdges: [
			{ parentId: 'Otto', childId: 'Bettina' },
			{ parentId: 'Rosa', childId: 'Bettina' },
			{ parentId: 'Otto', childId: 'Peter' },
			{ parentId: 'Rosa', childId: 'Peter' },
			{ parentId: 'Bettina', childId: 'Hans' },
			{ parentId: 'Bettina', childId: 'Lisa' },
			{ parentId: 'Peter', childId: 'Nina' }
		],
		siblingEdges: [],
		partnerEdges: [
			{ a: 'Otto', b: 'Rosa' },
			{ a: 'Bettina', b: 'Kurt' }
		],
		storedPairs: [],
		...over
	};
}

/** Terms derived for `subject`, as `[person, label]` pairs. */
const kinOf = (subject: string, graph: KinshipGraph = family()) =>
	deriveKinship(graph, subject).map((k) => [k.personId, k.label]);

describe('deriveKinship', () => {
	it('names grandparents by gender and says who they come through', () => {
		const found = deriveKinship(family(), 'Hans');
		expect(found.find((k) => k.personId === 'Otto')).toMatchObject({
			term: 'grandparent',
			label: 'Grandfather',
			via: ['Bettina']
		});
		expect(found.find((k) => k.personId === 'Rosa')).toMatchObject({ label: 'Grandmother' });
	});

	it('names grandchildren from the other end', () => {
		expect(kinOf('Otto')).toContainEqual(['Hans', 'Grandson']);
		expect(kinOf('Otto')).toContainEqual(['Lisa', 'Granddaughter']);
	});

	it('reaches great-grandparents but stops there', () => {
		const graph = family({
			people: [...family().people, p('Ur', 'female')],
			parentEdges: [...family().parentEdges, { parentId: 'Ur', childId: 'Otto' }]
		});
		expect(kinOf('Hans', graph)).toContainEqual(['Ur', 'Great-grandmother']);
		// A fifth generation is past what a label can honestly carry.
		const deeper = family({
			people: [...graph.people, p('Ahn')],
			parentEdges: [...graph.parentEdges, { parentId: 'Ahn', childId: 'Ur' }]
		});
		expect(kinOf('Hans', deeper).map(([id]) => id)).not.toContain('Ahn');
	});

	it('derives siblings from a shared parent, and half-siblings from only one', () => {
		expect(kinOf('Hans')).toContainEqual(['Lisa', 'Sister']);
		const half = family({
			people: [...family().people, p('Tom', 'male')],
			parentEdges: [...family().parentEdges, { parentId: 'Kurt', childId: 'Tom' }]
		});
		// Sharing no parent is not a sibling: Tom arrives through Kurt's partnership instead.
		expect(kinOf('Hans', half)).toContainEqual(['Tom', 'Stepbrother']);
		// Half only when both sides have two known parents and share exactly one: with one
		// parent recorded, "half" would be a claim the data cannot back.
		const halfShared = family({
			people: [...family().people, p('Tom', 'male'), p('Xaver', 'male')],
			parentEdges: [
				...family().parentEdges,
				{ parentId: 'Kurt', childId: 'Hans' },
				{ parentId: 'Bettina', childId: 'Tom' },
				{ parentId: 'Xaver', childId: 'Tom' }
			]
		});
		expect(kinOf('Hans', halfShared)).toContainEqual(['Tom', 'Half-brother']);
		expect(kinOf('Hans', halfShared)).toContainEqual(['Lisa', 'Sister']);
	});

	it('names aunts and uncles, nieces and nephews, and cousins', () => {
		expect(kinOf('Hans')).toContainEqual(['Peter', 'Uncle']);
		expect(kinOf('Peter')).toContainEqual(['Hans', 'Nephew']);
		expect(kinOf('Peter')).toContainEqual(['Lisa', 'Niece']);
		expect(kinOf('Hans')).toContainEqual(['Nina', 'Cousin']);
		expect(kinOf('Nina')).toContainEqual(['Hans', 'Cousin']);
	});

	it('names in-laws through a partner', () => {
		// Kurt is Bettina's partner: her parents are his parents-in-law, her brother his
		// brother-in-law.
		expect(kinOf('Kurt')).toContainEqual(['Otto', 'Father-in-law']);
		expect(kinOf('Kurt')).toContainEqual(['Peter', 'Brother-in-law']);
		expect(kinOf('Peter')).toContainEqual(['Kurt', 'Brother-in-law']);
	});

	it('names a step-parent and step-siblings, never the biological parent again', () => {
		// Kurt partners Bettina but is not Hans's parent ⇒ stepfather.
		expect(kinOf('Hans')).toContainEqual(['Kurt', 'Stepfather']);
		expect(kinOf('Hans').map(([id]) => id)).not.toContain('Bettina');
		const step = family({
			people: [...family().people, p('Timo', 'male')],
			parentEdges: [...family().parentEdges, { parentId: 'Kurt', childId: 'Timo' }]
		});
		expect(kinOf('Hans', step)).toContainEqual(['Timo', 'Stepbrother']);
	});

	it('falls back to a neutral term when the gender is not recorded', () => {
		const neutral = family({ people: family().people.map((x) => ({ ...x, gender: null })) });
		expect(kinOf('Hans', neutral)).toContainEqual(['Otto', 'Grandparent']);
		expect(kinOf('Hans', neutral)).toContainEqual(['Peter', 'Aunt or uncle']);
		expect(kinOf('Hans', neutral)).toContainEqual(['Lisa', 'Sibling']);
		expect(kinOf('Kurt', neutral)).toContainEqual(['Otto', 'Parent-in-law']);
	});

	it('never re-derives a pair that already has a stored relationship', () => {
		const stored = family({ storedPairs: [{ a: 'Hans', b: 'Otto' }] });
		expect(kinOf('Hans', stored).map(([id]) => id)).not.toContain('Otto');
		// Everyone else is still derived: the exclusion is per pair, not global.
		expect(kinOf('Hans', stored)).toContainEqual(['Rosa', 'Grandmother']);
	});

	it('never derives the subject as their own relative, and reports each person once', () => {
		for (const subject of ['Hans', 'Otto', 'Kurt', 'Nina']) {
			const ids = deriveKinship(family(), subject).map((k) => k.personId);
			expect(ids).not.toContain(subject);
			expect(new Set(ids).size).toBe(ids.length);
		}
	});

	it('orders closer relatives before distant ones, then by name', () => {
		const order = deriveKinship(family(), 'Hans').map((k) => k.term);
		expect(order.indexOf('sibling')).toBeLessThan(order.indexOf('grandparent'));
		expect(order.indexOf('grandparent')).toBeLessThan(order.indexOf('cousin'));
	});

	it('has nothing to say about someone with no primary links', () => {
		const lonely = family({ people: [...family().people, p('Solo')] });
		expect(deriveKinship(lonely, 'Solo')).toEqual([]);
	});
});
