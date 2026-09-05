/*
 * Browsing circles (docs/02 §2.4.2): a typed query over name and description, plus one chip per
 * kind that is actually there. Pure and client-safe — a household has few enough circles that
 * the page filters what it already has instead of asking the server on every keystroke.
 */

/** What browsing needs of a circle; the page's own type carries more. */
export interface BrowsableCircle {
	id: string;
	name: string;
	kind: string;
	description: string | null;
}

/** The chip that turns the kind filter off. */
export const ALL_KINDS = 'all';

/** What the chip row shows: the kind, its label, and how many the query left in it. */
export interface KindChip {
	kind: string;
	label: string;
	count: number;
}

/** Lower-case with accents stripped, so `Bühl` is found by `buhl`. */
function fold(value: string): string {
	return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function matchesQuery(circle: BrowsableCircle, folded: string): boolean {
	if (folded === '') return true;
	return fold(circle.name).includes(folded) || fold(circle.description ?? '').includes(folded);
}

/** The circles a query and a kind leave, in the order they came in. */
export function filterCircles<T extends BrowsableCircle>(
	circles: T[],
	filter: { query: string; kind: string }
): T[] {
	const folded = fold(filter.query.trim());
	return circles.filter(
		(circle) =>
			matchesQuery(circle, folded) && (filter.kind === ALL_KINDS || circle.kind === filter.kind)
	);
}

/**
 * One chip per kind present in what the query left, counted so no chip leads to an empty
 * page, and *All* first with the total. Kinds are listed alphabetically: the set is small and
 * a stable order matters more than frequency, which would make the row jump as you type.
 */
export function kindChips(circles: BrowsableCircle[], query: string): KindChip[] {
	const matching = filterCircles(circles, { query, kind: ALL_KINDS });
	const counts = new Map<string, number>();
	for (const circle of matching) counts.set(circle.kind, (counts.get(circle.kind) ?? 0) + 1);
	const kinds = [...counts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
	return [
		{ kind: ALL_KINDS, label: 'All', count: matching.length },
		...kinds.map(([kind, count]) => ({ kind, label: kind, count }))
	];
}

/**
 * The kind actually in force: the chosen one while the chips still offer it, otherwise *All*.
 * A kind the query has filtered away would leave the page empty with no chip pressed.
 */
export function activeKind(chips: KindChip[], chosen: string): string {
	return chips.some((chip) => chip.kind === chosen) ? chosen : ALL_KINDS;
}
