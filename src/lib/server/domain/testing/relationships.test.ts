import { describe, expect, it } from 'bun:test';
import {
	inMemoryKinshipGraph,
	inMemoryRelationshipTies,
	relationshipRepositoryWith,
	relationshipTypeRepositoryWith,
	someTie
} from '.';

const viewer = { id: 'u', householdId: 'h' };

describe('someTie', () => {
	it('is a current link to the other person, named by their id, with no specifics', () => {
		expect(someTie('r1', 'mia')).toEqual({
			id: 'r1',
			otherContactId: 'mia',
			otherDisplayName: 'mia',
			label: 'Linked to',
			typeId: 'some_type',
			typeKey: 'some_type',
			side: 'forward',
			category: 'social',
			description: null,
			sinceDate: null,
			status: 'current'
		});
	});

	it('takes the fields a test is about', () => {
		const spouse = someTie('r2', 'mia', { typeKey: 'spouse', category: 'romantic' });
		expect([spouse.typeKey, spouse.category]).toEqual(['spouse', 'romantic']);
	});
});

describe('inMemoryKinshipGraph', () => {
	it('is the empty household unless the test says otherwise', async () => {
		expect(await inMemoryKinshipGraph().loadKinshipGraphVisibleTo(viewer)).toEqual({
			people: [],
			parentEdges: [],
			siblingEdges: [],
			partnerEdges: [],
			storedPairs: []
		});
	});

	it('answers with the edges it was built over', async () => {
		const graph = inMemoryKinshipGraph({
			people: [{ id: 'a', displayName: 'A' }],
			siblingEdges: [{ a: 'a', b: 'b' }]
		});
		const read = await graph.loadKinshipGraphVisibleTo(viewer);
		expect([read.people.length, read.siblingEdges, read.parentEdges]).toEqual([
			1,
			[{ a: 'a', b: 'b' }],
			[]
		]);
	});
});

describe('inMemoryRelationshipTies', () => {
	const ties = inMemoryRelationshipTies({ andy: [someTie('r1', 'mia')] });

	it('lists the ties of the person asked about', async () => {
		expect(await ties.listForContactVisibleTo(viewer, 'andy')).toEqual([someTie('r1', 'mia')]);
	});

	it('lists nothing for someone the test gave no ties', async () => {
		expect(await ties.listForContactVisibleTo(viewer, 'mia')).toEqual([]);
	});
});

describe('relationshipRepositoryWith', () => {
	it('answers with what the test gave it', async () => {
		const repo = relationshipRepositoryWith({ exists: async () => true });
		expect(await repo.exists('a', 'b', 't')).toBe(true);
	});

	it('fails loud on a method the test did not expect to be called', async () => {
		const repo = relationshipRepositoryWith({});
		await expect(repo.removeVisibleTo(viewer, 'r1')).rejects.toThrow(
			'RelationshipRepository.removeVisibleTo was not expected in this test'
		);
	});
});

describe('relationshipTypeRepositoryWith', () => {
	it('answers with what the test gave it', async () => {
		const repo = relationshipTypeRepositoryWith({ countRelationshipsOfType: async () => 3 });
		expect(await repo.countRelationshipsOfType(viewer, 't1')).toBe(3);
	});

	it('fails loud on a method the test did not expect to be called', async () => {
		const repo = relationshipTypeRepositoryWith({});
		await expect(repo.deleteTypeVisibleTo(viewer, 't1')).rejects.toThrow(
			'RelationshipTypeRepository.deleteTypeVisibleTo was not expected in this test'
		);
	});
});
