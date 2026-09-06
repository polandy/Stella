import { redirect } from '@sveltejs/kit';
import { listArchivedContacts, listContacts } from '$lib/server/domain/contacts/contacts';
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
	// `?archived` is its own view: the tag chips filter the household's people, and the
	// archived ones are by definition not among them.
	const showArchived = url.searchParams.has('archived');

	// The archived list is loaded either way, because its size is what the chip says — and
	// a chip that leads to an empty room is worse than no chip.
	const [tags, archived, contacts, touches] = await Promise.all([
		listTags(getTagDeps(), locals.user.householdId),
		listArchivedContacts(getContactDeps(), viewer),
		activeTag
			? listContactsByTag(getTagDeps(), viewer, activeTag)
			: listContacts(getContactDeps(), viewer),
		getAttention().listQuietSourcesVisibleTo(viewer)
	]);
	const lastTouchedOn = new Map(touches.map((t) => [t.contactId, t.lastTouchedOn]));

	const shown = showArchived ? archived : contacts;

	return {
		contacts: shown.map((c) => ({ ...c, lastTouchedOn: lastTouchedOn.get(c.id) ?? null })),
		archivedCount: archived.length,
		showArchived,
		tags,
		// The archive is its own view; a tag left in the URL would otherwise make the header
		// claim a filter that is not being applied.
		activeTag: showArchived ? null : activeTag,
		today: new Date().toLocaleDateString('en-CA')
	};
};
