import { describe, expect, it } from 'bun:test';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import {
	createContact,
	editProfile,
	EmptyContactNameError,
	type Contact,
	type ContactCreator,
	type ContactRepository,
	type NewContact,
	type ProfilePatch
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
		listVisibleTo: async () => [],
		updateProfile: async () => {}
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

describe('createContact birth dates', () => {
	it('stores a full birth date and marks its precision', async () => {
		const f = fakeRepo();
		await createContact(
			{ contacts: f.repo, ids: sequentialIds('c1'), clock },
			creator,
			{ firstName: 'Lena', lastName: 'Brunner', birthDate: '2015-05-20' }
		);
		expect(f.inserted).toMatchObject({ birthDate: '2015-05-20', birthDatePrecision: 'full' });
	});

	it('accepts a birthday whose year is unknown', async () => {
		const f = fakeRepo();
		await createContact(
			{ contacts: f.repo, ids: sequentialIds('c1'), clock },
			creator,
			{ firstName: 'Mia', birthDate: '--03-11' }
		);
		expect(f.inserted).toMatchObject({ birthDate: '--03-11', birthDatePrecision: 'month_day' });
	});

	it('leaves the birth date null when none is given', async () => {
		const f = fakeRepo();
		await createContact({ contacts: f.repo, ids: sequentialIds('c1'), clock }, creator, {
			firstName: 'Mia'
		});
		expect(f.inserted).toMatchObject({ birthDate: null, birthDatePrecision: 'full' });
	});

	it('refuses a malformed birth date instead of storing a date nobody can read', async () => {
		const f = fakeRepo();
		await expect(
			createContact({ contacts: f.repo, ids: sequentialIds('c1'), clock }, creator, {
				firstName: 'Mia',
				birthDate: '11.03.2015'
			})
		).rejects.toThrow();
		expect(f.inserted).toBeNull();
	});
});

/*
 * Editing a name or a description in place (docs/02 §2.2): the hero's own fields, saved
 * without a form. A name may never become empty — display_name is required, and a person
 * with no name is unreachable in every list that sorts by it.
 */

function editableRepo(contact: Contact | null) {
	const patches: { id: string; patch: ProfilePatch }[] = [];
	const repo: ContactRepository = {
		insert: async () => {},
		findByIdVisibleTo: async () => contact,
		listVisibleTo: async () => [],
		updateProfile: async (id, patch) => {
			patches.push({ id, patch });
		}
	};
	return { repo, patches };
}

const viewer = { id: 'user-1', householdId: 'household-1' };

const existing: Contact = {
	id: 'contact-1',
	householdId: 'household-1',
	createdBy: 'user-1',
	visibility: 'shared',
	displayName: 'Hans Müller',
	firstName: 'Hans',
	lastName: 'Müller',
	nickname: null,
	description: 'Nachbar',
	howWeMet: null,
	metDate: null,
	metPlace: null,
	birthDate: null,
	birthDatePrecision: 'full',
	avatarPhotoId: null,
	isDeceased: false,
	createdAt: 1,
	updatedAt: 1
};

describe('editProfile', () => {
	it('saves a trimmed name and description, and stamps the change', async () => {
		const f = editableRepo(existing);

		const saved = await editProfile(deps(f.repo), viewer, 'contact-1', {
			displayName: '  Hans Müller-Meier  ',
			description: '  Nachbar, links  '
		});

		expect(saved).toBe(true);
		expect(f.patches).toEqual([
			{
				id: 'contact-1',
				patch: {
					displayName: 'Hans Müller-Meier',
					description: 'Nachbar, links',
					updatedAt: NOW
				}
			}
		]);
	});

	it('clears a description that was emptied, rather than storing blanks', async () => {
		const f = editableRepo(existing);

		await editProfile(deps(f.repo), viewer, 'contact-1', { displayName: 'Hans', description: '   ' });

		expect(f.patches[0].patch.description).toBeNull();
	});

	it('refuses an empty name and writes nothing', async () => {
		const f = editableRepo(existing);

		await expect(
			editProfile(deps(f.repo), viewer, 'contact-1', { displayName: '  ', description: null })
		).rejects.toThrow(EmptyContactNameError);
		expect(f.patches).toEqual([]);
	});

	it('writes nothing for a contact the viewer may not see', async () => {
		const f = editableRepo(null);

		const saved = await editProfile(deps(f.repo), viewer, 'contact-1', {
			displayName: 'Whoever',
			description: null
		});

		// positive control: the same call against a visible contact does write
		const visible = editableRepo(existing);
		await editProfile(deps(visible.repo), viewer, 'contact-1', { displayName: 'Whoever', description: null });

		expect(saved).toBe(false);
		expect(f.patches).toEqual([]);
		expect(visible.patches).toHaveLength(1);
	});
});
