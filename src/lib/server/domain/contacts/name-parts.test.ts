import { describe, expect, it } from 'bun:test';
import type { Contact } from './contacts';
import { editNameParts, type NameRepository, type NameWrite } from './name-parts';
import { EmptyContactNameError } from './contacts';
import { renameFacts } from '../../../stream/notices';
import type { NewActivityEntry } from '../activity/activity';

/*
 * Editing a person's name parts on their profile (docs/concepts/surnames.md §3.4, §6): first
 * name, last name and nickname, which until now could only be given when the person was added.
 * The shown name follows the parts when the parts made it, and a changed last name may be kept
 * as the former one.
 */

const NOW = 1_700_000_000_000;
const viewer = { id: 'user-1', householdId: 'household-1' };

const thomas: Contact = {
	id: 'thomas',
	householdId: 'household-1',
	createdBy: 'user-1',
	visibility: 'shared',
	displayName: 'Thomas',
	firstName: 'Thomas',
	lastName: null,
	nickname: null,
	formerName: null,
	jobTitle: null,
	company: null,
	description: null,
	howWeMet: null,
	metDate: null,
	metPlace: null,
	birthDate: null,
	birthDatePrecision: 'full',
	gender: null,
	avatarPhotoId: null,
	isDeceased: false,
	archivedAt: null,
	createdAt: 1,
	updatedAt: 1
};

function fakeNames(...visible: Contact[]) {
	const batches: { writes: readonly NameWrite[]; audit: NewActivityEntry | null }[] = [];
	const names: NameRepository = {
		findByIdVisibleTo: async (_viewer, id) => visible.find((c) => c.id === id) ?? null,
		writeNames: async (writes, audit) => {
			batches.push({ writes, audit });
		}
	};
	return { deps: { names, clock: { now: () => NOW }, ids: { next: () => 'log-1' } }, batches };
}

describe('editNameParts', () => {
	it('writes the three parts and a shown name made again from them', async () => {
		const f = fakeNames(thomas);

		const saved = await editNameParts(f.deps, viewer, 'thomas', {
			firstName: ' Thomas ',
			lastName: 'Brunner',
			nickname: 'Tom',
			displayName: 'Thomas',
			formerName: null,
			keepFormerName: false
		}, 'de');

		expect(saved).toBe(true);
		expect(f.batches).toEqual([
			{
				writes: [
					{
						id: 'thomas',
						displayName: 'Thomas „Tom“ Brunner',
						firstName: 'Thomas',
						lastName: 'Brunner',
						nickname: 'Tom',
						formerName: null,
						updatedAt: NOW
					}
				],
				audit: {
					id: 'log-1',
					householdId: 'household-1',
					actorId: 'user-1',
					action: 'update',
					entityType: 'contact_name',
					entityId: 'thomas',
					contactId: 'thomas',
					visibility: 'shared',
					summary: renameFacts('Thomas', 'Thomas „Tom“ Brunner'),
					createdAt: NOW
				}
			}
		]);
	});

	it('keeps a shown name a member chose', async () => {
		const f = fakeNames({ ...thomas, displayName: 'Onkel Tom' });

		await editNameParts(f.deps, viewer, 'thomas', {
			firstName: 'Thomas',
			lastName: 'Brunner',
			nickname: null,
			displayName: 'Onkel Tom',
			formerName: null,
			keepFormerName: false
		}, 'de');

		expect(f.batches[0]?.writes[0]?.displayName).toBe('Onkel Tom');
	});

	it('keeps the old last name as the former one when asked', async () => {
		const f = fakeNames({ ...thomas, displayName: 'Thomas Meier', lastName: 'Meier' });

		await editNameParts(f.deps, viewer, 'thomas', {
			firstName: 'Thomas',
			lastName: 'Brunner',
			nickname: null,
			displayName: 'Thomas Meier',
			formerName: null,
			keepFormerName: true
		}, 'de');

		expect(f.batches[0]?.writes[0]).toMatchObject({ lastName: 'Brunner', formerName: 'Meier' });
	});

	it('leaves the former name alone when not asked, or when the last name stays', async () => {
		const meier = { ...thomas, displayName: 'Thomas Meier', lastName: 'Meier', formerName: 'Keller' };
		const notAsked = fakeNames(meier);
		const unchanged = fakeNames(meier);

		await editNameParts(notAsked.deps, viewer, 'thomas', {
			firstName: 'Thomas',
			lastName: 'Brunner',
			nickname: null,
			displayName: 'Thomas Meier',
			formerName: 'Keller',
			keepFormerName: false
		}, 'de');
		await editNameParts(unchanged.deps, viewer, 'thomas', {
			firstName: 'Tom',
			lastName: 'Meier',
			nickname: null,
			displayName: 'Thomas Meier',
			formerName: 'Keller',
			keepFormerName: true
		}, 'de');

		expect(notAsked.batches[0]?.writes[0]?.formerName).toBe('Keller');
		expect(unchanged.batches[0]?.writes[0]?.formerName).toBe('Keller');
	});

	it('allows every part to be emptied, keeping the shown name', async () => {
		const f = fakeNames(thomas);

		await editNameParts(f.deps, viewer, 'thomas', {
			firstName: '',
			lastName: '',
			nickname: '',
			displayName: 'Thomas',
			formerName: null,
			keepFormerName: false
		}, 'de');

		expect(f.batches[0]?.writes[0]).toMatchObject({ displayName: 'Thomas', firstName: null, lastName: null });
	});

	it('writes nothing for a person the viewer may not see', async () => {
		const hidden = fakeNames();
		const visible = fakeNames(thomas);
		const parts = { firstName: 'Thomas', lastName: 'Brunner', nickname: null, displayName: 'Thomas', formerName: null, keepFormerName: false };

		const saved = await editNameParts(hidden.deps, viewer, 'thomas', parts, 'de');
		await editNameParts(visible.deps, viewer, 'thomas', parts, 'de');

		expect(saved).toBe(false);
		expect(hidden.batches).toEqual([]);
		// positive control: the same edit of a visible person is written
		expect(visible.batches).toHaveLength(1);
	});

	/*
	 * *Shown as* is in the same editor (docs/02 §2.2): while it follows the parts it is made
	 * again from them; once a member types their own, that is what is stored.
	 */
	it('makes a following shown name again from the new parts when it comes back untouched', async () => {
		const f = fakeNames({ ...thomas, displayName: 'Thomas Meier', lastName: 'Meier' });

		await editNameParts(f.deps, viewer, 'thomas', {
			firstName: 'Tom',
			lastName: 'Meier',
			nickname: null,
			displayName: 'Thomas Meier',
			formerName: null,
			keepFormerName: false
		}, 'de');

		expect(f.batches[0]?.writes[0]?.displayName).toBe('Tom Meier');
	});

	it('stores a shown name the member typed, whatever the parts make', async () => {
		const f = fakeNames(thomas);

		await editNameParts(f.deps, viewer, 'thomas', {
			firstName: 'Thomas',
			lastName: 'Brunner',
			nickname: null,
			displayName: '  Onkel Tom ',
			formerName: null,
			keepFormerName: false
		}, 'de');

		expect(f.batches[0]?.writes[0]).toMatchObject({ displayName: 'Onkel Tom', lastName: 'Brunner' });
	});

	it('keeps a chosen shown name that comes back untouched', async () => {
		const f = fakeNames({ ...thomas, displayName: 'Opa Hans' });

		await editNameParts(f.deps, viewer, 'thomas', {
			firstName: 'Thomas',
			lastName: 'Brunner',
			nickname: null,
			displayName: 'Opa Hans',
			formerName: null,
			keepFormerName: false
		}, 'de');

		expect(f.batches[0]?.writes[0]?.displayName).toBe('Opa Hans');
	});

	it('reads a blank shown name with parts as *follow the parts*', async () => {
		const f = fakeNames({ ...thomas, displayName: 'Opa Hans' });

		await editNameParts(f.deps, viewer, 'thomas', {
			firstName: 'Thomas',
			lastName: 'Brunner',
			nickname: null,
			displayName: '   ',
			formerName: null,
			keepFormerName: false
		}, 'de');

		expect(f.batches[0]?.writes[0]?.displayName).toBe('Thomas Brunner');
	});

	it('refuses a blank shown name with blank parts, and writes nothing', async () => {
		const f = fakeNames(thomas);

		await expect(
			editNameParts(f.deps, viewer, 'thomas', {
				firstName: ' ',
				lastName: '',
				nickname: null,
				displayName: '',
				formerName: null,
				keepFormerName: false
			}, 'de')
		).rejects.toThrow(EmptyContactNameError);
		expect(f.batches).toEqual([]);
	});

	/*
	 * Home is told (docs/02 §2.11): one line per save that changes the name, no more visible than
	 * the person.
	 */
	it('tells the household nothing when the save changed nothing', async () => {
		const f = fakeNames({ ...thomas, displayName: 'Thomas Brunner', lastName: 'Brunner' });

		await editNameParts(f.deps, viewer, 'thomas', {
			firstName: 'Thomas',
			lastName: 'Brunner',
			nickname: null,
			displayName: 'Thomas Brunner',
			formerName: null,
			keepFormerName: false
		}, 'de');

		expect(f.batches).toHaveLength(1);
		expect(f.batches[0]?.audit).toBeNull();
	});

	it('logs a change of a part even when the shown name stays, as privately as the person', async () => {
		const f = fakeNames({ ...thomas, displayName: 'Opa Hans', visibility: 'private' });

		await editNameParts(f.deps, viewer, 'thomas', {
			firstName: 'Thomas',
			lastName: 'Brunner',
			nickname: null,
			displayName: 'Opa Hans',
			formerName: null,
			keepFormerName: false
		}, 'de');

		expect(f.batches[0]?.audit).toMatchObject({
			visibility: 'private',
			contactId: 'thomas',
			summary: renameFacts('Opa Hans', 'Opa Hans')
		});
	});

	/*
	 * The former name is a part of its own (docs/02 §2.2): typed, cleared, or filled by *Keep …
	 * as former name*, and never in the shown name.
	 */
	it('stores a typed former name, trimmed, and clears an emptied one', async () => {
		const typed = fakeNames({ ...thomas, displayName: 'Franziska Abab', firstName: 'Franziska', lastName: 'Abab' });
		const cleared = fakeNames({ ...thomas, displayName: 'Franziska Abab', firstName: 'Franziska', lastName: 'Abab', formerName: 'Widmer' });
		const edit = { firstName: 'Franziska', lastName: 'Abab', nickname: null, displayName: 'Franziska Abab', keepFormerName: false };

		await editNameParts(typed.deps, viewer, 'thomas', { ...edit, formerName: '  Widmer ' }, 'de');
		await editNameParts(cleared.deps, viewer, 'thomas', { ...edit, formerName: '' }, 'de');

		expect(typed.batches[0]?.writes[0]).toMatchObject({ formerName: 'Widmer', displayName: 'Franziska Abab' });
		expect(cleared.batches[0]?.writes[0]?.formerName).toBeNull();
	});

	it('takes the replaced last name when asked to keep it, over what the field says', async () => {
		const f = fakeNames({ ...thomas, displayName: 'Franziska Widmer', firstName: 'Franziska', lastName: 'Widmer' });

		await editNameParts(f.deps, viewer, 'thomas', {
			firstName: 'Franziska',
			lastName: 'Abab',
			nickname: null,
			displayName: 'Franziska Widmer',
			formerName: '',
			keepFormerName: true
		}, 'de');

		expect(f.batches[0]?.writes[0]).toMatchObject({ formerName: 'Widmer', displayName: 'Franziska Abab' });
	});

	it('tells the household about a change of the former name alone', async () => {
		const f = fakeNames({ ...thomas, displayName: 'Franziska Abab', firstName: 'Franziska', lastName: 'Abab' });

		await editNameParts(f.deps, viewer, 'thomas', {
			firstName: 'Franziska',
			lastName: 'Abab',
			nickname: null,
			displayName: 'Franziska Abab',
			formerName: 'Widmer',
			keepFormerName: false
		}, 'de');

		expect(f.batches[0]?.audit?.summary).toBe(renameFacts('Franziska Abab', 'Franziska Abab'));
	});
});
