import { describe, expect, it } from 'bun:test';
import type { ActivityOf } from '../activity/activity';
import type { Contact, ContactRepository, DeletedContactMedia, MergePair } from './contacts';
import { deleteContact, mergeContacts } from './remove-contact';
import { contactRepositoryWith, fixedClock, sequentialIds } from '../testing';

const NOW = 1_700_000_000_000;
const clock = fixedClock(NOW);

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
	formerName: null,
	description: 'Nachbar',
	howWeMet: null,
	metDate: null,
	metPlace: null,
	birthDate: null,
	birthDatePrecision: 'full',
	gender: null,
	jobTitle: null,
	company: null,
	avatarPhotoId: null,
	isDeceased: false,
	archivedAt: null,
	createdAt: 1,
	updatedAt: 1
};

/*
 * Deleting a person for good (docs/02 §2.2). The row goes with everything hanging off it, so
 * the log entry is written in the same breath — once the contact is gone, nothing else can
 * say they were ever there.
 */
describe('deleteContact', () => {
	function deletableRepo(found: Contact | null, media: DeletedContactMedia[] = []) {
		const deleted: { id: string; audit: ActivityOf<'contact.deleted'> }[] = [];
		const repo = contactRepositoryWith({
			findByIdVisibleTo: async () => found,
			deleteVisibleTo: async (_viewer, id, audit) => {
				if (found === null) return null;
				deleted.push({ id, audit });
				return media;
			}
		});
		return { repo, deleted };
	}

	const files = [{ filePath: 'a.jpg', thumbPath: 'a-thumb.jpg' }];

	it('deletes the contact and says so in the log, in the household and the viewer name', async () => {
		const f = deletableRepo(existing);
		const removedFiles: string[] = [];

		expect(
			await deleteContact(
				{
					contacts: f.repo,
					photoFiles: { delete: async (p: string) => void removedFiles.push(p) },
					ids: sequentialIds('log-1'),
					clock
				},
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
					createdAt: NOW,
					event: {
						kind: 'contact.deleted',
						contactId: 'contact-1',
						displayName: 'Hans Müller',
						visibility: 'shared'
					}
				}
			}
		]);
	});

	it('mirrors a private contact visibility, so the log says no more than the record did', async () => {
		const f = deletableRepo({ ...existing, visibility: 'private' });

		await deleteContact(
			{
				contacts: f.repo,
				photoFiles: { delete: async () => {} },
				ids: sequentialIds('log-1'),
				clock
			},
			viewer,
			'contact-1'
		);

		expect(f.deleted[0].audit.event.visibility).toBe('private');
	});

	it('removes the bytes of every photo that hung off them, after the row is gone', async () => {
		const f = deletableRepo(existing, files);
		const removedFiles: string[] = [];

		await deleteContact(
			{
				contacts: f.repo,
				photoFiles: { delete: async (p: string) => void removedFiles.push(p) },
				ids: sequentialIds('log-1'),
				clock
			},
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
			photoFiles: { delete: async (p: string) => void removedFiles.push(p) },
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
			audit: ActivityOf<'contact.merged'>;
		}[] = [];
		const repo = contactRepositoryWith({
			readForMerge: async () => pair,
			mergeVisibleTo: async (_v, keepId, mergedId, profile, audit) => {
				merges.push({ keepId, mergedId, profile, audit });
				return true;
			}
		});
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
		keep: {
			displayName: 'Hans Müller',
			visibility: 'shared',
			profile: { ...blank, firstName: 'Hans' }
		},
		mergedAway: {
			displayName: 'Hansueli M.',
			profile: { ...blank, lastName: 'Müller', jobTitle: 'Schreiner' }
		}
	};

	const deps = (repo: ContactRepository) => ({
		contacts: repo,
		ids: sequentialIds('log-1'),
		clock
	});

	it('hands the repository the combined profile and a log entry naming both', async () => {
		const f = mergeableRepo(pair);

		expect(await mergeContacts(deps(f.repo), viewer, 'keep', 'dup')).toBe(true);
		expect(f.merges).toHaveLength(1);
		expect(f.merges[0].profile).toMatchObject({ firstName: 'Hans', jobTitle: 'Schreiner' });
		expect(f.merges[0].audit).toEqual({
			id: 'log-1',
			householdId: 'household-1',
			actorId: 'user-1',
			createdAt: NOW,
			event: {
				kind: 'contact.merged',
				keepId: 'keep',
				mergedAwayId: 'dup',
				keep: 'Hans Müller',
				mergedAway: 'Hansueli M.',
				visibility: 'shared'
			}
		});
	});

	it('mirrors the survivor visibility, so the log says no more than they do', async () => {
		const f = mergeableRepo({ ...pair, keep: { ...pair.keep, visibility: 'private' } });

		await mergeContacts(deps(f.repo), viewer, 'keep', 'dup');

		expect(f.merges[0].audit.event.visibility).toBe('private');
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
