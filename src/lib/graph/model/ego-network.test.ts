import { describe, expect, it } from 'bun:test';
import { buildEgoNetwork, expandNode } from './ego-network';
import { emptyModel } from './graph-model';
import { familySource } from './fixtures';
import type { GraphModel } from './types';

/*
 * buildEgoNetwork / expandNode (docs/04 §4.11). Lazy, hop-by-hop growth over the
 * GraphDataSource port, tested against an in-memory fake — no DB, fully deterministic.
 */

const ids = (m: GraphModel) => new Set(m.nodes.map((n) => n.id));
const edgeIds = (m: GraphModel) => new Set(m.edges.map((e) => e.id));

describe('buildEgoNetwork', () => {
	it('at depth 1 returns the centre, its direct neighbours, and the incident edges only', async () => {
		const model = await buildEgoNetwork(familySource(), 'mara', 1);

		// direct neighbours of Mara: partner, child, father, brother, friend, colleague,
		// the circle (membership), and grandfather (via the derived kinship edge).
		expect(ids(model)).toEqual(
			new Set(['mara', 'jonas', 'lio', 'peter', 'simon', 'sarah', 'tobias', 'kegel', 'walter'])
		);
		// second-hop-only nodes are absent
		expect(ids(model).has('doris')).toBe(false); // only reachable via the circle
		expect(ids(model).has('elena')).toBe(false); // only reachable via Tobias

		// only edges incident to Mara — Peter↔Walter (r4) is one hop further out
		expect(edgeIds(model)).toEqual(new Set(['r1', 'r2', 'r3', 'r5', 'r6', 'r7', 'k1', 'm1']));
		expect(edgeIds(model).has('r4')).toBe(false);
	});

	it('at depth 2 pulls in second-hop nodes and their connecting edges', async () => {
		const model = await buildEgoNetwork(familySource(), 'mara', 2);

		expect(ids(model).has('doris')).toBe(true);
		expect(ids(model).has('elena')).toBe(true);
		expect(edgeIds(model).has('r4')).toBe(true); // Peter → Walter
		expect(edgeIds(model).has('r8')).toBe(true); // Tobias → Elena
		expect(edgeIds(model).has('m4')).toBe(true); // Kegelclub → Doris
	});

	it('deduplicates nodes and edges reached through several paths', async () => {
		const model = await buildEgoNetwork(familySource(), 'mara', 2);
		expect(model.nodes.filter((n) => n.id === 'walter')).toHaveLength(1);
		expect(model.edges.filter((e) => e.id === 'k1')).toHaveLength(1);
	});

	it('returns an empty model for an unknown centre', async () => {
		const model = await buildEgoNetwork(familySource(), 'nobody', 2);
		expect(model.nodes).toHaveLength(0);
		expect(model.edges).toHaveLength(0);
	});

	it('at depth 0 returns just the centre node', async () => {
		const model = await buildEgoNetwork(familySource(), 'mara', 0);
		expect(ids(model)).toEqual(new Set(['mara']));
		expect(model.edges).toHaveLength(0);
	});
});

describe('expandNode', () => {
	it('merges a node’s neighbourhood into the existing model', async () => {
		const source = familySource();
		const ego = await buildEgoNetwork(source, 'mara', 1);
		expect(ids(ego).has('elena')).toBe(false);

		const expanded = await expandNode(source, ego, 'tobias');
		expect(ids(expanded).has('elena')).toBe(true);
		expect(edgeIds(expanded).has('r8')).toBe(true);
	});

	it('leaves the model unchanged for an unknown node', async () => {
		const source = familySource();
		const ego = await buildEgoNetwork(source, 'mara', 1);
		const after = await expandNode(source, ego, 'nobody');
		expect(ids(after)).toEqual(ids(ego));
		expect(edgeIds(after)).toEqual(edgeIds(ego));
	});

	it('does not mutate the input model', async () => {
		const source = familySource();
		const ego = await buildEgoNetwork(source, 'mara', 1);
		const before = ego.nodes.length;
		await expandNode(source, ego, 'tobias');
		expect(ego.nodes).toHaveLength(before);
	});

	it('can grow from an empty model', async () => {
		const expanded = await expandNode(familySource(), emptyModel(), 'mara');
		expect(ids(expanded).has('mara')).toBe(true);
		expect(ids(expanded).has('jonas')).toBe(true);
	});
});
