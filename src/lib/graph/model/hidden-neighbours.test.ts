import { describe, expect, it } from 'bun:test';
import { familyEdges, familyNodes } from './fixtures';
import { hiddenNeighbourCounts } from './hidden-neighbours';
import type { GraphModel } from './types';

/*
 * The "+N" on a node that can still grow (docs/05 §5.8): how many people or circles expanding
 * it would bring onto the map, so the reader can see where the map goes on before tapping.
 */

const graph: GraphModel = { nodes: familyNodes, edges: familyEdges };
const pick = (ids: string[]): GraphModel => ({
	nodes: familyNodes.filter((n) => ids.includes(n.id)),
	edges: familyEdges.filter((e) => ids.includes(e.source) && ids.includes(e.target))
});

describe('hiddenNeighbourCounts', () => {
	it('counts the people and circles a node is linked to that the map does not show yet', () => {
		const counts = hiddenNeighbourCounts(graph, pick(['mara', 'peter']));

		// mara: jonas, lio, simon, sarah, tobias, walter (kinship), kegel — peter is shown.
		expect(counts.get('mara')).toBe(7);
		// peter: walter, his father.
		expect(counts.get('peter')).toBe(1);
	});

	it('counts somebody linked twice over once', () => {
		// Peter's father entered once as a parent and once more as a colleague: one person.
		const twice: GraphModel = {
			nodes: graph.nodes,
			edges: [
				...graph.edges,
				{ id: 'r9', source: 'peter', target: 'walter', kind: 'relationship', category: 'professional' }
			]
		};
		const counts = hiddenNeighbourCounts(twice, pick(['mara', 'peter']));
		expect(counts.get('peter')).toBe(1);
	});

	it('leaves out a node with nothing left to show', () => {
		const counts = hiddenNeighbourCounts(graph, pick(['mara', 'peter', 'walter']));
		expect(counts.get('mara')).toBe(6);
		expect(counts.has('walter')).toBe(false);
		expect(counts.has('peter')).toBe(false);
	});

	it('counts only what the filters would let onto the map', () => {
		const counts = hiddenNeighbourCounts(graph, pick(['mara']), {
			filters: { edgeKinds: ['relationship'], categories: ['family'] }
		});
		// lio, peter, simon — not the partner, the friend, the colleague, the circle or the
		// inferred grandfather.
		expect(counts.get('mara')).toBe(3);
	});

	it('leaves out a node the map may not expand', () => {
		const counts = hiddenNeighbourCounts(graph, pick(['mara', 'peter']), {
			expandable: (id) => id !== 'peter'
		});
		expect(counts.has('peter')).toBe(false);
		expect(counts.get('mara')).toBe(7);
	});

	it('ignores a line to somebody the graph does not hold', () => {
		const withStray: GraphModel = {
			nodes: graph.nodes,
			edges: [...graph.edges, { id: 'x', source: 'walter', target: 'nobody', kind: 'relationship', category: 'family' }]
		};
		const counts = hiddenNeighbourCounts(withStray, pick(['mara', 'peter', 'walter']));
		expect(counts.has('walter')).toBe(false);
	});
});
