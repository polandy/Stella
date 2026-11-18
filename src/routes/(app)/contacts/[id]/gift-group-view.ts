import { authorLabel } from '$lib/story/author';
import { hasGiftDay } from '$lib/gifts/gifts';
import { sameWhen } from '$lib/when/when';
import type { VisibleGiftGroup } from '$lib/server/domain/gifts/gift-groups';
import type { PersonViewContext } from './person-view';

/** A group on this person's card, as *Who has it?* lists it (docs/dev/02 §2.25.11). */
export function giftGroupView({ group, gifts }: VisibleGiftGroup, ctx: PersonViewContext) {
	const mine = group.createdBy === ctx.viewerId;
	return {
		id: group.id,
		title: group.title,
		note: group.note,
		url: group.url,
		when: group.when,
		occasion: group.occasion,
		visibility: group.visibility,
		hiddenFromRecipients: group.hiddenFromRecipients,
		mine,
		notedBy: mine ? null : authorLabel(false, ctx.nameOfAuthor(group.createdBy)),
		members: gifts.map((gift) => ({
			giftId: gift.id,
			contactId: gift.contactId,
			name: gift.contactName,
			birth: gift.birth,
			state: gift.state,
			title: gift.title,
			givenOn: gift.givenOn,
			occasion: gift.occasion,
			when: gift.when,
			whenCheckedOn: gift.whenCheckedOn,
			createdAt: gift.createdAt,
			/** Changed for them alone, so a change for everyone leaves it be. */
			ownWhen: gift.state === 'idea' && !sameWhen(gift.when, group.when),
			ownTitle: !hasGiftDay(gift.state) && gift.title !== group.title
		}))
	};
}

export type GiftGroupView = ReturnType<typeof giftGroupView>;
