import { surpriseFromForm } from '../surprise/surprise';

/*
 * The words a gift is made of (docs/dev/02 §2.25). Pure and client-safe, so the form, the command's
 * payload schema and the use-case read one list of states and one list of occasions.
 */

/** An idea may be bought, then becomes a given gift; a received one is noted as such from the start. */
export const GIFT_STATES = ['idea', 'bought', 'given', 'received'] as const;

/** One of `GIFT_STATES`. */
export type GiftState = (typeof GIFT_STATES)[number];

/** Whether `value` is one of `GIFT_STATES`. */
export function isGiftState(value: string): value is GiftState {
	return (GIFT_STATES as readonly string[]).includes(value);
}

/** The states a gift is added in: *bought* is only ever reached from an idea. */
export const ADDABLE_GIFT_STATES = ['idea', 'given', 'received'] as const;

/** One of `ADDABLE_GIFT_STATES`. */
export type AddableGiftState = (typeof ADDABLE_GIFT_STATES)[number];

/** Whether `value` is one of `ADDABLE_GIFT_STATES`. */
export function isAddableGiftState(value: string): value is AddableGiftState {
	return (ADDABLE_GIFT_STATES as readonly string[]).includes(value);
}

/** Whether a gift in `state` has its day: given and received ones do, an idea or a bought one not yet. */
export function hasGiftDay(state: GiftState): state is 'given' | 'received' {
	return state === 'given' || state === 'received';
}

/** Whether a gift in `state` is still to come — an idea, or one bought and not yet handed over. */
export function isOpenGift(state: GiftState): state is 'idea' | 'bought' {
	return !hasGiftDay(state);
}

/**
 * The occasions the form offers as chips. Stored as these keys and worded in the reader's
 * language when shown, so a gift noted in German reads *Birthday* to an English reader; any
 * other occasion is stored as typed.
 */
export const GIFT_OCCASION_PRESETS = ['birthday', 'christmas', 'anniversary'] as const;

/** One of `GIFT_OCCASION_PRESETS`. */
export type GiftOccasionPreset = (typeof GIFT_OCCASION_PRESETS)[number];

/** Whether a stored occasion is one of the presets rather than free text. */
export function isGiftOccasionPreset(value: string): value is GiftOccasionPreset {
	return (GIFT_OCCASION_PRESETS as readonly string[]).includes(value);
}

/** The chip that opens a field for an occasion of the member's own wording. */
export const OTHER_OCCASION = 'other';

/**
 * The occasion a form chose: a preset's key, or the text typed beside *Other*. The chips and
 * the text field are two fields, so the form works without JavaScript too; the action and the
 * outbox's `toCommand` read them the same way through this.
 */
export function occasionFromForm(choice: string | null, typed: string | null): string | null {
	if (choice === OTHER_OCCASION) return (typed ?? '').trim() || null;
	return choice !== null && isGiftOccasionPreset(choice) ? choice : null;
}

/** The form's three-way choice, *Everyone but them* being a shared gift kept from its person (§2.25.10). */
export function visibilityFromForm(chosen: string | null): {
	visibility: 'shared' | 'private';
	hiddenFromRecipient: boolean;
} {
	const { visibility, keptFromPerson } = surpriseFromForm(chosen);
	return { visibility, hiddenFromRecipient: keptFromPerson };
}

/** Who gives a gift, as a form or a command asks for it: a person, or the household itself (§2.25.12). */
export type GiverChoice = { contactId: string } | { household: true };

/** What the giver field posts for the household itself; anything else non-empty is a person's id. */
export const HOUSEHOLD_GIVER = 'household';

/** The giver the form chose; empty is nobody, so *us*. */
export function giverFromForm(posted: string | null): GiverChoice | null {
	const value = (posted ?? '').trim();
	if (value.length === 0) return null;
	return value === HOUSEHOLD_GIVER ? { household: true } : { contactId: value };
}
