import { PARTNER_TYPE_KEYS } from '../../relationships/type-keys';
import { familiesOf } from '../model/generations';
import type { GraphModel } from '../model/types';
import { shelve, type Point } from './geometry';

/*
 * The family-tree arrangement (docs/02 §2.7, docs/05 §5.8). Pure: positions from the model, no
 * renderer. Every generation is one row, the oldest at the top; partners stand side by side;
 * a row is ordered so children sit under their parents, which keeps family lines from crossing.
 * Separate families stand side by side, and whoever has no family link — friends, colleagues,
 * circles — is shelved in rows beneath, rather than wedged into a generation they are not in.
 */

/** Distances of the family tree, in model units. */
export const TREE_SPACING = {
	/** Between neighbours on a row — wide enough for a name under each node. */
	node: 120,
	/** Extra room between one couple or single and the next on a row. */
	unit: 40,
	/** Between one generation's row and the next. */
	row: 150,
	/** Between two separate families standing side by side. */
	family: 200
} as const;

/**
 * Down-and-up passes that re-order each row under the one above and over the one below. A few
 * settle a household-sized tree; more only shuffle the same order again.
 */
const ORDERING_PASSES = 4;

/** Positions for every node of `model`, arranged as a family tree. */
export function familyTreeLayout(model: GraphModel): Map<string, Point> {
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
		const x = arrangeFamily(model, family, neighbours, partners);
		const xs = [...x.values()];
		const shift = left - Math.min(...xs);
		for (const [id, generation] of family) {
			positions.set(id, { x: x.get(id)! + shift, y: generation * TREE_SPACING.row });
			deepest = Math.max(deepest, generation);
		}
		left += Math.max(...xs) - Math.min(...xs) + TREE_SPACING.family;
	}

	const rest = model.nodes.filter((n) => !positions.has(n.id));
	// Circles first, so the people shelved after them read as the loose ends they are.
	rest.sort((a, b) => Number(b.kind === 'circle') - Number(a.kind === 'circle'));
	const shelfTop = (deepest + 1) * TREE_SPACING.row + (deepest >= 0 ? TREE_SPACING.row / 2 : 0);
	const width = Math.max(left - TREE_SPACING.family, TREE_SPACING.node * 4);
	shelve(
		rest.map((n) => n.id),
		{ x: 0, y: shelfTop },
		width,
		TREE_SPACING.node,
		TREE_SPACING.row
	).forEach((point, id) => positions.set(id, point));
	return positions;
}

/** Horizontal position of each member of one family, ordered row by row. */
function arrangeFamily(
	model: GraphModel,
	family: Map<string, number>,
	neighbours: Map<string, Set<string>>,
	partners: Map<string, Set<string>>
): Map<string, number> {
	// Rows of units: a couple (or a longer chain of partners) is one unit that moves together.
	const rows: string[][][] = [];
	const assigned = new Set<string>();
	for (const node of model.nodes) {
		const generation = family.get(node.id);
		if (generation === undefined || assigned.has(node.id)) continue;
		const unit = [node.id];
		assigned.add(node.id);
		for (let i = 0; i < unit.length; i++) {
			for (const partner of partners.get(unit[i]) ?? []) {
				if (family.get(partner) !== generation || assigned.has(partner)) continue;
				unit.push(partner);
				assigned.add(partner);
			}
		}
		(rows[generation] ??= []).push(unit);
	}

	const x = new Map<string, number>();
	const pack = (row: string[][]) => {
		let cursor = 0;
		for (const unit of row) {
			for (const id of unit) {
				x.set(id, cursor);
				cursor += TREE_SPACING.node;
			}
			cursor += TREE_SPACING.unit;
		}
		const middle = (cursor - TREE_SPACING.node - TREE_SPACING.unit) / 2;
		for (const unit of row) for (const id of unit) x.set(id, x.get(id)! - middle);
	};
	for (const row of rows) if (row) pack(row);

	/** Mean position of a unit's neighbours on row `towards`, or where it stands without any. */
	const pull = (unit: string[], towards: number) => {
		const xs = unit.flatMap((id) =>
			[...(neighbours.get(id) ?? [])].filter((n) => family.get(n) === towards).map((n) => x.get(n)!)
		);
		return xs.length > 0
			? xs.reduce((a, b) => a + b, 0) / xs.length
			: unit.reduce((a, id) => a + x.get(id)!, 0) / unit.length;
	};
	const reorder = (generation: number, towards: number) => {
		const row = rows[generation];
		if (!row || !rows[towards]) return;
		const keyed = row.map((unit) => ({ unit, key: pull(unit, towards) }));
		keyed.sort((a, b) => a.key - b.key);
		rows[generation] = keyed.map((k) => k.unit);
		pack(rows[generation]);
	};
	for (let pass = 0; pass < ORDERING_PASSES; pass++) {
		for (let g = 1; g < rows.length; g++) reorder(g, g - 1);
		for (let g = rows.length - 2; g >= 0; g--) reorder(g, g + 1);
	}
	return x;
}
