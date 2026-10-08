import { describe, expect, it } from 'bun:test';
import { toCytoscapeElements } from './elements';
import { avatarAccent } from '../../people/avatar';
import { groupByRole } from '../model/role-groups';
import type { GraphModel } from '../model/types';
import { nodeDiameter } from '../layout/legibility';

/*
 * Pure GraphModel → Cytoscape element mapping (docs/04 §4.11). No library, no DOM.
 */

const model: GraphModel = {
	nodes: [
		{ id: 'mara', kind: 'person', label: 'Mara' },
		{ id: 'walter', kind: 'person', label: 'Walter', deceased: true, avatarPhotoId: 'photo-w' },
		{ id: 'kegel', kind: 'circle', label: 'Kegelclub' }
	],
	edges: [
		{
			id: 'r1',
			source: 'mara',
			target: 'walter',
			kind: 'relationship',
			category: 'family',
			directed: true
		},
		{ id: 'm1', source: 'kegel', target: 'mara', kind: 'membership' },
		{ id: 'dangling', source: 'mara', target: 'ghost', kind: 'relationship', category: 'social' }
	]
};

describe('toCytoscapeElements', () => {
	const els = toCytoscapeElements(model, { centerId: 'mara' });
	const node = (id: string) => els.find((e) => e.group === 'nodes' && e.data.id === id);
	const edge = (id: string) => els.find((e) => e.group === 'edges' && e.data.id === id);

	it('marks the centre and classes people vs circles', () => {
		expect(node('mara')?.classes).toContain('center');
		expect(node('mara')?.classes).toContain('person');
		expect(node('kegel')?.classes).toContain('circle');
	});

	it('flags deceased and gives circles the lavender accent', () => {
		expect(node('walter')?.classes).toContain('deceased');
		expect(node('kegel')?.data.accent).toBe('lavender');
	});

	it('gives a person the same accent as their avatar everywhere else', () => {
		expect(node('mara')?.data.accent).toBe(avatarAccent('mara'));
	});

	it('hands a person with a photo its thumbnail, and one without nothing to draw', () => {
		expect(node('walter')?.classes).toContain('has-photo');
		expect(node('walter')?.data.photo).toBe('/media/photo-w?thumb');
		expect(node('mara')?.classes).not.toContain('has-photo');
		expect(node('mara')?.data.photo).toBeUndefined();
	});

	it('carries each person’s role as the caller words it, and an empty one otherwise', () => {
		const roles = new Map([['walter', 'Grandfather']]);
		const named = toCytoscapeElements(model, { centerId: 'mara', roleOf: (id) => roles.get(id) });
		const data = (id: string) => named.find((e) => e.data.id === id)?.data;

		expect(data('walter')?.role).toBe('Grandfather');
		expect(data('mara')?.role).toBe('');
		// Without a caller asking, nobody carries a role.
		expect(node('walter')?.data.role).toBe('');
	});

	it('encodes edge kind, category, and direction', () => {
		expect(edge('r1')?.data).toMatchObject({
			kind: 'relationship',
			category: 'family',
			directed: 1
		});
		expect(edge('m1')?.data).toMatchObject({ kind: 'membership', directed: 0 });
	});

	it('drops edges whose endpoint is not a present node', () => {
		expect(edge('dangling')).toBeUndefined();
	});

	it('computes node degree from drawn edges only', () => {
		// mara touches r1 and m1 (dangling is dropped) → degree 2
		expect(node('mara')?.data.degree).toBe(2);
		expect(node('kegel')?.data.degree).toBe(1);
	});

	it('sizes each node by its degree on the shared scale', () => {
		expect(node('mara')?.data.size).toBe(nodeDiameter(2));
		expect(node('kegel')?.data.size).toBe(nodeDiameter(1));
	});

	it('says how many more a node would bring in, and nothing for one with none', () => {
		const counted = toCytoscapeElements(model, { hiddenNeighbours: new Map([['walter', 4]]) });
		const of = (id: string) => counted.find((e) => e.group === 'nodes' && e.data.id === id);

		expect(of('walter')?.data.more).toBe(4);
		expect(of('walter')?.classes).toContain('has-more');
		expect(of('mara')?.data.more).toBe(0);
		expect(of('mara')?.classes).not.toContain('has-more');
	});
});

describe('toCytoscapeElements with the circles grouped by role', () => {
	const club: GraphModel = {
		nodes: [
			{ id: 'swim', kind: 'circle', label: 'Swim club' },
			{ id: 'lena', kind: 'person', label: 'Lena' },
			{ id: 'juri', kind: 'person', label: 'Juri' },
			{ id: 'andy', kind: 'person', label: 'Andy' }
		],
		edges: [
			{ id: 'm-lena', source: 'swim', target: 'lena', kind: 'membership', label: 'Child' },
			{ id: 'm-juri', source: 'swim', target: 'juri', kind: 'membership', label: 'Child' },
			{ id: 'father', source: 'andy', target: 'lena', kind: 'relationship', category: 'family' }
		]
	};
	const grouping = groupByRole(club, { innerLinks: true });
	const els = toCytoscapeElements(club, {
		grouping: {
			grouping,
			groupLabel: (g) => `${g.role} · ${g.memberIds.length}`,
			bundleLabel: (b) => `${b.edgeIds.length} links`
		}
	});
	const byId = (id: string) => els.find((e) => e.data.id === id);
	const group = grouping.groups[0];

	it('draws each group as a frame its members stand in', () => {
		expect(byId(group.id)).toMatchObject({
			group: 'nodes',
			classes: 'role-group',
			data: { label: 'Child · 2', kind: 'group' }
		});
		expect(byId('lena')?.data.parent).toBe(group.id);
		expect(byId('andy')?.data.parent).toBeUndefined();
	});

	it('draws the line standing in for others, named with what it carries', () => {
		const bundle = grouping.bundles[0];

		expect(byId(bundle.id)).toMatchObject({
			group: 'edges',
			classes: 'bundle',
			data: { source: 'swim', target: group.id, kind: 'membership', label: '2 links', count: 2 }
		});
	});

	it('tucks away the lines a bundle stands for, and leaves the rest', () => {
		expect(byId('m-lena')?.classes).toContain('tucked');
		expect(byId('father')?.classes).not.toContain('tucked');
	});
});
