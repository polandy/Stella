import * as v from 'valibot';
import { GIFT_STATES } from '../gifts/gifts';
import { ISO_DAY, nonEmpty, optionalText, requiredText, visibility } from './payload-fields';

/* What the gift and to-do commands carry (docs/04 §4.11.2), one Valibot schema each. */

/**
 * What a gift says (docs/02 §2.25). Only the title is required; whether the day is — and
 * whether it is real — is the use-case's to judge by the gift's state, and so is the link.
 */
const giftContent = {
	title: requiredText,
	note: optionalText,
	url: optionalText,
	/** ISO `YYYY-MM-DD` for a given or received gift; an idea has none. */
	givenOn: optionalText,
	/** A preset key (`GIFT_OCCASION_PRESETS`) or free text. */
	occasion: optionalText,
	visibility
};

/** A gift noted on a person: an idea, or one given or received (docs/02 §2.25). */
export const GiftAddSchema = v.object({
	contactId: nonEmpty,
	state: v.picklist(GIFT_STATES),
	...giftContent
});

/** A gift rewritten where it is listed; its state stays. */
export const GiftEditSchema = v.object({
	contactId: nonEmpty,
	giftId: nonEmpty,
	...giftContent
});

/** An idea given: the day, and the occasion if there was one. */
export const GiftMarkGivenSchema = v.object({
	contactId: nonEmpty,
	giftId: nonEmpty,
	givenOn: v.pipe(v.string(), v.regex(ISO_DAY)),
	occasion: optionalText
});

/** A gift taken off a person. */
export const GiftRemoveSchema = v.object({
	contactId: nonEmpty,
	giftId: nonEmpty
});

/** What a to-do says (docs/02 §2.26); whether the day is real is the use-case's to judge. */
const todoContent = {
	title: requiredText,
	/** ISO `YYYY-MM-DD` it is due by; empty for none. */
	dueOn: optionalText,
	visibility
};

/** A to-do noted on a person. */
export const TodoAddSchema = v.object({
	contactId: nonEmpty,
	...todoContent
});

/** A to-do rewritten where it is listed. */
export const TodoEditSchema = v.object({
	contactId: nonEmpty,
	todoId: nonEmpty,
	...todoContent
});

/** Which to-do a tick, an untick or a removal is about. */
export const TodoRefSchema = v.object({
	contactId: nonEmpty,
	todoId: nonEmpty
});
