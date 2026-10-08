import { describe, expect, it } from 'bun:test';
import { familyTreeLayout, TREE_SPACING } from './family-tree';
import { DEFAULT_NODE_SIZE } from './geometry';
import { TREE_LINES } from './tree-lines';
import { brunnerKeller, twoHouseholds } from './family-fixtures';
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

	it('draws the family lines at right angles, and no route for a line the bars already draw', () => {
		// Otto, Hans and Lena stand in one column. How a line bends is `tree-lines.ts`'s; here,
		// that the tree asks for it — and not for the grandparent line, which the two parent
		// lines already draw, so it takes no lane between the rows (`tree-shown.ts`).
		const grandparent = stored('otto', 'lena', 'grandparent_grandchild');
		const { routes } = familyTreeLayout({
			nodes: ['otto', 'hans', 'lena'].map(person),
			edges: [parentOf('otto', 'hans'), parentOf('hans', 'lena'), grandparent]
		});

		expect([...(routes?.keys() ?? [])].sort()).toEqual(
			['hans-parent_child-lena', 'otto-parent_child-hans'].sort()
		);
	});

	it('routes a grandparent line around the parent where it is the only tie between them', () => {
		// Without Hans's own line to Lena, nothing else on the map draws the grandparent line.
		const grandparent = stored('otto', 'lena', 'grandparent_grandchild');
		const { routes } = familyTreeLayout({
			nodes: ['otto', 'hans', 'lena'].map(person),
			edges: [parentOf('otto', 'hans'), grandparent]
		});

		expect(routes?.has(grandparent.id)).toBe(true);
	});

	it('still bends a line to somebody outside the family around whoever is in its way', () => {
		// Eva, Otto's friend, is shelved beneath; the line down to her would cross his son.
		const friends = stored('otto', 'eva', 'friend');
		const { bows, routes, positions } = familyTreeLayout({
			nodes: ['otto', 'hans', 'eva'].map(person),
			edges: [parentOf('otto', 'hans'), friends]
		});

		expect(routes?.has(friends.id)).toBe(false);
		expect(positions.get('eva')!.y).toBeGreaterThan(positions.get('hans')!.y);
		// The shelf starts at the tree's left edge, so Eva stands right under Hans.
		expect(positions.get('eva')!.x).toBe(positions.get('hans')!.x);
		expect(bows.has(friends.id)).toBe(true);
	});

	it('marks where the people outside the family begin, above the first of them', () => {
		const { positions, outsideFamily } = familyTreeLayout({
			nodes: ['anna', 'bert', 'ida'].map(person),
			edges: [parentOf('anna', 'bert')]
		});

		expect(outsideFamily).toBeDefined();
		expect(outsideFamily!.y).toBeGreaterThan(positions.get('bert')!.y);
		expect(outsideFamily!.y).toBeLessThan(positions.get('ida')!.y);
	});

	it('keeps the shelf no wider than the family above it, wrapping it into more rows', () => {
		// Lena's family and eight friends with long captions beneath.
		const friends = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8'];
		const model: GraphModel = {
			nodes: [...brunnerKeller.nodes, ...friends.map(person)],
			edges: brunnerKeller.edges
		};
		const sizeOf = (id: string) => ({ width: id.startsWith('f') ? 130 : 110, height: 70 });
		const { positions } = familyTreeLayout(model, sizeOf);
		const right = (ids: string[]) =>
			Math.max(...ids.map((id) => positions.get(id)!.x + sizeOf(id).width / 2));
		const left = (ids: string[]) =>
			Math.min(...ids.map((id) => positions.get(id)!.x - sizeOf(id).width / 2));
		const family = brunnerKeller.nodes.map((n) => n.id);

		expect(right(friends)).toBeLessThanOrEqual(right(family));
		expect(left(friends)).toBeGreaterThanOrEqual(left(family));
		expect(new Set(friends.map((id) => positions.get(id)!.y)).size).toBeGreaterThan(1);

		// A family of two is narrow: the shelf beneath it is no wider.
		const small = familyTreeLayout(
			{
				nodes: ['anna', 'bert', ...friends].map(person),
				edges: [parentOf('anna', 'bert'), parentOf('anna', 'bert')]
			},
			sizeOf
		).positions;
		const smallRight = (ids: string[]) =>
			Math.max(...ids.map((id) => small.get(id)!.x + sizeOf(id).width / 2));
		expect(smallRight(friends)).toBeLessThanOrEqual(Math.max(smallRight(['anna', 'bert']), 130));
	});

	it('names no shelf when everybody is family, nor when nobody is', () => {
		const allFamily = familyTreeLayout({
			nodes: ['anna', 'bert'].map(person),
			edges: [parentOf('anna', 'bert')]
		});
		const noFamily = familyTreeLayout({
			nodes: ['anna', 'eva'].map(person),
			edges: [stored('anna', 'eva', 'friend')]
		});

		expect(allFamily.positions.size).toBe(2);
		expect(allFamily.outsideFamily).toBeUndefined();
		expect(noFamily.positions.size).toBe(2);
		expect(noFamily.outsideFamily).toBeUndefined();
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

	it('leaves every gap between rows room for its lanes, clear of the names above and below', () => {
		const bars = TREE_LINES.bar * TREE_SPACING.row;
		const lastLane = bars + (TREE_LINES.lanes - 1) * TREE_LINES.lane;
		// The name and role hang up to about 80 units under a disc; the biggest disc and its
		// "+N" reach about 40 above its centre.
		expect(bars).toBeGreaterThan(80 + TREE_LINES.lane);
		expect(lastLane).toBeLessThan(TREE_SPACING.row - 40 - TREE_LINES.lane);
		// Lanes far enough apart to read as separate lines even on a phone.
		expect(TREE_LINES.lane).toBeGreaterThanOrEqual(14);
	});
});
