import { describe, expect, it } from 'bun:test';
import { familyTreeLayout } from './family-tree';
import { DEFAULT_NODE_SIZE, type Point, type Route } from './geometry';
import { TREE_LINES, treeRoutes } from './tree-lines';
import type { GraphEdge, GraphModel, GraphNode } from '../model/types';

/*
 * How the family tree draws its lines (docs/05 §5.8): partners joined by a short bar, one drop
 * from the middle of it to a bar over their children, a short drop to each child — right angles
 * everywhere, and never a line through somebody standing on the way.
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

const ROW = 170;
const size = () => DEFAULT_NODE_SIZE;

/** Routes for a model laid out as the tree lays it out, with everybody counted in the family. */
function routed(model: GraphModel) {
	const { positions } = familyTreeLayout(model);
	const members = new Set(model.nodes.map((n) => n.id));
	return { positions, routes: treeRoutes(model.edges, positions, members, size, ROW) };
}

/** The line as drawn: from where it leaves its source, over its bends, to its target. */
function pathOf(edge: GraphEdge, route: Route, positions: ReadonlyMap<string, Point>): Point[] {
	return [
		route.sourceEnd ?? positions.get(edge.source)!,
		...route.waypoints,
		route.targetEnd ?? positions.get(edge.target)!
	];
}

/** Every piece of the line runs straight across or straight down. */
function isRightAngled(path: Point[]): boolean {
	return path.slice(1).every((to, i) => to.x === path[i].x || to.y === path[i].y);
}

/** Who a straight piece from `a` to `b` runs through, by their box centred on where they stand. */
function crossed(a: Point, b: Point, positions: ReadonlyMap<string, Point>, except: string[]) {
	const half = { x: DEFAULT_NODE_SIZE.width / 2, y: DEFAULT_NODE_SIZE.height / 2 };
	return [...positions]
		.filter(([id]) => !except.includes(id))
		.filter(
			([, p]) =>
				Math.max(a.x, b.x) > p.x - half.x &&
				Math.min(a.x, b.x) < p.x + half.x &&
				Math.max(a.y, b.y) > p.y - half.y &&
				Math.min(a.y, b.y) < p.y + half.y
		)
		.map(([id]) => id);
}

/** Three generations: Otto and Rosa, their children Bert (with Anna) and Carl, and grandchildren. */
const family: GraphModel = {
	nodes: ['otto', 'rosa', 'anna', 'bert', 'carl', 'emil', 'hugo', 'finn'].map(person),
	edges: [
		spouses('otto', 'rosa'),
		parentOf('otto', 'bert'),
		parentOf('rosa', 'bert'),
		parentOf('otto', 'carl'),
		parentOf('rosa', 'carl'),
		spouses('anna', 'bert'),
		parentOf('anna', 'emil'),
		parentOf('bert', 'emil'),
		parentOf('anna', 'hugo'),
		parentOf('bert', 'hugo'),
		parentOf('carl', 'finn'),
		stored('otto', 'emil', 'grandparent_grandchild'),
		kin('finn', 'emil', 'cousin'),
		stored('bert', 'carl', 'sibling')
	]
};

describe('treeRoutes', () => {
	it('leaves a partner bar straight, side by side as the couple stands', () => {
		const { routes } = routed(family);

		expect(routes.has('otto-spouse-rosa')).toBe(false);
		expect(routes.has('anna-spouse-bert')).toBe(false);
		// The parent lines below them are bent, so the bar is the only straight one.
		expect(routes.has('otto-parent_child-bert')).toBe(true);
	});

	it('drops one line from the middle of the partner bar for both parents of a child', () => {
		const { positions, routes } = routed(family);
		const middle = (positions.get('otto')!.x + positions.get('rosa')!.x) / 2;

		for (const parent of ['otto', 'rosa']) {
			for (const child of ['bert', 'carl']) {
				const route = routes.get(`${parent}-parent_child-${child}`)!;
				expect(route.sourceEnd).toEqual({ x: middle, y: positions.get(parent)!.y });
				expect(route.waypoints[0].x).toBe(middle);
			}
		}
	});

	it('joins a couple’s children on one bar, with a short drop to each', () => {
		const { positions, routes } = routed(family);
		const bars = ['bert', 'carl'].map((child) => {
			const route = routes.get(`otto-parent_child-${child}`)!;
			return { bar: route.waypoints.at(-1)!, child: positions.get(child)! };
		});

		// One bar: every child's line turns down off it at the same height, above the child.
		expect(bars[0].bar.y).toBe(bars[1].bar.y);
		for (const { bar, child } of bars) {
			expect(bar.x).toBe(child.x);
			expect(bar.y).toBeLessThan(child.y);
		}
		// Between the parents' row and the children's.
		expect(bars[0].bar.y).toBeGreaterThan(positions.get('otto')!.y);
	});

	it('drops a lone parent’s line from the parent', () => {
		const { positions, routes } = routed(family);
		const route = routes.get('carl-parent_child-finn')!;

		expect(route.sourceEnd).toBeUndefined();
		expect(route.waypoints[0].x).toBe(positions.get('carl')!.x);
	});

	it('runs a stored sibling link along the bar the siblings already hang from', () => {
		const { routes } = routed(family);
		const sibling = routes.get('bert-sibling-carl')!;
		const bar = routes.get('otto-parent_child-bert')!.waypoints.at(-1)!;

		expect(sibling.waypoints.every((p) => p.y === bar.y)).toBe(true);
	});

	it('draws every family line at right angles', () => {
		const { positions, routes } = routed(family);
		const bent = family.edges.filter((e) => routes.has(e.id));

		expect(bent.length).toBeGreaterThan(8);
		for (const edge of bent) {
			expect(isRightAngled(pathOf(edge, routes.get(edge.id)!, positions))).toBe(true);
		}
	});

	it('never runs a line through anybody but the two it joins', () => {
		const { positions, routes } = routed(family);

		for (const edge of family.edges.filter((e) => routes.has(e.id))) {
			const path = pathOf(edge, routes.get(edge.id)!, positions);
			const through = path
				.slice(1)
				.flatMap((to, i) => crossed(path[i], to, positions, [edge.source, edge.target]));
			expect({ line: edge.id, through }).toEqual({ line: edge.id, through: [] });
		}
	});

	it('takes a grandparent line around the parent standing under the grandparent', () => {
		const model: GraphModel = {
			nodes: ['otto', 'hans', 'lena'].map(person),
			edges: [
				parentOf('otto', 'hans'),
				parentOf('hans', 'lena'),
				stored('otto', 'lena', 'grandparent_grandchild')
			]
		};
		const { positions, routes } = routed(model);
		const line = model.edges[2];
		const path = pathOf(line, routes.get(line.id)!, positions);

		// Otto, Hans and Lena stand in one column: straight down would run through Hans.
		expect(positions.get('hans')!.x).toBe(positions.get('otto')!.x);
		expect(isRightAngled(path)).toBe(true);
		expect(
			path.slice(1).flatMap((to, i) => crossed(path[i], to, positions, ['otto', 'lena']))
		).toEqual([]);
	});

	it('takes a line between two on a row over the top, not through whoever stands between', () => {
		const positions = new Map<string, Point>([
			['ina', { x: 0, y: 0 }],
			['jan', { x: 150, y: 0 }],
			['kai', { x: 300, y: 0 }]
		]);
		const cousins = kin('ina', 'kai', 'cousin');
		const route = treeRoutes([cousins], positions, new Set(positions.keys()), size, ROW).get(
			cousins.id
		)!;
		const path = pathOf(cousins, route, positions);

		expect(path.every((p, i) => i === 0 || i === path.length - 1 || p.y < 0)).toBe(true);
		expect(
			path.slice(1).flatMap((to, i) => crossed(path[i], to, positions, ['ina', 'kai']))
		).toEqual([]);
	});

	it('keeps two bars that would run along each other on separate lanes', () => {
		// Two couples whose children stand under the other couple: their bars overlap.
		const positions = new Map<string, Point>([
			['a1', { x: 0, y: 0 }],
			['a2', { x: 140, y: 0 }],
			['b1', { x: 420, y: 0 }],
			['b2', { x: 560, y: 0 }],
			['ac', { x: 560, y: ROW }],
			['bc', { x: 0, y: ROW }]
		]);
		const edges = [
			spouses('a1', 'a2'),
			spouses('b1', 'b2'),
			parentOf('a1', 'ac'),
			parentOf('a2', 'ac'),
			parentOf('b1', 'bc'),
			parentOf('b2', 'bc')
		];
		const routes = treeRoutes(edges, positions, new Set(positions.keys()), size, ROW);
		const barOf = (id: string) => routes.get(id)!.waypoints.at(-1)!.y;

		expect(barOf('a1-parent_child-ac')).toBe(barOf('a2-parent_child-ac'));
		expect(Math.abs(barOf('a1-parent_child-ac') - barOf('b1-parent_child-bc'))).toBe(
			TREE_LINES.lane
		);
	});

	it('squeezes a crowded gap’s lanes closer rather than run two lines along one', () => {
		// Six parents on a row, each with a child at the far end: six bars over one stretch.
		const parents = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'];
		const positions = new Map<string, Point>([
			...parents.map((id, i) => [id, { x: i * 150, y: 0 }] as [string, Point]),
			...parents.map((id, i) => [`${id}c`, { x: 900 + i * 150, y: ROW }] as [string, Point])
		]);
		const edges = parents.map((id) => parentOf(id, `${id}c`));
		const routes = treeRoutes(edges, positions, new Set(positions.keys()), size, ROW);
		const bars = edges.map((e) => routes.get(e.id)!.waypoints.at(-1)!.y);
		const top = TREE_LINES.bar * ROW;

		expect(new Set(bars).size).toBe(parents.length);
		expect(Math.min(...bars)).toBe(top);
		expect(Math.max(...bars)).toBeCloseTo(top + (TREE_LINES.lanes - 1) * TREE_LINES.lane, 9);
	});

	it('bends only the lines between members of the family', () => {
		const positions = new Map<string, Point>([
			['otto', { x: 0, y: 0 }],
			['eva', { x: 0, y: 400 }]
		]);
		const friends = stored('otto', 'eva', 'friend');
		const parent = parentOf('otto', 'eva');

		const routes = treeRoutes([friends, parent], positions, new Set(['otto']), size, ROW);
		const both = treeRoutes([friends, parent], positions, new Set(['otto', 'eva']), size, ROW);

		expect(routes.size).toBe(0);
		// With both in the family the parent line is bent; the friendship never is.
		expect([...both.keys()]).toEqual([parent.id]);
	});
});
