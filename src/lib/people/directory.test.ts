import { describe, expect, it } from 'bun:test';
import { groupByLetter, matchesQuery, startsWithQuery, type DirectoryPerson } from './directory';

/*
 * The People directory (docs/02 §2.2): letter groups and the find-as-you-type filter. Pure
 * and client-safe, so what a letter heading means and what a query matches are stated here
 * rather than left to whatever the template happened to do.
 */

function person(overrides: Partial<DirectoryPerson> = {}): DirectoryPerson {
	return {
		id: 'c1',
		displayName: 'Lena Brunner',
		firstName: 'Lena',
		lastName: 'Brunner',
		nickname: null,
		description: null,
		...overrides
	};
}

describe('groupByLetter', () => {
	it('groups by the first letter of the surname, then the given name, in letter order', () => {
		const groups = groupByLetter([
			person({ id: 'a', displayName: 'Zoe Adler', lastName: 'Adler' }),
			person({ id: 'b', displayName: 'Lena Brunner', lastName: 'Brunner' }),
			person({ id: 'c', displayName: 'Anna Brunner', firstName: 'Anna', lastName: 'Brunner' })
		]);

		expect(groups.map((g) => g.letter)).toEqual(['A', 'B']);
		expect(groups[1]!.people.map((p) => p.id)).toEqual(['c', 'b']);
	});

	it('falls back to the display name for someone with no surname', () => {
		const groups = groupByLetter([person({ displayName: 'Oma', firstName: null, lastName: null })]);

		expect(groups.map((g) => g.letter)).toEqual(['O']);
	});

	it('folds an accented initial onto its plain letter', () => {
		const groups = groupByLetter([person({ displayName: 'Émile', firstName: null, lastName: 'Émile' })]);

		expect(groups.map((g) => g.letter)).toEqual(['E']);
	});

	it('puts anyone whose name starts with a digit or symbol under one trailing group', () => {
		const groups = groupByLetter([
			person({ id: 'n', displayName: '3D print shop', firstName: null, lastName: null }),
			person({ id: 'a', displayName: 'Ana', firstName: null, lastName: null })
		]);

		expect(groups.map((g) => g.letter)).toEqual(['A', '#']);
	});
});

describe('matchesQuery', () => {
	it('matches anywhere in the name, ignoring case and accents', () => {
		expect(matchesQuery(person(), 'brun')).toBe(true);
		expect(matchesQuery(person(), 'LENA')).toBe(true);
		expect(matchesQuery(person({ displayName: 'Émile Zola' }), 'emile')).toBe(true);
	});

	it('matches a nickname and the description, which is often how someone is remembered', () => {
		expect(matchesQuery(person({ nickname: 'Leni' }), 'leni')).toBe(true);
		expect(matchesQuery(person({ description: 'Neighbour with the dog' }), 'dog')).toBe(true);
	});

	it('matches everyone on an empty query', () => {
		expect(matchesQuery(person(), '')).toBe(true);
		expect(matchesQuery(person(), '   ')).toBe(true);
	});

	it('does not match someone the query names nothing of', () => {
		expect(matchesQuery(person(), 'markus')).toBe(false);
	});
});

describe('startsWithQuery', () => {
	it('is true when any name the person goes by starts with the query', () => {
		expect(startsWithQuery(person(), 'brun')).toBe(true);
		expect(startsWithQuery(person(), 'le')).toBe(true);
		expect(startsWithQuery(person({ nickname: 'Leni' }), 'len')).toBe(true);
	});

	it('is false for a match in the middle of a name, or in the description', () => {
		expect(startsWithQuery(person(), 'ena')).toBe(false);
		expect(startsWithQuery(person({ description: 'Brunner cousin' }), 'cous')).toBe(false);
	});
});
