import { describe, expect, it } from 'bun:test';
import { inMemoryGraphSource } from './in-memory-source';
import { buildEgoNetwork } from './ego-network';
import { findConnectionPath } from './connection-path';
import { familyEdges, familyNodes } from './fixtures';
import type { GraphModel } from './types';

/*
 * The in-memory GraphDataSource (docs/04 §4.11) — the browser's data source. It must satisfy
 * the same port contract as the Drizzle-fed one, so the pure builders run over it unchanged.
 */

const model: GraphModel = { nodes: familyNodes, edges: familyEdges };

describe('inMemoryGraphSource', () => {
	it('returns a node’s centre, neighbours, and incident edges', async () => {
		const source = inMemoryGraphSource(model);
		const hood = await source.neighborhood('tobias');
		expect(hood?.center.id).toBe('tobias');
		expect(new Set(hood?.nodes.map((n) => n.id))).toEqual(new Set(['mara', 'elena']));
		expect(new Set(hood?.edges.map((e) => e.id))).toEqual(new Set(['r7', 'r8']));
	});

	it('returns null for an unknown node', async () => {
		expect(await inMemoryGraphSource(model).neighborhood('nobody')).toBeNull();
	});

	it('ignores edges that reference a missing node', async () => {
		const source = inMemoryGraphSource({
			nodes: [{ id: 'a', kind: 'person', label: 'A' }],
			edges: [{ id: 'x', source: 'a', target: 'ghost', kind: 'relationship' }]
		});
		const hood = await source.neighborhood('a');
		expect(hood?.nodes).toHaveLength(0);
		expect(hood?.edges).toHaveLength(0);
	});

	it('drives the pure builders exactly like any other source', async () => {
		const source = inMemoryGraphSource(model);
		const ego = await buildEgoNetwork(source, 'mara', 1);
		expect(ego.nodes.some((n) => n.id === 'kegel')).toBe(true);

		const path = await findConnectionPath(source, 'mara', 'doris');
		expect(path?.nodeIds).toEqual(['mara', 'kegel', 'doris']);
	});
});
