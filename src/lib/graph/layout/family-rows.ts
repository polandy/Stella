import { PARENT_CHILD_TYPE_KEY } from '../../relationships/type-keys';
import type { GraphEdge, GraphModel } from '../model/types';
import type { SizeOf } from './geometry';
import { barSpans, crossingBars } from './tree-lines';
import { barycentreOrder, husbandsLeft, improve, mirrored, type Rows } from './row-order';

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
 * their mother's on the right, as a family tree is usually drawn. The search itself is
 * `row-order.ts`; this file packs the rows and straightens the drops to only children.
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

/** A crossing outweighs any length of bar: the search never buys shorter bars with one. */
const CROSSING_WEIGHT = 1e6;

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
	const chosen = mirror.balance > asIs.balance ? mirror.rows : asIs.rows;
	return straightened(chosen, place(chosen), familyEdges, family, sizeOf, spacing, (x) =>
		crossingBars(
			barSpans(
				familyEdges,
				new Map(
					[...family].map(([id, generation]) => [
						id,
						{ x: x.get(id)!, y: generation * spacing.row }
					])
				),
				members
			)
		)
	);
}

/**
 * The positions with every only child's drop made one straight line: the child set right under
 * the parents' drop, or — where the child's row has no room — a lone parent set right over the
 * child. A move is kept only where it keeps every name its gap from its neighbours and adds no
 * crossing; otherwise the drop keeps its small jog.
 */
function straightened(
	rows: Rows,
	start: Map<string, number>,
	familyEdges: readonly GraphEdge[],
	family: ReadonlyMap<string, number>,
	sizeOf: SizeOf,
	spacing: RowSpacing,
	crossings: (x: ReadonlyMap<string, number>) => number
): Map<string, number> {
	const x = new Map(start);
	const parentsOf = new Map<string, string[]>();
	for (const e of familyEdges) {
		if (e.typeKey !== PARENT_CHILD_TYPE_KEY) continue;
		if (family.get(e.source) !== family.get(e.target)! - 1) continue;
		parentsOf.set(e.target, [...(parentsOf.get(e.target) ?? []), e.source]);
	}
	const byDrop = new Map<string, string[]>();
	for (const [child, parents] of parentsOf) {
		const key = [...parents].sort().join('+');
		byDrop.set(key, [...(byDrop.get(key) ?? []), child]);
	}
	const unitOf = (id: string) => rows.flat().find((unit) => unit.includes(id))!;
	const rowOf = (id: string) => rows[family.get(id)!];
	/** Whether moving `unit` by `delta` keeps it its gap clear of the units beside it. */
	const fits = (unit: string[], delta: number) => {
		const edges = (u: string[]) => ({
			left: Math.min(...u.map((id) => x.get(id)! - sizeOf(id).width / 2)),
			right: Math.max(...u.map((id) => x.get(id)! + sizeOf(id).width / 2))
		});
		const moved = edges(unit);
		const [left, right] = [moved.left + delta, moved.right + delta];
		return rowOf(unit[0])
			.filter((other) => other !== unit)
			.every((other) => {
				const box = edges(other);
				return box.right + spacing.gap <= left || right + spacing.gap <= box.left;
			});
	};
	const move = (unit: string[], delta: number) => {
		const before = crossings(x);
		for (const id of unit) x.set(id, x.get(id)! + delta);
		if (crossings(x) <= before) return true;
		for (const id of unit) x.set(id, x.get(id)! - delta);
		return false;
	};

	for (const [key, children] of byDrop) {
		if (children.length !== 1) continue;
		const parents = key.split('+');
		const parentUnit = unitOf(parents[0]);
		// One drop: a lone parent, or partners standing side by side in one unit.
		if (!parents.every((p) => parentUnit.includes(p))) continue;
		const dropX = parents.reduce((sum, p) => sum + x.get(p)!, 0) / parents.length;
		const child = children[0];
		const delta = dropX - x.get(child)!;
		if (delta === 0) continue;
		const childUnit = unitOf(child);
		if (fits(childUnit, delta) && move(childUnit, delta)) continue;
		if (parents.length === 1 && parentUnit.length === 1 && fits(parentUnit, -delta)) {
			move(parentUnit, -delta);
		}
	}
	return x;
}
