import { describe, expect, it } from 'bun:test';
import { journalRepositoryWith, someJournalEntry } from '.';

const viewer = { id: 'u', householdId: 'h' };

describe('someJournalEntry', () => {
	it("is a shared, untitled entry on Anna by the test's member", () => {
		expect(someJournalEntry('e1')).toEqual({
			id: 'e1',
			contactId: 'anna',
			createdBy: 'u1',
			visibility: 'shared',
			entryDate: '2026-10-09',
			title: null,
			body: 'A walk by the river',
			createdAt: 1000,
			updatedAt: 1000
		});
	});

	it('takes the fields a test is about', () => {
		const theirs = someJournalEntry('e2', { createdBy: 'u2', visibility: 'private' });
		expect([theirs.createdBy, theirs.visibility]).toEqual(['u2', 'private']);
	});
});

describe('journalRepositoryWith', () => {
	it('answers with what the test gave it', async () => {
		const entry = someJournalEntry('e1');
		const repo = journalRepositoryWith({ listForContactVisibleTo: async () => [entry] });
		expect(await repo.listForContactVisibleTo(viewer, 'anna')).toEqual([entry]);
	});

	it('fails loud on a method the test did not expect to be called', async () => {
		const repo = journalRepositoryWith({});
		await expect(
			repo.findRemovableBy({ id: 'u', householdId: 'h', isAdmin: false }, 'e1')
		).rejects.toThrow('JournalRepository.findRemovableBy was not expected in this test');
	});
});
