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

/** Grandparent → grandchild, the direction the row is stored in. */
export const GRANDPARENT_GRANDCHILD_TYPE_KEY = 'grandparent_grandchild';

/** Sibling: undirected, stored one way round. */
export const SIBLING_TYPE_KEY = 'sibling';

/*
 * The family terms Stella works out (docs/02 §2.4.1), as the types a household stores when it
 * confirms one. None of them is read back as a primary link — a stored cousin is a fact about
 * that pair, not something to reason onward from — so they stay out of `RESERVED_TYPE_KEYS`.
 */

/** Great-grandparent → great-grandchild, the direction the row is stored in. */
export const GREAT_GRANDPARENT_TYPE_KEY = 'great_grandparent_great_grandchild';

/** Half-sibling: undirected. Kept apart from `sibling`, which says the two are full siblings. */
export const HALF_SIBLING_TYPE_KEY = 'half_sibling';

/** Aunt or uncle → niece or nephew, the direction the row is stored in. */
export const AUNT_UNCLE_TYPE_KEY = 'aunt_uncle_niece_nephew';

/** Cousin: undirected. */
export const COUSIN_TYPE_KEY = 'cousin';

/** Parent-in-law → child-in-law, the direction the row is stored in. */
export const PARENT_IN_LAW_TYPE_KEY = 'parent_in_law_child_in_law';

/** Sibling-in-law: undirected. */
export const SIBLING_IN_LAW_TYPE_KEY = 'sibling_in_law';

/**
 * Which type a suggested link is stored as. A rule names a *relation*; the form that confirms
 * it has to name a type, and this is the one place the two vocabularies meet — so a rule that
 * starts offering siblings cannot quietly go on writing parent links.
 */
export const TYPE_KEY_FOR_RELATION: Readonly<Record<'parent' | 'sibling', string>> = {
	parent: PARENT_CHILD_TYPE_KEY,
	sibling: SIBLING_TYPE_KEY
};

/** Either of these makes someone a partner for kinship purposes. */
export const PARTNER_TYPE_KEYS: readonly string[] = ['partner', 'spouse'];

/**
 * The types that run down the generations, where the flipped pair cannot be true: nobody is
 * their own parent's parent (docs/02 §2.4). A household's own directed type is left out on
 * purpose — two people really can each be the other's landlord, and Stella does not know
 * enough about a type somebody named to call that a mistake.
 */
export const GENERATION_TYPE_KEYS: readonly string[] = [
	PARENT_CHILD_TYPE_KEY,
	GRANDPARENT_GRANDCHILD_TYPE_KEY,
	GREAT_GRANDPARENT_TYPE_KEY,
	AUNT_UNCLE_TYPE_KEY,
	PARENT_IN_LAW_TYPE_KEY
];
