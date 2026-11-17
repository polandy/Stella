import { hasGiftDay } from '../../../gifts/gifts';
import { phrase } from '../../../i18n/phrase';
import type { Viewer } from '../../access/visibility';
import { InvalidGiftError, requireVisibleGift, type GiftActor, type GiftDeps } from './gifts';

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
}

/** An idea bought, or a bought one an idea again. Asking for the state it is already in changes nothing. */
export async function markGiftBought(
	deps: Pick<GiftDeps, 'gifts' | 'clock'>,
	actor: GiftActor,
	input: MarkGiftBoughtInput
): Promise<{ giftId: string }> {
	const gift = await requireVisibleGift(deps, actor, input.contactId, input.giftId);
	const to = input.bought ? 'bought' : 'idea';
	if (gift.state === to) return { giftId: gift.id };
	if (hasGiftDay(gift.state)) throw new InvalidGiftError(phrase('errors.gift.alreadyGiven'));
	await deps.gifts.update({ ...gift, state: to, updatedAt: deps.clock.now() });
	return { giftId: gift.id };
}

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
