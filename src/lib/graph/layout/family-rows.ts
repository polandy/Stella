import { PARENT_CHILD_TYPE_KEY } from '../../relationships/type-keys';
import type { GraphEdge, GraphModel } from '../model/types';
import type { Point, SizeOf } from './geometry';
import { barSpans, crossingBars, type BarSpan } from './tree-lines';
import { barycentreOrder, husbandsLeft, improve, mirrored, type Rows } from './row-order';
import { inRememberedOrder, orderBreaks, type RowOrders } from './tree-order';

/*
 * The order of each row of one family in the family tree (docs/dev/05 §5.8). Pure. A row is a list
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
 * their mother's on the right, as a family tree is usually drawn. A row the reader ordered by
 * dragging (`tree-order.ts`) keeps that order above all else. The search itself is
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
/** Somebody amid another family's children — a partner amid their siblings — is worse still. */
const STRANGER_WEIGHT = 1e7;
/** A remembered order outweighs any crossing: what the reader dragged into place stays. */
const ORDER_WEIGHT = 1e10;

/** One family's arrangement: where each member stands, and the rows' units left to right. */
export interface FamilyArrangement {
	x: Map<string, number>;
	rows: Rows;
}

/** Horizontal position of each member of one family, ordered row by row. */
export function arrangeFamily(
	model: GraphModel,
	family: ReadonlyMap<string, number>,
	neighbours: ReadonlyMap<string, ReadonlySet<string>>,
	partners: ReadonlyMap<string, ReadonlySet<string>>,
	sizeOf: SizeOf,
	spacing: RowSpacing,
	orders: RowOrders = []
): FamilyArrangement {
	const wording = new Map(model.nodes.map((n) => [n.id, n.wording] as const));
	const familyEdges = model.edges.filter((e) => family.has(e.source) && family.has(e.target));
	const members = new Set(family.keys());

	// Rows of units: a couple, two parents of the same children, or a longer chain of either is
	// one unit that moves together.
	const together = couplesOf(family, familyEdges, partners);
	let rows: Rows = [];
	const assigned = new Set<string>();
	for (const node of model.nodes) {
		const generation = family.get(node.id);
		if (generation === undefined || assigned.has(node.id)) continue;
		const unit = chainOf(node.id, together);
		for (const id of unit) assigned.add(id);
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
		return (
			orderBreaks(order, orders) * ORDER_WEIGHT +
			crossingBars(spans) * CROSSING_WEIGHT +
			strangersAmong(spans, positions) * STRANGER_WEIGHT +
			length
		);
	};

	rows = inRememberedOrder(barycentreOrder(rows, family, neighbours, place), orders);
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
	const asIs = husbandsLeft(rows, together, wording, cost, counts);
	const mirror = husbandsLeft(mirrored(rows), together, wording, cost, counts);
	const mirrorKeepsOrders = orderBreaks(mirror.rows, orders) <= orderBreaks(asIs.rows, orders);
	const chosen = mirror.balance > asIs.balance && mirrorKeepsOrders ? mirror.rows : asIs.rows;
	const x = straightened(chosen, place(chosen), familyEdges, family, sizeOf, spacing, (x) =>
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
	return { x, rows: chosen };
}

/**
 * Who stands beside whom in one unit: partners, and two parents of the same child on one row,
 * a partnership entered or not.
 */
function couplesOf(
	family: ReadonlyMap<string, number>,
	familyEdges: readonly GraphEdge[],
	partners: ReadonlyMap<string, ReadonlySet<string>>
): Map<string, Set<string>> {
	const together = new Map<string, Set<string>>();
	const link = (a: string, b: string) => {
		if (a === b || family.get(a) !== family.get(b)) return;
		for (const [from, to] of [
			[a, b],
			[b, a]
		]) {
			if (!together.has(from)) together.set(from, new Set());
			together.get(from)!.add(to);
		}
	};
	for (const [id, others] of partners) {
		if (family.has(id)) for (const other of others) if (family.has(other)) link(id, other);
	}
	const parentsOf = new Map<string, string[]>();
	for (const e of familyEdges) {
		if (e.typeKey !== PARENT_CHILD_TYPE_KEY) continue;
		parentsOf.set(e.target, [...(parentsOf.get(e.target) ?? []), e.source]);
	}
	for (const parents of parentsOf.values()) {
		for (let i = 0; i < parents.length; i++) {
			for (let j = i + 1; j < parents.length; j++) link(parents[i], parents[j]);
		}
	}
	return together;
}

/**
 * Everybody linked to `start` through `together`, in the order of the chain they make — from
 * one end, so somebody with children by two others stands between them.
 */
function chainOf(start: string, together: ReadonlyMap<string, ReadonlySet<string>>): string[] {
	const reached = [start];
	for (let i = 0; i < reached.length; i++) {
		for (const next of together.get(reached[i]) ?? []) {
			if (!reached.includes(next)) reached.push(next);
		}
	}
	const end = reached.find((id) => (together.get(id)?.size ?? 0) <= 1) ?? start;
	const chain = [end];
	for (let i = 0; i < chain.length; i++) {
		for (const next of together.get(chain[i]) ?? []) {
			if (!chain.includes(next)) chain.push(next);
		}
	}
	return chain;
}

/**
 * How many times somebody stands among a bar's children who does not hang from it: on their
 * row, between the outermost two — a partner amid their partner's siblings.
 */
function strangersAmong(spans: readonly BarSpan[], positions: ReadonlyMap<string, Point>): number {
	let strangers = 0;
	for (const span of spans) {
		const xs = span.children.map((id) => positions.get(id)!.x);
		const [left, right, row] = [
			Math.min(...xs),
			Math.max(...xs),
			positions.get(span.children[0])!.y
		];
		for (const [id, p] of positions) {
			if (p.y === row && p.x > left && p.x < right && !span.children.includes(id)) strangers++;
		}
	}
	return strangers;
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

	// From the top down: straightening a drop may move its parents' unit, so the drop over them
	// is straightened first, or the one beneath would be left pointing where they used to stand.
	const generationOf = (key: string) => family.get(key.split('+')[0])!;
	const topDown = [...byDrop].sort(([a], [b]) => generationOf(a) - generationOf(b));
	// The units a straight drop already rests on: moving one again would bend that drop — a
	// couple whose partners each hang from a lone parent of their own would line up under the
	// second and leave the first askew.
	const settled = new Set<string[]>();
	for (const [key, children] of topDown) {
		if (children.length !== 1) continue;
		const parents = key.split('+');
		const parentUnit = unitOf(parents[0]);
		// One drop: a lone parent, or partners standing side by side in one unit.
		if (!parents.every((p) => parentUnit.includes(p))) continue;
		const dropX = parents.reduce((sum, p) => sum + x.get(p)!, 0) / parents.length;
		const child = children[0];
		const delta = dropX - x.get(child)!;
		const childUnit = unitOf(child);
		const straight =
			delta === 0 ||
			(!settled.has(childUnit) && fits(childUnit, delta) && move(childUnit, delta)) ||
			(parents.length === 1 &&
				parentUnit.length === 1 &&
				!settled.has(parentUnit) &&
				fits(parentUnit, -delta) &&
				move(parentUnit, -delta));
		if (straight) {
			settled.add(childUnit);
			settled.add(parentUnit);
		}
	}
	return x;
}
