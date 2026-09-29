import { redirect } from '@sveltejs/kit';
import { listContacts } from '$lib/server/domain/contacts/contacts';
import { contextOfPeople } from '$lib/server/domain/contacts/person-context';
import { getAccounts, getContactDeps, getPersonContextDeps } from '$lib/server/services';
import type { LayoutServerLoad } from './$types';

/*
 * Guard for the authenticated app. Unauthenticated visitors are sent to setup (when no
 * account exists yet) or to login. See docs/02 §2.1.
 *
 * The shell also carries the people the viewer may see, for the ⌘K palette (docs/05 §5.4):
 * one scoped read per navigation, a few hundred rows at most in a household, and it is what
 * makes the palette answer on the first keystroke instead of after a round trip. With them
 * comes what the viewer may see of the links and circles of people with nothing typed to tell
 * them apart, which every picker's namesake line falls back on (docs/02 §2.2.3).
 */

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) {
		const hasUsers = (await getAccounts().countUsers()) > 0;
		throw redirect(302, hasUsers ? '/login' : '/setup');
	}
	const viewer = { id: locals.user.id, householdId: locals.user.householdId };
	const people = await listContacts(getContactDeps(), viewer);
	const peopleContext = await contextOfPeople(getPersonContextDeps(), viewer, {
		people,
		selfContactId: locals.user.selfContactId,
		today: new Date().toLocaleDateString('en-CA')
	});
	return {
		user: locals.user,
		peopleContext,
		people: people.map((p) => ({
			id: p.id,
			displayName: p.displayName,
			firstName: p.firstName,
			lastName: p.lastName,
			nickname: p.nickname,
			avatarPhotoId: p.avatarPhotoId,
			// What tells two people of the same name apart in ⌘K and the pickers (docs/02 §2.2.3).
			description: p.description,
			metPlace: p.metPlace,
			metDate: p.metDate
		}))
	};
};
