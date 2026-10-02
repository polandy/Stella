/*
 * The relatives Stella works out rather than being told about (docs/02 §2.4.1). The engine
 * decides the term and whether it is worded male, female or neutrally; the words are here.
 */

export const kinship = {
	'kinship.term.sibling.male': 'Brother',
	'kinship.term.sibling.female': 'Sister',
	'kinship.term.sibling.neutral': 'Sibling',
	'kinship.term.half-sibling.male': 'Half-brother',
	'kinship.term.half-sibling.female': 'Half-sister',
	'kinship.term.half-sibling.neutral': 'Half-sibling',
	'kinship.term.grandparent.male': 'Grandfather',
	'kinship.term.grandparent.female': 'Grandmother',
	'kinship.term.grandparent.neutral': 'Grandparent',
	'kinship.term.grandchild.male': 'Grandson',
	'kinship.term.grandchild.female': 'Granddaughter',
	'kinship.term.grandchild.neutral': 'Grandchild',
	'kinship.term.aunt-uncle.male': 'Uncle',
	'kinship.term.aunt-uncle.female': 'Aunt',
	'kinship.term.aunt-uncle.neutral': 'Aunt or uncle',
	'kinship.term.niece-nephew.male': 'Nephew',
	'kinship.term.niece-nephew.female': 'Niece',
	'kinship.term.niece-nephew.neutral': 'Niece or nephew',
	'kinship.term.great-grandparent.male': 'Great-grandfather',
	'kinship.term.great-grandparent.female': 'Great-grandmother',
	'kinship.term.great-grandparent.neutral': 'Great-grandparent',
	'kinship.term.great-grandchild.male': 'Great-grandson',
	'kinship.term.great-grandchild.female': 'Great-granddaughter',
	'kinship.term.great-grandchild.neutral': 'Great-grandchild',
	'kinship.term.cousin.male': 'Cousin',
	'kinship.term.cousin.female': 'Cousin',
	'kinship.term.cousin.neutral': 'Cousin',
	'kinship.term.step-parent.male': 'Stepfather',
	'kinship.term.step-parent.female': 'Stepmother',
	'kinship.term.step-parent.neutral': 'Step-parent',
	'kinship.term.step-child.male': 'Stepson',
	'kinship.term.step-child.female': 'Stepdaughter',
	'kinship.term.step-child.neutral': 'Stepchild',
	'kinship.term.step-sibling.male': 'Stepbrother',
	'kinship.term.step-sibling.female': 'Stepsister',
	'kinship.term.step-sibling.neutral': 'Step-sibling',
	'kinship.term.parent-in-law.male': 'Father-in-law',
	'kinship.term.parent-in-law.female': 'Mother-in-law',
	'kinship.term.parent-in-law.neutral': 'Parent-in-law',
	'kinship.term.child-in-law.male': 'Son-in-law',
	'kinship.term.child-in-law.female': 'Daughter-in-law',
	'kinship.term.child-in-law.neutral': 'Child-in-law',
	'kinship.term.sibling-in-law.male': 'Brother-in-law',
	'kinship.term.sibling-in-law.female': 'Sister-in-law',
	'kinship.term.sibling-in-law.neutral': 'Sibling-in-law',

	/*
	 * Why a link is being offered (docs/02 §2.4.1). Both facts it follows from, in one
	 * sentence, written whole here rather than assembled from pieces: German puts the same
	 * three names in a different order, and every one of them is a link on screen
	 * (`src/lib/i18n/linked.ts`).
	 */
	/*
	 * A worked-out relative offered for entering (K1): the elder of a directed relation is named,
	 * or else the relative (`to`), in the gender on record and neutrally where there is none.
	 */
	'kinship.claim.grandparent.male': (p: { from: string; to: string }) => `${p.from} is a grandfather of ${p.to}`,
	'kinship.claim.grandparent.female': (p: { from: string; to: string }) => `${p.from} is a grandmother of ${p.to}`,
	'kinship.claim.grandparent.neutral': (p: { from: string; to: string }) => `${p.from} is a grandparent of ${p.to}`,
	'kinship.claim.great-grandparent.male': (p: { from: string; to: string }) => `${p.from} is a great-grandfather of ${p.to}`,
	'kinship.claim.great-grandparent.female': (p: { from: string; to: string }) => `${p.from} is a great-grandmother of ${p.to}`,
	'kinship.claim.great-grandparent.neutral': (p: { from: string; to: string }) => `${p.from} is a great-grandparent of ${p.to}`,
	'kinship.claim.aunt-uncle.male': (p: { from: string; to: string }) => `${p.from} is an uncle of ${p.to}`,
	'kinship.claim.aunt-uncle.female': (p: { from: string; to: string }) => `${p.from} is an aunt of ${p.to}`,
	'kinship.claim.aunt-uncle.neutral': (p: { from: string; to: string }) => `${p.from} is an aunt or uncle of ${p.to}`,
	'kinship.claim.parent-in-law.male': (p: { from: string; to: string }) => `${p.from} is a father-in-law of ${p.to}`,
	'kinship.claim.parent-in-law.female': (p: { from: string; to: string }) => `${p.from} is a mother-in-law of ${p.to}`,
	'kinship.claim.parent-in-law.neutral': (p: { from: string; to: string }) => `${p.from} is a parent-in-law of ${p.to}`,
	'kinship.claim.half-sibling.male': (p: { from: string; to: string }) => `${p.to} is a half-brother of ${p.from}`,
	'kinship.claim.half-sibling.female': (p: { from: string; to: string }) => `${p.to} is a half-sister of ${p.from}`,
	'kinship.claim.half-sibling.neutral': (p: { from: string; to: string }) => `${p.to} is a half-sibling of ${p.from}`,
	'kinship.claim.cousin.male': (p: { from: string; to: string }) => `${p.to} is a cousin of ${p.from}`,
	'kinship.claim.cousin.female': (p: { from: string; to: string }) => `${p.to} is a cousin of ${p.from}`,
	'kinship.claim.cousin.neutral': (p: { from: string; to: string }) => `${p.to} is a cousin of ${p.from}`,
	'kinship.claim.sibling-in-law.male': (p: { from: string; to: string }) => `${p.to} is a brother-in-law of ${p.from}`,
	'kinship.claim.sibling-in-law.female': (p: { from: string; to: string }) => `${p.to} is a sister-in-law of ${p.from}`,
	'kinship.claim.sibling-in-law.neutral': (p: { from: string; to: string }) => `${p.to} is a sibling-in-law of ${p.from}`,
	'kinship.reason.workedOutThrough': (p: { via: string }) => `Worked out through ${p.via}, not entered yet`,
	'kinship.reason.partnerOfParent': (p: { partner: string; parent: string; child: string }) =>
		`${p.partner} and ${p.parent} are partners, and ${p.parent} is a parent of ${p.child}.`,
	'kinship.reason.parentThroughSibling': (p: { parent: string; via: string; child: string }) =>
		`${p.parent} is a parent of ${p.via}, and ${p.via} and ${p.child} are siblings.`
};

/** The key set every translation of this area has to provide. */
export type KinshipMessages = typeof kinship;
