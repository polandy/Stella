import { error, json } from '@sveltejs/kit';
import { requireViewer } from '$lib/server/auth/guards';
import { getContact, listContactNamesAmong } from '$lib/server/domain/contacts/contacts';
import { authorNames } from '$lib/server/domain/household/members';
import { listStoryPage } from '$lib/server/domain/story/story';
import { getMemberDeps, getPhotos, getStoryDeps } from '$lib/server/services';
import { parseStoryCursor } from '$lib/story/cursor';
import {
	entryIdsOf,
	mentionIdsOf,
	nameLookup,
	photosByEntry,
	STORY_PAGE_SIZE,
	toStoryItem
} from '../story-view';
import type { RequestHandler } from './$types';
import { say } from '$lib/server/i18n/say';

/*
 * Older pages of the story timeline (docs/02 §2.23). The first page comes with the person's
 * page; this hands back the next one when the reader asks for it. Same visibility scoping as
 * everywhere else — a private entry or touchpoint only ever reaches its author.
 *
 * The cursor is posted back verbatim as JSON rather than flattened into query parameters: it
 * carries two independent resume points, and pulling them apart into six parameters would put
 * the merge's rules in the URL where nothing checks them.
 */

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const viewer = requireViewer(locals);

	const contact = await getContact(locals.services.people.contactDeps, viewer, params.id);
	if (!contact) throw error(404, say(locals, 'errors.contact.notFound')); // never reveal existence

	const body: unknown = await request.json().catch(() => null);
	const cursor = parseStoryCursor(body);
	if (cursor === null) throw error(400, say(locals, 'errors.story.badCursor'));

	const page = await listStoryPage(getStoryDeps(), viewer, params.id, {
		limit: STORY_PAGE_SIZE,
		cursor
	});

	// Only what this page shows: its entries' photos and the people its entries mention.
	const [photos, names, nameOfAuthor] = await Promise.all([
		getPhotos().listJournalPhotosOfEntries(viewer, params.id, entryIdsOf(page.items)),
		listContactNamesAmong(locals.services.people.contactDeps, viewer, mentionIdsOf(page.items)),
		authorNames(getMemberDeps(), viewer.householdId)
	]);
	const context = {
		userId: viewer.id,
		photosByEntry: photosByEntry(photos),
		nameOf: nameLookup(names),
		nameOfAuthor
	};

	return json({
		items: page.items.map((item) => toStoryItem(item, context)),
		nextCursor: page.nextCursor
	});
};
