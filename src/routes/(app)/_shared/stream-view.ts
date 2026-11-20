import { extractMentionIds } from '#lib/mentions/mentions.js';
import { tagPageHref } from '#lib/hashtags/hashtags.js';
import type { Viewer } from '#lib/server/access/visibility.js';
import {
	listContactNamesAmong,
	type ContactNameDeps
} from '#lib/server/domain/contacts/contact-names.js';
import {
	immichPhotosOfEntries,
	type EntryImmichPhotoReadDeps
} from '#lib/server/domain/immich/entry-immich-photos.js';
import { renderMarkdownWithMentions } from '#lib/server/domain/notes/markdown.js';
import type { StreamItem } from '#lib/server/domain/stream/stream.js';

/*
 * Stream items as a page shows them (docs/dev/02 §2.22.2): a moment's Markdown rendered here, its
 * mentions named as the viewer may see them, its tags leading to the tag's own page (§2.20.2), and
 * the Immich photos it refers to signed for the viewer (docs/dev/04 ADR-132). Shared by Home and a tag's page, so a moment reads the same on both.
 */

/** Render the moments among `items`; every other kind passes through as it is. */
export async function streamForView(
	deps: { names: ContactNameDeps; immichPhotos: EntryImmichPhotoReadDeps },
	viewer: Viewer,
	items: readonly StreamItem[]
) {
	const moments = items.flatMap((item) => (item.kind === 'moment' ? [item] : []));
	const [names, immichByEntry] = await Promise.all([
		// What a mention already written is called (archived people included), for these moments only.
		listContactNamesAmong(
			deps.names,
			viewer,
			moments.flatMap((moment) => extractMentionIds(moment.body))
		),
		immichPhotosOfEntries(
			deps.immichPhotos,
			viewer,
			null,
			moments.map((moment) => moment.id)
		)
	]);
	const nameById = new Map(names.map((c) => [c.id, c.displayName]));
	const nameOf = (id: string) => nameById.get(id) ?? null;
	return items.map((item) =>
		item.kind === 'moment'
			? {
					...item,
					body: undefined,
					bodyHtml: renderMarkdownWithMentions(item.body, nameOf, { tagHref: tagPageHref }),
					immichPhotos: immichByEntry.get(item.id) ?? []
				}
			: item
	);
}

/** One rendered stream item. */
export type StreamItemView = Awaited<ReturnType<typeof streamForView>>[number];
