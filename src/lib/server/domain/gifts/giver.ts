import { hasGiftDay } from '../../../gifts/gifts';
import { phrase } from '../../../i18n/phrase';
import { todayFor } from '../../../dates/today';
import { sameWhen, type When } from '../../../when/when';
import { birthOfVisible } from '../shared/idea-on-person';
import {
	giverOf,
	hiddenOf,
	InvalidGiftError,
	requireVisibleGift,
	whenOf,
	type GiftActor,
	type GiftDeps,
	type GiverChoice
} from './gifts';

/*
 * Who gives a gift (docs/dev/02 §2.25.12): an open idea, or one bought, *vergeben* to a person or
 * to the household itself, for the occasion it is meant for. A booking is simply the giver field —
 * one booking per item, its givers together. What was given or received keeps
 * its giver; it happened.
 */

export interface AssignGiftInput {
	contactId: string;
	giftId: string;
	/** The new giver; null frees the gift again (*Wieder frei*). */
	giver: GiverChoice | null;
	/** Those giving with them, in the order named. */
	coGivers?: GiverChoice[];
	/** The occasion it is meant for; absent keeps the gift's own. */
	when?: When | null;
	/** Kept from the person it is for (D4); only its author decides, absent keeps it as it was. */
	hiddenFromRecipient?: boolean;
}

/** Set or clear who gives an idea or a bought gift, and for when. */
export async function assignGift(
	deps: GiftDeps,
	actor: GiftActor,
	input: AssignGiftInput
): Promise<{ giftId: string }> {
	const gift = await requireVisibleGift(deps, actor, input.contactId, input.giftId);
	if (hasGiftDay(gift.state)) throw new InvalidGiftError(phrase('errors.gift.alreadyGiven'));
	const today = todayFor(deps.clock);
	const asked = input.when === undefined ? gift.when : input.when;
	const kept = sameWhen(asked, gift.when);
	const when = kept
		? gift.when
		: whenOf(asked, await birthOfVisible(deps.contacts, actor, gift.contactId), today);
	const mine = gift.createdBy === actor.userId;
	const asksHidden = mine
		? (input.hiddenFromRecipient ?? gift.hiddenFromRecipient)
		: gift.hiddenFromRecipient;
	const hidden =
		asksHidden === gift.hiddenFromRecipient
			? gift.hiddenFromRecipient
			: await hiddenOf(deps, actor, gift.contactId, gift.visibility, asksHidden);
	await deps.gifts.update({
		...gift,
		...(await giverOf(deps, actor, gift, input.giver, input.coGivers)),
		when,
		whenCheckedOn: kept ? gift.whenCheckedOn : today,
		hiddenFromRecipient: hidden,
		updatedAt: deps.clock.now()
	});
	return { giftId: gift.id };
}

/** Which people are the household's members' own, for *Wer schenkt?* to suggest; no read of who sees them. */
export async function membersOwnPeopleOf(
	deps: Pick<GiftDeps, 'ownPeople'>,
	actor: GiftActor
): Promise<string[]> {
	const owners = await deps.ownPeople.membersOwnPeople(actor.householdId);
	return owners.map((owner) => owner.contactId);
}
