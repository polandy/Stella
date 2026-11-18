import type { PartialDate } from '../dates/partial-date';
import { checkWhen, whenOutlook, type WhenCheck, type WhenOutlook } from '../when/resolve';
import type { When } from '../when/when';

// What one shared when comes to for each person (docs/dev/02 §2.25.11, ADR-134); form and use-case share it.

/** The most people one idea is noted for at once; a guard, never a limit anybody meets. */
export const GIFT_GROUP_MAX_RECIPIENTS = 50;

/** One person the idea is for. */
export interface GroupRecipient {
	contactId: string;
	birth: PartialDate | null;
	/** A when of their own instead of the shared one — one too old for it (F4); absent: the shared one. */
	when?: When | null;
}

/** Why a person gets no idea from the shared when. */
export type RecipientProblem = Extract<WhenCheck, { ok: false }>['problem'];

/** What the when comes to for one person: the when to store and how it stands, or why not. */
export type RecipientPlan =
	| { contactId: string; ok: true; when: When | null; outlook: WhenOutlook; own: boolean }
	| { contactId: string; ok: false; problem: RecipientProblem };

/** Each person once, the first time they are named, in the order given. */
export function planGiftGroup(
	when: When | null,
	recipients: readonly GroupRecipient[],
	today: string
): RecipientPlan[] {
	const seen = new Set<string>();
	const plans: RecipientPlan[] = [];
	for (const recipient of recipients) {
		if (seen.has(recipient.contactId)) continue;
		seen.add(recipient.contactId);
		const own = recipient.when !== undefined;
		const asked = own ? (recipient.when ?? null) : when;
		const check = checkWhen(asked, recipient.birth, today);
		plans.push(
			check.ok
				? {
						contactId: recipient.contactId,
						ok: true,
						when: check.when,
						outlook: whenOutlook(asked, recipient.birth, today),
						own
					}
				: { contactId: recipient.contactId, ok: false, problem: check.problem }
		);
	}
	return plans;
}
