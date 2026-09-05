import { renderMarkdownWithMentions } from '$lib/server/domain/notes/markdown';
import type { StoryItem } from '$lib/server/domain/story/story';
import type { StoryItemView } from '$lib/story/item';

/*
 * Turn a domain story item into what the timeline renders (docs/02 §2.23). This is the edge's
 * job, not the domain's — Markdown rendering, photo ids and author names are presentation. It
 * lives here rather than inside either route because the page's first page and the endpoint's
 * later pages must produce exactly the same shape; two copies would drift on the first change.
 */

export interface StoryViewContext {
	/** The signed-in user, to decide what they may remove. */
	userId: string;
	/** Visible journal photo ids, keyed by entry id. */
	photosByEntry: Map<string, string[]>;
	/** Display name for an @-mention target the viewer may see, or null. */
	nameOf: (contactId: string) => string | null;
}

export function toStoryItem(item: StoryItem, ctx: StoryViewContext): StoryItemView {
	if (item.kind === 'journal') {
		const entry = item.entry;
		return {
			kind: 'journal',
			id: entry.id,
			day: item.day,
			recordedAt: item.recordedAt,
			visibility: entry.visibility,
			mine: entry.createdBy === ctx.userId,
			title: entry.title,
			bodyHtml: renderMarkdownWithMentions(entry.body, ctx.nameOf),
			photos: ctx.photosByEntry.get(entry.id) ?? []
		};
	}

	const interaction = item.interaction;
	return {
		kind: 'interaction',
		id: interaction.id,
		day: item.day,
		recordedAt: item.recordedAt,
		visibility: interaction.visibility,
		mine: interaction.createdBy === ctx.userId,
		interactionKind: interaction.kind,
		title: interaction.title,
		description: interaction.description,
		participants: interaction.participants.map((p) => ({
			contactId: p.contactId,
			displayName: p.displayName
		}))
	};
}
