import { surpriseFromForm } from '../surprise/surprise';
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
	const { visibility, keptFromPerson } = surpriseFromForm(chosen);
	return { visibility, hiddenFromPerson: keptFromPerson };
}

const PLAN_PARAM = 'plan';

/**
 * Where the command palette's *Outing with …* lands (docs/dev/05 §5.4): the person's page with the
 * Outings card's form open. No hash, for the reason `giftIdeaPath` gives.
 */
export function newPlanPath(contactId: string): string {
	return `/contacts/${contactId}?${PLAN_PARAM}=new`;
}

/** Whether a page address asks for the form (`newPlanPath`). */
export function asksForNewPlan(url: URL): boolean {
	return url.searchParams.get(PLAN_PARAM) === 'new';
}
