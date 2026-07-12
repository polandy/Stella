import { error, json, redirect } from '@sveltejs/kit';
import { getContact, listContacts } from '$lib/server/domain/contacts/contacts';
import { listJournalPage } from '$lib/server/domain/journal/journal';
import { renderMarkdownWithMentions } from '$lib/server/domain/notes/markdown';
import { getContactDeps, getJournalDeps, getPhotos } from '$lib/server/services';
import type { RequestHandler } from './$types';

/*
 * Paginated journal read for the inline timeline on the contact page. Returns one keyset page
 * of visible, Markdown-rendered entries (newest first) plus a cursor for the next older page.
 * Same visibility scoping as the full journal — a private entry only reaches its author.
 */

const PAGE_SIZE = 8;

export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) throw redirect(302, '/login');
	const viewer = { id: locals.user.id, householdId: locals.user.householdId };

	const contact = await getContact(getContactDeps(), viewer, params.id);
	if (!contact) throw error(404, 'Contact not found'); // never reveal existence

	const beforeDate = url.searchParams.get('before_date');
	const beforeTs = url.searchParams.get('before_ts');
	const before =
		beforeDate && beforeTs && Number.isFinite(Number(beforeTs))
			? { entryDate: beforeDate, createdAt: Number(beforeTs) }
			: undefined;

	const page = await listJournalPage(getJournalDeps(), viewer, params.id, {
		limit: PAGE_SIZE,
		before
	});

	// Attach visible photo ids per entry (same source the full journal uses).
	const photos = await getPhotos().listJournalPhotos(viewer, params.id);
	const photosByEntry = new Map<string, string[]>();
	for (const p of photos) {
		const list = photosByEntry.get(p.journalEntryId) ?? [];
		list.push(p.id);
		photosByEntry.set(p.journalEntryId, list);
	}

	// Name lookup for @-mention chips, scoped to what the viewer may see.
	const allContacts = await listContacts(getContactDeps(), viewer);
	const nameById = new Map(allContacts.map((c) => [c.id, c.displayName]));
	const nameOf = (id: string) => nameById.get(id) ?? null;

	return json({
		entries: page.entries.map((e) => ({
			id: e.id,
			entryDate: e.entryDate,
			title: e.title,
			bodyHtml: renderMarkdownWithMentions(e.body, nameOf),
			visibility: e.visibility,
			mine: e.createdBy === locals.user!.id,
			photos: photosByEntry.get(e.id) ?? []
		})),
		nextCursor: page.nextCursor
	});
};
