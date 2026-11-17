import type { QuickPick } from '../when/quick-picks';
import type { WhenKind } from '../when/when';

/* What an outing idea can say (docs/dev/02 §2.27); `src/lib/when` knows no outings. */

/** The whens an outing can be for, in the picker's order after *some time*. */
export const PLAN_WHEN_KINDS = [
	'on_date',
	'in_month',
	'at_age',
	'from_age'
] as const satisfies readonly WhenKind[];

/** The days the outing form offers at one tap. */
export const PLAN_QUICK_PICKS = [
	'saturday',
	'christmas',
	'birthday'
] as const satisfies readonly QuickPick[];
