import { redirect } from '@sveltejs/kit';
import { listContacts } from '$lib/server/domain/contacts/contacts';
import { getAccounts, getContactDeps } from '$lib/server/services';
import type { LayoutServerLoad } from './$types';

/*
 * Guard for the authenticated app. Unauthenticated visitors are sent to setup (when no
 * account exists yet) or to login. See docs/02 §2.1.
 *
 * The shell also carries the people the viewer may see, for the ⌘K palette (docs/05 §5.4):
 * one scoped read per navigation, a few hundred rows at most in a household, and it is what
 * makes the palette answer on the first keystroke instead of after a round trip.
 */

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) {
		const hasUsers = (await getAccounts().countUsers()) > 0;
		throw redirect(302, hasUsers ? '/login' : '/setup');
	}
	const viewer = { id: locals.user.id, householdId: locals.user.householdId };
	const people = await listContacts(getContactDeps(), viewer);
	return {
		user: locals.user,
		people: people.map((p) => ({
			id: p.id,
			displayName: p.displayName,
			firstName: p.firstName,
			lastName: p.lastName,
			nickname: p.nickname,
			avatarPhotoId: p.avatarPhotoId
		}))
	};
};
