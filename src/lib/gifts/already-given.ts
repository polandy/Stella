import type { GiftState } from './gifts';

/*
 * The *already given* hint (docs/02 §2.25.2). Pure, so the gift form asks it on every keystroke
 * without a round trip — the person page already holds every gift the reader may see. It is a
 * hint, not a block: the second tin of her favourite tea can be on purpose.
 */

/** What the hint needs of a gift on the person's card. */
export interface GiftOnRecord {
	id: string;
	state: GiftState;
	title: string;
	givenOn: string | null;
	occasion: string | null;
}

/** Fewer letters than this would find a match in almost any title. */
const MIN_LETTERS = 3;

/** Case and accents folded and spaces evened, the way the name matcher reads a name. */
const fold = (value: string) =>
	value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * The gift already given to this person that `typed` looks like, or null: one title inside the
 * other, so *teekanne* finds *Teekanne aus Gusseisen* and *Tee aus Ceylon* finds *Tee*. Of
 * several, the latest given. `except` is the gift being rewritten, which would find itself.
 */
export function alreadyGiven<T extends GiftOnRecord>(
	typed: string,
	gifts: readonly T[],
	except?: string
): T | null {
	const query = fold(typed);
	if (query.length < MIN_LETTERS) return null;
	let latest: T | null = null;
	for (const gift of gifts) {
		if (gift.state !== 'given' || gift.id === except) continue;
		const title = fold(gift.title);
		const matches = title.includes(query) || (title.length >= MIN_LETTERS && query.includes(title));
		if (matches && (latest === null || (gift.givenOn ?? '') > (latest.givenOn ?? ''))) {
			latest = gift;
		}
	}
	return latest;
}
