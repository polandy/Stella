import type { Point } from './geometry';
import type { Rows } from './row-order';

/*
 * The order a reader gives the family tree by dragging (docs/dev/05 §5.8). Pure. A drop puts
 * the dragged person's unit — them and the partners beside them — at the place in their row
 * nearest where they were let go; the row's new order is remembered, and the search
 * (`family-rows.ts`) then treats every remembered order as outweighing any crossing.
 */

/** Each row the reader has ordered by dragging, its people left to right. */
export type RowOrders = readonly (readonly string[])[];

/** Each family's rows as the tree last laid them out, as units, left to right. */
export type TreeRows = readonly (readonly (readonly string[])[])[];

/**
 * The remembered orders after `id` was let go at `x`, or null when `id` stands in no family row
 * (the shelf). The dropped row's order replaces whatever was remembered for anybody in it.
 */
export function ordersAfterDrop(
	rows: TreeRows,
	positions: ReadonlyMap<string, Point>,
	id: string,
	x: number,
	orders: RowOrders
): RowOrders | null {
	const row = rows.find((r) => r.some((unit) => unit.includes(id)));
	if (!row) return null;
	const unit = row.find((u) => u.includes(id))!;
	const centre = (u: readonly string[]) =>
		u.reduce((sum, member) => sum + positions.get(member)!.x, 0) / u.length;
	// Where the unit's own middle lands, the dragged person moved by the drop and the rest with them.
	const landed = centre(unit) + x - positions.get(id)!.x;
	const others = row.filter((u) => u !== unit);
	const at = others.filter((u) => centre(u) < landed).length;
	const order = [...others.slice(0, at), unit, ...others.slice(at)].flat();
	const inRow = new Set(order);
	return [...orders.filter((o) => !o.some((member) => inRow.has(member))), order];
}

/** Rank of each remembered person: which order they are in, then where in it. */
function ranksOf(orders: RowOrders): Map<string, { order: number; at: number }> {
	const ranks = new Map<string, { order: number; at: number }>();
	orders.forEach((o, order) => o.forEach((id, at) => ranks.set(id, { order, at })));
	return ranks;
}

/** How many pairs on one row stand the other way round from a remembered order. */
export function orderBreaks(rows: Rows, orders: RowOrders): number {
	if (orders.length === 0) return 0;
	const ranks = ranksOf(orders);
	let breaks = 0;
	for (const row of rows) {
		const ranked = row.flat().flatMap((id) => {
			const rank = ranks.get(id);
			return rank ? [rank] : [];
		});
		for (let i = 0; i < ranked.length; i++) {
			for (let j = i + 1; j < ranked.length; j++) {
				if (ranked[i].order === ranked[j].order && ranked[i].at > ranked[j].at) breaks++;
			}
		}
	}
	return breaks;
}

/**
 * The rows with every remembered person's unit set in remembered order, in the places such
 * units already take; a unit nobody remembers keeps its place, so a newcomer stays free.
 */
export function inRememberedOrder(rows: Rows, orders: RowOrders): Rows {
	if (orders.length === 0) return rows;
	const ranks = ranksOf(orders);
	const keyOf = (unit: string[]) =>
		Math.min(
			...unit.map((id) => {
				const rank = ranks.get(id);
				return rank ? rank.order * 1e6 + rank.at : Infinity;
			})
		);
	return rows.map((row) => {
		const turned = row.map((unit) =>
			orderBreaks([[[...unit].reverse()]], orders) < orderBreaks([[unit]], orders)
				? [...unit].reverse()
				: unit
		);
		const slots = turned.flatMap((unit, i) => (keyOf(unit) < Infinity ? [i] : []));
		const remembered = slots.map((i) => turned[i]).sort((a, b) => keyOf(a) - keyOf(b));
		const result = [...turned];
		slots.forEach((slot, k) => (result[slot] = remembered[k]));
		return result;
	});
}
