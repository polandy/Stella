import type { GraphDataSource, GraphEdge, GraphNode, Neighborhood } from './types';

/*
 * Test support: an in-memory GraphDataSource over plain node/edge arrays, plus a small
 * family fixture mirroring the explorer mockup. Kept out of *.test.ts so several test files
 * can share it; imported only by tests (never by the app).
 */

/** Build a fake data source whose neighbourhood scan mimics a visibility-scoped adapter. */
export function fakeGraphSource(nodes: GraphNode[], edges: GraphEdge[]): GraphDataSource {
	return {
		async neighborhood(nodeId: string): Promise<Neighborhood | null> {
			const center = nodes.find((n) => n.id === nodeId);
			if (!center) return null;
			const incident = edges.filter((e) => e.source === nodeId || e.target === nodeId);
			const neighborIds = new Set(incident.map((e) => (e.source === nodeId ? e.target : e.source)));
			const neighbors = nodes.filter((n) => neighborIds.has(n.id));
			return { center, nodes: neighbors, edges: incident };
		}
	};
}

const P = (id: string, label: string): GraphNode => ({ id, kind: 'person', label });

export const familyNodes: GraphNode[] = [
	P('mara', 'Mara Keller'),
	P('jonas', 'Jonas Keller'),
	P('lio', 'Lio Keller'),
	P('peter', 'Peter Keller'),
	P('walter', 'Walter Keller'),
	P('simon', 'Simon Keller'),
	P('sarah', 'Sarah Moser'),
	P('tobias', 'Tobias Frei'),
	P('elena', 'Elena Vogt'),
	P('doris', 'Doris Wyss'),
	P('ghost', 'Unconnected Person'),
	{ id: 'kegel', kind: 'circle', label: 'Kegelclub Bühl' }
];

export const familyEdges: GraphEdge[] = [
	{ id: 'r1', source: 'mara', target: 'jonas', kind: 'relationship', category: 'romantic' },
	{ id: 'r2', source: 'mara', target: 'lio', kind: 'relationship', category: 'family' },
	{ id: 'r3', source: 'mara', target: 'peter', kind: 'relationship', category: 'family' },
	{ id: 'r4', source: 'peter', target: 'walter', kind: 'relationship', category: 'family' },
	{ id: 'r5', source: 'mara', target: 'simon', kind: 'relationship', category: 'family' },
	{ id: 'r6', source: 'mara', target: 'sarah', kind: 'relationship', category: 'social' },
	{ id: 'r7', source: 'mara', target: 'tobias', kind: 'relationship', category: 'professional' },
	{ id: 'r8', source: 'tobias', target: 'elena', kind: 'relationship', category: 'professional' },
	{ id: 'k1', source: 'mara', target: 'walter', kind: 'kinship', label: 'Grandfather', derived: true },
	{ id: 'm1', source: 'kegel', target: 'mara', kind: 'membership' },
	{ id: 'm2', source: 'kegel', target: 'sarah', kind: 'membership' },
	{ id: 'm3', source: 'kegel', target: 'jonas', kind: 'membership' },
	{ id: 'm4', source: 'kegel', target: 'doris', kind: 'membership' }
];

/** A ready-made fake source over the family fixture. */
export function familySource(): GraphDataSource {
	return fakeGraphSource(familyNodes, familyEdges);
}
