import type { PreferenceStorage } from './density-preference';
import type { RowOrders } from './layout/tree-order';

/*
 * The adapter that keeps, per device, the row orders a reader dragged the family tree into —
 * for each centre person's tree its own (docs/dev/05 §5.8). Only the most recent trees are
 * kept, so the entry cannot grow without end.
 */

const KEY = 'stella.graph.treeOrders';
/** The most trees whose orders are kept; the longest untouched goes first. */
export const KEPT_TREES = 50;

export interface TreeOrderPreference {
	load(centre: string): RowOrders;
	save(centre: string, orders: RowOrders): void;
}

type Kept = [centre: string, orders: string[][]][];

/** What a stored entry says, or nothing where it is missing, damaged or of another shape. */
function parse(raw: string | null): Kept {
	if (!raw) return [];
	try {
		const value: unknown = JSON.parse(raw);
		if (!Array.isArray(value)) return [];
		return value.filter(
			(entry): entry is Kept[number] =>
				Array.isArray(entry) &&
				typeof entry[0] === 'string' &&
				Array.isArray(entry[1]) &&
				entry[1].every(
					(order: unknown) =>
						Array.isArray(order) && order.every((id: unknown) => typeof id === 'string')
				)
		);
	} catch {
		return [];
	}
}

export function treeOrderPreference(storage: PreferenceStorage): TreeOrderPreference {
	const read = (): Kept => {
		try {
			return parse(storage.getItem(KEY));
		} catch {
			// Storage can be blocked (private mode, a site setting); nothing is remembered then.
			return [];
		}
	};
	return {
		load(centre) {
			return read().find(([c]) => c === centre)?.[1] ?? [];
		},
		save(centre, orders) {
			const rest = read().filter(([c]) => c !== centre);
			const entry: Kept[number] = [centre, orders.map((o) => [...o])];
			const kept = [...rest, entry].slice(-KEPT_TREES);
			try {
				storage.setItem(KEY, JSON.stringify(kept));
			} catch {
				// Not remembered, still kept for this visit.
			}
		}
	};
}
