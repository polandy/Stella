import { error, redirect } from '@sveltejs/kit';
import { getContact } from '$lib/server/domain/contacts/contacts';
import { getContactDeps } from '$lib/server/services';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) throw redirect(302, '/login');
	const viewer = { id: locals.user.id, householdId: locals.user.householdId };

	const contact = await getContact(getContactDeps(), viewer, params.id);
	if (!contact) {
		// 404 for both "missing" and "not visible to you" — never reveal existence.
		throw error(404, 'Contact not found');
	}
	return { contact };
};
