import { describe, expect, it } from 'bun:test';
import { inMemoryTagLists, somebody, someTag } from '.';

const viewer = { id: 'u', householdId: 'h' };

describe('someTag', () => {
	it('is a tag of the test household that nobody carries yet', () => {
		expect(someTag('ski', 'Ski')).toEqual({
			id: 'ski',
			householdId: 'h',
			name: 'Ski',
			color: 'blue',
			carriedBy: []
		});
	});
});

describe('inMemoryTagLists', () => {
	const lists = inMemoryTagLists(
		[
			someTag('ski', 'Ski', { carriedBy: ['cleo', 'anna'] }),
			someTag('choir', 'Choir', { color: 'mauve', carriedBy: ['anna'] }),
			someTag('away', 'Away', { householdId: 'elsewhere', carriedBy: ['anna'] })
		],
		[somebody('anna', 'Anna'), somebody('cleo', 'Cleo', { archived: true })]
	);

	it('lists a household’s tags by name, without who carries them', async () => {
		expect(await lists.listByHousehold('h')).toEqual([
			{ id: 'choir', householdId: 'h', name: 'Choir', color: 'mauve' },
			{ id: 'ski', householdId: 'h', name: 'Ski', color: 'blue' }
		]);
	});

	it('lists the tags a person carries, by name', async () => {
		expect((await lists.listForContactVisibleTo(viewer, 'cleo')).map((t) => t.id)).toEqual(['ski']);
	});

	it('lists the people who carry a tag by name, archived ones included, as list rows', async () => {
		const people = await lists.listContactsByTagVisibleTo(viewer, 'ski');
		expect(people.map((p) => p.id)).toEqual(['anna', 'cleo']);
		expect(people[0]).not.toHaveProperty('archived');
	});
});
