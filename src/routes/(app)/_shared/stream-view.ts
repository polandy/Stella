import { extractMentionIds } from '$lib/mentions/mentions';
import { tagPageHref } from '$lib/hashtags/hashtags';
import type { Viewer } from '$lib/server/access/visibility';
import {
	listContactNamesAmong,
	type ContactNameDeps
} from '$lib/server/domain/contacts/contact-names';
import { renderMarkdownWithMentions } from '$lib/server/domain/notes/markdown';
import type { StreamItem } from '$lib/server/domain/stream/stream';

/*
 * Stream items as a page shows them (docs/02 §2.22.2): a moment's Markdown rendered here, its
 * mentions named as the viewer may see them, and its tags leading to the tag's own page
 * (§2.20.2). Shared by Home and a tag's page, so a moment reads the same on both.
 */

/** Render the moments among `items`; every other kind passes through as it is. */
export async function streamForView(
	deps: ContactNameDeps,
	viewer: Viewer,
	items: readonly StreamItem[]
) {
	// What a mention already written is called (archived people included), for these moments only.
	const names = await listContactNamesAmong(
		deps,
		viewer,
		items.flatMap((item) => (item.kind === 'moment' ? extractMentionIds(item.body) : []))
	);
	const nameById = new Map(names.map((c) => [c.id, c.displayName]));
	const nameOf = (id: string) => nameById.get(id) ?? null;
	return items.map((item) =>
		item.kind === 'moment'
			? {
					...item,
					body: undefined,
					bodyHtml: renderMarkdownWithMentions(item.body, nameOf, { tagHref: tagPageHref })
				}
			: item
	);
}

/** One rendered stream item. */
export type StreamItemView = Awaited<ReturnType<typeof streamForView>>[number];
