import { describe, expect, it } from 'bun:test';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import {
	createContact,
	type ContactCreator,
	type ContactRepository,
	type NewContact
} from './contacts';

/*
 * The createContact use-case: derive the display name, apply the creator's default
 * visibility, normalise optional fields, and persist via the repository port. Pure
 * orchestration tested with fakes (docs/08 §8.3).
 */

const NOW = 1_700_000_000_000;
const clock: Clock = { now: () => NOW };

function sequentialIds(...values: string[]): IdGenerator {
	let i = 0;
	return { next: () => values[i++] ?? `id-${i}` };
}

function fakeRepo() {
	let inserted: NewContact | null = null;
	const repo: ContactRepository = {
		insert: async (contact) => {
			inserted = contact;
		},
		findByIdVisibleTo: async () => null,
		listVisibleTo: async () => []
	};
	return {
		repo,
		get inserted() {
			return inserted;
		}
	};
}

const creator: ContactCreator = {
	userId: 'user-1',
	householdId: 'household-1',
	defaultVisibility: 'shared'
};

const deps = (repo: ContactRepository) => ({ contacts: repo, ids: sequentialIds('contact-1'), clock });

describe('createContact', () => {
	it('persists a contact with a derived name, default visibility, and timestamps', async () => {
		const f = fakeRepo();
		const id = await createContact(deps(f.repo), creator, {
			firstName: 'Hans',
			lastName: 'Müller',
			howWeMet: 'at the lake'
		});

		expect(id).toBe('contact-1');
		expect(f.inserted).toMatchObject({
			id: 'contact-1',
			householdId: 'household-1',
			createdBy: 'user-1',
			visibility: 'shared',
			displayName: 'Hans Müller',
			firstName: 'Hans',
			lastName: 'Müller',
			howWeMet: 'at the lake',
			createdAt: NOW,
			updatedAt: NOW
		});
	});

	it('respects an explicit visibility over the creator default', async () => {
		const f = fakeRepo();
		await createContact(deps(f.repo), creator, { displayName: 'Secret Person', visibility: 'private' });
		expect(f.inserted?.visibility).toBe('private');
	});

	it('normalises blank optional fields to null', async () => {
		const f = fakeRepo();
		await createContact(deps(f.repo), creator, { firstName: 'Hans', lastName: '  ', description: '' });
		expect(f.inserted?.lastName).toBeNull();
		expect(f.inserted?.description).toBeNull();
	});

	it('rejects a contact with nothing to identify it', async () => {
		const f = fakeRepo();
		await expect(createContact(deps(f.repo), creator, {})).rejects.toThrow();
	});
});
