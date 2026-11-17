import { SURPRISE } from '../gifts/gifts';
import type { QuickPick } from '../when/quick-picks';
import type { When, WhenKind } from '../when/when';

/* What an outing idea can say (docs/dev/02 §2.27); `src/lib/when` knows no outings. */

/** The whens an outing can be for, in the picker's order after *some time*. */
export const PLAN_WHEN_KINDS = [
	'on_date',
	'in_month',
	'at_age',
	'from_age'
] as const satisfies readonly WhenKind[];

/** A when an outing can be for. */
export type PlanWhen = Extract<When, { kind: (typeof PLAN_WHEN_KINDS)[number] }>;

/** Whether `when` is one an outing can be for. */
export function isPlanWhen(when: When): when is PlanWhen {
	return (PLAN_WHEN_KINDS as readonly string[]).includes(when.kind);
}

/** The days the outing form offers at one tap. */
export const PLAN_QUICK_PICKS = [
	'saturday',
	'christmas',
	'birthday'
] as const satisfies readonly QuickPick[];

/** The form's three-way choice, *Everyone but them* being a shared idea kept from its person. */
export function planVisibilityFromForm(chosen: string | null): {
	visibility: 'shared' | 'private';
	hiddenFromPerson: boolean;
} {
	if (chosen === 'private') return { visibility: 'private', hiddenFromPerson: false };
	return { visibility: 'shared', hiddenFromPerson: chosen === SURPRISE };
}
