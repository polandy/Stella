import { describe, expect, it } from 'bun:test';
import type { ContactAddPayload } from '../../../commands/commands';
import type { Viewer } from '../../access/visibility';
import { addPerson, type AddPersonDeps } from './add-person';
import { NeedsSomethingToKnowThemByError, type Contact, type ContactRepository, type NewContact } from './contacts';

/*
 * Adding a person from the *Add person* form (docs/02 §2.2), and adding yourself (§2.1.3):
 * "Start with yourself" on the first-run card creates the member's own record and points their
 * account at it in the same step, so nobody has to find Settings afterwards to say who they are.
 */

const actor = { userId: 'u1', householdId: 'h1', locale: 'en' as const };

const payload: ContactAddPayload = {
	firstName: 'Andy',
	lastName: 'Pollari',
	nickname: null,
	description: null,
	howWeMet: null,
	metPlace: null,
	birthDate: null,
	visibility: 'shared'
};

/** A contact store that keeps what is inserted, and an account store that records every write. */
function fakes() {
	const inserted: NewContact[] = [];
	const selfWrites: [string, string | null][] = [];
	const unused = () => {
		throw new Error('not part of adding a person');
	};
	const contacts: ContactRepository = {
		insert: async (contact) => void inserted.push(contact),
		findByIdVisibleTo: async (viewer: Viewer, id: string) => {
			const found = inserted.find((c) => c.id === id && c.householdId === viewer.householdId);
			const contact: Contact | null = found
				? { ...found, formerName: null, jobTitle: null, company: null, avatarPhotoId: null, isDeceased: false, archivedAt: null }
				: null;
			return contact;
		},
		listVisibleTo: unused,
		listArchivedVisibleTo: unused,
		listNamesVisibleTo: unused,
		listNamesAmongVisibleTo: unused,
		listBrowsableNamesAmong: unused,
		listSomeBrowsableIdsVisibleTo: unused,
		countArchivedVisibleTo: unused,
		listDistinguishableVisibleTo: unused,
		updateProfile: unused,
		setGender: unused,
		setJob: unused,
		setArchived: unused,
		deleteVisibleTo: unused,
		readForMerge: unused,
		mergeVisibleTo: unused
	};
	const deps: AddPersonDeps = {
		contacts,
		ids: { next: () => 'c-new' },
		clock: { now: () => 1_700_000_000_000 },
		accounts: { updateSelfContact: async (userId, contactId) => void selfWrites.push([userId, contactId]) }
	};
	return { deps, inserted, selfWrites };
}

describe('addPerson', () => {
	it('adds the person and leaves who the member is alone', async () => {
		const { deps, inserted, selfWrites } = fakes();

		expect(await addPerson(deps, actor, payload)).toEqual({ contactId: 'c-new' });
		expect(inserted.map((c) => c.displayName)).toEqual(['Andy Pollari']);
		expect(selfWrites).toEqual([]);
	});

	it('points the member at the new record when they are adding themselves', async () => {
		const { deps, inserted, selfWrites } = fakes();

		await addPerson(deps, actor, { ...payload, isSelf: true });

		expect(inserted).toHaveLength(1);
		expect(selfWrites).toEqual([['u1', 'c-new']]);
	});

	it('claims nobody when the person could not be added', async () => {
		const { deps, inserted, selfWrites } = fakes();
		const firstNameOnly = { ...payload, lastName: null, isSelf: true };

		// positive control: the same request with a surname goes through and is claimed
		await addPerson(deps, actor, { ...payload, isSelf: true });
		expect(selfWrites).toHaveLength(1);

		await expect(addPerson(deps, actor, firstNameOnly)).rejects.toBeInstanceOf(
			NeedsSomethingToKnowThemByError
		);
		expect(inserted).toHaveLength(1);
		expect(selfWrites).toHaveLength(1);
	});
});
