import { error, json, redirect } from '@sveltejs/kit';
import { getContact, listContacts } from '$lib/server/domain/contacts/contacts';
import { authorNames } from '$lib/server/domain/household/members';
import { listStoryPage } from '$lib/server/domain/story/story';
import { getContactDeps, getMemberDeps, getPhotos, getStoryDeps } from '$lib/server/services';
import { parseStoryCursor } from '$lib/story/cursor';
import { toStoryItem } from '../story-view';
import type { RequestHandler } from './$types';

/*
 * Older pages of the story timeline (docs/02 §2.23). The first page comes with the person's
 * page; this hands back the next one when the reader asks for it. Same visibility scoping as
 * everywhere else — a private entry or touchpoint only ever reaches its author.
 *
 * The cursor is posted back verbatim as JSON rather than flattened into query parameters: it
 * carries two independent resume points, and pulling them apart into six parameters would put
 * the merge's rules in the URL where nothing checks them.
 */

const PAGE_SIZE = 12;

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) throw redirect(302, '/login');
	const viewer = { id: locals.user.id, householdId: locals.user.householdId };

	const contact = await getContact(getContactDeps(), viewer, params.id);
	if (!contact) throw error(404, 'Contact not found'); // never reveal existence

	const body: unknown = await request.json().catch(() => null);
	const cursor = parseStoryCursor(body);
	if (cursor === null) throw error(400, 'Malformed story cursor');

	const page = await listStoryPage(getStoryDeps(), viewer, params.id, {
		limit: PAGE_SIZE,
		cursor
	});

	const photos = await getPhotos().listJournalPhotos(viewer, params.id);
	const photosByEntry = new Map<string, string[]>();
	for (const photo of photos) {
		const list = photosByEntry.get(photo.journalEntryId) ?? [];
		list.push(photo.id);
		photosByEntry.set(photo.journalEntryId, list);
	}

	const allContacts = await listContacts(getContactDeps(), viewer);
	const nameById = new Map(allContacts.map((c) => [c.id, c.displayName]));
	const nameOfAuthor = await authorNames(getMemberDeps(), viewer.householdId);

	return json({
		items: page.items.map((item) =>
			toStoryItem(item, {
				userId: locals.user!.id,
				photosByEntry,
				nameOf: (id) => nameById.get(id) ?? null,
				nameOfAuthor
			})
		),
		nextCursor: page.nextCursor
	});
};
