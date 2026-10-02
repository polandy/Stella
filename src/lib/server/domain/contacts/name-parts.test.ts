import { describe, expect, it } from 'bun:test';
import type { Contact } from './contacts';
import { editNameParts, type NameRepository, type NameWrite } from './name-parts';
import { EmptyContactNameError } from './contacts';
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
	return { deps: { names, clock: { now: () => NOW } }, batches };
}

describe('editNameParts', () => {
	it('writes the three parts and a shown name made again from them', async () => {
		const f = fakeNames(thomas);

		const saved = await editNameParts(f.deps, viewer, 'thomas', {
			firstName: ' Thomas ',
			lastName: 'Brunner',
			nickname: 'Tom',
			displayName: 'Thomas',
			keepFormerName: false
		});

		expect(saved).toBe(true);
		expect(f.batches).toEqual([
			{
				writes: [
					{
						id: 'thomas',
						displayName: 'Thomas Brunner',
						firstName: 'Thomas',
						lastName: 'Brunner',
						nickname: 'Tom',
						formerName: null,
						updatedAt: NOW
					}
				],
				audit: null
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
			keepFormerName: false
		});

		expect(f.batches[0]?.writes[0]?.displayName).toBe('Onkel Tom');
	});

	it('keeps the old last name as the former one when asked', async () => {
		const f = fakeNames({ ...thomas, displayName: 'Thomas Meier', lastName: 'Meier' });

		await editNameParts(f.deps, viewer, 'thomas', {
			firstName: 'Thomas',
			lastName: 'Brunner',
			nickname: null,
			displayName: 'Thomas Meier',
			keepFormerName: true
		});

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
			keepFormerName: false
		});
		await editNameParts(unchanged.deps, viewer, 'thomas', {
			firstName: 'Tom',
			lastName: 'Meier',
			nickname: null,
			displayName: 'Thomas Meier',
			keepFormerName: true
		});

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
			keepFormerName: false
		});

		expect(f.batches[0]?.writes[0]).toMatchObject({ displayName: 'Thomas', firstName: null, lastName: null });
	});

	it('writes nothing for a person the viewer may not see', async () => {
		const hidden = fakeNames();
		const visible = fakeNames(thomas);
		const parts = { firstName: 'Thomas', lastName: 'Brunner', nickname: null, displayName: 'Thomas', keepFormerName: false };

		const saved = await editNameParts(hidden.deps, viewer, 'thomas', parts);
		await editNameParts(visible.deps, viewer, 'thomas', parts);

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
			keepFormerName: false
		});

		expect(f.batches[0]?.writes[0]?.displayName).toBe('Tom Meier');
	});

	it('stores a shown name the member typed, whatever the parts make', async () => {
		const f = fakeNames(thomas);

		await editNameParts(f.deps, viewer, 'thomas', {
			firstName: 'Thomas',
			lastName: 'Brunner',
			nickname: null,
			displayName: '  Onkel Tom ',
			keepFormerName: false
		});

		expect(f.batches[0]?.writes[0]).toMatchObject({ displayName: 'Onkel Tom', lastName: 'Brunner' });
	});

	it('keeps a chosen shown name that comes back untouched', async () => {
		const f = fakeNames({ ...thomas, displayName: 'Opa Hans' });

		await editNameParts(f.deps, viewer, 'thomas', {
			firstName: 'Thomas',
			lastName: 'Brunner',
			nickname: null,
			displayName: 'Opa Hans',
			keepFormerName: false
		});

		expect(f.batches[0]?.writes[0]?.displayName).toBe('Opa Hans');
	});

	it('reads a blank shown name with parts as *follow the parts*', async () => {
		const f = fakeNames({ ...thomas, displayName: 'Opa Hans' });

		await editNameParts(f.deps, viewer, 'thomas', {
			firstName: 'Thomas',
			lastName: 'Brunner',
			nickname: null,
			displayName: '   ',
			keepFormerName: false
		});

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
				keepFormerName: false
			})
		).rejects.toThrow(EmptyContactNameError);
		expect(f.batches).toEqual([]);
	});
});
