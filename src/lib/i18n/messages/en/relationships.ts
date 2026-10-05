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
	'relationshipTypes.replaced': (p: { label: string }) =>
		`Stella now has “${p.label}” built in, so this one shows up twice in the picker.`,
	'relationshipTypes.mergeInto': (p: { label: string }) => `Merge into ${p.label}`,
	'relationshipTypes.mergeLabel': 'Merge into another type',
	'relationshipTypes.mergeHint':
		'Moves every relationship of this type onto the one you pick, then removes this one. Where two people are already linked by both, they keep one link.',
	'relationshipTypes.merge': 'Merge',
	'relationshipTypes.merged': 'Relationship types merged',
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
	'relationships.blocked.romanticTaken': (p: { name: string; partner: string }) =>
		`${p.name} is already with ${p.partner}`,
	'relationships.blocked.parentsComplete': (p: { name: string; max: number }) =>
		`${p.name} already has ${p.max} parents`,

	'relationships.status.current': 'current',
	'relationships.status.former': 'former',

	/*
	 * Who somebody is to the person whose page lists them (docs/05 §5.5): the far end of a tie as
	 * a noun, gendered where their gender is on record. Family terms the kinship engine also
	 * uses are said in its words (`kinship.term.*`); these are the rest.
	 */

	'relationships.role.parent.male': 'Father',
	'relationships.role.parent.female': 'Mother',
	'relationships.role.parent.neutral': 'Parent',
	'relationships.role.child.male': 'Son',
	'relationships.role.child.female': 'Daughter',
	'relationships.role.child.neutral': 'Child',
	'relationships.role.partner.male': 'Partner',
	'relationships.role.partner.female': 'Partner',
	'relationships.role.partner.neutral': 'Partner',
	'relationships.role.spouse.male': 'Husband',
	'relationships.role.spouse.female': 'Spouse',
	'relationships.role.spouse.neutral': 'Spouse',
	'relationships.role.friend.male': 'Friend',
	'relationships.role.friend.female': 'Friend',
	'relationships.role.friend.neutral': 'Friend',
	'relationships.role.colleague.male': 'Colleague',
	'relationships.role.colleague.female': 'Colleague',
	'relationships.role.colleague.neutral': 'Colleague',
	'relationships.role.mentor.male': 'Mentor',
	'relationships.role.mentor.female': 'Mentor',
	'relationships.role.mentor.neutral': 'Mentor',
	'relationships.role.mentee.male': 'Mentee',
	'relationships.role.mentee.female': 'Mentee',
	'relationships.role.mentee.neutral': 'Mentee',
	'relationships.role.neighbor.male': 'Neighbor',
	'relationships.role.neighbor.female': 'Neighbor',
	'relationships.role.neighbor.neutral': 'Neighbor',
	'relationships.role.acquaintance.male': 'Acquaintance',
	'relationships.role.acquaintance.female': 'Acquaintance',
	'relationships.role.acquaintance.neutral': 'Acquaintance',
	'relationships.role.knows.male': 'Acquainted',
	'relationships.role.knows.female': 'Acquainted',
	'relationships.role.knows.neutral': 'Acquainted',
	'relationships.role.connected.male': 'Connected',
	'relationships.role.connected.female': 'Connected',
	'relationships.role.connected.neutral': 'Connected',

	'relationships.type.parent_child.forward': 'Parent of',
	'relationships.type.parent_child.reverse': 'Child of',
	'relationships.type.grandparent_grandchild.forward': 'Grandparent of',
	'relationships.type.grandparent_grandchild.reverse': 'Grandchild of',
	'relationships.type.great_grandparent_great_grandchild.forward': 'Great-grandparent of',
	'relationships.type.great_grandparent_great_grandchild.reverse': 'Great-grandchild of',
	'relationships.type.half_sibling.forward': 'Half-sibling of',
	'relationships.type.half_sibling.reverse': 'Half-sibling of',
	'relationships.type.aunt_uncle_niece_nephew.forward': 'Aunt / uncle of',
	'relationships.type.aunt_uncle_niece_nephew.reverse': 'Niece / nephew of',
	'relationships.type.cousin.forward': 'Cousin of',
	'relationships.type.cousin.reverse': 'Cousin of',
	'relationships.type.parent_in_law_child_in_law.forward': 'Parent-in-law of',
	'relationships.type.parent_in_law_child_in_law.reverse': 'Child-in-law of',
	'relationships.type.sibling_in_law.forward': 'Sibling-in-law of',
	'relationships.type.sibling_in_law.reverse': 'Sibling-in-law of',
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
	'relationships.type.other.reverse': 'Connected to',
	// The same link when its other end is the viewer's own person (docs/02 §2.2.3).
	'relationships.towardsYou.parent_child.forward': 'Your parent',
	'relationships.towardsYou.parent_child.reverse': 'Your child',
	'relationships.towardsYou.grandparent_grandchild.forward': 'Your grandparent',
	'relationships.towardsYou.grandparent_grandchild.reverse': 'Your grandchild',
	'relationships.towardsYou.great_grandparent_great_grandchild.forward': 'Your great-grandparent',
	'relationships.towardsYou.great_grandparent_great_grandchild.reverse': 'Your great-grandchild',
	'relationships.towardsYou.half_sibling.forward': 'Your half-sibling',
	'relationships.towardsYou.half_sibling.reverse': 'Your half-sibling',
	'relationships.towardsYou.aunt_uncle_niece_nephew.forward': 'Your aunt / uncle',
	'relationships.towardsYou.aunt_uncle_niece_nephew.reverse': 'Your niece / nephew',
	'relationships.towardsYou.cousin.forward': 'Your cousin',
	'relationships.towardsYou.cousin.reverse': 'Your cousin',
	'relationships.towardsYou.parent_in_law_child_in_law.forward': 'Your parent-in-law',
	'relationships.towardsYou.parent_in_law_child_in_law.reverse': 'Your child-in-law',
	'relationships.towardsYou.sibling_in_law.forward': 'Your sibling-in-law',
	'relationships.towardsYou.sibling_in_law.reverse': 'Your sibling-in-law',
	'relationships.towardsYou.sibling.forward': 'Your sibling',
	'relationships.towardsYou.sibling.reverse': 'Your sibling',
	'relationships.towardsYou.partner.forward': 'Your partner',
	'relationships.towardsYou.partner.reverse': 'Your partner',
	'relationships.towardsYou.spouse.forward': 'Your spouse',
	'relationships.towardsYou.spouse.reverse': 'Your spouse',
	'relationships.towardsYou.friend.forward': 'A friend of yours',
	'relationships.towardsYou.friend.reverse': 'A friend of yours',
	'relationships.towardsYou.colleague.forward': 'Your colleague',
	'relationships.towardsYou.colleague.reverse': 'Your colleague',
	'relationships.towardsYou.mentor_mentee.forward': 'Your mentor',
	'relationships.towardsYou.mentor_mentee.reverse': 'Your mentee',
	'relationships.towardsYou.neighbor.forward': 'Your neighbor',
	'relationships.towardsYou.neighbor.reverse': 'Your neighbor',
	'relationships.towardsYou.acquaintance.forward': 'An acquaintance of yours',
	'relationships.towardsYou.acquaintance.reverse': 'An acquaintance of yours',
	'relationships.towardsYou.knows.forward': 'Knows you',
	'relationships.towardsYou.knows.reverse': 'Knows you',
	'relationships.towardsYou.other.forward': 'Connected to you',
	'relationships.towardsYou.other.reverse': 'Connected to you'
};

/** The key set every translation of this area has to provide. */
export type RelationshipsMessages = typeof relationships;
