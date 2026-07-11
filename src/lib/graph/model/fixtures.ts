import type { GraphDataSource, GraphEdge, GraphNode } from './types';
import { inMemoryGraphSource } from './in-memory-source';

/*
 * Test support: a family fixture mirroring the explorer mockup, plus a convenience wrapper
 * over the real in-memory source. Kept out of *.test.ts so several test files can share it.
 */

/** A data source over plain node/edge arrays (thin wrapper on the production in-memory source). */
export function fakeGraphSource(nodes: GraphNode[], edges: GraphEdge[]): GraphDataSource {
	return inMemoryGraphSource({ nodes, edges });
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
