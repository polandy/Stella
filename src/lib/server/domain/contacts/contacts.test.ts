import { describe, expect, it } from 'bun:test';
import type { ActivityOf } from '../activity/activity';
import {
	archiveContact,
	createContact,
	editProfile,
	setGender,
	InvalidGenderError,
	setJob,
	JobFieldTooLongError,
	describeContact,
	EmptyDescriptionError,
	NeedsSomethingToKnowThemByError,
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
import { contactRepositoryWith, fixedClock, sequentialIds } from '../testing';

/*
 * The createContact use-case: derive the display name, apply the creator's default
 * visibility, normalise optional fields, and persist via the repository port. Pure
 * orchestration tested with fakes (docs/08 §8.3).
 */

const NOW = 1_700_000_000_000;
const clock = fixedClock(NOW);

function fakeRepo() {
	let inserted: NewContact | null = null;
	const repo = contactRepositoryWith({
		insert: async (contact) => {
			inserted = contact;
		}
	});
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
	defaultVisibility: 'shared',
	locale: 'en'
};

const deps = (repo: ContactRepository) => ({
	contacts: repo,
	ids: sequentialIds('contact-1'),
	clock
});

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
		await createContact(deps(f.repo), creator, {
			displayName: 'Secret Person',
			visibility: 'private'
		});
		expect(f.inserted?.visibility).toBe('private');
	});

	it('normalises blank optional fields to null', async () => {
		const f = fakeRepo();
		await createContact(deps(f.repo), creator, {
			firstName: 'Hans',
			lastName: '  ',
			nickname: '',
			description: 'From the choir'
		});
		expect(f.inserted?.lastName).toBeNull();
		expect(f.inserted?.nickname).toBeNull();
	});

	it('refuses a first name alone, with no last name and nothing to know them by (docs/02 §2.2.3)', async () => {
		const f = fakeRepo();
		await expect(
			createContact(deps(f.repo), creator, {
				firstName: 'Thomas',
				lastName: '  ',
				description: ' '
			})
		).rejects.toBeInstanceOf(NeedsSomethingToKnowThemByError);
		await expect(
			createContact(deps(f.repo), creator, { displayName: 'Thomas' })
		).rejects.toBeInstanceOf(NeedsSomethingToKnowThemByError);
		expect(f.inserted).toBeNull();
	});

	it('takes a first name with a last name, or with a description, or a full name typed as one', async () => {
		for (const input of [
			{ firstName: 'Thomas', lastName: 'Widmer' },
			{ firstName: 'Thomas', description: 'Mountain guide at the hut' },
			{ displayName: 'Thomas Widmer' }
		]) {
			const f = fakeRepo();
			await createContact(deps(f.repo), creator, input);
			expect(f.inserted?.displayName).toContain('Thomas');
		}
	});

	it('keeps the gender chosen while adding them, and none when none was chosen', async () => {
		const chosen = fakeRepo();
		await createContact(deps(chosen.repo), creator, {
			firstName: 'Jana',
			lastName: 'Aebi',
			gender: 'diverse'
		});
		const unchosen = fakeRepo();
		await createContact(deps(unchosen.repo), creator, { firstName: 'Jana', lastName: 'Aebi' });

		expect(chosen.inserted?.gender).toBe('diverse');
		expect(unchosen.inserted?.gender).toBeNull();
	});

	it('refuses a gender that is not one of the three, and adds no one', async () => {
		const f = fakeRepo();
		await expect(
			createContact(deps(f.repo), creator, {
				firstName: 'Jana',
				lastName: 'Aebi',
				gender: 'other' as never
			})
		).rejects.toBeInstanceOf(InvalidGenderError);
		expect(f.inserted).toBeNull();
	});

	it('rejects a contact with nothing to identify it', async () => {
		const f = fakeRepo();
		await expect(createContact(deps(f.repo), creator, {})).rejects.toThrow();
	});
});

describe('createContact birth dates', () => {
	it('stores a full birth date and marks its precision', async () => {
		const f = fakeRepo();
		await createContact({ contacts: f.repo, ids: sequentialIds('c1'), clock }, creator, {
			firstName: 'Lena',
			lastName: 'Brunner',
			birthDate: '2015-05-20'
		});
		expect(f.inserted).toMatchObject({ birthDate: '2015-05-20', birthDatePrecision: 'full' });
	});

	it('accepts a birthday whose year is unknown', async () => {
		const f = fakeRepo();
		await createContact({ contacts: f.repo, ids: sequentialIds('c1'), clock }, creator, {
			firstName: 'Mia',
			lastName: 'Brunner',
			birthDate: '--03-11'
		});
		expect(f.inserted).toMatchObject({ birthDate: '--03-11', birthDatePrecision: 'month_day' });
	});

	it('leaves the birth date null when none is given', async () => {
		const f = fakeRepo();
		await createContact({ contacts: f.repo, ids: sequentialIds('c1'), clock }, creator, {
			firstName: 'Mia',
			lastName: 'Brunner'
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
	const genders: { id: string; gender: string | null; updatedAt: number }[] = [];
	const jobs: {
		id: string;
		job: { jobTitle: string | null; company: string | null };
		updatedAt: number;
	}[] = [];
	const repo = contactRepositoryWith({
		findByIdVisibleTo: async () => contact,
		updateProfile: async (id, patch) => {
			patches.push({ id, patch });
		},
		setGender: async (id, gender, updatedAt) => {
			genders.push({ id, gender, updatedAt });
		},
		setJob: async (id, job, updatedAt) => {
			jobs.push({ id, job, updatedAt });
		},
		setArchived: async (id, archivedAt) => {
			archived.push({ id, archivedAt });
		}
	});
	return { repo, patches, archived, genders, jobs };
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

describe('editProfile', () => {
	/*
	 * Only the description now: the name is edited with its parts in one editor
	 * (`editNameParts`), so there is one way to rename, not two (docs/02 §2.2).
	 */
	it('saves a trimmed description, keeps the name as stored, and stamps the change', async () => {
		const f = editableRepo(existing);

		const saved = await editProfile(deps(f.repo), viewer, 'contact-1', {
			description: '  Nachbar, links  '
		});

		expect(saved).toBe(true);
		expect(f.patches).toEqual([
			{
				id: 'contact-1',
				patch: { displayName: 'Hans Müller', description: 'Nachbar, links', updatedAt: NOW }
			}
		]);
	});

	it('clears a description that was emptied, rather than storing blanks', async () => {
		const f = editableRepo(existing);

		await editProfile(deps(f.repo), viewer, 'contact-1', { description: '   ' });

		expect(f.patches[0].patch.description).toBeNull();
	});

	it('writes nothing for a contact the viewer may not see', async () => {
		const f = editableRepo(null);

		const saved = await editProfile(deps(f.repo), viewer, 'contact-1', { description: null });

		// positive control: the same call against a visible contact does write
		const visible = editableRepo(existing);
		await editProfile(deps(visible.repo), viewer, 'contact-1', { description: null });

		expect(saved).toBe(false);
		expect(f.patches).toEqual([]);
		expect(visible.patches).toHaveLength(1);
	});
});

/*
 * Setting a gender from the profile (docs/02 §2.2): one tap on one of three, and a tap on the
 * chosen one again takes it off the record.
 */
describe('setGender', () => {
	it('records the gender and stamps the change', async () => {
		const f = editableRepo(existing);

		const saved = await setGender(deps(f.repo), viewer, 'contact-1', 'female');

		expect(saved).toBe(true);
		expect(f.genders).toEqual([{ id: 'contact-1', gender: 'female', updatedAt: NOW }]);
	});

	it('takes the gender off the record', async () => {
		const f = editableRepo({ ...existing, gender: 'male' });

		await setGender(deps(f.repo), viewer, 'contact-1', null);

		expect(f.genders).toEqual([{ id: 'contact-1', gender: null, updatedAt: NOW }]);
	});

	it('refuses anything but the three, and writes nothing', async () => {
		const f = editableRepo(existing);

		await expect(
			setGender(deps(f.repo), viewer, 'contact-1', 'genderfluid' as never)
		).rejects.toThrow(InvalidGenderError);
		expect(f.genders).toEqual([]);
	});

	it('writes nothing for a contact the viewer may not see', async () => {
		const hidden = editableRepo(null);
		const saved = await setGender(deps(hidden.repo), viewer, 'contact-1', 'female');

		// positive control: the same call against a visible contact does write
		const visible = editableRepo(existing);
		await setGender(deps(visible.repo), viewer, 'contact-1', 'female');

		expect(saved).toBe(false);
		expect(hidden.genders).toEqual([]);
		expect(visible.genders).toHaveLength(1);
	});
});

/*
 * A job title and company from the profile card (docs/02 §2.2): two free-text fields saved
 * together, trimmed, a blank one taken off the record.
 */
describe('setJob', () => {
	it('records both parts, trimmed, and stamps the change', async () => {
		const f = editableRepo(existing);

		const saved = await setJob(deps(f.repo), viewer, 'contact-1', {
			jobTitle: '  Teacher ',
			company: ' Primarschule Muri  '
		});

		expect(saved).toBe(true);
		expect(f.jobs).toEqual([
			{
				id: 'contact-1',
				job: { jobTitle: 'Teacher', company: 'Primarschule Muri' },
				updatedAt: NOW
			}
		]);
	});

	it('takes an emptied part off the record rather than storing blanks', async () => {
		const f = editableRepo({ ...existing, jobTitle: 'Teacher', company: 'Primarschule Muri' });

		await setJob(deps(f.repo), viewer, 'contact-1', { jobTitle: 'Teacher', company: '   ' });
		await setJob(deps(f.repo), viewer, 'contact-1', { jobTitle: null, company: null });

		expect(f.jobs.map((j) => j.job)).toEqual([
			{ jobTitle: 'Teacher', company: null },
			{ jobTitle: null, company: null }
		]);
	});

	it('takes 200 characters in each field, and refuses one more without writing anything', async () => {
		const f = editableRepo(existing);

		await setJob(deps(f.repo), viewer, 'contact-1', {
			jobTitle: 'x'.repeat(200),
			company: 'y'.repeat(200)
		});
		await expect(
			setJob(deps(f.repo), viewer, 'contact-1', { jobTitle: 'x'.repeat(201), company: null })
		).rejects.toThrow(JobFieldTooLongError);
		await expect(
			setJob(deps(f.repo), viewer, 'contact-1', { jobTitle: null, company: 'y'.repeat(201) })
		).rejects.toThrow(JobFieldTooLongError);

		expect(f.jobs).toHaveLength(1);
	});

	it('counts the length after trimming, so surrounding spaces do not push it over', async () => {
		const f = editableRepo(existing);

		await setJob(deps(f.repo), viewer, 'contact-1', {
			jobTitle: `  ${'x'.repeat(200)}  `,
			company: null
		});

		expect(f.jobs).toHaveLength(1);
	});

	it('writes nothing for a contact the viewer may not see', async () => {
		const hidden = editableRepo(null);
		const saved = await setJob(deps(hidden.repo), viewer, 'contact-1', {
			jobTitle: 'Teacher',
			company: null
		});

		// positive control: the same call against a visible contact does write
		const visible = editableRepo(existing);
		await setJob(deps(visible.repo), viewer, 'contact-1', { jobTitle: 'Teacher', company: null });

		expect(saved).toBe(false);
		expect(hidden.jobs).toEqual([]);
		expect(visible.jobs).toHaveLength(1);
	});
});

/*
 * Tidying up the people known by a first name only (docs/02 §2.2.3): a description written
 * straight from the list, the name left as it is.
 */
describe('describeContact', () => {
	const thomas: Contact = {
		...existing,
		displayName: 'Thomas',
		firstName: 'Thomas',
		lastName: null,
		description: null
	};

	it('saves a trimmed description and keeps the name they have', async () => {
		const f = editableRepo(thomas);

		const saved = await describeContact(deps(f.repo), viewer, 'contact-1', '  SAC hut, Aug 2026  ');

		expect(saved).toBe(true);
		expect(f.patches).toEqual([
			{
				id: 'contact-1',
				patch: { displayName: 'Thomas', description: 'SAC hut, Aug 2026', updatedAt: NOW }
			}
		]);
	});

	it('refuses an empty description and writes nothing', async () => {
		const f = editableRepo(thomas);

		await expect(describeContact(deps(f.repo), viewer, 'contact-1', '   ')).rejects.toThrow(
			EmptyDescriptionError
		);
		expect(f.patches).toEqual([]);
	});

	it('writes nothing for a contact the viewer may not see', async () => {
		const f = editableRepo(null);

		const saved = await describeContact(deps(f.repo), viewer, 'contact-1', 'SAC hut');

		// positive control: the same call against a visible contact does write
		const visible = editableRepo(thomas);
		await describeContact(deps(visible.repo), viewer, 'contact-1', 'SAC hut');

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
					media: { delete: async (p: string) => void removedFiles.push(p) },
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
			{ contacts: f.repo, media: { delete: async () => {} }, ids: sequentialIds('log-1'), clock },
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
				media: { delete: async (p: string) => void removedFiles.push(p) },
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
