import { redirect } from '@sveltejs/kit';
import { listContacts } from '$lib/server/domain/contacts/contacts';
import { listContactsByTag, listTags } from '$lib/server/domain/tags/tags';
import { getAttention, getContactDeps, getTagDeps } from '$lib/server/services';
import type { PageServerLoad } from './$types';

/*
 * People (docs/02 §2.2): every person the viewer may see, with the last day anything was
 * written about them. That day comes from the attention repository, the same scoped read
 * that feeds "Quiet lately" on Home, so the two screens can never disagree about it.
 */

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(302, '/login');
	const viewer = { id: locals.user.id, householdId: locals.user.householdId };
	const activeTag = url.searchParams.get('tag');

	const [tags, contacts, touches] = await Promise.all([
		listTags(getTagDeps(), locals.user.householdId),
		activeTag
			? listContactsByTag(getTagDeps(), viewer, activeTag)
			: listContacts(getContactDeps(), viewer),
		getAttention().listQuietSourcesVisibleTo(viewer)
	]);
	const lastTouchedOn = new Map(touches.map((t) => [t.contactId, t.lastTouchedOn]));

	return {
		contacts: contacts.map((c) => ({ ...c, lastTouchedOn: lastTouchedOn.get(c.id) ?? null })),
		tags,
		activeTag,
		today: new Date().toLocaleDateString('en-CA')
	};
};
