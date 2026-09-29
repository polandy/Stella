import { error, fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import {
	describeContact,
	EmptyDescriptionError,
	listArchivedContacts,
	listContacts
} from '$lib/server/domain/contacts/contacts';
import { listContactsByTag, listTags } from '$lib/server/domain/tags/tags';
import { getAttention, getContactDeps, getTagDeps } from '$lib/server/services';
import { say, translator } from '$lib/server/i18n/say';
import { isKnownByAFirstNameOnly } from '$lib/people/namesakes';
import type { Actions, PageServerLoad } from './$types';

/*
 * People (docs/02 §2.2): every person the viewer may see, with the last day anything was
 * written about them. That day comes from the attention repository, the same scoped read
 * that feeds "Quiet lately" on Home, so the two screens can never disagree about it.
 */

/** The clean-up view's address: everyone known by a first name only (docs/02 §2.2.3). */
const FIRST_NAME_ONLY = '/contacts?firstNameOnly';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(302, '/login');
	const viewer = { id: locals.user.id, householdId: locals.user.householdId };
	// `?archived` and `?firstNameOnly` are views of their own: the tag chips filter the
	// household's people, and these two lists are not a tag's.
	const showArchived = url.searchParams.has('archived');
	const showFirstNameOnly = !showArchived && url.searchParams.has('firstNameOnly');
	const activeTag = showArchived || showFirstNameOnly ? null : url.searchParams.get('tag');

	// The archived list and everyone are loaded either way, because their sizes are what the
	// chips say — and a chip that leads to an empty room is worse than no chip.
	const [tags, archived, everyone, tagged, touches] = await Promise.all([
		listTags(getTagDeps(), locals.user.householdId),
		listArchivedContacts(getContactDeps(), viewer),
		listContacts(getContactDeps(), viewer),
		activeTag ? listContactsByTag(getTagDeps(), viewer, activeTag) : null,
		getAttention().listQuietSourcesVisibleTo(viewer)
	]);
	const lastTouchedOn = new Map(touches.map((t) => [t.contactId, t.lastTouchedOn]));
	const firstNameOnly = everyone.filter(isKnownByAFirstNameOnly);

	const shown = showArchived ? archived : showFirstNameOnly ? firstNameOnly : (tagged ?? everyone);

	return {
		contacts: shown.map((c) => ({ ...c, lastTouchedOn: lastTouchedOn.get(c.id) ?? null })),
		archivedCount: archived.length,
		firstNameOnlyCount: firstNameOnly.length,
		showArchived,
		showFirstNameOnly,
		tags,
		activeTag,
		today: new Date().toLocaleDateString('en-CA')
	};
};

const DescribeSchema = v.object({
	id: v.pipe(v.string(), v.minLength(1)),
	description: v.string()
});

export const actions: Actions = {
	/* A description written straight from the clean-up list (docs/02 §2.2.3). */
	describe: async ({ request, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };
		const parsed = v.safeParse(DescribeSchema, Object.fromEntries(await request.formData()));
		if (!parsed.success) throw error(400, say(locals, 'errors.contact.emptyDescription'));

		try {
			const saved = await describeContact(getContactDeps(), viewer, parsed.output.id, parsed.output.description);
			if (!saved) throw error(404, say(locals, 'errors.contact.notFound'));
		} catch (err) {
			if (err instanceof EmptyDescriptionError)
				return fail(400, { describeError: err.phrase(translator(locals)), describedId: parsed.output.id });
			throw err;
		}
		// Back to the list, which no longer has them — without JavaScript too.
		throw redirect(303, FIRST_NAME_ONLY);
	}
};
