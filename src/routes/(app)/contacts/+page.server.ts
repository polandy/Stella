import { redirect } from '@sveltejs/kit';
import { listContacts } from '$lib/server/domain/contacts/contacts';
import { getContactDeps } from '$lib/server/services';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');
	const viewer = { id: locals.user.id, householdId: locals.user.householdId };
	return { contacts: await listContacts(getContactDeps(), viewer) };
};
