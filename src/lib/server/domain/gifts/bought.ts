import { hasGiftDay } from '../../../gifts/gifts';
import { phrase } from '../../../i18n/phrase';
import type { Viewer } from '../../access/visibility';
import {
	hiddenOf,
	InvalidGiftError,
	requireVisibleGift,
	type GiftActor,
	type GiftDeps
} from './gifts';

/*
 * A gift bought and waiting to be handed over (docs/dev/02 §2.25.9). It is still the idea's row, in
 * the state *bought*: off the household's list and its counts, still on the person's card and in
 * Home's *Coming up* as ready, until *Mark as given* gives it its day. Its when stays, so taking
 * it back to an idea — *Not bought yet* — finds it as it was.
 */

export interface MarkGiftBoughtInput {
	contactId: string;
	giftId: string;
	/** True: bought. False: not bought yet after all, an idea again. */
	bought: boolean;
	/** Where it is kept (D20); absent or blank says nowhere in particular. */
	storedAt?: string | null;
	/** Kept from the member it is for (D23); only its author decides, absent keeps it as it was. */
	hiddenFromRecipient?: boolean;
}

/**
 * An idea bought — kept somewhere, maybe — or a bought one an idea again, its place forgotten.
 * Asking for what already stands changes nothing.
 */
export async function markGiftBought(
	deps: Pick<GiftDeps, 'gifts' | 'clock' | 'ownPeople'>,
	actor: GiftActor,
	input: MarkGiftBoughtInput
): Promise<{ giftId: string }> {
	const gift = await requireVisibleGift(deps, actor, input.contactId, input.giftId);
	if (hasGiftDay(gift.state)) throw new InvalidGiftError(phrase('errors.gift.alreadyGiven'));
	const to = input.bought ? 'bought' : 'idea';
	const storedAt = input.bought ? input.storedAt?.trim() || null : null;
	const asksHidden =
		gift.createdBy === actor.userId
			? (input.hiddenFromRecipient ?? gift.hiddenFromRecipient)
			: gift.hiddenFromRecipient;
	if (gift.state === to && storedAt === gift.storedAt && asksHidden === gift.hiddenFromRecipient) {
		return { giftId: gift.id };
	}
	const hidden =
		asksHidden === gift.hiddenFromRecipient
			? gift.hiddenFromRecipient
			: await hiddenOf(deps, actor, gift.contactId, gift.visibility, asksHidden);
	await deps.gifts.update({
		...gift,
		state: to,
		storedAt,
		hiddenFromRecipient: hidden,
		updatedAt: deps.clock.now()
	});
	return { giftId: gift.id };
}

/** Where the viewer's household has kept bought gifts so far, for *Bought…* to offer (D20). */
export const giftPlaces = (deps: Pick<GiftDeps, 'gifts'>, viewer: Viewer): Promise<string[]> =>
	deps.gifts.listStoredPlacesVisibleTo(viewer);

/** The bought gifts the viewer may see on each of these people, by title; one with none is left out. */
export async function readyGifts(
	deps: Pick<GiftDeps, 'gifts'>,
	viewer: Viewer,
	contactIds: readonly string[]
): Promise<Map<string, string[]>> {
	const ready = new Map<string, string[]>();
	if (contactIds.length === 0) return ready;
	for (const gift of await deps.gifts.listBoughtVisibleTo(viewer, [...new Set(contactIds)])) {
		ready.set(gift.contactId, [...(ready.get(gift.contactId) ?? []), gift.title]);
	}
	return ready;
}
