import { describe, expect, it } from 'bun:test';
import { familyTreeLayout, TREE_SPACING } from './family-tree';
import { DEFAULT_NODE_SIZE } from './geometry';
import type { GraphEdge, GraphModel, GraphNode } from '../model/types';

/*
 * The family-tree arrangement (docs/02 §2.7, docs/05 §5.8): every generation one row, the
 * oldest at the top, partners side by side and children under their parents.
 */

const person = (id: string): GraphNode => ({ id, kind: 'person', label: id });

const stored = (source: string, target: string, typeKey: string): GraphEdge => ({
	id: `${source}-${typeKey}-${target}`,
	source,
	target,
	kind: 'relationship',
	category: 'family',
	typeKey
});
const parentOf = (parent: string, child: string) => stored(parent, child, 'parent_child');
const spouses = (a: string, b: string) => stored(a, b, 'spouse');

/**
 * One family over three generations: siblings Bert and Carl, each married with two children.
 * Listed in an unhelpful order — partners apart, the right-hand couple's children first — so
 * the arrangement has to do the ordering itself.
 */
const twoHouseholds: GraphModel = {
	nodes: ['otto', 'rosa', 'anna', 'dora', 'bert', 'carl', 'finn', 'gina', 'emil', 'hugo'].map(
		person
	),
	edges: [
		spouses('otto', 'rosa'),
		parentOf('otto', 'bert'),
		parentOf('rosa', 'carl'),
		spouses('anna', 'bert'),
		spouses('carl', 'dora'),
		parentOf('carl', 'finn'),
		parentOf('dora', 'gina'),
		parentOf('anna', 'emil'),
		parentOf('bert', 'hugo')
	]
};

describe('familyTreeLayout', () => {
	it('gives every node on the map a place', () => {
		const layout = familyTreeLayout(twoHouseholds).positions;

		expect([...layout.keys()].sort()).toEqual(twoHouseholds.nodes.map((n) => n.id).sort());
	});

	it('puts each generation on one row, parents above their children', () => {
		const layout = familyTreeLayout(twoHouseholds).positions;

		expect(layout.get('anna')!.y).toBe(layout.get('carl')!.y);
		expect(layout.get('emil')!.y).toBe(layout.get('finn')!.y);
		expect(layout.get('anna')!.y).toBeLessThan(layout.get('emil')!.y);
	});

	it('sets partners side by side, nobody between them', () => {
		const layout = familyTreeLayout(twoHouseholds).positions;
		const row = ['anna', 'bert', 'carl', 'dora'].sort(
			(a, b) => layout.get(a)!.x - layout.get(b)!.x
		);

		expect(Math.abs(row.indexOf('anna') - row.indexOf('bert'))).toBe(1);
		expect(Math.abs(row.indexOf('carl') - row.indexOf('dora'))).toBe(1);
	});

	it('keeps children under their own parents, so family lines do not cross', () => {
		const layout = familyTreeLayout(twoHouseholds).positions;
		const x = (id: string) => layout.get(id)!.x;
		const annaSideIsLeft = x('anna') < x('carl');

		for (const child of ['emil', 'hugo']) {
			for (const other of ['finn', 'gina']) {
				expect(x(child) < x(other)).toBe(annaSideIsLeft);
			}
		}
	});

	it('never lets two names on a row run into each other', () => {
		const layout = familyTreeLayout(twoHouseholds).positions;
		const points = [...layout.values()];

		for (let i = 0; i < points.length; i++) {
			for (let j = i + 1; j < points.length; j++) {
				if (points[i].y !== points[j].y) continue;
				expect(Math.abs(points[i].x - points[j].x)).toBeGreaterThanOrEqual(
					DEFAULT_NODE_SIZE.width + TREE_SPACING.gap
				);
			}
		}
	});

	it('gives a long name the room it needs', () => {
		const widths: Record<string, number> = { anna: 300 };
		const { positions } = familyTreeLayout(
			{
				nodes: ['otto', 'anna', 'bert'].map(person),
				edges: [parentOf('otto', 'anna'), parentOf('otto', 'bert')]
			},
			(id) => ({ width: widths[id] ?? 60, height: 60 })
		);
		const gapBetween =
			Math.abs(positions.get('anna')!.x - positions.get('bert')!.x) - (300 + 60) / 2;

		expect(gapBetween).toBeGreaterThanOrEqual(TREE_SPACING.gap);
	});

	it('bends a grandparent line around the parent standing in its way', () => {
		// Otto, Hans and Lena stand in one column; the straight line from Otto to Lena would run
		// through Hans and hide its name under him.
		const grandparent = stored('otto', 'lena', 'grandparent_grandchild');
		const { bows } = familyTreeLayout({
			nodes: ['otto', 'hans', 'lena'].map(person),
			edges: [parentOf('otto', 'hans'), parentOf('hans', 'lena'), grandparent]
		});

		expect(bows.has(grandparent.id)).toBe(true);
		expect(bows.size).toBe(1);
	});

	it('sets separate families side by side without overlapping', () => {
		const layout = familyTreeLayout({
			nodes: ['anna', 'bert', 'carl', 'dora'].map(person),
			edges: [parentOf('anna', 'bert'), parentOf('carl', 'dora')]
		}).positions;
		const left = ['anna', 'bert'].map((id) => layout.get(id)!.x);
		const right = ['carl', 'dora'].map((id) => layout.get(id)!.x);

		expect(Math.max(...left) < Math.min(...right) || Math.max(...right) < Math.min(...left)).toBe(
			true
		);
	});

	it('shelves people and circles without a family link below the tree', () => {
		const layout = familyTreeLayout({
			nodes: [
				person('anna'),
				person('bert'),
				person('ida'),
				{ id: 'ski', kind: 'circle', label: 'Ski' }
			],
			edges: [
				parentOf('anna', 'bert'),
				{ id: 'm', source: 'ski', target: 'ida', kind: 'membership' }
			]
		}).positions;
		const lowestInTree = Math.max(layout.get('anna')!.y, layout.get('bert')!.y);

		expect(layout.get('ida')!.y).toBeGreaterThan(lowestInTree);
		expect(layout.get('ski')!.y).toBeGreaterThan(lowestInTree);
	});
});
