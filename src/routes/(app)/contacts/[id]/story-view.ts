import { canRemoveAuthored, type ContactAccess, type Remover } from '$lib/server/access/visibility';
import type { JournalPhotoRef } from '$lib/server/domain/media/journal-photos';
import { renderMarkdownWithMentions } from '$lib/server/domain/notes/markdown';
import type { StoryItem } from '$lib/server/domain/story/story';
import { extractMentionIds } from '$lib/mentions/mentions';
import { authorLabel } from '$lib/story/author';
import type { StoryItemView } from '$lib/story/item';

/*
 * Turn a domain story item into what the timeline renders (docs/02 §2.23). This is the edge's
 * job, not the domain's — Markdown rendering, photo ids and author names are presentation. It
 * lives here rather than inside either route because the page's first page and the endpoint's
 * later pages must produce exactly the same shape; two copies would drift on the first change.
 */

/** Items per page of the timeline: the first comes with the page, the rest from the endpoint. */
export const STORY_PAGE_SIZE = 12;

/** Visible journal photo ids grouped by entry, so each entry renders its own gallery. */
export function photosByEntry(photos: readonly JournalPhotoRef[]): Map<string, string[]> {
	const grouped = new Map<string, string[]>();
	for (const photo of photos) {
		const list = grouped.get(photo.journalEntryId) ?? [];
		list.push(photo.id);
		grouped.set(photo.journalEntryId, list);
	}
	return grouped;
}

/** The people the journal entries among `items` mention, each once — the names a page needs. */
export function mentionIdsOf(items: readonly StoryItem[]): string[] {
	const ids = new Set<string>();
	for (const item of items) {
		if (item.kind === 'journal') for (const id of extractMentionIds(item.entry.body)) ids.add(id);
	}
	return [...ids];
}

/** The journal entries among `items` — the ones whose photos a page shows. */
export function entryIdsOf(items: readonly StoryItem[]): string[] {
	return items.flatMap((item) => (item.kind === 'journal' ? [item.entry.id] : []));
}

/**
 * The name lookup for @-mention chips. Built from the visibility scope, not the browsing one:
 * an archived person keeps their name in a sentence that already mentions them (docs/02 §2.2).
 */
export function nameLookup(
	names: readonly { id: string; displayName: string }[]
): (contactId: string) => string | null {
	const byId = new Map(names.map((c) => [c.id, c.displayName]));
	return (contactId) => byId.get(contactId) ?? null;
}

export interface StoryViewContext {
	/** The signed-in member, to decide what they may remove and who counts as "you". */
	remover: Remover;
	/** The person the story is of: a private one hides what is on it from the rule's admin half. */
	person: ContactAccess;
	/** Name of the household member behind a user id, or null once they are gone. */
	nameOfAuthor: (userId: string) => string | null;
	/** Visible journal photo ids, keyed by entry id. */
	photosByEntry: Map<string, string[]>;
	/** Display name for an @-mention target the viewer may see, or null. */
	nameOf: (contactId: string) => string | null;
}

/** Whether *Remove* is drawn: the access layer's rule, so the button is never one that fails. */
function removable(
	ctx: StoryViewContext,
	record: { createdBy: string; visibility: 'shared' | 'private' }
): boolean {
	return canRemoveAuthored(ctx.remover, {
		ownerId: record.createdBy,
		visibility: record.visibility,
		contact: ctx.person
	});
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
			mine: entry.createdBy === ctx.remover.id,
			removable: removable(ctx, entry),
			author: authorLabel(entry.createdBy === ctx.remover.id, ctx.nameOfAuthor(entry.createdBy)),
			title: entry.title,
			bodyHtml: renderMarkdownWithMentions(entry.body, ctx.nameOf),
			photos: ctx.photosByEntry.get(entry.id) ?? []
		};
	}

	if (item.kind === 'gift') {
		const gift = item.gift;
		const mine = gift.createdBy === ctx.remover.id;
		return {
			kind: 'gift',
			id: gift.id,
			day: item.day,
			recordedAt: item.recordedAt,
			visibility: gift.visibility,
			mine,
			// A gift is removed on the Gifts card, not from the story.
			removable: false,
			author: authorLabel(mine, ctx.nameOfAuthor(gift.createdBy)),
			giftState: gift.state,
			title: gift.title,
			occasion: gift.occasion
		};
	}

	const interaction = item.interaction;
	return {
		kind: 'interaction',
		id: interaction.id,
		day: item.day,
		recordedAt: item.recordedAt,
		visibility: interaction.visibility,
		mine: interaction.createdBy === ctx.remover.id,
		removable: removable(ctx, interaction),
		author: authorLabel(
			interaction.createdBy === ctx.remover.id,
			ctx.nameOfAuthor(interaction.createdBy)
		),
		interactionKind: interaction.kind,
		title: interaction.title,
		description: interaction.description,
		participants: interaction.participants.map((p) => ({
			contactId: p.contactId,
			displayName: p.displayName
		}))
	};
}
