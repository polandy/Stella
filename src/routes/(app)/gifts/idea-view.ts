import type { OpenIdea } from '$lib/server/domain/gifts/gifts';
import { alsoFor, giftGroupPanelPath } from '$lib/gifts/group-panel';
import { authorLabel } from '$lib/story/author';
import type { WhenState } from '$lib/when/state';

/** A group of the listed ideas, with everyone in it the viewer may see. */
export interface IdeaGroup {
	id: string;
	members: readonly { contactId: string; name: string }[];
}

/*
 * An open idea as the household's list shows it (docs/dev/02 §2.25.6) — the same words as on the
 * person's Gifts card: who noted it by first name, its link, and whether only the viewer sees it;
 * an idea several people get names the others, linked to *Who has it?* on its person's card.
 */
export function openIdeaView(
	idea: OpenIdea & { whenState: WhenState | null },
	viewerId: string,
	nameOfAuthor: (userId: string) => string | null,
	groups: readonly IdeaGroup[] = []
) {
	const group = idea.groupId && groups.find((found) => found.id === idea.groupId);
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
		when: idea.when,
		whenState: idea.whenState,
		hiddenFromRecipient: idea.hiddenFromRecipient,
		mine,
		notedBy: mine ? null : authorLabel(false, nameOfAuthor(idea.createdBy)),
		group: group
			? {
					names: alsoFor(group.members, idea.contactId),
					href: giftGroupPanelPath(idea.contactId, group.id)
				}
			: null
	};
}

export type OpenIdeaView = ReturnType<typeof openIdeaView>;
