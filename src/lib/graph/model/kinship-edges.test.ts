import { describe, expect, it } from 'bun:test';
import type { KinshipGraph } from '../../kinship/kinship';
import { deriveKinshipEdges } from './kinship-edges';

/*
 * Derived-kinship edges for the explorer (docs/02 §2.7, §2.4.1). Pure: the caller hands in the
 * people and links the viewer may see, so these tests need no database.
 */

const person = (id: string, displayName: string, gender?: string) => ({ id, displayName, gender });

/** The example from docs/02 §2.4.1: Bettina parents Hans, Otto parents Bettina. */
function threeGenerations(): KinshipGraph {
	return {
		people: [person('hans', 'Hans'), person('bettina', 'Bettina', 'female'), person('otto', 'Otto', 'male')],
		parentEdges: [
			{ parentId: 'bettina', childId: 'hans' },
			{ parentId: 'otto', childId: 'bettina' }
		],
		siblingEdges: [],
		partnerEdges: [],
		storedPairs: [
			{ a: 'bettina', b: 'hans' },
			{ a: 'otto', b: 'bettina' }
		]
	};
}

describe('deriveKinshipEdges', () => {
	it('names the grandfather two generations up, pointing from the relative to the subject', () => {
		const edges = deriveKinshipEdges(threeGenerations());

		expect(edges).toHaveLength(1);
		expect(edges[0]).toMatchObject({
			source: 'otto',
			target: 'hans',
			kind: 'kinship',
			label: 'Grandfather',
			derived: true,
			directed: true
		});
	});

	it('emits one edge per pair rather than one per perspective', () => {
		const edges = deriveKinshipEdges(threeGenerations());

		// Otto sees a grandchild where Hans sees a grandfather — the same line, drawn once.
		expect(edges.map((e) => e.id)).toEqual(['kin:hans:otto']);
	});

	it('leaves a symmetric term undirected', () => {
		const siblings: KinshipGraph = {
			people: [person('mother', 'Mother'), person('lisa', 'Lisa', 'female'), person('hans', 'Hans', 'male')],
			parentEdges: [
				{ parentId: 'mother', childId: 'lisa' },
				{ parentId: 'mother', childId: 'hans' }
			],
			siblingEdges: [],
			partnerEdges: [],
			storedPairs: [
				{ a: 'mother', b: 'lisa' },
				{ a: 'mother', b: 'hans' }
			]
		};

		const edges = deriveKinshipEdges(siblings);

		expect(edges).toHaveLength(1);
		expect(edges[0]).toMatchObject({ id: 'kin:hans:lisa', directed: false });
		expect(edges[0].label).toBe('Brother'); // source Hans, in his role towards Lisa
	});

	it('never re-derives a pair the household has already linked itself', () => {
		const graph = threeGenerations();
		// The household entered "Otto grandparent of Hans" by hand; the derived line must go.
		const withStoredLink: KinshipGraph = {
			...graph,
			storedPairs: [...graph.storedPairs, { a: 'otto', b: 'hans' }]
		};

		expect(deriveKinshipEdges(withStoredLink)).toEqual([]);
		// …while the same graph without that entry does produce it (proves the case can fail).
		expect(deriveKinshipEdges(graph)).toHaveLength(1);
	});

	it('returns nothing for a graph with no primary links to reason from', () => {
		expect(
			deriveKinshipEdges({
				people: [person('a', 'A'), person('b', 'B')],
				parentEdges: [],
				siblingEdges: [],
				partnerEdges: [],
				storedPairs: []
			})
		).toEqual([]);
	});
});
