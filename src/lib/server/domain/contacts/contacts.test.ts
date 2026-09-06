import { describe, expect, it } from 'bun:test';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import type { NewActivityEntry } from '../activity/activity';
import {
	archiveContact,
	createContact,
	editProfile,
	EmptyContactNameError,
	restoreContact,
	deleteContact,
	mergeContacts,
	type MergePair,
	type DeletedContactMedia,
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
		listArchivedVisibleTo: async () => [],
		listNamesVisibleTo: async () => [],
		updateProfile: async () => {},
		setArchived: async () => {},
		deleteVisibleTo: async () => null,
		readForMerge: async () => null,
		mergeVisibleTo: async () => false
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
	const archived: { id: string; archivedAt: number | null }[] = [];
	const repo: ContactRepository = {
		insert: async () => {},
		findByIdVisibleTo: async () => contact,
		listVisibleTo: async () => [],
		listArchivedVisibleTo: async () => [],
		listNamesVisibleTo: async () => [],
		updateProfile: async (id, patch) => {
			patches.push({ id, patch });
		},
		setArchived: async (id, archivedAt) => {
			archived.push({ id, archivedAt });
		},
		deleteVisibleTo: async () => null,
		readForMerge: async () => null,
		mergeVisibleTo: async () => false
	};
	return { repo, patches, archived };
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
	archivedAt: null,
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


/*
 * Archiving (docs/02 §2.2): the household puts someone out of the way without losing them.
 * The stamp comes from the clock port, never from the adapter, so the test can name it.
 */
describe('archiveContact / restoreContact', () => {
	it('stamps the archive with the current time', async () => {
		const f = editableRepo(existing);

		expect(await archiveContact(deps(f.repo), viewer, 'contact-1')).toBe(true);
		expect(f.archived).toEqual([{ id: 'contact-1', archivedAt: NOW }]);
	});

	it('clears the stamp when the contact is brought back', async () => {
		const f = editableRepo({ ...existing, archivedAt: NOW });

		expect(await restoreContact(deps(f.repo), viewer, 'contact-1')).toBe(true);
		expect(f.archived).toEqual([{ id: 'contact-1', archivedAt: null }]);
	});

	it('writes nothing for a contact the viewer may not see', async () => {
		const f = editableRepo(null);
		expect(await archiveContact(deps(f.repo), viewer, 'contact-1')).toBe(false);
		expect(await restoreContact(deps(f.repo), viewer, 'contact-1')).toBe(false);

		// positive control: the same calls against a visible contact do write
		const visible = editableRepo(existing);
		await archiveContact(deps(visible.repo), viewer, 'contact-1');

		expect(f.archived).toEqual([]);
		expect(visible.archived).toHaveLength(1);
	});
});


/*
 * Deleting a person for good (docs/02 §2.2). The row goes with everything hanging off it, so
 * the log entry is written in the same breath — once the contact is gone, nothing else can
 * say they were ever there.
 */
describe('deleteContact', () => {
	function deletableRepo(found: Contact | null, media: DeletedContactMedia[] = []) {
		const deleted: { id: string; audit: NewActivityEntry }[] = [];
		const repo: ContactRepository = {
			insert: async () => {},
			findByIdVisibleTo: async () => found,
			listVisibleTo: async () => [],
			listArchivedVisibleTo: async () => [],
			listNamesVisibleTo: async () => [],
			updateProfile: async () => {},
			setArchived: async () => {},
			readForMerge: async () => null,
		mergeVisibleTo: async () => false,
		deleteVisibleTo: async (_viewer, id, audit) => {
				if (found === null) return null;
				deleted.push({ id, audit });
				return media;
			}
		};
		return { repo, deleted };
	}

	const files = [{ filePath: 'a.jpg', thumbPath: 'a-thumb.jpg' }];

	it('deletes the contact and says so in the log, in the household and the viewer name', async () => {
		const f = deletableRepo(existing);
		const removedFiles: string[] = [];

		expect(
			await deleteContact(
				{ contacts: f.repo, media: { delete: async (p: string) => void removedFiles.push(p) }, ids: sequentialIds('log-1'), clock },
				viewer,
				'contact-1'
			)
		).toBe(true);

		expect(f.deleted).toEqual([
			{
				id: 'contact-1',
				audit: {
					id: 'log-1',
					householdId: 'household-1',
					actorId: 'user-1',
					action: 'delete',
					entityType: 'contact',
					entityId: 'contact-1',
					contactId: null,
					visibility: 'shared',
					summary: 'removed Hans Müller',
					createdAt: NOW
				}
			}
		]);
	});

	it('mirrors a private contact visibility, so the log says no more than the record did', async () => {
		const f = deletableRepo({ ...existing, visibility: 'private' });

		await deleteContact(
			{ contacts: f.repo, media: { delete: async () => {} }, ids: sequentialIds('log-1'), clock },
			viewer,
			'contact-1'
		);

		expect(f.deleted[0].audit.visibility).toBe('private');
	});

	it('removes the bytes of every photo that hung off them, after the row is gone', async () => {
		const f = deletableRepo(existing, files);
		const removedFiles: string[] = [];

		await deleteContact(
			{ contacts: f.repo, media: { delete: async (p: string) => void removedFiles.push(p) }, ids: sequentialIds('log-1'), clock },
			viewer,
			'contact-1'
		);

		expect(removedFiles).toEqual(['a.jpg', 'a-thumb.jpg']);
	});

	it('deletes nothing for a contact the viewer may not see', async () => {
		const f = deletableRepo(null);
		const removedFiles: string[] = [];
		const deps = {
			contacts: f.repo,
			media: { delete: async (p: string) => void removedFiles.push(p) },
			ids: sequentialIds('log-1'),
			clock
		};

		expect(await deleteContact(deps, viewer, 'contact-1')).toBe(false);
		expect(f.deleted).toEqual([]);
		expect(removedFiles).toEqual([]);

		// positive control: the same call against a visible contact does delete.
		const visible = deletableRepo(existing, files);
		await deleteContact({ ...deps, contacts: visible.repo }, viewer, 'contact-1');
		expect(visible.deleted).toHaveLength(1);
		expect(removedFiles).toEqual(['a.jpg', 'a-thumb.jpg']);
	});
});


/*
 * Merging duplicates (docs/02 §2.2). The use-case decides what the log says and which record's
 * answers win; every collision belongs to the repository, which the integration spec covers.
 */
describe('mergeContacts', () => {
	function mergeableRepo(pair: MergePair | null) {
		const merges: {
			keepId: string;
			mergedId: string;
			profile: unknown;
			audit: NewActivityEntry;
		}[] = [];
		const repo: ContactRepository = {
			insert: async () => {},
			findByIdVisibleTo: async () => null,
			listVisibleTo: async () => [],
			listArchivedVisibleTo: async () => [],
			listNamesVisibleTo: async () => [],
			updateProfile: async () => {},
			setArchived: async () => {},
			deleteVisibleTo: async () => null,
			readForMerge: async () => pair,
			mergeVisibleTo: async (_v, keepId, mergedId, profile, audit) => {
				merges.push({ keepId, mergedId, profile, audit });
				return true;
			}
		};
		return { repo, merges };
	}

	const blank = {
		firstName: null,
		lastName: null,
		nickname: null,
		prefix: null,
		suffix: null,
		formerName: null,
		gender: null,
		pronouns: null,
		description: null,
		avatarPhotoId: null,
		birthDate: null,
		birthDatePrecision: 'full' as const,
		isDeceased: false,
		deathDate: null,
		jobTitle: null,
		company: null,
		howWeMet: null,
		metDate: null,
		metPlace: null
	};

	const pair: MergePair = {
		keep: { displayName: 'Hans Müller', visibility: 'shared', profile: { ...blank, firstName: 'Hans' } },
		mergedAway: { displayName: 'Hansueli M.', profile: { ...blank, lastName: 'Müller', jobTitle: 'Schreiner' } }
	};

	const deps = (repo: ContactRepository) => ({ contacts: repo, ids: sequentialIds('log-1'), clock });

	it('hands the repository the combined profile and a log entry naming both', async () => {
		const f = mergeableRepo(pair);

		expect(await mergeContacts(deps(f.repo), viewer, 'keep', 'dup')).toBe(true);
		expect(f.merges).toHaveLength(1);
		expect(f.merges[0].profile).toMatchObject({ firstName: 'Hans', jobTitle: 'Schreiner' });
		expect(f.merges[0].audit).toEqual({
			id: 'log-1',
			householdId: 'household-1',
			actorId: 'user-1',
			action: 'merge',
			entityType: 'contact',
			entityId: 'dup',
			// Unlike a deletion, the survivor still has a page for the item to link to.
			contactId: 'keep',
			visibility: 'shared',
			summary: 'merged Hansueli M. into Hans Müller',
			createdAt: NOW
		});
	});

	it('mirrors the survivor visibility, so the log says no more than they do', async () => {
		const f = mergeableRepo({ ...pair, keep: { ...pair.keep, visibility: 'private' } });

		await mergeContacts(deps(f.repo), viewer, 'keep', 'dup');

		expect(f.merges[0].audit.visibility).toBe('private');
	});

	it('refuses a pair the viewer cannot reach, and merges nothing', async () => {
		const f = mergeableRepo(null);

		expect(await mergeContacts(deps(f.repo), viewer, 'keep', 'dup')).toBe(false);
		expect(f.merges).toEqual([]);

		// positive control: a reachable pair does merge.
		const reachable = mergeableRepo(pair);
		expect(await mergeContacts(deps(reachable.repo), viewer, 'keep', 'dup')).toBe(true);
		expect(reachable.merges).toHaveLength(1);
	});

	it('refuses to merge a record into itself before reading anything', async () => {
		const f = mergeableRepo(pair);

		expect(await mergeContacts(deps(f.repo), viewer, 'same', 'same')).toBe(false);
		expect(f.merges).toEqual([]);
	});
});
