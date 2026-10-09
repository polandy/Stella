import { extractMentionIds } from '$lib/mentions/mentions';
import type { JournalEntry } from '$lib/server/domain/journal/journal';
import type { JournalPhotoRef } from '$lib/server/domain/media/journal-photos';
import { renderMarkdownWithMentions } from '$lib/server/domain/notes/markdown';
import { authorLabel } from '$lib/story/author';

/*
 * The journal's entries as the page shows them (docs/02 §2.20), as plain data so it is tested
 * without a request (docs/08 §8.5): `+page.server.ts` reads the entries, their photos and the
 * names they mention, and hands them over.
 */

export interface JournalViewInput {
	viewerId: string;
	entries: readonly JournalEntry[];
	/** The visible photos on the contact, oldest first. */
	photos: readonly JournalPhotoRef[];
	/** The mentioned people the viewer may see, archived ones included. */
	names: readonly { id: string; displayName: string }[];
	/** Who wrote an entry, by member id; null for someone no longer in the household. */
	nameOfAuthor: (userId: string) => string | null;
}

/** Each entry rendered for the page, with only what its reader may have. */
export function journalEntriesFor({
	viewerId,
	entries,
	photos,
	names,
	nameOfAuthor
}: JournalViewInput) {
	// Group visible photo ids by their entry so each entry renders its own gallery.
	const photosByEntry = new Map<string, string[]>();
	for (const p of photos) {
		const list = photosByEntry.get(p.journalEntryId) ?? [];
		list.push(p.id);
		photosByEntry.set(p.journalEntryId, list);
	}

	// Name lookup for @-mention chips, scoped to what the viewer may see — archived people
	// included, since a mention already written still names them (docs/02 §2.2).
	const nameById = new Map(names.map((c) => [c.id, c.displayName]));
	const nameOf = (id: string) => nameById.get(id) ?? null;

	// render Markdown + @-mentions server-side; the output is already safe (docs/02 §2.5, §2.20.1)
	return entries.map((e) => ({
		id: e.id,
		entryDate: e.entryDate,
		title: e.title,
		bodyHtml: renderMarkdownWithMentions(e.body, nameOf),
		// the stored body for the edit form, which shows its tokens as handles and keeps whom
		// each one names — including people the picker does not offer, such as the subject.
		// Only an author edits an entry, so only their own carry it.
		bodyForEdit: e.createdBy === viewerId ? e.body : null,
		mentionNames: Object.fromEntries(
			extractMentionIds(e.body).flatMap((id) => (nameById.has(id) ? [[id, nameById.get(id)!]] : []))
		),
		visibility: e.visibility,
		mine: e.createdBy === viewerId,
		// Who wrote each entry, named the same way the story names it (docs/02 §2.23).
		author: authorLabel(e.createdBy === viewerId, nameOfAuthor(e.createdBy)),
		photos: photosByEntry.get(e.id) ?? [],
		updatedAt: e.updatedAt
	}));
}
