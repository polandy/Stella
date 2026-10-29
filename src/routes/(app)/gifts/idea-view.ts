import type { OpenIdea } from '$lib/server/domain/gifts/gifts';
import { authorLabel } from '$lib/story/author';

/*
 * An open idea as the household's list shows it (docs/02 §2.25.6) — the same words as on the
 * person's Gifts card: who noted it by first name, its link, and whether only the viewer sees it.
 */
export function openIdeaView(
	idea: OpenIdea,
	viewerId: string,
	nameOfAuthor: (userId: string) => string | null
) {
	const mine = idea.createdBy === viewerId;
	return {
		id: idea.id,
		contactId: idea.contactId,
		contactName: idea.contactName,
		avatarPhotoId: idea.avatarPhotoId,
		title: idea.title,
		note: idea.note,
		url: idea.url,
		visibility: idea.visibility,
		mine,
		notedBy: mine ? null : authorLabel(false, nameOfAuthor(idea.createdBy))
	};
}

export type OpenIdeaView = ReturnType<typeof openIdeaView>;
