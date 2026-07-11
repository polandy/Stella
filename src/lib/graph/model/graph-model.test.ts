import { describe, expect, it } from 'bun:test';
import { applyFilters, emptyModel, mergeModels, neighborsOf, reachableFrom } from './graph-model';
import { buildEgoNetwork } from './ego-network';
import { familySource } from './fixtures';
import type { GraphModel } from './types';

/*
 * Pure value operations over GraphModel (docs/04 §4.11) — merging, adjacency, reachability
 * and applyFilters. No I/O; every function returns a fresh model and never mutates its input.
 */

const nodeIds = (m: GraphModel) => new Set(m.nodes.map((n) => n.id));
const edgeIds = (m: GraphModel) => new Set(m.edges.map((e) => e.id));

describe('mergeModels', () => {
	it('deduplicates nodes and edges by id, keeping the first occurrence', () => {
		const a: GraphModel = {
			nodes: [{ id: 'x', kind: 'person', label: 'X' }],
			edges: [{ id: 'e', source: 'x', target: 'y', kind: 'relationship' }]
		};
		const b: GraphModel = {
			nodes: [
				{ id: 'x', kind: 'person', label: 'DUPLICATE' },
				{ id: 'y', kind: 'person', label: 'Y' }
			],
			edges: [{ id: 'e', source: 'x', target: 'y', kind: 'relationship' }]
		};
		const merged = mergeModels(a, b);
		expect(nodeIds(merged)).toEqual(new Set(['x', 'y']));
		expect(merged.edges).toHaveLength(1);
		expect(merged.nodes.find((n) => n.id === 'x')?.label).toBe('X');
	});

	it('does not mutate its inputs', () => {
		const a = emptyModel();
		const b: GraphModel = { nodes: [{ id: 'x', kind: 'person', label: 'X' }], edges: [] };
		mergeModels(a, b);
		expect(a.nodes).toHaveLength(0);
	});
});

describe('neighborsOf', () => {
	it('lists the distinct adjacent node ids', async () => {
		const model = await buildEgoNetwork(familySource(), 'mara', 1);
		expect(neighborsOf(model, 'mara')).toEqual(
			new Set(['jonas', 'lio', 'peter', 'simon', 'sarah', 'tobias', 'kegel', 'walter'])
		);
	});
});

describe('reachableFrom', () => {
	it('collects every node connected to the start', async () => {
		const model = await buildEgoNetwork(familySource(), 'mara', 2);
		const reached = reachableFrom(model, 'mara');
		expect(reached.has('doris')).toBe(true);
		expect(reached.has('elena')).toBe(true);
	});
});

describe('applyFilters', () => {
	it('keeps only the requested edge kinds and drops nodes that become unreachable', async () => {
		const model = await buildEgoNetwork(familySource(), 'mara', 2);
		const filtered = applyFilters(model, {
			edgeKinds: ['relationship', 'kinship'],
			keepNodeId: 'mara'
		});
		// membership gone → the circle and doris (only reachable via it) disappear
		expect(nodeIds(filtered).has('kegel')).toBe(false);
		expect(nodeIds(filtered).has('doris')).toBe(false);
		// relationship and kinship survive
		expect(nodeIds(filtered).has('walter')).toBe(true);
		expect(edgeIds(filtered).has('k1')).toBe(true);
		expect([...edgeIds(filtered)].every((id) => !id.startsWith('m'))).toBe(true);
	});

	it('filters relationship edges by category without touching other kinds', async () => {
		// depth 1: each neighbour hangs off a single edge, so a category filter cleanly reveals
		// which nodes survive (at depth 2 Jonas would still be reachable via the circle).
		const model = await buildEgoNetwork(familySource(), 'mara', 1);
		const familyOnly = applyFilters(model, { categories: ['family'], keepNodeId: 'mara' });

		// non-family relationships and their exclusive nodes are gone
		expect(nodeIds(familyOnly).has('jonas')).toBe(false); // romantic
		expect(nodeIds(familyOnly).has('sarah')).toBe(false); // social
		expect(nodeIds(familyOnly).has('tobias')).toBe(false); // professional
		expect(edgeIds(familyOnly).has('r7')).toBe(false);
		// family relationships remain
		expect(nodeIds(familyOnly).has('peter')).toBe(true);
		expect(nodeIds(familyOnly).has('lio')).toBe(true);
		// kinship and membership are unaffected by a category filter
		expect(edgeIds(familyOnly).has('k1')).toBe(true);
		expect(nodeIds(familyOnly).has('walter')).toBe(true);
		expect(nodeIds(familyOnly).has('kegel')).toBe(true);
	});

	it('never drops the kept centre even if it ends up isolated', () => {
		const model: GraphModel = {
			nodes: [
				{ id: 'mara', kind: 'person', label: 'Mara' },
				{ id: 'jonas', kind: 'person', label: 'Jonas' }
			],
			edges: [{ id: 'r1', source: 'mara', target: 'jonas', kind: 'relationship', category: 'romantic' }]
		};
		const filtered = applyFilters(model, { categories: ['family'], keepNodeId: 'mara' });
		expect(nodeIds(filtered)).toEqual(new Set(['mara']));
		expect(filtered.edges).toHaveLength(0);
	});

	it('drops edgeless orphans when no centre is given', () => {
		const model: GraphModel = {
			nodes: [
				{ id: 'a', kind: 'person', label: 'A' },
				{ id: 'b', kind: 'person', label: 'B' },
				{ id: 'lonely', kind: 'person', label: 'Lonely' }
			],
			edges: [{ id: 'e', source: 'a', target: 'b', kind: 'relationship', category: 'social' }]
		};
		expect(nodeIds(applyFilters(model, {}))).toEqual(new Set(['a', 'b']));
	});

	it('does not mutate its input', async () => {
		const model = await buildEgoNetwork(familySource(), 'mara', 2);
		const before = model.nodes.length;
		applyFilters(model, { edgeKinds: ['relationship'], keepNodeId: 'mara' });
		expect(model.nodes).toHaveLength(before);
	});
});
