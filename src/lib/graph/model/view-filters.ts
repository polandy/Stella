import type { GraphFilters } from './types';

/*
 * The kinds of line the Filter menu switches (docs/05 §5.8), and what the switched-on ones
 * ask of `applyFilters`. The menu draws each in its colour and line style; this decides which
 * lines a set of switches keeps, so it tests without the menu.
 */

/** Every kind the Filter menu offers, in the order it lists them. */
export const FILTER_KEYS = [
	'family',
	'romantic',
	'social',
	'professional',
	'circles',
	'kinship'
] as const;

export type FilterKey = (typeof FILTER_KEYS)[number];

/*
 * Circles are people's shared contexts, not people: on the route they belong in the picture,
 * on a person's card they double the node count for something the profile already lists.
 * The chip is there either way, so switching them on is one click (docs/05 §5.5).
 */
export function openingFilterKeys(compact: boolean): ReadonlySet<string> {
	return new Set(FILTER_KEYS.filter((key) => !(compact && key === 'circles')));
}

/** What `applyFilters` keeps for the kinds switched on in `active`, never dropping the centre. */
export function graphFiltersFor(
	active: ReadonlySet<string>,
	centerId: string | null
): GraphFilters {
	const categories = (['family', 'romantic', 'social', 'professional'] as const).filter((c) =>
		active.has(c)
	);
	const edgeKinds: GraphFilters['edgeKinds'] = [];
	if (categories.length) edgeKinds.push('relationship');
	if (active.has('circles')) edgeKinds.push('membership');
	if (active.has('kinship')) edgeKinds.push('kinship');
	return { edgeKinds, categories, keepNodeId: centerId ?? undefined };
}
