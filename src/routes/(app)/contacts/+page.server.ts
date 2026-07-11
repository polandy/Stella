import { redirect } from '@sveltejs/kit';
import { listContacts } from '$lib/server/domain/contacts/contacts';
import { listContactsByTag, listTags } from '$lib/server/domain/tags/tags';
import { getContactDeps, getTagDeps } from '$lib/server/services';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(302, '/login');
	const viewer = { id: locals.user.id, householdId: locals.user.householdId };
	const activeTag = url.searchParams.get('tag');

	const [tags, contacts] = await Promise.all([
		listTags(getTagDeps(), locals.user.householdId),
		activeTag
			? listContactsByTag(getTagDeps(), viewer, activeTag)
			: listContacts(getContactDeps(), viewer)
	]);

	return { contacts, tags, activeTag };
};
