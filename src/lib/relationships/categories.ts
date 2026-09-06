/*
 * What kind of tie a relationship type describes (docs/03 §relationship_type). The category
 * groups the picker and gives the link its fixed accent in the graph, so both the domain and
 * the interface need the same closed list — it lives here, beside the type keys, because a
 * component cannot import from `$lib/server`.
 */

export const RELATIONSHIP_CATEGORIES = [
	'family',
	'romantic',
	'social',
	'professional',
	'other'
] as const;

/** One of `RELATIONSHIP_CATEGORIES`. */
export type RelationshipCategory = (typeof RELATIONSHIP_CATEGORIES)[number];
