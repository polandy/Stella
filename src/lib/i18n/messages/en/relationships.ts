/*
 * Relationships: the categories, the built-in vocabulary and whether a tie still holds
 * (docs/02 §2.4). A household's own types are stored text and read as they were typed; the
 * built-in ones have stable keys, so they are translated here and shown in the viewer's
 * language wherever they appear.
 */

export const relationships = {
	'relationshipTypes.title': 'Relationship types',
	'relationshipTypes.intro':
		'The kinds of link your household can record. Add your own where the built-in ones do not say it — godparent, choir mate, landlord.',
	'relationshipTypes.own': 'Your own',
	'relationshipTypes.addType': 'Add type',
	'relationshipTypes.otherSide': (p: { label: string }) => `from the other side: ${p.label}`,
	'relationshipTypes.remove': (p: { label: string }) => `Remove the type ${p.label}`,
	'relationshipTypes.removed': 'Relationship type removed',
	'relationshipTypes.used': (p: { count: number }) => `used ${p.count}×`,
	'relationshipTypes.label': 'Label',
	'relationshipTypes.category': 'Category',
	'relationshipTypes.fromOtherSide': 'From the other side',
	'relationshipTypes.none': 'No types of your own yet.',
	'relationshipTypes.labelPlaceholder': 'Godparent of',
	'relationshipTypes.reversePlaceholder': 'Godchild of',
	'relationshipTypes.symmetric': 'Reads the same from both sides',
	'relationshipTypes.builtIn': 'Built in',
	'relationshipTypes.builtInHint':
		'These come with Stella and are the same everywhere, so the family kinship Stella works out — grandparents, cousins, in-laws — keeps meaning the same thing.',

	'relationships.category.family': 'Family',
	'relationships.category.romantic': 'Romantic',
	'relationships.category.social': 'Social',
	'relationships.category.professional': 'Work',
	'relationships.category.other': 'Other',

	/*
	 * Why an entry of the picker is greyed out (docs/02 §2.4) — a few words beside the label,
	 * where the refusal at the write is a whole sentence saying what to do about it
	 * (`errors.relationship.*`).
	 */
	/** The heading over a run of entries that cannot be picked, carrying the reason once. */
	'relationships.blocked.group': (p: { reason: string }) => `Not possible — ${p.reason}`,
	'relationships.blocked.alreadyTied': (p: { tie: string; name: string }) =>
		`already ${p.tie} ${p.name}`,
	/** For a refusal that names no link — the wording above is the one a reader should meet. */
	'relationships.blocked.alreadyRomantic': (p: { name: string }) => `already with ${p.name}`,
	'relationships.blocked.siblingDerived': 'already siblings through their parents',
	'relationships.blocked.romanticTaken': (p: { name: string; partner: string }) =>
		`${p.name} is already with ${p.partner}`,
	'relationships.blocked.parentsComplete': (p: { name: string; max: number }) =>
		`${p.name} already has ${p.max} parents`,

	'relationships.status.current': 'current',
	'relationships.status.former': 'former',

	'relationships.type.parent_child.forward': 'Parent of',
	'relationships.type.parent_child.reverse': 'Child of',
	'relationships.type.grandparent_grandchild.forward': 'Grandparent of',
	'relationships.type.grandparent_grandchild.reverse': 'Grandchild of',
	'relationships.type.sibling.forward': 'Sibling of',
	'relationships.type.sibling.reverse': 'Sibling of',
	'relationships.type.partner.forward': 'Partner of',
	'relationships.type.partner.reverse': 'Partner of',
	'relationships.type.spouse.forward': 'Spouse of',
	'relationships.type.spouse.reverse': 'Spouse of',
	'relationships.type.friend.forward': 'Friend of',
	'relationships.type.friend.reverse': 'Friend of',
	'relationships.type.colleague.forward': 'Colleague of',
	'relationships.type.colleague.reverse': 'Colleague of',
	'relationships.type.mentor_mentee.forward': 'Mentor of',
	'relationships.type.mentor_mentee.reverse': 'Mentee of',
	'relationships.type.neighbor.forward': 'Neighbor of',
	'relationships.type.neighbor.reverse': 'Neighbor of',
	'relationships.type.acquaintance.forward': 'Acquaintance of',
	'relationships.type.acquaintance.reverse': 'Acquaintance of',
	'relationships.type.knows.forward': 'Knows',
	'relationships.type.knows.reverse': 'Knows',
	'relationships.type.other.forward': 'Connected to',
	'relationships.type.other.reverse': 'Connected to'
};

/** The key set every translation of this area has to provide. */
export type RelationshipsMessages = typeof relationships;
