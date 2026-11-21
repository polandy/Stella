import { PARENT_CHILD_TYPE_KEY } from '../../relationships/type-keys';
import { looseRelatives } from '../model/loose-relatives';
import type { GraphEdge, GraphModel } from '../model/types';
import type { Point, SizeOf } from './geometry';
import { pairOrderBreaks, parentKindOf } from './parent-pairs';
import { atRowEnds } from './row-ends';
import { barSpans, crossingBars, hangings, type BarSpan } from './bar-spans';
import { clearOfCouples, straightened, towardHome } from './row-nudges';
import { barycentreOrder, husbandsLeft, improve, mirrored, type Rows } from './row-order';
import { inRememberedOrder, orderBreaks, type RowOrders } from './tree-order';

/*
 * The order of each row of one family in the family tree (docs/dev/05 §5.8). Pure. A row is a list
 * of units — a couple, two parents of the same children, or a longer chain of either, moves
 * together — and the order is chosen so that nobody stands amid another family's children (a
 * partner who married in stands at the edge of the siblings) and every couple's bar over their
 * children stands clear of every other couple's: then no family's drop runs through another
 * family's bar, siblings stand side by side, and each child's family hangs under its own parents.
 *
 * It starts from the usual barycentre passes (each unit under the mean of its neighbours on
 * the row above, then over the row below) and then improves the order by moving one unit at a
 * time — anywhere on its row, or turned round — for as long as that takes somebody out from
 * among strangers, removes a crossing, puts a child's parent pairs in their order (the family
 * the child lives with nearest, `parent-pairs.ts`) or draws the bars shorter. Last, of the
 * order and its mirror image, it keeps the one with more husbands to the left of their wives, so a person's
 * father's family stands on the left and their mother's on the right, as a family tree is
 * usually drawn. A row the reader ordered by
 * dragging (`tree-order.ts`) keeps that order above all else. The search itself is
 * `row-order.ts`; this file packs the rows, straightens the drops to only children and moves
 * a lone parent's children out past that parent's outer edge where the packing left them under
 * the parent's couple.
 *
 * A relative with no bar to hang from — a cousin entered with no aunt or uncle on record — takes
 * no part in the search: they stand at the end of their row, a family's distance out, on the
 * side of the parent they are related through, or on the right where no line says which
 * (`loose-relatives.ts`). Their place is the tree's, not the reader's to drag.
 */

/** Distances a row is packed with, in model units. */
export interface RowSpacing {
	/** Between two neighbours' names on a row. */
	gap: number;
	/** Extra room between one unit and the next. */
	unit: number;
	/** Between one generation's row and the next. */
	row: number;
	/** Between a row and the loose relatives at its end. */
	family: number;
}

/** A child's pairs in the wrong order outweigh any length of bar, never a crossing. */
const PAIR_ORDER_WEIGHT = 1e5;
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
	everyone: ReadonlyMap<string, number>,
	neighbours: ReadonlyMap<string, ReadonlySet<string>>,
	partners: ReadonlyMap<string, ReadonlySet<string>>,
	sizeOf: SizeOf,
	spacing: RowSpacing,
	orders: RowOrders = []
): FamilyArrangement {
	const wording = new Map(model.nodes.map((n) => [n.id, n.wording] as const));
	const allEdges = model.edges.filter((e) => everyone.has(e.source) && everyone.has(e.target));
	const loose = looseRelatives(new Set(everyone.keys()), allEdges);
	// The search orders whoever hangs from a bar; the loose stand at the rows' ends after it.
	const family = new Map([...everyone].filter(([id]) => !loose.has(id)));
	const familyEdges = allEdges.filter((e) => family.has(e.source) && family.has(e.target));
	const members = new Set(family.keys());

	// Rows of units: a couple, two co-parents, or a longer chain of either moves together.
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
		const spans = barSpans(familyEdges, positions, members, sizeOf);
		const length = spans.reduce((sum, s) => sum + s.right - s.left, 0);
		return (
			orderBreaks(order, orders) * ORDER_WEIGHT +
			crossingBars(spans) * CROSSING_WEIGHT +
			strangersAmong(spans, positions) * STRANGER_WEIGHT +
			pairOrderBreaks(hangings(spans, positions)) * PAIR_ORDER_WEIGHT +
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
	const positionsAt = (x: ReadonlyMap<string, number>) =>
		new Map(
			[...family].map(([id, generation]) => [id, { x: x.get(id)!, y: generation * spacing.row }])
		);
	const spansAt = (x: ReadonlyMap<string, number>) =>
		barSpans(familyEdges, positionsAt(x), members, sizeOf);
	const crossingsAt = (x: ReadonlyMap<string, number>) => crossingBars(spansAt(x));
	const breaksAt = (x: ReadonlyMap<string, number>) =>
		pairOrderBreaks(hangings(spansAt(x), positionsAt(x)));
	const x = straightened(chosen, place(chosen), familyEdges, family, sizeOf, spacing, crossingsAt);
	clearOfCouples(chosen, x, family, sizeOf, spacing, spansAt, crossingsAt);
	towardHome(chosen, x, family, sizeOf, spacing, spansAt, crossingsAt, breaksAt);
	atRowEnds(x, loose, everyone, allEdges, sizeOf, spacing);
	return { x, rows: chosen };
}

/**
 * Who stands beside whom in a unit: partners, and two parents of one child on one row of one
 * kind — a child's foster parent and biological parents are no unit for that child.
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
		const pair = `${e.target}|${parentKindOf(e)}`;
		parentsOf.set(pair, [...(parentsOf.get(pair) ?? []), e.source]);
	}
	for (const parents of parentsOf.values()) {
		for (let i = 0; i < parents.length; i++) {
			for (let j = i + 1; j < parents.length; j++) link(parents[i], parents[j]);
		}
	}
	return together;
}

/** Everybody linked to `start` through `together`, walked from one end of their chain. */
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

/** How often somebody stands between a bar's outermost children without hanging from it. */
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
