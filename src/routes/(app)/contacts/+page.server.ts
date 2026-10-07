import { requireViewer } from '$lib/server/auth/guards';
import {
	countArchivedContacts,
	listArchivedContacts,
	listContacts
} from '$lib/server/domain/contacts/contacts';
import { listContactsByTag, listTags } from '$lib/server/domain/tags/tags';
import { readSurnameHelp } from '$lib/server/domain/contacts/last-names';
import { getAttention } from '$lib/server/services';
import { lastNameActions } from '$lib/server/last-names-actions';
import type { Actions, PageServerLoad } from './$types';
import { systemClock } from '$lib/server/clock';
import { todayFor } from '$lib/dates/today';

/*
 * People (docs/02 §2.2): every person the viewer may see, with the last day anything was
 * written about them. That day comes from the attention repository, a scoped read, so a
 * private entry the viewer may not see never dates anyone.
 */

export const load: PageServerLoad = async ({ locals, url }) => {
	const viewer = requireViewer(locals);
	const activeTag = url.searchParams.get('tag');
	// `?archived` is its own view: the tag chips filter the household's people, and the
	// archived ones are by definition not among them.
	const showArchived = url.searchParams.has('archived');

	// The archive's size is what the chip says — and a chip that leads to an empty room is
	// worse than no chip — so it is counted either way; the list only when it is shown.
	const [tags, archivedCount, contacts, touches, surnameHelp] = await Promise.all([
		listTags(locals.services.records.tagDeps, viewer.householdId),
		countArchivedContacts(locals.services.people.contactDeps, viewer),
		showArchived
			? listArchivedContacts(locals.services.people.contactDeps, viewer)
			: activeTag
				? listContactsByTag(locals.services.records.tagDeps, viewer, activeTag)
				: listContacts(locals.services.people.contactDeps, viewer),
		getAttention().listLastTouchedVisibleTo(viewer),
		readSurnameHelp(locals.services.people.surnameReviewDeps, viewer, null)
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
			jobTitle: c.jobTitle,
			company: c.company,
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
		today: todayFor(systemClock),
		// Whom a last name set here is offered on to (docs/02 §2.2.4.5).
		passOn: surnameHelp.passOn
	};
};

/* *Select* → *Set last name* (docs/02 §2.2.4.3), the one batch write. */
export const actions: Actions = { ...lastNameActions };
