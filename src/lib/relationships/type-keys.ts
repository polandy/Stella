/*
 * The keys of the relationship types Stella seeds (docs/02 §2.4). Most types are just rows,
 * but a few are reasoned about by name — which links count as primary for kinship inference,
 * and which type a propagation suggestion stores — so the literals have one home instead of
 * being written out again in every caller.
 *
 * A seeded type's row id **is** its key (`relationship-types.ts` builds them that way), which
 * is why the same constant serves a `key` comparison here and a `typeId` posted by a form.
 */

/** Parent → child, the direction the row is stored in. */
export const PARENT_CHILD_TYPE_KEY = 'parent_child';

/** Sibling: undirected, stored one way round. */
export const SIBLING_TYPE_KEY = 'sibling';

/** Either of these makes someone a partner for kinship purposes. */
export const PARTNER_TYPE_KEYS: readonly string[] = ['partner', 'spouse'];
