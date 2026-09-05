import type { RelationshipCategory } from '../../relationships/relationships';

/*
 * How Monica's relationship type names land in Stella (docs/02 §2.16; the full table is in
 * docs/monica-mapping.md). Monica stores every link twice, once per direction, each with its
 * own type name ("parent" on one row, "child" on the mirrored one). Stella stores one row
 * whose type carries both labels, so each Monica name resolves to a Stella type *and* which
 * side of it the `contact_is` person is on.
 */

export interface MappedRelationshipType {
	/** A built-in id from `built-in-types.ts`, or a custom key the import creates. */
	key: string;
	/** Whether `contact_is` is the forward-label side of the Stella type. */
	forward: boolean;
	/** Present only for types Stella does not have built in. */
	custom?: {
		forwardLabel: string;
		reverseLabel: string;
		category: RelationshipCategory;
		symmetric: boolean;
	};
}

const sym = (
	key: string,
	label: string,
	category: RelationshipCategory
): MappedRelationshipType => ({
	key,
	forward: true,
	custom: { forwardLabel: label, reverseLabel: label, category, symmetric: true }
});

const asym = (
	key: string,
	forwardLabel: string,
	reverseLabel: string,
	category: RelationshipCategory,
	forward: boolean
): MappedRelationshipType => ({
	key,
	forward,
	custom: { forwardLabel, reverseLabel, category, symmetric: false }
});

const builtIn = (key: string, forward = true): MappedRelationshipType => ({ key, forward });

/** Monica type name → Stella type. Names Monica ships by default in every account. */
export const MONICA_RELATIONSHIP_TYPES: Readonly<Record<string, MappedRelationshipType>> = {
	partner: builtIn('partner'),
	spouse: builtIn('spouse'),
	date: sym('dating', 'Dating', 'romantic'),
	lover: sym('lover', 'Lover of', 'romantic'),
	inlovewith: asym('in_love_with', 'In love with', 'Loved by', 'romantic', true),
	lovedby: asym('in_love_with', 'In love with', 'Loved by', 'romantic', false),
	ex: sym('ex', 'Ex of', 'romantic'),
	ex_husband: sym('ex_spouse', 'Ex-spouse of', 'romantic'),
	parent: builtIn('parent_child', true),
	child: builtIn('parent_child', false),
	sibling: builtIn('sibling'),
	grandparent: builtIn('grandparent_grandchild', true),
	grandchild: builtIn('grandparent_grandchild', false),
	uncle: asym('uncle_nephew', 'Uncle/aunt of', 'Nephew/niece of', 'family', true),
	nephew: asym('uncle_nephew', 'Uncle/aunt of', 'Nephew/niece of', 'family', false),
	cousin: sym('cousin', 'Cousin of', 'family'),
	godfather: asym('godparent_godchild', 'Godparent of', 'Godchild of', 'family', true),
	godson: asym('godparent_godchild', 'Godparent of', 'Godchild of', 'family', false),
	stepparent: asym('stepparent_stepchild', 'Step-parent of', 'Step-child of', 'family', true),
	stepchild: asym('stepparent_stepchild', 'Step-parent of', 'Step-child of', 'family', false),
	friend: builtIn('friend'),
	bestfriend: sym('best_friend', 'Best friend of', 'social'),
	colleague: builtIn('colleague'),
	boss: asym('boss_subordinate', 'Boss of', 'Reports to', 'professional', true),
	subordinate: asym('boss_subordinate', 'Boss of', 'Reports to', 'professional', false),
	mentor: builtIn('mentor_mentee', true),
	protege: builtIn('mentor_mentee', false)
};

/**
 * Resolve a Monica type name. A name Monica does not ship (a user-defined type) becomes a
 * symmetric custom type carrying the name as its label, so nothing is dropped.
 */
export function mapRelationshipType(name: string): MappedRelationshipType {
	const known = MONICA_RELATIONSHIP_TYPES[name];
	if (known) return known;
	const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'other';
	const label = name.charAt(0).toUpperCase() + name.slice(1);
	return sym(key, label, 'other');
}
