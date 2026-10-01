import type { AuthUser } from './auth/accounts';
import { listContacts } from './domain/contacts/contacts';
import { contextOfPeople } from './domain/contacts/person-context';
import { namesakesOn } from '../people/namesakes';
import { getContactDeps, getPersonContextDeps } from './services';

/*
 * The people the app shell carries for the ⌘K palette and every picker (docs/05 §5.4), with
 * what the viewer may see of the links and circles of namesakes with nothing typed to tell
 * them apart (docs/02 §2.2.3). One scoped read, sent once rather than again in each page's
 * data; the stamp lets a page that kept the shell tell whether it is still current
 * (`$lib/sync/people-freshness`, docs/04 §4.9).
 */

/** The shell's people as `user` may see them, and the stamp of exactly that. */
export async function readShellPeople(user: AuthUser) {
	const viewer = { id: user.id, householdId: user.householdId };
	const contacts = await listContacts(getContactDeps(), viewer);
	// Only namesakes are ever given a second line, so only their links and circles are read.
	const peopleContext = await contextOfPeople(getPersonContextDeps(), viewer, {
		people: namesakesOn(contacts),
		selfContactId: user.selfContactId,
		today: new Date().toLocaleDateString('en-CA')
	});
	const people = contacts.map((p) => ({
		id: p.id,
		displayName: p.displayName,
		firstName: p.firstName,
		lastName: p.lastName,
		nickname: p.nickname,
		avatarPhotoId: p.avatarPhotoId,
		// A shared text may only mention shared people (docs/02 §2.20.1).
		visibility: p.visibility,
		// What the relationship form's *since* suggestion starts from (docs/02 §2.4).
		birthDate: p.birthDate,
		// What tells two people of the same name apart in ⌘K and the pickers (docs/02 §2.2.3).
		description: p.description,
		metPlace: p.metPlace,
		metDate: p.metDate
	}));
	return { people, peopleContext, peopleStamp: stampOf({ people, peopleContext }) };
}

/** A short fingerprint of what the shell would send; equal exactly when the content is. */
const stampOf = (shell: unknown) => Bun.hash(JSON.stringify(shell)).toString(36);
