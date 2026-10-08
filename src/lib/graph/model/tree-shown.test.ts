import { describe, expect, it } from 'bun:test';
import { hiddenInTree } from './tree-shown';
import type { GraphEdge, GraphModel, GraphNode } from './types';

/*
 * Which lines the family tree leaves off (docs/05 §5.8). Its bars already say who is whose
 * grandparent, aunt, cousin or sibling, so a line saying it again only stacks lines between the
 * rows; and the people outside the family stand on their shelf without a line up to the tree,
 * until one of the two ends is selected.
 */

const person = (id: string): GraphNode => ({ id, kind: 'person', label: id });

const stored = (source: string, target: string, typeKey: string): GraphEdge => ({
	id: `${source}-${typeKey}-${target}`,
	source,
	target,
	kind: 'relationship',
	category: typeKey === 'friend' ? 'social' : 'family',
	typeKey
});
const parentOf = (parent: string, child: string) => stored(parent, child, 'parent_child');
const kin = (
	source: string,
	target: string,
	term: NonNullable<GraphEdge['kin']>['term']
): GraphEdge => ({
	id: `kin:${source}:${target}`,
	source,
	target,
	kind: 'kinship',
	kin: { term, variant: 'neutral' },
	derived: true
});

/** Grandparents Hans and Rosa, sons Markus and Daniel, their children Lena and Timo. */
const family: GraphModel = {
	nodes: ['hans', 'rosa', 'markus', 'daniel', 'lena', 'timo', 'mia', 'ski'].map((id) =>
		id === 'ski' ? { id, kind: 'circle', label: id } : person(id)
	),
	edges: [
		stored('hans', 'rosa', 'spouse'),
		parentOf('hans', 'markus'),
		parentOf('rosa', 'markus'),
		parentOf('hans', 'daniel'),
		parentOf('markus', 'lena'),
		parentOf('daniel', 'timo'),
		stored('markus', 'daniel', 'sibling'),
		stored('hans', 'lena', 'grandparent_grandchild'),
		kin('timo', 'lena', 'cousin'),
		kin('daniel', 'lena', 'aunt-uncle'),
		stored('lena', 'mia', 'friend'),
		stored('markus', 'timo', 'friend'),
		{ id: 'm', source: 'ski', target: 'lena', kind: 'membership' }
	]
};

describe('hiddenInTree', () => {
	it('leaves off every family line the bars already draw — entered or worked out', () => {
		const hidden = hiddenInTree(family, null);

		for (const id of [
			'markus-sibling-daniel',
			'hans-grandparent_grandchild-lena',
			'kin:timo:lena',
			'kin:daniel:lena'
		]) {
			expect(hidden.has(id), id).toBe(true);
		}
	});

	it('keeps the bars themselves: every parent line and partner line', () => {
		const hidden = hiddenInTree(family, null);

		for (const edge of family.edges.filter(
			(e) => e.typeKey === 'parent_child' || e.typeKey === 'spouse'
		)) {
			expect(hidden.has(edge.id), edge.id).toBe(false);
		}
	});

	it('keeps a family line nothing on the map draws otherwise', () => {
		// Without the parents between them, the cousin line is what ties Timo to Lena.
		const sparse: GraphModel = {
			nodes: ['lena', 'timo'].map(person),
			edges: [kin('timo', 'lena', 'cousin')]
		};

		expect(hiddenInTree(sparse, null).size).toBe(0);
		expect(hiddenInTree(family, null).has('kin:timo:lena')).toBe(true);
	});

	it('stands the people outside the family without a line, until one end is selected', () => {
		const none = hiddenInTree(family, null);
		const lenaSelected = hiddenInTree(family, 'lena');
		const miaSelected = hiddenInTree(family, 'mia');

		expect(none.has('lena-friend-mia')).toBe(true);
		expect(none.has('m')).toBe(true);
		expect(lenaSelected.has('lena-friend-mia')).toBe(false);
		expect(lenaSelected.has('m')).toBe(false);
		expect(miaSelected.has('lena-friend-mia')).toBe(false);
		expect(miaSelected.has('m')).toBe(true);
	});

	it('draws a tie that is no family line between two of the family only around a selection', () => {
		// Markus and his nephew are friends besides: a diagonal across the tree until asked for.
		expect(hiddenInTree(family, null).has('markus-friend-timo')).toBe(true);
		expect(hiddenInTree(family, 'timo').has('markus-friend-timo')).toBe(false);
		expect(hiddenInTree(family, 'timo').has('markus-parent_child-lena')).toBe(false);
	});

	it('shows a line a traced path runs along, whichever kind it is', () => {
		const hidden = hiddenInTree(family, null, new Set(['lena-friend-mia', 'kin:timo:lena']));

		expect(hidden.has('lena-friend-mia')).toBe(false);
		expect(hidden.has('kin:timo:lena')).toBe(false);
		expect(hidden.has('m')).toBe(true);
	});

	it('keeps the repeated family lines off even around the selected person', () => {
		expect(hiddenInTree(family, 'lena').has('hans-grandparent_grandchild-lena')).toBe(true);
	});
});
