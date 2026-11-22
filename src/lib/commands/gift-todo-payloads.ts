import * as v from 'valibot';
import { ADDABLE_GIFT_STATES } from '../gifts/gifts';
import { GIFT_WHEN_KINDS } from '../gifts/idea-when';
import { optionalWhenOf, whenSchemaOf } from '../when/schema';
import { ISO_DAY, nonEmpty, optionalText, requiredText, visibility } from './payload-fields';

/* What the gift and to-do commands carry (docs/dev/04 §4.11.2), one Valibot schema each. */

/**
 * What a gift says (docs/dev/02 §2.25). Only the title is required; whether the day is — and
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
	visibility,
	/** Kept from the member whose own person it is for (§2.25.10); left out, nobody is. */
	hiddenFromRecipient: v.optional(v.boolean())
};

const giftWhen = optionalWhenOf(GIFT_WHEN_KINDS);

/** Who gives a gift (§2.25.12): a person, or the household itself; null or absent, *us*. */
const giverChoice = v.union([
	v.object({ contactId: nonEmpty }),
	v.object({ household: v.literal(true) })
]);
const giver = v.nullable(giverChoice);

/** Those giving with the first (§2.25.12), in the order named; absent on a command from before. */
const coGivers = v.optional(v.array(giverChoice));

/** A gift noted on a person: an idea, or one given or received (docs/dev/02 §2.25). */
export const GiftAddSchema = v.object({
	contactId: nonEmpty,
	state: v.picklist(ADDABLE_GIFT_STATES),
	...giftContent,
	when: giftWhen,
	giver: v.optional(giver),
	coGivers
});

/** An open idea or a bought gift *vergeben* — or freed with none — for when it is meant (§2.25.12). */
export const GiftAssignSchema = v.object({
	contactId: nonEmpty,
	giftId: nonEmpty,
	giver,
	coGivers,
	when: giftWhen,
	hiddenFromRecipient: v.optional(v.boolean())
});

/** One person an idea for several is for (§2.25.11). */
const GroupRecipientSchema = v.object({
	contactId: nonEmpty,
	/** A when of their own instead of the shared one, null for *now*; absent, the shared one. */
	when: v.optional(v.nullable(whenSchemaOf(GIFT_WHEN_KINDS))),
	/** An estimated birth year for someone with no birth date, kept on them once noted. */
	birthYear: v.optional(v.pipe(v.string(), v.regex(/^\d{4}$/)))
});

/** One idea for several people (§2.25.11): a gift each, bound by one group. */
export const GiftGroupAddSchema = v.object({
	title: requiredText,
	note: optionalText,
	url: optionalText,
	occasion: optionalText,
	visibility,
	/** Kept from each person it is for whose own person they are (§2.25.10). */
	hiddenFromRecipients: v.optional(v.boolean()),
	/** The shared when; null for *now*. */
	when: v.nullable(whenSchemaOf(GIFT_WHEN_KINDS)),
	recipients: v.pipe(v.array(GroupRecipientSchema), v.minLength(1))
});

/** A group followed up as a whole (§2.25.11). */
export const GiftGroupRefSchema = v.object({ groupId: nonEmpty });

/** One gift of a group, to go on alone. */
export const GiftGroupGiftSchema = v.object({ groupId: nonEmpty, giftId: nonEmpty });

/** More people for a group; each gets the group's when, worked out for them. */
export const GiftGroupAddRecipientsSchema = v.object({
	groupId: nonEmpty,
	recipients: v.pipe(v.array(GroupRecipientSchema), v.minLength(1))
});

/** A group rewritten: for one person's open gift, or for the group and every open one. */
export const GiftGroupEditSchema = v.object({
	groupId: nonEmpty,
	giftId: v.optional(nonEmpty),
	title: requiredText,
	note: optionalText,
	url: optionalText,
	when: v.optional(v.nullable(whenSchemaOf(GIFT_WHEN_KINDS)))
});

/** A gift rewritten where it is listed; its state stays. */
export const GiftEditSchema = v.object({
	contactId: nonEmpty,
	giftId: nonEmpty,
	...giftContent,
	when: giftWhen
});

/** An idea given: the day, and the occasion if there was one. */
export const GiftMarkGivenSchema = v.object({
	contactId: nonEmpty,
	giftId: nonEmpty,
	givenOn: v.pipe(v.string(), v.regex(ISO_DAY)),
	occasion: optionalText
});

/** An idea bought and waiting to be handed over, or back to an idea (docs/dev/02 §2.25.9). */
export const GiftMarkBoughtSchema = v.object({
	contactId: nonEmpty,
	giftId: nonEmpty,
	bought: v.boolean(),
	/** Where it waits to be handed over (§2.25.9); absent or blank, nowhere in particular. */
	storedAt: v.optional(v.nullable(v.string())),
	/** Asked of its author only, as on *Vergeben…* (§2.25.10). */
	hiddenFromRecipient: v.optional(v.boolean())
});

/** An idea's question answered (docs/dev/02 §2.25.8): kept as *now* (null), or given a new when. */
export const GiftAnswerWhenSchema = v.object({
	contactId: nonEmpty,
	giftId: nonEmpty,
	when: v.nullable(whenSchemaOf(GIFT_WHEN_KINDS))
});

/** A gift taken off a person. */
export const GiftRemoveSchema = v.object({
	contactId: nonEmpty,
	giftId: nonEmpty
});

/** What a to-do says (docs/dev/02 §2.26); whether the day is real is the use-case's to judge. */
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
