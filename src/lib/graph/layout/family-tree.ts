import { PARTNER_TYPE_KEYS } from '../../relationships/type-keys';
import { familiesOf } from '../model/generations';
import { hiddenInTree } from '../model/tree-shown';
import type { GraphModel } from '../model/types';
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
import { treeRoutes } from './tree-lines';

/*
 * The family-tree arrangement (docs/02 §2.7, docs/05 §5.8). Pure: positions from the model, no
 * renderer. Every generation is one row, the oldest at the top; partners stand side by side;
 * a row is ordered so children sit under their parents, which keeps family lines from crossing.
 * Separate families stand side by side, and whoever has no family link — friends, colleagues,
 * circles — is shelved in rows beneath, rather than wedged into a generation they are not in.
 * Each node gets the room its name needs. The family lines are drawn at right angles, as on a
 * paper tree (`tree-lines.ts`); any other line that would pass through somebody on its way —
 * a friend's line down to the shelf — bends around them.
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

/** The narrowest the shelf beneath gets, so a map with no family still reads as rows. */
const SHELF_MIN_WIDTH = 600;

/** Every node of `model` arranged as a family tree, each given the room `sizeOf` says it takes. */
export function familyTreeLayout(model: GraphModel, sizeOf: SizeOf = defaultSizeOf): Arrangement {
	const neighbours = new Map<string, Set<string>>();
	const partners = new Map<string, Set<string>>();
	const link = (map: Map<string, Set<string>>, a: string, b: string) => {
		if (!map.has(a)) map.set(a, new Set());
		map.get(a)!.add(b);
	};
	for (const edge of model.edges) {
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
	for (const family of familiesOf(model)) {
		const x = arrangeFamily(model, family, neighbours, partners, sizeOf, TREE_SPACING);
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
	// One row beneath the youngest generation: no line runs down to the shelf (docs/05 §5.8).
	const shelfTop = (deepest + 1) * TREE_SPACING.row;
	const width = Math.max(left - TREE_SPACING.family, SHELF_MIN_WIDTH);
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
	const straightOrBowed = model.edges.filter((e) => !routes.has(e.id));
	return {
		positions,
		bows: bowsAround(positions, straightOrBowed, sizeOf, LINE_CLEARANCE),
		routes,
		// Named only beneath a family: on a map with none, everybody is on the shelf.
		...(members.size > 0 && rest.length > 0 ? { outsideFamily: { x: 0, y: shelfTop } } : {})
	};
}
