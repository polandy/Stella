import { describe, expect, it } from 'bun:test';
import { expandWouldAdd } from './expand-offer';
import { familyEdges, familyNodes } from './fixtures';
import type { GraphModel } from './types';

/*
 * Whether the peek panel offers *Expand* (docs/02 §2.7): exactly when expanding the node under
 * the current filters would put something new on the map — a person or circle, or a line
 * between people already shown.
 */

const graph: GraphModel = { nodes: familyNodes, edges: familyEdges };
const shown = (ids: string[], edgeIds: string[]): GraphModel => ({
	nodes: familyNodes.filter((n) => ids.includes(n.id)),
	edges: familyEdges.filter((e) => edgeIds.includes(e.id))
});

describe('expandWouldAdd', () => {
	it('offers it when only people are missing', () => {
		// Peter and his link to Mara are drawn; his father Walter is not on the map.
		expect(expandWouldAdd(graph, shown(['mara', 'peter'], ['r3']), 'peter')).toBe(true);
	});

	it('offers it when only a line among people already shown is missing', () => {
		// Everyone in the Kegelclub is on the map, but only Mara's membership is drawn.
		const map = shown(['kegel', 'mara', 'sarah', 'jonas', 'doris'], ['m1']);
		expect(expandWouldAdd(graph, map, 'kegel')).toBe(true);
	});

	it('does not offer it when the filters hide everything still missing', () => {
		// Walter is reached by a family link; with only social links let through, nothing comes.
		const map = shown(['mara', 'peter'], ['r3']);
		expect(
			expandWouldAdd(graph, map, 'peter', { edgeKinds: ['relationship'], categories: ['social'] })
		).toBe(false);
	});

	it('does not offer it when everything around the node is drawn already', () => {
		const map = shown(['kegel', 'mara', 'sarah', 'jonas', 'doris'], ['m1', 'm2', 'm3', 'm4']);
		expect(expandWouldAdd(graph, map, 'kegel')).toBe(false);
	});

	it('does not offer it on somebody with no links at all', () => {
		const lonely: GraphModel = {
			nodes: [...familyNodes, { id: 'zoe', kind: 'person', label: 'Zoe' }],
			edges: familyEdges
		};
		expect(expandWouldAdd(lonely, { nodes: lonely.nodes, edges: [] }, 'zoe')).toBe(false);
	});
});
