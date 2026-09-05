import { describe, expect, it } from 'bun:test';
import { rankNameCandidates, type NameCandidate } from './suggestions';

/*
 * Duplicate & relative suggestions (docs/02 §2.2.1). A pure ranker: given the name being
 * typed and the people the user may see, it returns the likely duplicates and relatives,
 * best first, each with the reason it was picked. Visibility is the caller's job (§2.10).
 */

const person = (id: string, first: string | null, last: string | null, relationships = 0): NameCandidate => ({
	id,
	displayName: [first, last].filter(Boolean).join(' '),
	firstName: first,
	lastName: last,
	relationshipCount: relationships
});

const household = [
	person('hans', 'Hans', 'Müller', 3),
	person('vreni', 'Vreni', 'Müller', 1),
	person('lena', 'Lena', 'Brunner', 5),
	person('kaspar', 'Kaspar', 'Vogelsang'),
	person('nick', null, null),
	person('mia', 'Mia', 'Muler')
];

describe('rankNameCandidates', () => {
	it('proposes nobody until a surname is typed', () => {
		expect(rankNameCandidates({ firstName: 'Hans' }, household)).toEqual([]);
		expect(rankNameCandidates({ lastName: '  ' }, household)).toEqual([]);
	});

	it('finds the same surname regardless of case and diacritics', () => {
		const found = rankNameCandidates({ lastName: 'MULLER' }, household);
		expect(found.map((c) => c.id)).toEqual(['hans', 'vreni', 'mia']);
		expect(found[0]?.reason).toBe('same-surname');
		expect(found[2]?.reason).toBe('similar-surname');
	});

	it('puts an exact full-name match first — that is the likely duplicate', () => {
		const found = rankNameCandidates({ firstName: 'vreni', lastName: 'Müller' }, household);
		expect(found.map((c) => [c.id, c.reason])).toEqual([
			['vreni', 'same-name'],
			['hans', 'same-surname'],
			['mia', 'similar-surname']
		]);
	});

	it('tolerates one typo in a surname of at least four letters, not in short ones', () => {
		expect(rankNameCandidates({ lastName: 'Bruner' }, household).map((c) => c.id)).toEqual(['lena']);
		expect(rankNameCandidates({ lastName: 'Brunnre' }, household).map((c) => c.id)).toEqual(['lena']);
		expect(rankNameCandidates({ lastName: 'Vogel' }, household)).toEqual([]);
		expect(rankNameCandidates({ lastName: 'Mul' }, [person('x', 'A', 'Mur')])).toEqual([]);
	});

	it('matches a part of a compound surname', () => {
		const people = [person('a', 'Anna', 'Müller-Brunner'), person('b', 'Beat', 'von Arx')];
		expect(rankNameCandidates({ lastName: 'Brunner' }, people).map((c) => c.id)).toEqual(['a']);
		expect(rankNameCandidates({ lastName: 'Arx' }, people).map((c) => c.id)).toEqual(['b']);
	});

	it('orders equals by how connected they already are, then by name', () => {
		const people = [
			person('c', 'Carla', 'Roth', 0),
			person('b', 'Beat', 'Roth', 2),
			person('a', 'Anna', 'Roth', 2)
		];
		expect(rankNameCandidates({ lastName: 'Roth' }, people).map((c) => c.id)).toEqual(['a', 'b', 'c']);
	});

	it('caps the list', () => {
		const many = Array.from({ length: 12 }, (_, i) => person(`p${i}`, `P${i}`, 'Roth'));
		expect(rankNameCandidates({ lastName: 'Roth' }, many)).toHaveLength(5);
		expect(rankNameCandidates({ lastName: 'Roth' }, many, 2)).toHaveLength(2);
	});
});
