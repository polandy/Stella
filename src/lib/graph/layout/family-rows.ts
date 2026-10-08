import { PARENT_CHILD_TYPE_KEY } from '../../relationships/type-keys';
import type { GraphModel } from '../model/types';
import type { SizeOf } from './geometry';
import { barSpans, crossingBars } from './tree-lines';

/*
 * The order of each row of one family in the family tree (docs/05 §5.8). Pure. A row is a list
 * of units — a couple, or a longer chain of partners, moves together — and the order is chosen
 * so that every couple's bar over their children stands clear of every other couple's: then no
 * family's drop runs through another family's bar, siblings stand side by side, and each
 * child's family hangs under its own parents.
 *
 * It starts from the usual barycentre passes (each unit under the mean of its neighbours on
 * the row above, then over the row below) and then improves the order by moving one unit at a
 * time — anywhere on its row, or turned round — for as long as that removes a crossing or
 * draws the bars shorter. Last, of the order and its mirror image, it keeps the one with more
 * husbands to the left of their wives, so a person's father's family stands on the left and
 * their mother's on the right, as a family tree is usually drawn.
 */

/** Distances a row is packed with, in model units. */
export interface RowSpacing {
	/** Between two neighbours' names on a row. */
	gap: number;
	/** Extra room between one unit and the next. */
	unit: number;
	/** Between one generation's row and the next. */
	row: number;
}

/** Down-and-up barycentre passes; a few settle a household-sized tree. */
const ORDERING_PASSES = 4;
/** The most rounds of single moves; each round either improves the order or ends the search. */
const SEARCH_ROUNDS = 40;
/** A crossing outweighs any length of bar: the search never buys shorter bars with one. */
const CROSSING_WEIGHT = 1e6;

type Rows = string[][][];

/** Horizontal position of each member of one family, ordered row by row. */
export function arrangeFamily(
	model: GraphModel,
	family: ReadonlyMap<string, number>,
	neighbours: ReadonlyMap<string, ReadonlySet<string>>,
	partners: ReadonlyMap<string, ReadonlySet<string>>,
	sizeOf: SizeOf,
	spacing: RowSpacing
): Map<string, number> {
	const wording = new Map(model.nodes.map((n) => [n.id, n.wording] as const));
	const familyEdges = model.edges.filter((e) => family.has(e.source) && family.has(e.target));
	const members = new Set(family.keys());

	// Rows of units: a couple (or a longer chain of partners) is one unit that moves together.
	let rows: Rows = [];
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
	rows = Array.from(rows, (row) => row ?? []);

	/** Every member's position with the rows packed in this order, each row centred on 0. */
	const place = (order: Rows): Map<string, number> => {
		const x = new Map<string, number>();
		for (const row of order) {
			let cursor = 0;
			for (const unit of row) {
				for (const id of unit) {
					const width = sizeOf(id).width;
					x.set(id, cursor + width / 2);
					cursor += width + spacing.gap;
				}
				cursor += spacing.unit;
			}
			const middle = (cursor - spacing.gap - spacing.unit) / 2;
			for (const unit of row) for (const id of unit) x.set(id, x.get(id)! - middle);
		}
		return x;
	};

	/** How badly an order draws the bars: every crossing first, then their total length. */
	const cost = (order: Rows): number => {
		const x = place(order);
		const positions = new Map(
			[...family].map(([id, generation]) => [id, { x: x.get(id)!, y: generation * spacing.row }])
		);
		const spans = barSpans(familyEdges, positions, members);
		const length = spans.reduce((sum, s) => sum + s.right - s.left, 0);
		return crossingBars(spans) * CROSSING_WEIGHT + length;
	};

	rows = barycentreOrder(rows, family, neighbours, place);
	rows = improve(rows, cost);
	// A couple free to turn round puts the husband left. Which way the whole tree faces is
	// decided by the couples joining two families on the map — Lena's parents, whose sides are
	// her father's and her mother's family — or by every couple where none does.
	const withParents = new Set(
		familyEdges.filter((e) => e.typeKey === PARENT_CHILD_TYPE_KEY).map((e) => e.target)
	);
	const joinsFamilies = (a: string, b: string) => withParents.has(a) && withParents.has(b);
	const anyJoin = rows
		.flat()
		.some((unit) => unit.some((a, i) => i > 0 && joinsFamilies(unit[i - 1], a)));
	const counts = anyJoin ? joinsFamilies : () => true;
	const asIs = husbandsLeft(rows, partners, wording, cost, counts);
	const mirror = husbandsLeft(mirrored(rows), partners, wording, cost, counts);
	return place(mirror.balance > asIs.balance ? mirror.rows : asIs.rows);
}

/** Each row re-ordered under the one above and over the one below, a few times over. */
function barycentreOrder(
	start: Rows,
	family: ReadonlyMap<string, number>,
	neighbours: ReadonlyMap<string, ReadonlySet<string>>,
	place: (order: Rows) => Map<string, number>
): Rows {
	const rows = start.map((row) => [...row]);
	let x = place(rows);
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
		if (rows[generation].length === 0 || rows[towards].length === 0) return;
		const keyed = rows[generation].map((unit) => ({ unit, key: pull(unit, towards) }));
		keyed.sort((a, b) => a.key - b.key);
		rows[generation] = keyed.map((k) => k.unit);
		x = place(rows);
	};
	for (let pass = 0; pass < ORDERING_PASSES; pass++) {
		for (let g = 1; g < rows.length; g++) reorder(g, g - 1);
		for (let g = rows.length - 2; g >= 0; g--) reorder(g, g + 1);
	}
	return rows;
}

/** The order after single moves — a unit to another place on its row, or turned round. */
function improve(start: Rows, cost: (order: Rows) => number): Rows {
	let best = start;
	let bestCost = cost(best);
	for (let round = 0; round < SEARCH_ROUNDS; round++) {
		let improved = false;
		for (const candidate of movesFrom(best)) {
			const candidateCost = cost(candidate);
			if (candidateCost < bestCost) {
				best = candidate;
				bestCost = candidateCost;
				improved = true;
				break;
			}
		}
		if (!improved) break;
	}
	return best;
}

/** Every order one move away: a unit turned round, or taken out and put back elsewhere. */
function* movesFrom(rows: Rows): Generator<Rows> {
	for (let g = 0; g < rows.length; g++) {
		const row = rows[g];
		for (let i = 0; i < row.length; i++) {
			if (row[i].length > 1) {
				yield withRow(
					rows,
					g,
					row.map((unit, k) => (k === i ? [...unit].reverse() : unit))
				);
			}
			for (let j = 0; j < row.length; j++) {
				if (j === i) continue;
				const without = row.filter((_, k) => k !== i);
				yield withRow(rows, g, [...without.slice(0, j), row[i], ...without.slice(j)]);
			}
		}
	}
}

const withRow = (rows: Rows, g: number, row: string[][]): Rows =>
	rows.map((r, k) => (k === g ? row : r));

/** The same order seen in a mirror: every row and every unit back to front. */
function mirrored(rows: Rows): Rows {
	return rows.map((row) => [...row].reverse().map((unit) => [...unit].reverse()));
}

/**
 * The order with every couple whose turning round costs nothing turned husband-left, and how
 * many more of the couples that `counts` then stand husband-left than wife-left.
 */
function husbandsLeft(
	start: Rows,
	partners: ReadonlyMap<string, ReadonlySet<string>>,
	wording: ReadonlyMap<string, string | undefined>,
	cost: (order: Rows) => number,
	counts: (left: string, right: string) => boolean
): { rows: Rows; balance: number } {
	const sideOf = (unit: string[], only = (_l: string, _r: string) => true): number => {
		let balance = 0;
		for (let i = 1; i < unit.length; i++) {
			const [left, right] = [unit[i - 1], unit[i]];
			if (!partners.get(left)?.has(right) || !only(left, right)) continue;
			if (wording.get(left) === 'male' && wording.get(right) === 'female') balance++;
			if (wording.get(left) === 'female' && wording.get(right) === 'male') balance--;
		}
		return balance;
	};
	let rows = start;
	let current = cost(rows);
	for (let g = 0; g < rows.length; g++) {
		for (let i = 0; i < rows[g].length; i++) {
			const unit = rows[g][i];
			if (sideOf(unit) >= 0) continue;
			const turned = withRow(
				rows,
				g,
				rows[g].map((u, k) => (k === i ? [...u].reverse() : u))
			);
			const turnedCost = cost(turned);
			if (turnedCost <= current) {
				rows = turned;
				current = turnedCost;
			}
		}
	}
	return { rows, balance: rows.flat().reduce((sum, unit) => sum + sideOf(unit, counts), 0) };
}
