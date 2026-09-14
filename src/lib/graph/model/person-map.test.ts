import { describe, expect, test } from 'bun:test';
import { familyEdges, familyNodes } from './fixtures';
import { personMap, PERSON_MAP_RINGS } from './person-map';
import { ringsFrom } from './rings';
import type { GraphModel } from './types';

/*
 * What a person's page is handed (docs/05 §5.5). The point of the slice is what it leaves
 * behind: the whole household travels to the explorer route, never to a profile.
 */

const family: GraphModel = { nodes: familyNodes, edges: familyEdges };

describe('personMap', () => {
	test('carries the person, their people, and their people’s people', async () => {
		const map = await personMap(family, 'mara');
		const ids = map.nodes.map((node) => node.id);

		expect(ids).toContain('mara'); // the centre
		expect(ids).toContain('tobias'); // one hop
		expect(ids).toContain('elena'); // two hops, through Tobias
	});

	test('stops at the ring it promises', async () => {
		const map = await personMap(family, 'mara');
		const rings = ringsFrom(map, 'mara');
		for (const node of map.nodes) {
			expect(rings.get(node.id)).toBeLessThanOrEqual(PERSON_MAP_RINGS);
		}
	});

	test('leaves out somebody the person is not connected to at all', async () => {
		const map = await personMap(family, 'mara');
		expect(map.nodes.map((node) => node.id)).not.toContain('ghost');
	});

	test('is smaller than the snapshot it was cut from', async () => {
		// Walter's own slice reaches Mara's household, but not the circle members hanging off it.
		const map = await personMap(family, 'walter');
		expect(map.nodes.length).toBeLessThan(family.nodes.length);
		expect(map.nodes.map((node) => node.id)).not.toContain('doris');
	});

	test('answers an empty map for somebody the viewer’s snapshot does not hold', async () => {
		// The snapshot is already access-scoped, so an invisible person is simply not in it —
		// and must not come back as a neighbourhood of anybody else's.
		const map = await personMap(family, 'not-visible-to-me');
		expect(map.nodes).toEqual([]);
		expect(map.edges).toEqual([]);
	});
});
