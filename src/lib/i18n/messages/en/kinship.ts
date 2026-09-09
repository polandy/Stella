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
	'kinship.term.sibling-in-law.neutral': 'Sibling-in-law'
};

/** The key set every translation of this area has to provide. */
export type KinshipMessages = typeof kinship;
