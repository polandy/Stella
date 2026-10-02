import { redirect } from '@sveltejs/kit';
import {
	countArchivedContacts,
	listArchivedContacts,
	listContacts
} from '$lib/server/domain/contacts/contacts';
import { listContactsByTag, listTags } from '$lib/server/domain/tags/tags';
import { readSurnameHelp } from '$lib/server/domain/contacts/last-names';
import { getAttention, getContactDeps, getSurnameReviewDeps, getTagDeps } from '$lib/server/services';
import { lastNameActions } from '$lib/server/last-names-actions';
import type { Actions, PageServerLoad } from './$types';

/*
 * People (docs/02 §2.2): every person the viewer may see, with the last day anything was
 * written about them. That day comes from the attention repository, a scoped read, so a
 * private entry the viewer may not see never dates anyone.
 */

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(302, '/login');
	const viewer = { id: locals.user.id, householdId: locals.user.householdId };
	const activeTag = url.searchParams.get('tag');
	// `?archived` is its own view: the tag chips filter the household's people, and the
	// archived ones are by definition not among them.
	const showArchived = url.searchParams.has('archived');

	// The archive's size is what the chip says — and a chip that leads to an empty room is
	// worse than no chip — so it is counted either way; the list only when it is shown.
	const [tags, archivedCount, contacts, touches, surnameHelp] = await Promise.all([
		listTags(getTagDeps(), locals.user.householdId),
		countArchivedContacts(getContactDeps(), viewer),
		showArchived
			? listArchivedContacts(getContactDeps(), viewer)
			: activeTag
				? listContactsByTag(getTagDeps(), viewer, activeTag)
				: listContacts(getContactDeps(), viewer),
		getAttention().listLastTouchedVisibleTo(viewer),
		readSurnameHelp(getSurnameReviewDeps(), viewer, null)
	]);
	const lastTouchedOn = new Map(touches.map((t) => [t.contactId, t.lastTouchedOn]));

	return {
		// What a row shows and the filter searches (`$lib/people/directory`), not the whole record.
		contacts: contacts.map((c) => ({
			id: c.id,
			displayName: c.displayName,
			firstName: c.firstName,
			lastName: c.lastName,
			nickname: c.nickname,
			formerName: c.formerName,
			description: c.description,
			avatarPhotoId: c.avatarPhotoId,
			visibility: c.visibility,
			lastTouchedOn: lastTouchedOn.get(c.id) ?? null
		})),
		archivedCount,
		showArchived,
		tags,
		// The archive is its own view; a tag left in the URL would otherwise make the header
		// claim a filter that is not being applied.
		activeTag: showArchived ? null : activeTag,
		today: new Date().toLocaleDateString('en-CA'),
		// Whom a last name set here is offered on to (docs/concepts/surnames.md §3.3).
		passOn: surnameHelp.passOn
	};
};

/* *Select* → *Set last name* (docs/concepts/surnames.md §3.2), the one batch write. */
export const actions: Actions = { ...lastNameActions };
