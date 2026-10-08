import type { GraphEdge, GraphModel, GraphNode } from '../model/types';

/*
 * Test support: households shaped like the demo's, for the family tree's tests (docs/05 §5.8).
 * Kept out of *.test.ts so the layout and the line tests can share them. Listed in an unhelpful
 * order on purpose — in-laws first, a sister between the brothers — so the arrangement has to
 * find the order itself.
 */

const person = (id: string, wording: GraphNode['wording']): GraphNode => ({
	id,
	kind: 'person',
	label: id,
	wording
});

const stored = (source: string, target: string, typeKey: string): GraphEdge => ({
	id: `${source}-${typeKey}-${target}`,
	source,
	target,
	kind: 'relationship',
	category: typeKey === 'spouse' ? 'romantic' : 'family',
	typeKey
});

const kin = (
	source: string,
	target: string,
	term: NonNullable<GraphEdge['kin']>['term']
): GraphEdge => ({
	id: `kin:${source}:${target}`,
	source,
	target,
	kind: 'kinship',
	kin: { term, variant: 'neutral' },
	derived: true
});

const parentsOf = (child: string, ...parents: string[]) =>
	parents.map((parent) => stored(parent, child, 'parent_child'));

/**
 * Lena's family, as her map holds it: the Brunner grandparents on her father's side, the
 * Keller grandparents on her mother's, an uncle and his son, an aunt, her brothers — with the
 * grandparent and sibling links the household entered besides, and a worked-out cousin.
 */
export const brunnerKeller: GraphModel = {
	nodes: [
		person('corinne', 'female'),
		person('peter', 'male'),
		person('ursula', 'female'),
		person('sandra', 'female'),
		person('lena', 'female'),
		person('daniel', 'male'),
		person('hans', 'male'),
		person('rosa', 'female'),
		person('markus', 'male'),
		person('noah', 'male'),
		person('elias', 'male'),
		person('timo', 'male')
	],
	edges: [
		stored('hans', 'rosa', 'spouse'),
		stored('peter', 'ursula', 'spouse'),
		stored('markus', 'sandra', 'spouse'),
		...parentsOf('daniel', 'hans', 'rosa'),
		...parentsOf('markus', 'hans', 'rosa'),
		...parentsOf('sandra', 'peter', 'ursula'),
		...parentsOf('corinne', 'peter', 'ursula'),
		...parentsOf('lena', 'markus', 'sandra'),
		...parentsOf('noah', 'markus', 'sandra'),
		...parentsOf('elias', 'markus', 'sandra'),
		...parentsOf('timo', 'daniel'),
		stored('corinne', 'sandra', 'sibling'),
		stored('daniel', 'markus', 'sibling'),
		stored('lena', 'noah', 'sibling'),
		stored('elias', 'lena', 'sibling'),
		stored('hans', 'lena', 'grandparent_grandchild'),
		stored('rosa', 'lena', 'grandparent_grandchild'),
		stored('peter', 'lena', 'grandparent_grandchild'),
		kin('timo', 'lena', 'cousin'),
		kin('corinne', 'lena', 'aunt-uncle'),
		kin('daniel', 'lena', 'aunt-uncle')
	]
};

/** The same family with Daniel's wife and a second couple marrying in on the mother's side. */
export const brunnerKellerWidened: GraphModel = {
	nodes: [
		...brunnerKeller.nodes,
		person('nadia', 'female'),
		person('marco', 'male'),
		person('gina', 'female')
	],
	edges: [
		...brunnerKeller.edges,
		stored('daniel', 'nadia', 'spouse'),
		...parentsOf('timo', 'nadia'),
		stored('corinne', 'marco', 'spouse'),
		...parentsOf('gina', 'corinne', 'marco')
	]
};

/** Two families side by side with nothing between them: the Widmers and a lone father. */
export const twoFamilies: GraphModel = {
	nodes: [
		person('mia', 'female'),
		person('jan', 'male'),
		person('thomas', 'male'),
		person('luca', 'male'),
		person('franziska', 'female'),
		person('beat', 'male')
	],
	edges: [
		stored('franziska', 'thomas', 'spouse'),
		...parentsOf('luca', 'thomas', 'franziska'),
		...parentsOf('mia', 'thomas', 'franziska'),
		stored('luca', 'mia', 'sibling'),
		...parentsOf('jan', 'beat')
	]
};

/**
 * One family over three generations: siblings Bert and Carl, each married with two children.
 * Listed in an unhelpful order — partners apart, the right-hand couple's children first — so
 * the arrangement has to do the ordering itself.
 */
export const twoHouseholds: GraphModel = {
	nodes: ['otto', 'rosa', 'anna', 'dora', 'bert', 'carl', 'finn', 'gina', 'emil', 'hugo'].map(
		(id) => person(id, undefined)
	),
	edges: [
		stored('otto', 'rosa', 'spouse'),
		...parentsOf('bert', 'otto'),
		...parentsOf('carl', 'rosa'),
		stored('anna', 'bert', 'spouse'),
		stored('carl', 'dora', 'spouse'),
		...parentsOf('finn', 'carl'),
		...parentsOf('gina', 'dora'),
		...parentsOf('emil', 'anna'),
		...parentsOf('hugo', 'bert')
	]
};
