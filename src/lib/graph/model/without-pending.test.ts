import { describe, expect, it } from 'bun:test';
import type { GraphModel } from './types';
import { withoutRelationships } from './without-pending';

/** Anna in the middle, Bert and Carl on either side, Carl also in a circle. */
const model: GraphModel = {
	nodes: [
		{ id: 'anna', kind: 'person', label: 'Anna' },
		{ id: 'bert', kind: 'person', label: 'Bert' },
		{ id: 'carl', kind: 'person', label: 'Carl' },
		{ id: 'choir', kind: 'circle', label: 'Choir' }
	],
	edges: [
		{ id: 'r-bert', source: 'anna', target: 'bert', kind: 'relationship' },
		{ id: 'r-carl', source: 'anna', target: 'carl', kind: 'relationship' },
		{ id: 'r-carl-2', source: 'carl', target: 'bert', kind: 'relationship' },
		{ id: 'm-carl', source: 'carl', target: 'choir', kind: 'membership' }
	]
};

describe('withoutRelationships', () => {
	it('drops the named links and the person who was only there for one of them', () => {
		const left = withoutRelationships(model, new Set(['r-bert', 'r-carl-2']), 'anna');

		expect(left.edges.map((e) => e.id)).toEqual(['r-carl', 'm-carl']);
		expect(left.nodes.map((n) => n.id)).toEqual(['anna', 'carl', 'choir']);
	});

	it('keeps a person who is still connected by another link', () => {
		const left = withoutRelationships(model, new Set(['r-carl']), 'anna');

		expect(left.nodes.map((n) => n.id)).toContain('carl');
		expect(left.edges.map((e) => e.id)).toEqual(['r-bert', 'r-carl-2', 'm-carl']);
	});

	it('keeps the person the map is centred on, however much is taken away', () => {
		const left = withoutRelationships(model, new Set(['r-bert', 'r-carl', 'r-carl-2']), 'anna');

		expect(left.nodes.map((n) => n.id)).toEqual(['anna', 'carl', 'choir']);
		expect(left.edges.map((e) => e.id)).toEqual(['m-carl']);
	});

	it('changes nothing when nothing is pending', () => {
		const left = withoutRelationships(model, new Set(), 'anna');

		expect(left).toEqual(model);
	});

	it('leaves links of another kind alone, even one named by mistake', () => {
		const left = withoutRelationships(model, new Set(['m-carl']), 'anna');

		expect(left.edges.map((e) => e.id)).toContain('m-carl');
	});
});
