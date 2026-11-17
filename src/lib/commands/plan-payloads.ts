import * as v from 'valibot';
import { PLAN_WHEN_KINDS } from '../plans/plans';
import { optionalWhenOf, whenSchemaOf } from '../when/schema';
import { nonEmpty, optionalText, requiredText, visibility } from './payload-fields';

/* What the outing commands carry (docs/dev/04 §4.11.2), one Valibot schema each. */

/** What an outing idea says (docs/dev/02 §2.27); whether the link and the when hold is the use-case's to judge. */
const planContent = {
	title: requiredText,
	note: optionalText,
	url: optionalText,
	visibility,
	/** Kept from the member whose own person it is with; left out, nobody is. */
	hiddenFromPerson: v.optional(v.boolean()),
	when: optionalWhenOf(PLAN_WHEN_KINDS)
};

/** An outing idea noted on a person. */
export const PlanAddSchema = v.object({
	contactId: nonEmpty,
	...planContent
});

/** An idea rewritten where it is listed; booking and tick stay. */
export const PlanEditSchema = v.object({
	contactId: nonEmpty,
	planId: nonEmpty,
	...planContent
});

/** Which idea a booking, a tick, their undoing or a removal is about. */
export const PlanRefSchema = v.object({
	contactId: nonEmpty,
	planId: nonEmpty
});

/** A passed idea answered on Home (docs/dev/02 §2.27.8): a new when ahead, or null for *some time*. */
export const PlanAnswerWhenSchema = v.object({
	contactId: nonEmpty,
	planId: nonEmpty,
	when: v.nullable(whenSchemaOf(PLAN_WHEN_KINDS))
});
