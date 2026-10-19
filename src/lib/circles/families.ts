import { ALL_KINDS, matchesCircleQuery } from './browse';
import { isPastCircle, type CircleTree, type TreeCircle } from './tree';

/*
 * The Circles list as families (docs/02 §2.4.2): a card per top-level circle, its direct
 * sub-circles as rows inside it — current and future ones shown, past ones behind a toggle.
 * Search and the kind chips reach into every family at any depth. Pure and client-safe, like
 * the rest of browsing.
 */

/** A sub-circle as a row of its parent's card. */
export interface CircleRow<T extends TreeCircle> {
	circle: T;
	/** Its own visible sub-circles at any depth, shown as "+N inside". */
	descendantCount: number;
}

/** One card of the list. */
export interface CircleFamily<T extends TreeCircle> {
	/** The top-level circle the card is. */
	circle: T;
	/** Rows shown right away. */
	rows: CircleRow<T>[];
	/** Rows of sub-circles that are over, behind the "show N past" toggle. */
	pastRows: CircleRow<T>[];
	/** Hidden private sub-circles, as "+N more" under the rows. */
	hiddenCount: number;
	/** Its direct sub-circles, hidden ones included, for the meta line. */
	childCount: number;
}

/** What the list is filtered by, and the day that decides which rows are past. */
export interface FamilyFilter {
	query: string;
	kind: string;
	/** YYYY-MM-DD. */
	today: string;
}

/** The cards for `filter`, in sibling order; a family nothing in matches is left out. */
export function circleFamilies<T extends TreeCircle>(
	tree: CircleTree<T>,
	filter: FamilyFilter
): CircleFamily<T>[] {
	const row = (circle: T): CircleRow<T> => ({
		circle,
		descendantCount: tree.descendants(circle.id).length
	});
	const families: CircleFamily<T>[] = [];

	for (const top of tree.topLevel()) {
		const below = tree.descendants(top.id);
		if (filter.kind !== ALL_KINDS && ![top, ...below].some((c) => c.kind === filter.kind)) continue;

		const family = { circle: top, childCount: tree.childCount(top.id) };
		if (matchesCircleQuery(top, filter.query)) {
			const children = tree.children(top.id);
			families.push({
				...family,
				rows: children.filter((c) => !isPastCircle(c, filter.today)).map(row),
				pastRows: children.filter((c) => isPastCircle(c, filter.today)).map(row),
				hiddenCount: top.hiddenChildCount
			});
			continue;
		}

		// The parent itself does not match: only the hits, at any depth, past ones included.
		const hits = below.filter((c) => matchesCircleQuery(c, filter.query));
		if (hits.length > 0)
			families.push({ ...family, rows: hits.map(row), pastRows: [], hiddenCount: 0 });
	}
	return families;
}
