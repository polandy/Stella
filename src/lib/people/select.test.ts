import { describe, expect, it } from 'bun:test';
import { filterPeople, type SelectablePerson } from './select';

function person(
	overrides: Partial<SelectablePerson> & { id: string; displayName: string }
): SelectablePerson {
	return { firstName: null, lastName: null, nickname: null, description: null, ...overrides };
}

describe('filterPeople', () => {
	const alice = person({ id: '1', displayName: 'Alice Anderson' });
	const bob = person({ id: '2', displayName: 'Bob Baker', nickname: 'Bobby' });
	const zoe = person({ id: '3', displayName: 'Zoé Zimmer' });
	const people = [alice, bob, zoe];

	it('returns everyone for an empty query', () => {
		expect(filterPeople('', people)).toEqual(people);
	});

	it('matches by substring, case-insensitively', () => {
		expect(filterPeople('AND', people)).toEqual([alice]);
	});

	it('matches nicknames', () => {
		expect(filterPeople('bobby', people)).toEqual([bob]);
	});

	it('is diacritic-insensitive', () => {
		expect(filterPeople('zoe', people)).toEqual([zoe]);
	});

	it('ranks a name-start match above a mid-name match', () => {
		const anne = person({ id: '4', displayName: 'Anne Baker' });
		const found = filterPeople('an', [alice, anne]);
		expect(found.map((p) => p.id)).toEqual(['4', '1']);
	});

	it('excludes people who do not match', () => {
		expect(filterPeople('xyz', people)).toEqual([]);
	});
});
