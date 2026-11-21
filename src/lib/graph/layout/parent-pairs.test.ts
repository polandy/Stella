import { describe, expect, it } from 'bun:test';
import { barSpans, crossingBars, type BarSpan } from './bar-spans';
import { familyTreeLayout, TREE_SPACING } from './family-tree';
import { DEFAULT_NODE_SIZE, type Point, type Route } from './geometry';
import { lenaParentPairs as lena, parentOf } from './parent-pairs-fixtures';
import { dockOffsets, pairOrderBreaks, pairRank } from './parent-pairs';
import { treeRoutes } from './tree-lines';

/*
 * A child with several parent pairs in the family tree (docs/dev/05 §5.8): one bar and one dock
 * per pair, the family the child lives with nearest, and the kind's stroke on its branch alone.
 */

const size = () => DEFAULT_NODE_SIZE;
const members = new Set(lena.nodes.map((n) => n.id));
const laidOut = familyTreeLayout(lena);
const positions = laidOut.positions;
const routes = treeRoutes(lena.edges, positions, members, size, TREE_SPACING.row);
const edge = (id: string) => lena.edges.find((e) => e.id === id)!;
const routeOf = (id: string) => routes.get(id)!;

/** The line as drawn: from where it leaves its source, over its bends, to its target. */
function pathOf(id: string): Point[] {
	const route: Route = routeOf(id);
	return [
		route.sourceEnd ?? positions.get(edge(id).source)!,
		...route.waypoints,
		route.targetEnd ?? positions.get(edge(id).target)!
	];
}
const dockX = (id: string) => pathOf(id).at(-1)!.x;

describe('a child with several parent pairs', () => {
	it('gives each pair of one kind a bar of its own', () => {
		const spans = barSpans(lena.edges, positions, members, size).filter((s) =>
			s.children.includes('lena')
		);
		expect(spans.map((s) => [...s.parents].sort())).toHaveLength(4);
		expect(spans.map((s) => [...s.parents].sort().join('+')).sort()).toEqual([
			'eva+jonas',
			'karl',
			'mara+tom',
			'ruth'
		]);
	});

	it('docks each pair’s line on its own spot on top of the child', () => {
		const docks = [
			dockX('mara-parent_child-lena'),
			dockX('karl-parent_child-lena'),
			dockX('jonas-parent_child-lena'),
			dockX('ruth-parent_child-lena')
		];
		expect(new Set(docks).size).toBe(4);
		expect(dockX('tom-parent_child-lena')).toBe(dockX('mara-parent_child-lena'));
		const lenaX = positions.get('lena')!.x;
		for (const x of docks) expect(Math.abs(x - lenaX)).toBeLessThan(DEFAULT_NODE_SIZE.height / 4);
	});

	it('draws every line to the child at right angles', () => {
		for (const id of routes.keys()) {
			const path = pathOf(id);
			expect(path.slice(1).every((to, i) => to.x === path[i].x || to.y === path[i].y)).toBe(true);
		}
	});

	it('starts an adopted child’s line where it branches off the biological sibling’s', () => {
		const start = routeOf('jonas-parent_child-lena').sourceEnd!;
		const noah = pathOf('jonas-parent_child-noah');
		const bar = noah.find((p) => p.y === start.y);
		expect(bar).toBeDefined();
		expect(start.y).toBeGreaterThan(positions.get('jonas')!.y);
	});

	it('stands the family the child lives with nearest and the ended foster family farthest', () => {
		const lenaX = positions.get('lena')!.x;
		const spans = barSpans(lena.edges, positions, members, size);
		const from = (parent: string) =>
			Math.abs(spans.find((s) => s.parents.includes(parent))!.drop - lenaX);
		expect(from('jonas')).toBeLessThan(from('mara'));
		expect(from('mara')).toBeLessThan(from('karl'));
		expect(from('karl')).toBeLessThan(from('ruth'));
	});

	it('runs no line through another pair’s bar', () => {
		expect(laidOut.bridges).toBeUndefined();
	});

	it('names none of the child’s drops, too close together to read; their strokes tell them apart', () => {
		for (const parent of ['mara', 'tom', 'karl', 'jonas', 'eva', 'ruth']) {
			expect(routeOf(`${parent}-parent_child-lena`).nameEnd).toBeNull();
		}
		expect(routeOf('jonas-parent_child-noah').nameEnd).toBe('target');
	});

	it('leaves a pair’s bar and its own children’s lines as they were', () => {
		expect(routeOf('ruth-parent_child-ben').sourceEnd).toBeUndefined();
		expect(routeOf('jonas-parent_child-noah').targetEnd).toBeUndefined();
	});
});

describe('pairRank', () => {
	it('ranks the family the child lives with first and an ended foster family last', () => {
		const ranks = [
			parentOf('a', 'c', 'adoptive'),
			parentOf('a', 'c', 'foster'),
			parentOf('a', 'c'),
			parentOf('a', 'c', 'step'),
			{ ...parentOf('a', 'c', 'foster'), former: true as const }
		].map(pairRank);
		expect(ranks).toEqual([0, 0, 1, 2, 3]);
	});
});

describe('dockOffsets', () => {
	it('docks one bar on the centre and spreads several evenly about it', () => {
		expect(dockOffsets(1)).toEqual([0]);
		expect(dockOffsets(2)).toEqual([-6, 6]);
		expect(dockOffsets(3)).toEqual([-12, 0, 12]);
	});

	it('squeezes many docks onto the smallest disc', () => {
		const four = dockOffsets(4);
		expect(Math.max(...four.map(Math.abs))).toBeLessThan(15);
	});
});

describe('pairOrderBreaks', () => {
	it('counts a pair standing nearer the child than one that should stand nearer', () => {
		const adoptive = { child: 'c', at: 0, drop: 100, rank: 0 };
		const biological = { child: 'c', at: 0, drop: -50, rank: 1 };
		expect(pairOrderBreaks([adoptive, biological])).toBe(1);
		expect(pairOrderBreaks([{ ...adoptive, drop: 40 }, biological])).toBe(0);
	});
});

describe('crossingBars, over one child', () => {
	const span = (drop: number, dock: number, children = ['c']): BarSpan => ({
		channel: 0,
		left: Math.min(drop, dock),
		right: Math.max(drop, dock),
		children,
		docks: children.map(() => dock),
		ranks: children.map(() => 1),
		parents: [`p${drop}`],
		drop
	});

	it('lets two pairs’ bars meet over their child where lanes keep every line clear', () => {
		expect(crossingBars([span(-200, -6), span(-100, 6)])).toBe(0);
	});

	it('still counts bars over different children sharing a stretch', () => {
		expect(crossingBars([span(-200, -6, ['a']), span(-100, 6, ['b'])])).toBe(1);
	});
});
