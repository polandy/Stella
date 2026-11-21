/*
 * The kind of a parent link (docs/dev/02 §2.4): one `parent_child` type, told apart by kind, so
 * the tree, the kinship engine and the exclusion rules keep reading one parent type. A client-safe
 * module, like `status.ts`, because the person page offers the choice.
 */

export const PARENT_KINDS = ['biological', 'adoptive', 'foster', 'step'] as const;

export type ParentKind = (typeof PARENT_KINDS)[number];

/** What every parent link is unless said otherwise, and what the migration gave the old ones. */
export const BIOLOGICAL_PARENT_KIND: ParentKind = 'biological';

/** A child has at most two of each of these; foster and step families can follow one another. */
const MAX_PARENTS_OF_KIND: Readonly<Record<ParentKind, number | null>> = {
	biological: 2,
	adoptive: 2,
	foster: null,
	step: null
};

/** How many parents of `kind` a child may have, or null when the kind has no limit. */
export const maxParentsOf = (kind: ParentKind): number | null => MAX_PARENTS_OF_KIND[kind];

export const isParentKind = (value: string): value is ParentKind =>
	(PARENT_KINDS as readonly string[]).includes(value);
