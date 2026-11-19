import type { PartialDate } from '../dates/partial-date';
import { dayOfInstant } from '../dates/today';
import { whenState, type WhenState } from '../when/state';
import type { When, WhenKind } from '../when/when';

/* Where a gift idea stands against its when (docs/dev/02 §2.25.8); `src/lib/when` knows no gifts. */

/** The whens a gift idea can be for; a month is an outing's (docs/dev/02 §2.27). */
export const GIFT_WHEN_KINDS = [
	'from_age',
	'at_age',
	'christmas_at_age',
	'on_date',
	'later'
] as const satisfies readonly WhenKind[];

/** What an idea's state is read from. */
export interface IdeaTiming {
	when: When | null;
	whenCheckedOn: string | null;
	createdAt: number;
}

/** An idea's state on `today`; null for one meant for *now*. */
export function ideaState(
	idea: IdeaTiming,
	birth: PartialDate | null,
	today: string
): WhenState | null {
	if (idea.when === null) return null;
	const notedOn = dayOfInstant(idea.createdAt);
	return whenState(idea.when, { birth, notedOn, checkedOn: idea.whenCheckedOn }, today);
}

/** Whether an idea still waits, out of every count and list. */
export function ideaWaits(idea: IdeaTiming, birth: PartialDate | null, today: string): boolean {
	return ideaState(idea, birth, today)?.kind === 'waiting';
}
