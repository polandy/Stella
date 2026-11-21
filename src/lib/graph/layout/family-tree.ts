import { PARTNER_TYPE_KEYS } from '../../relationships/type-keys';
import { familiesOf } from '../model/generations';
import { isLooseLine } from '../model/loose-relatives';
import { hiddenInTree } from '../model/tree-shown';
import type { GraphEdge, GraphModel } from '../model/types';
import {
	bowsAround,
	defaultSizeOf,
	LINE_CLEARANCE,
	shelve,
	type Arrangement,
	type Point,
	type SizeOf
} from './geometry';
import { arrangeFamily } from './family-rows';
import { bridgesOf, drawnLine } from './tree-bridges';
import { treeRoutes } from './tree-lines';
import type { RowOrders } from './tree-order';

/*
 * The family-tree arrangement (docs/dev/02 §2.7, docs/dev/05 §5.8). Pure: positions from the model, no
 * renderer. Every generation is one row, the oldest at the top; partners stand side by side;
 * a row is ordered so children sit under their parents, which keeps family lines from crossing.
 * Separate families stand side by side, and whoever has no family link — friends, colleagues,
 * circles — is shelved in rows beneath, rather than wedged into a generation they are not in.
 * Each node gets the room its name needs. The family lines are drawn at right angles, as on a
 * paper tree (`tree-lines.ts`); any other line that would pass through somebody on its way —
 * a friend's line down to the shelf — bends around them. A row the reader ordered by dragging
 * keeps that order (`tree-order.ts`).
 */

/** Distances of the family tree, in model units. */
export const TREE_SPACING = {
	/** Between two neighbours' names on a row. */
	gap: 30,
	/** Extra room between one couple or single and the next on a row. */
	unit: 40,
	/** Between one generation's row and the next. */
	row: 230,
	/** Between two separate families standing side by side. */
	family: 120
} as const;

/** How wide the shelf is laid out when there is no family above it to keep within. */
const SHELF_MIN_WIDTH = 600;

/** The family tree's arrangement, with each family's rows as units left to right. */
export interface TreeArrangement extends Arrangement {
	rows: string[][][];
}

/**
 * Every node of `model` arranged as a family tree, each given the room `sizeOf` says it takes,
 * every row in `orders` kept in the order the reader dragged it into. `unfiltered` are the
 * links before the reader's filters: the people are placed by those among them, so a filter
 * takes lines away but never moves anybody; only `model`'s own links are drawn.
 */
export function familyTreeLayout(
	model: GraphModel,
	sizeOf: SizeOf = defaultSizeOf,
	orders: RowOrders = [],
	unfiltered: readonly GraphEdge[] = []
): TreeArrangement {
	const arranged = arrangedBy(model, unfiltered);
	const neighbours = new Map<string, Set<string>>();
	const partners = new Map<string, Set<string>>();
	const link = (map: Map<string, Set<string>>, a: string, b: string) => {
		if (!map.has(a)) map.set(a, new Set());
		map.get(a)!.add(b);
	};
	for (const edge of arranged.edges) {
		if (edge.source === edge.target) continue;
		link(neighbours, edge.source, edge.target);
		link(neighbours, edge.target, edge.source);
		if (edge.typeKey !== undefined && PARTNER_TYPE_KEYS.includes(edge.typeKey)) {
			link(partners, edge.source, edge.target);
			link(partners, edge.target, edge.source);
		}
	}

	const positions = new Map<string, Point>();
	let left = 0;
	let deepest = -1;
	const rows: string[][][] = [];
	for (const family of familiesOf(arranged)) {
		const { x, rows: familyRows } = arrangeFamily(
			arranged,
			family,
			neighbours,
			partners,
			sizeOf,
			TREE_SPACING,
			orders
		);
		rows.push(...familyRows.filter((row) => row.length > 0));
		const lefts = [...x].map(([id, at]) => at - sizeOf(id).width / 2);
		const rights = [...x].map(([id, at]) => at + sizeOf(id).width / 2);
		const shift = left - Math.min(...lefts);
		for (const [id, generation] of family) {
			positions.set(id, { x: x.get(id)! + shift, y: generation * TREE_SPACING.row });
			deepest = Math.max(deepest, generation);
		}
		left += Math.max(...rights) - Math.min(...lefts) + TREE_SPACING.family;
	}

	const rest = model.nodes.filter((n) => !positions.has(n.id));
	// Circles first, so the people shelved after them read as the loose ends they are.
	rest.sort((a, b) => Number(b.kind === 'circle') - Number(a.kind === 'circle'));
	// One row beneath the youngest generation: no line runs down to the shelf (docs/dev/05 §5.8).
	const shelfTop = (deepest + 1) * TREE_SPACING.row;
	// No wider than the family above it, so the shelf never sets how far out the map is framed;
	// with no family at all it is laid out at a readable width of its own.
	const width = deepest >= 0 ? left - TREE_SPACING.family : SHELF_MIN_WIDTH;
	const members = new Set(positions.keys());
	shelve(
		rest.map((n) => n.id),
		{ x: 0, y: shelfTop },
		width,
		sizeOf,
		TREE_SPACING.gap,
		TREE_SPACING.gap
	).forEach((point, id) => positions.set(id, point));

	// A line the bars already draw is left off (`tree-shown.ts`), so it takes no lane either.
	const repeated = hiddenInTree(model, null);
	const routes = treeRoutes(
		model.edges.filter((e) => !repeated.has(e.id)),
		positions,
		members,
		sizeOf,
		TREE_SPACING.row
	);
	const edgeById = new Map(model.edges.map((e) => [e.id, e]));
	const bridges = bridgesOf(
		[...routes].map(([id, route]) => {
			const { source, target } = edgeById.get(id)!;
			return drawnLine(id, route, positions.get(source)!, positions.get(target)!);
		})
	);
	const straightOrBowed = model.edges.filter((e) => !routes.has(e.id));
	// A cousin's or an in-law's line among the family takes no lane: dotted, around a selection.
	const dottedLines = new Set(
		straightOrBowed
			.filter((e) => isLooseLine(e) && members.has(e.source) && members.has(e.target))
			.map((e) => e.id)
	);
	return {
		positions,
		rows,
		bows: bowsAround(positions, straightOrBowed, sizeOf, LINE_CLEARANCE),
		routes,
		dottedLines,
		...(bridges.length > 0 ? { bridges } : {}),
		// Named only beneath a family: on a map with none, everybody is on the shelf.
		...(members.size > 0 && rest.length > 0 ? { outsideFamily: { x: 0, y: shelfTop, width } } : {})
	};
}

/** The people the tree shelves outside the family, placed as `familyTreeLayout` places them. */
export function outsideTheFamily(
	model: GraphModel,
	unfiltered: readonly GraphEdge[] = []
): Set<string> {
	const inFamily = new Set(familiesOf(arrangedBy(model, unfiltered)).flatMap((f) => [...f.keys()]));
	return new Set(
		model.nodes.filter((n) => n.kind === 'person' && !inFamily.has(n.id)).map((n) => n.id)
	);
}

/** What the tree is placed by: every unfiltered link among the model's people, then its own. */
function arrangedBy(model: GraphModel, unfiltered: readonly GraphEdge[]): GraphModel {
	if (unfiltered.length === 0) return model;
	const shown = new Set(model.nodes.map((n) => n.id));
	const among = unfiltered.filter((e) => shown.has(e.source) && shown.has(e.target));
	const known = new Set(unfiltered.map((e) => e.id));
	return { nodes: model.nodes, edges: [...among, ...model.edges.filter((e) => !known.has(e.id))] };
}
