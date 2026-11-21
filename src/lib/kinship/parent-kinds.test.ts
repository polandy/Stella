import { describe, expect, it } from 'bun:test';
import { deriveKinship, type KinshipGraph, type ParentEdge } from './kinship';
import { createTranslator } from '#lib/i18n/translate.js';
import { kinshipLabel } from './labels';

/*
 * Derivation per parent kind (docs/dev/02 §2.4.1). An adoptive parent derives like a
 * biological one; a foster parent only makes foster siblings; a recorded step parent only
 * makes step siblings.
 *
 *   Otto ── Rosa
 *      ├── Bettina ── Kurt   (Kurt her partner, no parent of anyone)
 *      │      ├── Hans       (biological)
 *      │      ├── Ada        (adoptive)
 *      │      └── Fiona      (foster)  └── Fritz (Fiona's own child)
 *      └── Peter
 *             └── Nina
 *   Sven (parent of Sofie, recorded step parent of Hans) ── his father Sepp
 */

const p = (id: string, gender?: 'male' | 'female') => ({
	id,
	displayName: id,
	gender: gender ?? null
});

function family(extra: ParentEdge[] = [], over: Partial<KinshipGraph> = {}): KinshipGraph {
	return {
		people: ['Otto', 'Rosa', 'Bettina', 'Kurt', 'Hans', 'Ada', 'Fiona', 'Fritz', 'Peter', 'Nina']
			.concat(['Sven', 'Sofie', 'Sepp', 'Greta'])
			.map((id) => p(id, id === 'Fiona' || id === 'Greta' ? 'female' : undefined)),
		parentEdges: [
			{ parentId: 'Otto', childId: 'Bettina' },
			{ parentId: 'Rosa', childId: 'Bettina' },
			{ parentId: 'Otto', childId: 'Peter' },
			{ parentId: 'Rosa', childId: 'Peter' },
			{ parentId: 'Peter', childId: 'Nina' },
			{ parentId: 'Bettina', childId: 'Hans' },
			{ parentId: 'Bettina', childId: 'Ada', kind: 'adoptive' },
			{ parentId: 'Bettina', childId: 'Fiona', kind: 'foster' },
			{ parentId: 'Fiona', childId: 'Fritz' },
			{ parentId: 'Sepp', childId: 'Sven' },
			{ parentId: 'Sven', childId: 'Sofie' },
			{ parentId: 'Sven', childId: 'Hans', kind: 'step' },
			...extra
		],
		siblingEdges: [],
		partnerEdges: [
			{ a: 'Otto', b: 'Rosa' },
			{ a: 'Bettina', b: 'Kurt' }
		],
		storedPairs: [],
		...over
	};
}

const en = createTranslator('en');

/** Derived relatives of `subject` as `{ person: term }`. */
const termsOf = (subject: string, graph: KinshipGraph = family()) =>
	Object.fromEntries(deriveKinship(graph, subject).map((k) => [k.personId, k.term]));

describe('an adoptive parent derives like a biological one', () => {
	it('gives the adopted child grandparents, plain siblings, aunts and cousins', () => {
		const ada = termsOf('Ada');
		expect(ada.Otto).toBe('grandparent');
		expect(ada.Rosa).toBe('grandparent');
		expect(ada.Hans).toBe('sibling');
		expect(ada.Peter).toBe('aunt-uncle');
		expect(ada.Nina).toBe('cousin');
	});

	it('reads the same from the other end', () => {
		expect(termsOf('Otto').Ada).toBe('grandchild');
		expect(termsOf('Nina').Ada).toBe('cousin');
		expect(termsOf('Hans').Ada).toBe('sibling');
	});
});

describe('a foster parent derives foster siblings only', () => {
	it('names the foster parent’s other children foster siblings, both ways', () => {
		expect(termsOf('Fiona').Hans).toBe('foster-sibling');
		expect(termsOf('Fiona').Ada).toBe('foster-sibling');
		expect(termsOf('Hans').Fiona).toBe('foster-sibling');
		expect(termsOf('Ada').Fiona).toBe('foster-sibling');
	});

	it('gives the foster child no grandparents, aunts, cousins or step-parent through the foster family', () => {
		const fiona = termsOf('Fiona');
		for (const id of ['Otto', 'Rosa', 'Peter', 'Nina', 'Kurt']) expect(fiona[id]).toBeUndefined();
		expect(termsOf('Otto').Fiona).toBeUndefined();
		expect(termsOf('Kurt').Fiona).toBeUndefined();
	});

	it('gives the foster parent no grandchild through the foster child', () => {
		expect(termsOf('Bettina').Fritz).toBeUndefined();
		expect(termsOf('Fritz').Bettina).toBeUndefined();
		expect(termsOf('Hans').Fritz).toBeUndefined();
	});

	it('makes two foster children of one parent foster siblings', () => {
		const graph = family([{ parentId: 'Bettina', childId: 'Greta', kind: 'foster' }]);
		expect(termsOf('Greta', graph).Fiona).toBe('foster-sibling');
		expect(termsOf('Fiona', graph).Greta).toBe('foster-sibling');
	});

	it('keeps siblings who share a biological parent siblings when fostered together', () => {
		const graph = family([
			{ parentId: 'Sepp', childId: 'Greta' },
			{ parentId: 'Sepp', childId: 'Fiona' },
			{ parentId: 'Bettina', childId: 'Greta', kind: 'foster' }
		]);
		expect(termsOf('Greta', graph).Fiona).toBe('sibling');
	});

	it('runs the foster sibling through the foster parent', () => {
		const hans = deriveKinship(family(), 'Fiona').find((k) => k.personId === 'Hans')!;
		expect(hans.viaIds).toEqual(['Bettina']);
	});
});

describe('a recorded step parent derives step siblings only', () => {
	it('names the step parent’s children step siblings, both ways, through the step parent', () => {
		const sofie = deriveKinship(family(), 'Hans').find((k) => k.personId === 'Sofie')!;
		expect(sofie.term).toBe('step-sibling');
		expect(sofie.viaIds).toEqual(['Sven']);
		expect(termsOf('Sofie').Hans).toBe('step-sibling');
	});

	it('gives the step child no grandparent, and the step parent no grandchild, through it', () => {
		expect(termsOf('Hans').Sepp).toBeUndefined();
		expect(termsOf('Sepp').Hans).toBeUndefined();
	});

	it('does not count the step sibling twice when the step parent is also the parent’s partner', () => {
		const graph = family([], {
			partnerEdges: [
				{ a: 'Otto', b: 'Rosa' },
				{ a: 'Bettina', b: 'Sven' }
			]
		});
		const sofie = deriveKinship(graph, 'Hans').filter((k) => k.personId === 'Sofie');
		expect(sofie.map((k) => k.term)).toEqual(['step-sibling']);
		expect(termsOf('Ada', graph).Sven).toBe('step-parent');
	});
});

describe('the foster-sibling term', () => {
	it('is worded by gender in both languages', () => {
		const fiona = deriveKinship(family(), 'Hans').find((k) => k.personId === 'Fiona')!;
		expect(kinshipLabel(en, fiona)).toBe('Foster sister');
		expect(kinshipLabel(createTranslator('de'), fiona)).toBe('Pflegeschwester');
		expect(kinshipLabel(en, { term: 'foster-sibling', variant: 'neutral' })).toBe('Foster sibling');
		expect(kinshipLabel(createTranslator('de'), { term: 'foster-sibling', variant: 'male' })).toBe(
			'Pflegebruder'
		);
	});
});
